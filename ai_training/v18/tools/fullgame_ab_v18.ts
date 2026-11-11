/**
 * V18/T18-03 预登记搜索改进 S2：**完整对局的策略 A/B**。
 *
 * ## 为什么换掉 S0/S1 的干预方式
 *
 * S0/S1 比较的是「换掉一个原子动作，然后全部交回 H0 有界续弈」。
 * 第一道门已经实测：这种干预方向的可重复率**不超过随机重排基线**，
 * 而且在真的分出胜负的比较里一致改善数为 0。
 * 诊断结论是「固定的 H0 续弈把首手差异迅速抹平」。
 *
 * S2 改成：**从同一个精确状态出发，用同一条随机流，把整局打完**，
 * 只是把**主体座位**的决策策略换成不同候选（学生网络 / H0 / B100-Q），
 * 其余座位一律 H0。结果是**真实自然终局**，不是有界截断估值。
 *
 * 这不是「多试几次」，而是换了一个**更强的干预单位与更干净的标签**。
 *
 * ## 与 S0/S1 的关系
 *
 * - 状态来源相同（同一批学生轨迹）；
 * - RNG 合同相同（每座位 `streamFor(seed, seat)`）；
 * - 但不再有 horizon 截断：跑到自然终局或步数上限，并如实区分两者。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/fullgame_ab_v18.ts \
 *     --run-id run_20260927_v18_01 --windows 32 --policies student,h0,b100q \
 *     --seeds 2026099901,2026099902,2026099903
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { getAllianceId } from '../../src/game/rule_config';
import { mulberry32 } from '../../v15/tools/labeler_l1_v15';
import { createB100Policy } from '../../v17/teachers/b100_policy';
import { b100PolicyInputKeySafe } from '../../v17/teachers/b100_input_key';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'run_20260927_v18_01') as string;
const RUN_ROOT = path.resolve(`v18/out/${RUN_ID}`);
const V17_RUN = path.resolve('v17/out/v17_20260926_r2');
const WINDOWS = Number(arg('--windows', '32'));
const POLICIES = (arg('--policies', 'student,h0,b100q') as string).split(',').map((s) => s.trim()).filter(Boolean);
const SEEDS = (arg('--continuation-seeds', '2026099901,2026099902,2026099903') as string).split(',').map(Number);
const SAMPLE_SEED = Number(arg('--sample-seed', '2026099904'));
const MAX_STEPS = Number(arg('--max-steps', '6000'));
const WALL_MS = Number(arg('--wall-ms', '180000'));
const STUDENT_MODEL = arg('--student-model', `${process.env.V18_CHAMPION ?? 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'}`) as string;
const OUT_TAG = arg('--out-tag', 'S2fullgame') as string;
/** 只从失败轨迹取窗口（默认，与 S0/S1 可比），还是从全部决策取。 */
const SOURCE_FILTER = arg('--source-filter', 'all') as 'all' | 'failure';
/**
 * V18/T18-03 S3：**局面平衡过滤**（只换窗口选择规则，不换干预方式）。
 *
 * S2 的结论是「从学生轨迹均匀抽的 16 个窗口里，换掉整局策略也改不了胜负」。
 * 那批窗口要么接近终局（8+，其中一个在第 8329 个原子步），要么本身已定势。
 * S3 只保留：阶段 0-2 或 3-7、双方存活单位数之差 <= MAX_UNIT_DIFF、双方都还有指挥官。
 * 目的是回答一个更基本的问题：**这五图上到底存不存在对主体策略敏感的状态**。
 */
const BALANCE_FILTER = arg('--balance-filter', 'off') as 'off' | 'balanced';
const MAX_UNIT_DIFF = Number(arg('--max-unit-diff', '1'));

const rolloutFiles = [0, 1, 2, 3, 4].map(
    (m) => path.join(V17_RUN, 'data', 'new_train', 'rollouts', `train_student_P1s2026.m${m}.jsonl`),
);

function streamFor(seed: number, seat: number): () => number {
    const h = crypto.createHash('sha256').update(Buffer.from(`seatstream|${seed}|${seat}`, 'utf8')).digest();
    return mulberry32(h.readUInt32LE(0));
}

interface WindowRow {
    gameId: string;
    rootId: string;
    rootFamilyId: string;
    mapName: string;
    phaseBucket: string;
    stepIndex: number;
    subjectPlayerId: number;
    subjectSeat: number;
    sourceOutcome: string | null;
    valueTarget: number | null;
    behaviorActionCode: string;
    state: GameState;
}

