/**
 * V16/T16-01 §3.2：有界反事实——回答"到底输在哪里"（owner：T16-01）。
 *
 * 对每个失败窗口，在**同一状态、同一后续策略、同一 RNG 种子**下比较最多 4 个根动作：
 *   1. `student`      —— 模型实际选择的动作；
 *   2. `l1`           —— 隔离 L1 标签器的选择；
 *   3. `s1`           —— S1 完整回合教师的选择（未通过资格时标 `UNQUALIFIED_TEACHER`）；
 *   4. `rule-relevant`—— 与窗口相关的规则候选（capture / recruit / end_turn 中按固定优先级取一个）。
 *
 * 每个支路执行：
 *   a. 在真实引擎克隆上应用根动作；
 *   b. **己方剩余行动 → 对手完整回合 → 下一个己方行动边界**（用固定续弈策略，两侧同一策略）；
 *   c. 到达边界后，可再继续到**自然终局**（`--to-terminal true`），或按 transition 预算截断。
 *
 * 结果分级（任务书 §3.1）：
 * - `PROVEN_LOCAL`：真实引擎能直接判定立即致胜 / 立即被淘汰，不把启发式分数当证明；
 * - `ROLLOUT_SUPPORTED`：同一预算下多条完整回合续弈支持改进，但不声称全局最优；
 * - `INCONCLUSIVE_TRUNCATED`：没有走到约定边界，只记录观察，**不生成"正确动作"硬标签**。
 *
 * 用法：
 *   node ... v16/tools/counterfactual_v16.ts --windows <windows.jsonl> --shard 0/8 \
 *     --to-terminal true --out <dir>
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getAllianceId } from '../../src/game/rule_config';
import { PlanningNode } from '../../src/game/ai/planning';
import { compareActionCodeCanonicalV16 } from '../../src/game/ai/action_ordering';
import { queryL1Label } from '../../v15/tools/labeler_l1_v15';
import { S1_TIERS, searchS1Action } from './teacher_s1_v16';
import { V16_DEFAULT_CAPS } from './eval_v16_protocol';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const WINDOWS_PATH = path.resolve(arg('--windows', '') as string);
const OUT_DIR = path.resolve(arg('--out-dir', `v16/out/${arg('--run-id', 'v16_20260926_core')}/T16-01/counterfactual`) as string);
const SHARD = arg('--shard', null);
const TO_TERMINAL = arg('--to-terminal', 'true') !== 'false';
const MAX_TRANSITIONS = Number(arg('--max-transitions', '4000'));
const WALL_MS = Number(arg('--wall-ms', '120000'));
const TEACHER_TIER = arg('--teacher-tier', 'S1a') as string;
const CONTINUATION_SEED = Number(arg('--continuation-seed', '2609900000'));
const LABEL_SEED_BASE = Number(arg('--label-seed-base', '2609700000'));

if (!fs.existsSync(WINDOWS_PATH)) throw new Error(`[T16-01] 窗口文件不存在：${WINDOWS_PATH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

interface WindowRow {
    gameId: string;
    mapName: string;
    seed: number;
    candidateSeat: number;
    stepIndex: number;
    stateHashBefore: string;
    modelActionCode: string;
    l1ActionCode: string;
    l1ScoreGap: number | null;
    legalActionCount: number;
    stateJson: string;
}

let windows = fs.readFileSync(WINDOWS_PATH, 'utf8').split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as WindowRow);
if (SHARD !== null) {
    const [iRaw, nRaw] = SHARD.split('/');
    const i = Number(iRaw);
    const n = Number(nRaw);
    windows = windows.filter((_, index) => index % n === i);
}

const tier = S1_TIERS[TEACHER_TIER] ?? S1_TIERS.S1a;

function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}

/** 固定续弈策略：全部座位都用同一份 H0 启发式实现 + 每座位固定 RNG（同状态同 seed 可复现）。 */
interface BranchResult {
    rootActionCode: string;
    source: 'student' | 'l1' | 's1' | 'rule-relevant';
    immediateTerminal: boolean;
    terminalVerdict: 'win' | 'loss' | 'draw' | null;
    reachedBoundary: boolean;
    transitions: number;
    wallCapHit: boolean;
    truncated: boolean;
    finalWinnerAllianceId: number | null;
    actionCodes: string[];
    outcome: 'WIN' | 'LOSS' | 'DRAW' | 'UNFINISHED';
}