const seen = new Set<string>();
const pool: WindowRow[] = [];
for (const file of rolloutFiles) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        let row: Record<string, unknown>;
        try {
            row = JSON.parse(t) as Record<string, unknown>;
        } catch {
            continue;
        }
        if (String(row.sourcePolicy) !== 'P1:s2026') continue;
        if (!row.stateJson || row.valueTarget === null || row.valueTarget === undefined) continue;
        if (SOURCE_FILTER === 'failure' && Number(row.valueTarget) !== -1) continue;
        const gameId = String(row.gameId);
        if (seen.has(gameId)) continue;
        seen.add(gameId);
        pool.push({
            gameId,
            rootId: String(row.rootId),
            rootFamilyId: String(row.trueFamilyId ?? row.rootFamilyId),
            mapName: String(row.mapName),
            phaseBucket: String(row.phaseBucket),
            stepIndex: Number(row.stepIndex),
            subjectPlayerId: Number(row.subjectPlayerId),
            subjectSeat: Number(row.subjectSeat ?? row.subjectPlayerId),
            sourceOutcome: row.subjectOutcome === null ? null : String(row.subjectOutcome),
            valueTarget: Number(row.valueTarget),
            behaviorActionCode: String(row.behaviorActionCode),
            state: JSON.parse(String(row.stateJson)) as GameState,
        });
    }
}
console.log(`[S2] 候选窗口池 ${pool.length}（source-filter=${SOURCE_FILTER}）`);

/** V18/T18-03 S3：平衡局面过滤。只保留双方兵力相近、都有指挥官、且非残局的状态。 */
function isBalanced(window: WindowRow): boolean {
    if (BALANCE_FILTER === 'off') return true;
    if (window.phaseBucket === '8+') return false;
    const subjectAlliance = getAllianceId(window.state, window.subjectPlayerId);
    const alive = window.state.units.filter((u) => u.hp > 0);
    const own = alive.filter((u) => getAllianceId(window.state, u.ownerId) === subjectAlliance).length;
    const enemy = alive.filter((u) => getAllianceId(window.state, u.ownerId) !== subjectAlliance).length;
    if (Math.abs(own - enemy) > MAX_UNIT_DIFF) return false;
    const hasCommander = (allianceId: number): boolean => alive.some((u) => {
        if (getAllianceId(window.state, u.ownerId) !== allianceId) return false;
        // 与 H0 相同的判据：ownerId === playerId 且 unitClass 为 commander 之一。
        return u.unitClass === 'commander';
    });
    const enemyAlliances = [...new Set(window.state.players
        .map((p) => getAllianceId(window.state, p.id))
        .filter((a) => a !== subjectAlliance))];
    return hasCommander(subjectAlliance) && enemyAlliances.some((a) => hasCommander(a));
}

const balancedPool = pool.filter(isBalanced);
console.log(`[S2] 平衡过滤后候选 ${balancedPool.length}（balance-filter=${BALANCE_FILTER}, maxUnitDiff=${MAX_UNIT_DIFF}）`);

// 固定 seed 的 Fisher–Yates，按 rootFamilyId#stepIndex 排序后洗牌；每家族最多 2 个。
const rng = mulberry32(SAMPLE_SEED);
const shuffled = [...balancedPool].sort((a, b) =>
    `${a.rootFamilyId}#${String(a.stepIndex).padStart(6, '0')}`.localeCompare(
        `${b.rootFamilyId}#${String(b.stepIndex).padStart(6, '0')}`));
for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const perFamily = new Map<string, number>();
const selected: WindowRow[] = [];
for (const row of shuffled) {
    if (selected.length >= WINDOWS) break;
    const used = perFamily.get(row.rootFamilyId) ?? 0;
    if (used >= 2) continue;
    perFamily.set(row.rootFamilyId, used + 1);
    selected.push(row);
}
console.log(`[S2] 选中窗口 ${selected.length}，覆盖 root 家族 ${perFamily.size}`);

// 学生网络
const studentJson = fs.readFileSync(path.resolve(STUDENT_MODEL), 'utf8');
const predictor: SpatialResNetPredictor = new SpatialResNetPredictor(
    loadSpatialResNetFromJson(studentJson, { expectedEncoderSchemaId: 'spatial26_global20_actionSemantics53_v15' }),
);
console.log(`[S2] 学生策略 ${STUDENT_MODEL} schema=${predictor.encoderSchemaId}`);

interface GameResult {
    policy: string;
    seed: number;
    steps: number;
    wallMs: number;
    naturalTerminal: boolean;
    winnerAllianceId: number | null;
    subjectOutcome: string;
    subjectAliveUnits: number;
    enemyAliveUnits: number;
    stopReason: string;
}

function playFullGame(window: WindowRow, policy: string, seed: number): GameResult {
    const engine = new GameEngine(JSON.parse(JSON.stringify(window.state)) as GameState);
    const subjectAlliance = getAllianceId(window.state, window.subjectPlayerId);
    const subjectPlayer = window.subjectPlayerId;
    const seatAi = new Map<number, HeuristicAI>();
    const getAi = (seat: number): HeuristicAI => {
        let ai = seatAi.get(seat);
        if (!ai) { ai = new HeuristicAI(streamFor(seed, seat)); seatAi.set(seat, ai); }
        return ai;
    };
    const started = Date.now();
    let steps = 0;
    let stopReason = 'NATURAL_TERMINAL';

    while (!engine.isTerminal()) {
        if (steps >= MAX_STEPS) { stopReason = 'STEP_LIMIT'; break; }
        if (Date.now() - started > WALL_MS) { stopReason = 'WALL_CLOCK'; break; }
        const state = engine.getState();
        const current = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(current).filter((a) => a.type !== 'surrender');
        if (legal.length === 0) { stopReason = 'NO_LEGAL_ACTIONS'; break; }

        let action: Action | null = null;
        if (current === subjectPlayer) {
            if (policy === 'student') {
                const result = predictSpatialAction(predictor, state, current, legal);
                action = result.action;
            } else if (policy === 'b100q') {
                try {
                    const key = b100PolicyInputKeySafe(state, current, legal);
                    const handle = createB100Policy({
                        variant: 'B100-Q', rootSeed: seed, seat: current,
                        ...(key ? { queryKeyOverride: key.key } : {}),
                    });
                    action = handle.policy({ state, playerId: current, allowed: legal, seat: current, seed });
                } catch {
                    action = null;
                }
            }
            // policy === 'h0' 走下面的默认分支
        }
        if (!action) action = getAi(current).getAction(engine, current, legal);

        const code = encodeAction(action);
        if (!legal.map(encodeAction).includes(code)) { stopReason = 'ILLEGAL_ACTION'; break; }
        try {
            engine.step(action);
        } catch {
            stopReason = 'ENGINE_ERROR';
            break;
        }
        steps += 1;
    }

    const finalState = engine.getState();
    const winner = finalState.winner;
    const naturalTerminal = engine.isTerminal();
    let subjectOutcome = 'TRUNCATED';
    if (naturalTerminal) {
        if (winner === -1) subjectOutcome = 'DRAW';
        else subjectOutcome = winner === subjectAlliance ? 'WIN' : 'LOSS';
    }
    const alive = (allianceId: number): number =>
        finalState.units.filter((u) => u.hp > 0 && getAllianceId(finalState, u.ownerId) === allianceId).length;
    return {
        policy,
        seed,
        steps,
        wallMs: Date.now() - started,
        naturalTerminal,
        winnerAllianceId: winner,
        subjectOutcome,
        subjectAliveUnits: alive(subjectAlliance),
        enemyAliveUnits: finalState.units.filter(
            (u) => u.hp > 0 && getAllianceId(finalState, u.ownerId) !== subjectAlliance,
        ).length,
        stopReason,
    };
}

const windowReports: unknown[] = [];
const startedAll = Date.now();
for (let wi = 0; wi < selected.length; wi += 1) {
    const window = selected[wi];
    const perPolicy: Record<string, GameResult[]> = {};
    for (const policy of POLICIES) {
        perPolicy[policy] = SEEDS.map((seed) => playFullGame(window, policy, seed));
    }
    const summary: Record<string, unknown> = {};
    for (const policy of POLICIES) {
        const results = perPolicy[policy];
        const wins = results.filter((r) => r.subjectOutcome === 'WIN').length;
        const losses = results.filter((r) => r.subjectOutcome === 'LOSS').length;
        const draws = results.filter((r) => r.subjectOutcome === 'DRAW').length;
        const truncated = results.filter((r) => !r.naturalTerminal).length;
        summary[policy] = {
            games: results.length,
            wins,
            losses,
            draws,
            truncated,
            winRate: results.length ? wins / results.length : null,
            naturalCompletionRate: results.length ? (results.length - truncated) / results.length : null,
            meanSteps: results.length ? results.reduce((s, r) => s + r.steps, 0) / results.length : null,
        };
    }
    windowReports.push({
        windowId: `s2w${String(wi).padStart(3, '0')}:${window.gameId}`,
        gameId: window.gameId,
        mapName: window.mapName,
        phaseBucket: window.phaseBucket,
        stepIndex: window.stepIndex,
        rootFamilyId: window.rootFamilyId,
        subjectPlayerId: window.subjectPlayerId,
        studentBehaviorActionCode: window.behaviorActionCode,
        /** 该窗口来自哪一局：win/loss。注意这**不是**本次 A/B 的结果。 */
        originGameOutcome: window.valueTarget === 1 ? 'win' : window.valueTarget === -1 ? 'loss' : null,
        summary,
        perPolicy,
    });
    if ((wi + 1) % 4 === 0) {
        console.log(`[S2] 窗口 ${wi + 1}/${selected.length} 完成 ${((Date.now() - startedAll) / 1000).toFixed(0)}s`);
    }
}