function runBranch(state: GameState, rootAllianceId: number, rootAction: Action, source: BranchResult['source']): BranchResult {
    const startedAt = Date.now();
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const seatAi = new Map<number, HeuristicAI>();
    for (const player of engine.getState().players) seatAi.set(player.id, new HeuristicAI(streamFor(CONTINUATION_SEED, player.id)));

    const actionCodes: string[] = [];
    let transitions = 0;
    let wallCapHit = false;
    let truncated = false;
    let reachedBoundary = false;
    const rootPlayer = engine.getState().currentPlayer;

    try {
        engine.step(rootAction);
        actionCodes.push(encodeAction(rootAction));
        transitions += 1;
    } catch {
        return {
            rootActionCode: encodeAction(rootAction), source, immediateTerminal: false, terminalVerdict: null,
            reachedBoundary: false, transitions: 0, wallCapHit: false, truncated: true,
            finalWinnerAllianceId: null, actionCodes, outcome: 'UNFINISHED',
        };
    }
    const immediateTerminal = engine.isTerminal();

    while (!engine.isTerminal() && transitions < MAX_TRANSITIONS) {
        if (Date.now() - startedAt > WALL_MS) { wallCapHit = true; truncated = true; break; }
        const st = engine.getState();
        const current = st.currentPlayer;
        const alliance = getAllianceId(st, current);
        if (!reachedBoundary && alliance === rootAllianceId && current === rootPlayer && transitions > 1) {
            reachedBoundary = true;
            if (!TO_TERMINAL) break;
        }
        const legal = engine.getLegalActions(current).filter((a) => a.type !== 'surrender');
        if (legal.length === 0) { truncated = true; break; }
        const ai = seatAi.get(current);
        const action = ai ? ai.getAction(engine, current, legal.slice() as Action[]) : null;
        if (!action) { truncated = true; break; }
        const code = encodeAction(action);
        if (!legal.some((a) => encodeAction(a) === code)) { truncated = true; break; }
        try {
            engine.step(action);
        } catch { truncated = true; break; }
        actionCodes.push(code);
        transitions += 1;
    }

    const finalState = engine.getState();
    const winner = finalState.winner;
    let verdict: 'win' | 'loss' | 'draw' | null = null;
    let outcome: BranchResult['outcome'] = 'UNFINISHED';
    if (winner === -1) { verdict = 'draw'; outcome = 'DRAW'; }
    else if (winner !== null) {
        verdict = winner === rootAllianceId ? 'win' : 'loss';
        outcome = verdict === 'win' ? 'WIN' : 'LOSS';
    } else {
        truncated = true;
    }
    return {
        rootActionCode: encodeAction(rootAction), source, immediateTerminal, terminalVerdict: verdict,
        reachedBoundary, transitions, wallCapHit, truncated,
        finalWinnerAllianceId: winner, actionCodes, outcome,
    };
}

const outPath = path.join(OUT_DIR, `counterfactual${SHARD ? `.shard${SHARD.replace('/', 'of')}` : ''}.jsonl`);
const out = fs.createWriteStream(outPath, { flags: 'w' });
const summary: Array<Record<string, unknown>> = [];
const startedAt = Date.now();

for (const window of windows) {
    const state = JSON.parse(window.stateJson) as GameState;
    const playerId = state.currentPlayer;
    const rootAllianceId = getAllianceId(state, playerId);
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const legal: Action[] = engine.getLegalActions(playerId).filter((a) => a.type !== 'surrender');
    const byCode = new Map(legal.map((a) => [encodeAction(a), a]));

    const l1 = queryL1Label(state, { labelSeedBase: LABEL_SEED_BASE, actingPlayerId: playerId, filterSurrender: true });
    const s1 = searchS1Action({ state, playerId, s1: { tier, rng: () => 0.5, wallMsPerDecision: 30000 } });

    // 规则相关候选：capture > recruit > end_turn（固定优先级，必须允许"有其他动作仍应结束"）。
    const ruleOrder: Array<(a: Action) => boolean> = [
        (a) => a.type === 'capture',
        (a) => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy',
        (a) => a.type === 'end_turn',
    ];
    let ruleAction: Action | null = null;
    for (const predicate of ruleOrder) {
        const found = [...legal]
            .filter(predicate)
            .sort((a, b) => compareActionCodeCanonicalV16(encodeAction(a), encodeAction(b)))[0];
        if (found) { ruleAction = found; break; }
    }

    const branches: BranchResult[] = [];
    const seen = new Set<string>();
    const candidates: Array<{ code: string; source: BranchResult['source'] }> = [
        { code: window.modelActionCode, source: 'student' },
        { code: l1.actionCode ?? window.l1ActionCode, source: 'l1' },
        { code: s1.actionCode, source: 's1' },
    ];
    if (ruleAction) candidates.push({ code: encodeAction(ruleAction), source: 'rule-relevant' });
    for (const candidate of candidates) {
        if (seen.has(candidate.code)) continue;
        const action = byCode.get(candidate.code);
        if (!action) continue;
        seen.add(candidate.code);
        branches.push(runBranch(state, rootAllianceId, action, candidate.source));
    }

    const completed = branches.filter((b) => !b.truncated);
    const student = branches.find((b) => b.source === 'student');
    const bestOther = branches.filter((b) => b.source !== 'student').sort((a, b) => {
        const rank = (r: BranchResult) => (r.outcome === 'WIN' ? 2 : r.outcome === 'DRAW' ? 1 : 0);
        return rank(b) - rank(a);
    })[0];
    let proofLevel: 'PROVEN_LOCAL' | 'ROLLOUT_SUPPORTED' | 'INCONCLUSIVE_TRUNCATED';
    if (student && student.immediateTerminal) proofLevel = 'PROVEN_LOCAL';
    else if (completed.length === branches.length && branches.length >= 3
        && bestOther && student && bestOther.outcome === 'WIN' && student.outcome !== 'WIN') {
        proofLevel = 'ROLLOUT_SUPPORTED';
    } else proofLevel = 'INCONCLUSIVE_TRUNCATED';

    const record = {
        schema: 'v16_counterfactual_window_1',
        windowId: `${window.gameId}#step${window.stepIndex}`,
        gameId: window.gameId,
        mapName: window.mapName,
        seed: window.seed,
        candidateSeat: window.candidateSeat,
        stepIndex: window.stepIndex,
        stateHashBefore: window.stateHashBefore,
        rootAllianceId,
        legalActionCount: legal.length,
        config: {
            toTerminal: TO_TERMINAL,
            maxTransitions: MAX_TRANSITIONS,
            wallMs: WALL_MS,
            continuationPolicy: 'H0-heuristic-seatstream(continuation-seed)',
            continuationSeed: CONTINUATION_SEED,
            teacherTier: TEACHER_TIER,
            teacherVersion: s1.teacherVersion,
            teacherQualified: false,
            teacherQualificationNote:
                'S1a 在 DEV20 实测 2/20（<14/20 门槛），因此其建议只作为观察支路，不作为"正确动作"证明。',
        },
        branches,
        proofLevel,
        causeBucket: null,
    };
    out.write(`${JSON.stringify(record)}\n`);
    summary.push({
        windowId: record.windowId,
        mapName: window.mapName,
        candidateSeat: window.candidateSeat,
        branches: branches.length,
        completed: completed.length,
        proofLevel,
        studentOutcome: student?.outcome ?? null,
        branchOutcomes: Object.fromEntries(branches.map((b) => [b.source, b.outcome])),
        l1ScoreGap: window.l1ScoreGap,
    });
    console.log(
        `[T16-01] ${record.windowId} 支路=${branches.length} 完成=${completed.length} `
        + `student=${student?.outcome ?? 'na'} ${JSON.stringify(Object.fromEntries(branches.map((b) => [b.source, b.outcome])))} → ${proofLevel}`,
    );
}

await new Promise<void>((resolve) => out.end(resolve));

// 失误桶统计（分母与窗口 id 都写出；允许"有其他合法动作仍应结束"的反例）。
const buckets: Record<string, string[]> = {
    '经济占领': [], '招募/堵出口': [], '战损/反击': [], '指挥官与城堡安全': [],
    '地形与推进': [], '回合结束': [], '残局收官': [], '其他/未定': [],
};
for (const row of summary) {
    const id = String(row.windowId);
    const student = summary.find((s) => s.windowId === id);
    void student;
    if (row.branchOutcomes && (row.branchOutcomes as Record<string, string>)['rule-relevant'] === 'WIN'
        && (row.branchOutcomes as Record<string, string>)['student'] !== 'WIN') {
        buckets['残局收官'].push(id);
    } else if ((row.branchOutcomes as Record<string, string>)['l1'] === 'WIN'
        && (row.branchOutcomes as Record<string, string>)['student'] !== 'WIN') {
        buckets['其他/未定'].push(id);
    } else {
        buckets['其他/未定'].push(id);
    }
}

const result = {
    schema: 'v16_counterfactual_summary_1',
    task: 'T16-01',
    windowsPath: WINDOWS_PATH.replace(/\\/g, '/'),
    outPath: outPath.replace(/\\/g, '/'),
    sha256: crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex'),
    windows: summary.length,
    byProofLevel: summary.reduce((acc: Record<string, number>, r) => {
        const k = String(r.proofLevel); acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {}),
    byMap: summary.reduce((acc: Record<string, number>, r) => {
        const k = String(r.mapName); acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {}),
    bySeat: summary.reduce((acc: Record<string, number>, r) => {
        const k = `seat${r.candidateSeat}`; acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {}),
    studentOutcomes: summary.reduce((acc: Record<string, number>, r) => {
        const k = String(r.studentOutcome); acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {}),
    failureBuckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { denominator: summary.length, windowIds: v.slice(0, 20), count: v.length }])),
    bucketNote: '分桶只按"哪个支路在完整 rollout 后获胜"机械划分，尚无语义级归因；残局收官桶允许"有其他合法动作仍应结束"的反例。',
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    windowsDetail: summary,
};
fs.writeFileSync(outPath.replace(/\.jsonl$/, '.summary.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    outPath: outPath.replace(/\\/g, '/'),
    windows: result.windows,
    byProofLevel: result.byProofLevel,
    studentOutcomes: result.studentOutcomes,
    wallSeconds: result.wallSeconds,
}, null, 2));
void V16_DEFAULT_CAPS;