// 聚合：按策略统计胜场，并做**同窗口配对**比较
const aggregate: Record<string, { games: number; wins: number; losses: number; draws: number; truncated: number }> = {};
for (const policy of POLICIES) {
    aggregate[policy] = { games: 0, wins: 0, losses: 0, draws: 0, truncated: 0 };
}
for (const report of windowReports) {
    const w = report as { perPolicy: Record<string, GameResult[]> };
    for (const policy of POLICIES) {
        for (const r of w.perPolicy[policy]) {
            const a = aggregate[policy];
            a.games += 1;
            a.wins += r.subjectOutcome === 'WIN' ? 1 : 0;
            a.losses += r.subjectOutcome === 'LOSS' ? 1 : 0;
            a.draws += r.subjectOutcome === 'DRAW' ? 1 : 0;
            a.truncated += r.naturalTerminal ? 0 : 1;
        }
    }
}

// 配对比较：只在两个策略都自然完赛的 (窗口, seed) 上比较
const paired: Record<string, { bothNatural: number; aWins: number; bWins: number; ties: number }> = {};
for (let i = 0; i < POLICIES.length; i += 1) {
    for (let j = i + 1; j < POLICIES.length; j += 1) {
        const a = POLICIES[i];
        const b = POLICIES[j];
        const key = `${a}_vs_${b}`;
        const entry = { bothNatural: 0, aWins: 0, bWins: 0, ties: 0 };
        for (const report of windowReports) {
            const w = report as { perPolicy: Record<string, GameResult[]> };
            for (let k = 0; k < SEEDS.length; k += 1) {
                const ra = w.perPolicy[a][k];
                const rb = w.perPolicy[b][k];
                if (!ra.naturalTerminal || !rb.naturalTerminal) continue;
                entry.bothNatural += 1;
                const sa = ra.subjectOutcome === 'WIN' ? 1 : 0;
                const sb = rb.subjectOutcome === 'WIN' ? 1 : 0;
                if (sa > sb) entry.aWins += 1;
                else if (sb > sa) entry.bWins += 1;
                else entry.ties += 1;
            }
        }
        paired[key] = entry;
    }
}

const report = {
    schema: 'v18_fullgame_ab_1',
    runId: RUN_ID,
    contract: {
        intervention: '从同一精确状态出发，用同一条每座位随机流，把整局打完；只改主体座位的策略',
        policies: POLICIES,
        seeds: SEEDS,
        maxSteps: MAX_STEPS,
        wallMsPerGame: WALL_MS,
        sourceFilter: SOURCE_FILTER,
        sampleSeed: SAMPLE_SEED,
        studentModel: STUDENT_MODEL,
        note: '结果只有自然终局才算胜负；截断单列，不计入胜率比较。',
    },
    windows: windowReports.length,
    windowCount: windowReports.length,
    rootFamilies: perFamily.size,
    aggregate,
    pairedComparison: paired,
    /**
     * 逐窗口明细必须落盘：任务书要求「按 family 给区间」，
     * 只有总数无法做家族级读数，也无法复核同一家族的多个窗口是否被当成独立样本。
     */
    windowDetails: windowReports,
    wallSeconds: Number(((Date.now() - startedAll) / 1000).toFixed(1)),
    disclaimer: [
        '主体座位换策略、其余座位仍为 H0；这不是「学生对 H0」的完整对局，而是「同一局面下不同主体策略」的对照。',
        '窗口来自学生轨迹，因此仍偏向学生访问分布；结论只覆盖这些状态。',
        '每窗口只有 3 个 seed，配对比较的样本量很小，必须看区间而不是只看胜场差。',
    ],
};

const dir = path.join(RUN_ROOT, 'counterfactual');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `fullgame_ab.${OUT_TAG}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    out: `counterfactual/fullgame_ab.${OUT_TAG}.json`,
    windows: report.windows,
    rootFamilies: report.rootFamilies,
    aggregate,
    pairedComparison: paired,
    wallSeconds: report.wallSeconds,
}, null, 2));
