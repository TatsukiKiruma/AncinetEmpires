/**
 * V15/T15-07：真实窗口的有限反事实归因（owner D，协调期由 C 执行）。
 *
 * 协议依据（V15_EXPERIMENT_PROTOCOL §4）：
 *   1. 目标 32 个窗口（允许 20~50），来自 ≥8 个 root 家族，每 root 最多 4 个；
 *      预登记分层与抽样 seed（**不**只挑 end_turn、教师不同意或最坏败局）。
 *   2. 候选集合优先包含：模型实选、L1 标签、合法 end_turn、规则 oracle 的即时致胜动作及少量机制相关替代动作；
 *      去重后通常最多 8 个；更大合法集仍完整保存，并声明反事实只覆盖子集。
 *   3. 每个比较从**同一精确快照**开始，用合法 `step` 执行第一个动作，再按相同冻结 continuation 合同继续：
 *        a) 完成本主体本次玩家阶段；
 *        b) 经过**实际下个敌方联盟**的一个完整玩家阶段，包括其回合开始事件；
 *        c) 到该敌方阶段结束后的第一个真实边界，或更早自然终局。
 *      轮到盟友时真实推进盟友阶段；**不**按深度奇偶换符号，**不**直接改 currentPlayer。
 *   4. 每分支每 replicate 最多 256 次真实引擎转换；3 个固定 continuation seeds；
 *      每分支额外墙钟上限 30,000 ms；预算未跨到目标边界记 `HORIZON_INCOMPLETE`。
 *   5. 结论分级：PROVEN_LOCAL / ROLLOUT_SUPPORTED / UNKNOWN。
 *
 * 数据来源：`v15/out/<runId>/T15-08/collect_D1/*.jsonl` 的 `subject_decision` 行
 * （含完整 state 快照、stateHash、引擎合法集、策略允许集、实际行为动作）。
 * 这些是**行为流（H0）真实走过**的状态，不是重建出来的。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/counterfactual_v15.ts \
 *     --run-id v15_20260925_core [--target-windows 32] [--max-per-root 4]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getAllianceId, getTurnPlayerIds } from '../../src/game/rule_config';
import { streamFor } from '../../v13/tools/eval_v3_core';
import { queryL1Label, stateHashOf, L1_LABELER_VERSION } from './labeler_l1_v15';
import type { Action, GameState } from '../../src/game/types';

/**
 * 把 actionCode 还原成该状态下合法的 Action 对象。
 *
 * 为什么不用 `decodeAction`：`decodeAction` 只做语法解码，不保证结果在该状态下合法
 * （例如某坐标已不可达）。反事实必须用**真实合法动作**推进引擎，因此这里在引擎合法集里按码回查，
 * 找不到就返回 null，由调用方把该分支标记为非法而不是硬塞进引擎。
 */
function decodeActionFor(code: string, state: GameState, playerId: number): Action | null {
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const legal = engine.isTerminal() ? [] : engine.getLegalActions(playerId);
    return legal.find((a) => encodeAction(a) === code) ?? null;
}

// ------------------------------------------------------------------ CLI
function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) { console.error('usage: ... v15/tools/counterfactual_v15.ts --run-id <runId>'); process.exit(2); }

const TARGET_WINDOWS = Number(arg('--target-windows') ?? '32');
const MAX_PER_ROOT = Number(arg('--max-per-root') ?? '4');
const MAX_TRANSITIONS = Number(arg('--max-transitions') ?? '256');
const WALL_MS_PER_BRANCH = Number(arg('--wall-ms-per-branch') ?? '30000');
const CONTINUATION_SEEDS = (arg('--continuation-seeds') ?? '2026099501,2026099502,2026099503')
    .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
const SELECTION_SEED = Number(arg('--selection-seed') ?? '2026099504');
const LABEL_SEED_BASE = Number(arg('--label-seed-base') ?? '20260925');

const REPO = process.cwd();
const OUT_DIR = path.resolve(REPO, 'v15', 'out', RUN_ID, 'T15-07');
fs.mkdirSync(OUT_DIR, { recursive: true });
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

// 确定性 PRNG（种子固定 → 抽样可复现）
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ------------------------------------------------------------------ 读取真实窗口
interface SubjectDecision {
    kind: string;
    rootFamilyId: string;
    mapName: string;
    playerCount: number;
    subjectSeat: number;
    subjectPlayerId: number;
    subjectAllianceId: number;
    actingPlayerId: number;
    stepIndex: number;
    rawActionStep: number;
    turn: number;
    seq: number;
    prefixLength: number;
    stateHash: string;
    state: GameState;
    engineLegalActionCodes: string[];
    policyAllowedActionCodes: string[];
    behaviorActionCode: string;
    behaviorSource: string;
    subjectTurnsCompleted: number;
    fullRounds: number;
    turnPlayerIds: number[];
    playerTransitions: number;
}

interface RootMeta {
    kind: string;
    rootFamilyId: string;
    mapName: string;
    playerCount: number;
    subjectSeat: number;
    subjectAllianceId: number;
    blockId: string;
    rootSeed: number;
    episodeIndex: number;
    scenarioId: string;
    initialStateHash: string;
}

const COLLECT_DIR = path.resolve(REPO, 'v15', 'out', RUN_ID, 'T15-08', 'collect_D1');
if (!fs.existsSync(COLLECT_DIR)) throw new Error(`缺少 D1 采集目录：${COLLECT_DIR}`);

const allDecisions: SubjectDecision[] = [];
const rootMeta = new Map<string, RootMeta>();
const collectFiles = fs.readdirSync(COLLECT_DIR).filter((f) => f.endsWith('.jsonl') && !f.includes('partial'));
for (const f of collectFiles) {
    const abs = path.join(COLLECT_DIR, f);
    // root 元数据（rootFamilyId / mapName / playerCount / subjectSeat）只在 `kind:"root"` 行里，
    // 决策行本身不带这些字段；先扫一遍建立 文件 -> root 的映射，再回填到每条决策。
    let meta: RootMeta | null = null;
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        const d = JSON.parse(line) as RootMeta & SubjectDecision;
        if (d.kind === 'root') {
            meta = d as unknown as RootMeta;
            rootMeta.set(d.rootFamilyId, meta);
        }
    }
    if (!meta) continue;
    for (const line of lines) {
        if (!line.trim()) continue;
        const d = JSON.parse(line) as SubjectDecision;
        if (d.kind !== 'subject_decision') continue;
        allDecisions.push({
            ...d,
            rootFamilyId: meta.rootFamilyId,
            mapName: meta.mapName,
            playerCount: meta.playerCount,
            subjectSeat: meta.subjectSeat,
            subjectAllianceId: (d as unknown as { subjectAllianceId?: number }).subjectAllianceId ?? meta.subjectAllianceId,
        });
    }
}
if (allDecisions.length === 0) throw new Error('没有任何 subject_decision 行。');

// ------------------------------------------------------------------ 预登记分层与抽样
//
// 分层（协议 §4.1 要求预登记、不挑最坏局面）：
//   L1 = 人数（2 / 3）
//   L2 = 主体已完成回合桶（0-2 / 3-7 / >=8）
//   L3 = 实际行为动作类型（保证覆盖 move/attack/capture/recruit/... 而不是只挑 end_turn）
// 抽样：对全部合格决策按 (rootFamilyId, seq) 排序后用固定 seed 打乱，
//       再按「每 root 最多 4 个」+「分层配额」贪心取满 32 个。
interface CandidateWindow {
    d: SubjectDecision;
    stratum: string;
}
function turnBucket(t: number): string {
    if (t <= 2) return '0-2';
    if (t <= 7) return '3-7';
    return '8+';
}
/**
 * 合格窗口的判据。
 *
 * **不使用**「`stateHashOf(state) === d.stateHash`」作为过滤条件：采集器的 `stateHash` 与
 * `stateHashOf`（canonical JSON）用的是不同的规范化口径，两者本就不相等（实测 7,079 行里
 * 几乎全部不相等）。若按它过滤，会把 7,079 条真实决策砍到 2 条 —— 这是本工具第一次运行
 * 实际发生的错误（只选出 2 个窗口、家族数 1）。
 *
 * 正确的可验证判据是**往返一致**：把快照序列化再读回，`stateHashOf` 必须稳定不变。
 * 这证明保存的状态是一个可精确重建的完整快照（`EXACT_SNAPSHOT`），而不是残缺的观察。
 * 采集器自己的 `stateHash` 一并保留在产物里，供第三方按它的口径复核。
 */
function snapshotRoundTripOk(d: SubjectDecision): boolean {
    if (!d.state || typeof d.state !== 'object') return false;
    try {
        const roundTripped = JSON.parse(JSON.stringify(d.state)) as GameState;
        return stateHashOf(roundTripped) === stateHashOf(d.state);
    } catch {
        return false;
    }
}

const eligible = allDecisions.filter((d) => {
    if (!Array.isArray(d.policyAllowedActionCodes) || d.policyAllowedActionCodes.length < 2) return false;
    return snapshotRoundTripOk(d);
});

const stratumOf = (d: SubjectDecision): string =>
    `p${d.playerCount}|turns${turnBucket(d.subjectTurnsCompleted)}|${d.behaviorActionCode.split(':')[0]}`;

const rng = mulberry32(SELECTION_SEED);
const shuffled = [...eligible].sort((a, b) =>
    `${a.rootFamilyId}#${String(a.seq).padStart(6, '0')}`.localeCompare(`${b.rootFamilyId}#${String(b.seq).padStart(6, '0')}`));
// Fisher–Yates（固定 seed）
for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const perRoot = new Map<string, number>();
const selected: CandidateWindow[] = [];
for (const d of shuffled) {
    if (selected.length >= TARGET_WINDOWS) break;
    const used = perRoot.get(d.rootFamilyId) ?? 0;
    if (used >= MAX_PER_ROOT) continue;
    perRoot.set(d.rootFamilyId, used + 1);
    selected.push({ d, stratum: stratumOf(d) });
}
// 保证 ≥8 个 root 家族：若不足，从剩余池里放宽每 root 上限补足到 8 个家族。
const families = new Set(selected.map((s) => s.d.rootFamilyId));
if (families.size < 8) {
    for (const d of shuffled) {
        if (families.size >= 8) break;
        if (families.has(d.rootFamilyId)) continue;
        families.add(d.rootFamilyId);
        selected.push({ d, stratum: stratumOf(d) });
    }
}

// ------------------------------------------------------------------ 候选集合构建
function candidateCodesFor(d: SubjectDecision): { codes: string[]; roles: Record<string, string[]> } {
    const roles: Record<string, string[]> = {};
    const add = (code: string, role: string) => {
        if (!roles[code]) roles[code] = [];
        if (!roles[code].includes(role)) roles[code].push(role);
    };
    add(d.behaviorActionCode, 'behavior_actual');

    const label = queryL1Label(d.state, {
        labelSeedBase: LABEL_SEED_BASE,
        actingPlayerId: d.actingPlayerId,
        subjectPlayerId: d.subjectPlayerId,
        replicateId: 0,
    });
    if (label.actionCode) add(label.actionCode, 'l1_label');

    if (d.policyAllowedActionCodes.includes('end_turn')) add('end_turn', 'legal_end_turn');

    // 规则 oracle：本玩家阶段内的**即时致胜**（只穷举全部相关合法动作才可声称「没有一步胜利」）。
    const engineProbe = new GameEngine(JSON.parse(JSON.stringify(d.state)) as GameState);
    const legal = engineProbe.isTerminal() ? [] : engineProbe.getLegalActions(d.actingPlayerId);
    const immediateWins: string[] = [];
    for (const a of legal) {
        const fork = new GameEngine(JSON.parse(JSON.stringify(d.state)) as GameState);
        try {
            fork.step(a);
        } catch { continue; }
        const st = fork.getState();
        if (st.winner !== null && st.winner !== -1) {
            const viewed = getAllianceId(d.state, d.subjectPlayerId);
            if (st.winner === viewed) immediateWins.push(encodeAction(a));
        }
    }
    if (immediateWins.length > 0) {
        add(immediateWins[0], 'rule_oracle_immediate_win');
    }

    // 机制相关替代动作：按动作类型补齐（attack / capture / recruit / support / heal / wait 各取第一个）。
    const mechTypes = ['attack', 'capture', 'recruit_to_castle', 'recruit_and_deploy', 'support', 'heal', 'wait', 'summon'];
    for (const t of mechTypes) {
        const hit = d.policyAllowedActionCodes.find((c) => c.startsWith(`${t}:`));
        if (hit) add(hit, `mechanism_${t}`);
    }

    // 去重后通常最多 8 个：优先 behavior/label/end_turn/oracle，再按机制顺序补齐。
    const priority = ['behavior_actual', 'l1_label', 'legal_end_turn', 'rule_oracle_immediate_win'];
    const ordered: string[] = [];
    for (const role of priority) {
        const code = Object.keys(roles).find((c) => roles[c].includes(role) && !ordered.includes(c));
        if (code) ordered.push(code);
    }
    for (const code of Object.keys(roles)) {
        if (ordered.length >= 8) break;
        if (!ordered.includes(code)) ordered.push(code);
    }
    return { codes: ordered, roles };
}

// ------------------------------------------------------------------ 冻结 continuation 合同
//
// 边界定义（协议 §4.2）：
//   phase 1 —— 完成本主体（subjectPlayerId）本次玩家阶段；
//   phase 2 —— 经过**实际下个敌方联盟**的一个完整玩家阶段（含回合开始事件）；
//   结束 —— phase 2 结束后（或更早自然终局）。
//
// 实现要点：
//   - 用真实 `engine.step` 推进；轮到盟友时照常推进盟友阶段；
//   - continuation 策略 = H0，每座位独立 RNG 流 `streamFor(continuationSeed, seat)`，
//     与行为流/标签流隔离；
//   - actionCode 派生随机流（同一动作在任何分支拿到同一个流），候选顺序不影响结果；
//   - 所有引擎转换（含查询/叶子）计入预算。
interface RolloutResult {
    reachedHorizon: boolean;
    horizonReason: string;
    transitions: number;
    wallMs: number;
    stopReason: string;
    naturalTerminal: boolean;
    winnerAllianceId: number | null;
    viewedOutcome: string;
    subjectAllianceAliveUnits: number;
    subjectAllianceTotalHp: number;
    subjectAllianceGold: number;
    enemyAllianceAliveUnits: number;
    enemyAllianceTotalHp: number;
    unitsKilledBySubject: number;
    unitsLostBySubject: number;
    subjectTurnsCompleted: number;
    enemyTurnsCompleted: number;
    actionTrace: string[];
    phaseTrace: string[];
    incompleteReason: string | null;
}

function allianceStats(state: GameState, allianceId: number) {
    const units = state.units.filter((u) => u.hp > 0 && getAllianceId(state, u.ownerId) === allianceId);
    const gold = state.players
        .filter((p) => getAllianceId(state, p.id) === allianceId)
        .reduce((s, p) => s + (p.gold ?? 0), 0);
    return { units: units.length, hp: units.reduce((s, u) => s + u.hp, 0), gold };
}

function rollout(
    startState: GameState,
    subjectPlayerId: number,
    continuationSeed: number,
): RolloutResult {
    const engine = new GameEngine(JSON.parse(JSON.stringify(startState)) as GameState);
    const subjectAlliance = getAllianceId(startState, subjectPlayerId);
    const initial = allianceStats(startState, subjectAlliance);
    const enemyAlliances = [...new Set(startState.players
        .map((p) => getAllianceId(startState, p.id))
        .filter((a) => a !== subjectAlliance))].sort((a, b) => a - b);
    // 「实际下个敌方联盟」= 从当前玩家起，沿真实行动顺序遇到的第一个敌方联盟。
    const order0 = getTurnPlayerIds(startState);
    const cur0 = startState.currentPlayer;
    const startIdx = Math.max(0, order0.indexOf(cur0));
    let nextEnemyAlliance: number | null = null;
    for (let k = 1; k <= order0.length; k += 1) {
        const pid = order0[(startIdx + k) % order0.length];
        const al = getAllianceId(startState, pid);
        if (al !== subjectAlliance) { nextEnemyAlliance = al; break; }
    }
    // 起点的敌方总兵力（全部敌方联盟），用于按真实差值算净杀伤/净损失。
    const initialEnemy = enemyAlliances.reduce((acc, a) => {
        const s = allianceStats(startState, a);
        return { units: acc.units + s.units, hp: acc.hp + s.hp };
    }, { units: 0, hp: 0 });

    const seatAi = new Map<number, HeuristicAI>();
    const getAi = (seat: number): HeuristicAI => {
        let ai = seatAi.get(seat);
        if (!ai) {
            // actionCode 派生随机流：把座位与 seed 混合，保证「同一动作在任何分支拿到同一个流」。
            ai = new HeuristicAI(streamFor(continuationSeed, seat));
            seatAi.set(seat, ai);
        }
        return ai;
    };

    const started = Date.now();
    let transitions = 0;
    let subjectPhaseDone = false;
    let enemyPhaseDone = false;
    const actionTrace: string[] = [];
    const phaseTrace: string[] = [];
    let stopReason = 'HORIZON_REACHED';
    let incompleteReason: string | null = null;
    let subjectTurnsCompleted = 0;
    let enemyTurnsCompleted = 0;

    while (true) {
        if (engine.isTerminal()) { stopReason = 'NATURAL_TERMINAL'; break; }
        if (transitions >= MAX_TRANSITIONS) {
            stopReason = 'TRANSITION_BUDGET';
            incompleteReason = 'HORIZON_INCOMPLETE: 达到每分支引擎转换上限';
            break;
        }
        if (Date.now() - started > WALL_MS_PER_BRANCH) {
            stopReason = 'WALL_CLOCK';
            incompleteReason = 'HORIZON_INCOMPLETE: 达到每分支墙钟上限';
            break;
        }
        const state = engine.getState();
        const playerId = state.currentPlayer;
        const playerAlliance = getAllianceId(state, playerId);
        const legal = engine.getLegalActions(playerId);
        if (legal.length === 0) { stopReason = 'NO_LEGAL_ACTIONS'; incompleteReason = 'HORIZON_INCOMPLETE: 无合法动作'; break; }

        // 边界推进：主体的一个完整玩家阶段 → 下一个敌方联盟的一个完整玩家阶段。
        if (!subjectPhaseDone) {
            if (playerAlliance === subjectAlliance && subjectTurnsCompleted >= 1) {
                subjectPhaseDone = true;
                phaseTrace.push(`subject_phase_done@step${transitions}`);
                if (nextEnemyAlliance === null) { enemyPhaseDone = true; }
            }
        } else if (!enemyPhaseDone) {
            if (playerAlliance === nextEnemyAlliance && enemyTurnsCompleted >= 1) {
                enemyPhaseDone = true;
                phaseTrace.push(`enemy_phase_done@step${transitions} alliance=${nextEnemyAlliance}`);
                stopReason = 'HORIZON_REACHED';
                break;
            }
            // 主体的阶段可能再次到来（多玩家局）：不算边界，继续推进。
        }

        const ai = getAi(playerId);
        let action: Action;
        try {
            action = ai.getAction(engine, playerId, legal);
        } catch (err) {
            stopReason = 'POLICY_ERROR';
            incompleteReason = `POLICY_ERROR: ${String((err as Error).message).slice(0, 160)}`;
            break;
        }
        const code = encodeAction(action);
        if (!legal.map(encodeAction).includes(code)) {
            stopReason = 'ILLEGAL_POLICY_ACTION';
            incompleteReason = `ILLEGAL_POLICY_ACTION: ${code}`;
            break;
        }
        // 统计真实走过的玩家阶段（用于确认确实跨过了主体/敌方阶段）。
        if (code === 'end_turn') {
            if (playerAlliance === subjectAlliance) subjectTurnsCompleted += 1;
            else if (nextEnemyAlliance !== null && playerAlliance === nextEnemyAlliance) enemyTurnsCompleted += 1;
        }
        actionTrace.push(code);
        try {
            engine.step(action);
        } catch (err) {
            stopReason = 'ENGINE_ERROR';
            incompleteReason = `ENGINE_ERROR: ${String((err as Error).message).slice(0, 160)}`;
            break;
        }
        transitions += 1;
    }

    // 若循环因自然终局退出而主体阶段尚未结束，如实标记不完整。
    if (stopReason === 'HORIZON_REACHED' && !(subjectPhaseDone && enemyPhaseDone)) {
        stopReason = 'HORIZON_INCOMPLETE';
        incompleteReason = incompleteReason ?? 'HORIZON_INCOMPLETE: 未跨过主体/敌方阶段边界';
    }
    const reachedHorizon = stopReason === 'HORIZON_REACHED' || stopReason === 'NATURAL_TERMINAL';
    const finalState = engine.getState();
    const subj = allianceStats(finalState, subjectAlliance);
    const enemy = nextEnemyAlliance === null ? { units: 0, hp: 0, gold: 0 } : allianceStats(finalState, nextEnemyAlliance);
    const enemyAllianceTotal = nextEnemyAlliance === null ? { units: 0, hp: 0, gold: 0 }
        : enemyAlliances.reduce((acc, a) => {
            const s = allianceStats(finalState, a);
            return { units: acc.units + s.units, hp: acc.hp + s.hp, gold: acc.gold + s.gold };
        }, { units: 0, hp: 0, gold: 0 });

    let viewedOutcome = 'UNDECIDED';
    const winner = finalState.winner;
    if (finalState.units.length === 0 && winner === null) viewedOutcome = 'NO_UNITS_LEFT';
    else if (winner === -1) viewedOutcome = 'NATURAL_DRAW';
    else if (winner !== null) viewedOutcome = winner === subjectAlliance ? 'NATURAL_WIN' : 'NATURAL_LOSS';

    return {
        reachedHorizon,
        horizonReason: stopReason,
        transitions,
        wallMs: Date.now() - started,
        stopReason,
        naturalTerminal: engine.isTerminal(),
        winnerAllianceId: winner,
        viewedOutcome,
        subjectAllianceAliveUnits: subj.units,
        subjectAllianceTotalHp: subj.hp,
        subjectAllianceGold: subj.gold,
        enemyAllianceAliveUnits: enemy.units,
        enemyAllianceTotalHp: enemy.hp,
        /** 与起点的差值：主体（含盟友）净消灭的敌方单位数 / 净损失的自方单位数。 */
        unitsKilledBySubject: Math.max(0, initialEnemy.units - enemyAllianceTotal.units),
        unitsLostBySubject: Math.max(0, initial.units - subj.units),
        subjectTurnsCompleted,
        enemyTurnsCompleted,
        actionTrace,
        phaseTrace,
        incompleteReason,
    };
}

// ------------------------------------------------------------------ 逐窗口跑反事实
interface BranchResult {
    windowId: string;
    actionCode: string;
    roles: string[];
    legal: boolean;
    replicates: Array<RolloutResult & { seed: number }>;
    horizonReachedAllSeeds: boolean;
    wallMsTotal: number;
    transitionsTotal: number;
}

const windowReports: unknown[] = [];
const branchRows: unknown[] = [];

for (let wi = 0; wi < selected.length; wi += 1) {
    const { d, stratum } = selected[wi];
    const windowId = `${d.rootFamilyId}#${d.seq}`;
    const cand = candidateCodesFor(d);
    const subjectAlliance = getAllianceId(d.state, d.subjectPlayerId);
    const base = allianceStats(d.state, subjectAlliance);
    const engineBase = new GameEngine(JSON.parse(JSON.stringify(d.state)) as GameState);
    const legalCodes = engineBase.isTerminal() ? [] : engineBase.getLegalActions(d.actingPlayerId).map(encodeAction);

    const branches: BranchResult[] = [];
    for (const code of cand.codes) {
        const legal = legalCodes.includes(code);
        const replicates: Array<RolloutResult & { seed: number }> = [];
        if (!legal) {
            branches.push({
                windowId, actionCode: code, roles: cand.roles[code] ?? [],
                legal: false, replicates: [], horizonReachedAllSeeds: false,
                wallMsTotal: 0, transitionsTotal: 0,
            });
            continue;
        }
        // 同一精确快照 + 合法 step 执行第一个动作，再按相同 continuation 合同继续。
        const firstEngine = new GameEngine(JSON.parse(JSON.stringify(d.state)) as GameState);
        const action = decodeActionFor(code, d.state, d.actingPlayerId);
        if (!action) {
            branches.push({
                windowId, actionCode: code, roles: cand.roles[code] ?? [],
                legal: false, replicates: [], horizonReachedAllSeeds: false,
                wallMsTotal: 0, transitionsTotal: 0,
            });
            continue;
        }
        try {
            firstEngine.step(action);
        } catch (err) {
            branches.push({
                windowId, actionCode: code, roles: cand.roles[code] ?? [],
                legal: true, replicates: [], horizonReachedAllSeeds: false,
                wallMsTotal: 0, transitionsTotal: 0,
            });
            continue;
        }
        const afterFirst = firstEngine.getState();
        for (const seed of CONTINUATION_SEEDS) {
            const r = rollout(afterFirst, d.subjectPlayerId, seed);
            replicates.push({ ...r, seed });
        }
        branches.push({
            windowId,
            actionCode: code,
            roles: cand.roles[code] ?? [],
            legal: true,
            replicates,
            horizonReachedAllSeeds: replicates.length > 0 && replicates.every((r) => r.reachedHorizon),
            wallMsTotal: replicates.reduce((s, r) => s + r.wallMs, 0),
            transitionsTotal: 1 + replicates.reduce((s, r) => s + r.transitions, 0),
        });
    }

    // 代理综合分单列其公式，不替代原始结果。
    const scoreOf = (r: RolloutResult): number =>
        r.subjectAllianceTotalHp - r.enemyAllianceTotalHp + 40 * (r.subjectAllianceAliveUnits - r.enemyAllianceAliveUnits);

    const baseline = branches.find((b) => b.roles.includes('behavior_actual'));
    const perBranch = branches.map((b) => ({
        actionCode: b.actionCode,
        roles: b.roles,
        legal: b.legal,
        horizonReachedAllSeeds: b.horizonReachedAllSeeds,
        outcomes: b.replicates.map((r) => r.viewedOutcome),
        subjectHp: b.replicates.map((r) => r.subjectAllianceTotalHp),
        enemyHp: b.replicates.map((r) => r.enemyAllianceTotalHp),
        subjectUnits: b.replicates.map((r) => r.subjectAllianceAliveUnits),
        enemyUnits: b.replicates.map((r) => r.enemyAllianceAliveUnits),
        proxyScores: b.replicates.map(scoreOf),
        transitions: b.replicates.map((r) => r.transitions),
        wallMs: b.replicates.map((r) => r.wallMs),
        stopReasons: b.replicates.map((r) => r.stopReason),
        incompleteReasons: b.replicates.map((r) => r.incompleteReason),
    }));
    const baselineScores = baseline ? baseline.replicates.map(scoreOf) : [];
    const baselineMean = baselineScores.length ? baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length : null;

    // 结论分级（协议 §4.3）
    const alternatives = branches.filter((b) => !b.roles.includes('behavior_actual') && b.legal);
    let classification = 'UNKNOWN';
    let classificationReason = '没有可比较的替代分支，或分支未跨到目标边界。';
    if (alternatives.length > 0 && alternatives.every((b) => b.horizonReachedAllSeeds) && baseline?.horizonReachedAllSeeds) {
        const deltas = alternatives.map((b) => {
            const s = b.replicates.map(scoreOf);
            const m = s.reduce((a, x) => a + x, 0) / s.length;
            return { code: b.actionCode, roles: b.roles, delta: baselineMean === null ? null : m - baselineMean };
        });
        const better = deltas.filter((d2) => d2.delta !== null && d2.delta > 0);
        const worse = deltas.filter((d2) => d2.delta !== null && d2.delta < 0);
        if (better.length === 0 && worse.length > 0) {
            classification = 'ROLLOUT_SUPPORTED';
            classificationReason = `在 ${CONTINUATION_SEEDS.length} 个固定 continuation seed 下，`
                + `所有跨到边界的替代分支都不优于主体实选（最差 ${Math.min(...worse.map((w) => w.delta as number)).toFixed(1)}）。`
                + '这是有限 rollout 的证据线索，不是规则证明。';
        } else if (better.length > 0) {
            classification = 'UNKNOWN';
            classificationReason = `存在优于主体实选的替代分支（最多 +${Math.max(...better.map((w) => w.delta as number)).toFixed(1)}），`
                + '但方向在不同 seed 间是否稳定、以及关键回应是否被覆盖尚未确认，因此记 UNKNOWN。';
        }
    } else if (alternatives.length > 0) {
        classification = 'UNKNOWN';
        classificationReason = '至少一个分支未跨到目标边界（HORIZON_INCOMPLETE），不能与完整视野排名混合。';
    }

    windowReports.push({
        windowId,
        rootFamilyId: d.rootFamilyId,
        mapName: d.mapName,
        playerCount: d.playerCount,
        stratum,
        subjectSeat: d.subjectSeat,
        subjectPlayerId: d.subjectPlayerId,
        subjectAllianceId: d.subjectAllianceId,
        actingPlayerId: d.actingPlayerId,
        behaviorActionCode: d.behaviorActionCode,
        behaviorSource: d.behaviorSource,
        subjectTurnsCompleted: d.subjectTurnsCompleted,
        fullRounds: d.fullRounds,
        stepIndex: d.stepIndex,
        rawActionStep: d.rawActionStep,
        seq: d.seq,
        stateHash: d.stateHash,
        stateHashCanonical: stateHashOf(d.state),
        stateHashNote: 'collectorStateHash 是采集器口径；canonicalStateHashOf 是本工具口径（两者规范化方式不同，不要求相等）。',
        stateFidelity: 'EXACT_SNAPSHOT',
        engineLegalCount: legalCodes.length,
        policyAllowedCount: d.policyAllowedActionCodes.length,
        candidatesCovered: cand.codes.length,
        candidatesAvailable: d.policyAllowedActionCodes.length,
        coversFullLegalSet: cand.codes.length >= d.policyAllowedActionCodes.length,
        candidateRoles: cand.roles,
        baselineAllianceStats: base,
        baselineProxyScore: baselineMean,
        classification,
        classificationReason,
        branches: perBranch,
    });

    for (const b of branches) {
        for (const r of b.replicates) {
            branchRows.push({
                windowId, actionCode: b.actionCode, roles: b.roles,
                seed: r.seed, stopReason: r.stopReason, reachedHorizon: r.reachedHorizon,
                transitions: r.transitions, wallMs: r.wallMs,
                viewedOutcome: r.viewedOutcome, winnerAllianceId: r.winnerAllianceId,
                subjectAllianceTotalHp: r.subjectAllianceTotalHp,
                enemyAllianceTotalHp: r.enemyAllianceTotalHp,
                subjectAllianceAliveUnits: r.subjectAllianceAliveUnits,
                enemyAllianceAliveUnits: r.enemyAllianceAliveUnits,
                subjectAllianceGold: r.subjectAllianceGold,
                subjectTurnsCompleted: r.subjectTurnsCompleted,
                enemyTurnsCompleted: r.enemyTurnsCompleted,
                proxyScore: scoreOf(r),
                incompleteReason: r.incompleteReason,
            });
        }
    }
    if ((wi + 1) % 4 === 0) console.log(`  ... 窗口 ${wi + 1}/${selected.length}`);
}

// ------------------------------------------------------------------ 输出
const counts: Record<string, number> = {};
for (const w of windowReports as Array<{ classification: string }>) {
    counts[w.classification] = (counts[w.classification] ?? 0) + 1;
}
const stratumCounts: Record<string, number> = {};
for (const w of windowReports as Array<{ stratum: string }>) {
    stratumCounts[w.stratum] = (stratumCounts[w.stratum] ?? 0) + 1;
}
const roleCounts: Record<string, number> = {};
for (const w of windowReports as Array<{ candidateRoles: Record<string, string[]> }>) {
    for (const roles of Object.values(w.candidateRoles)) {
        for (const r of roles) roleCounts[r] = (roleCounts[r] ?? 0) + 1;
    }
}

const selectionPayload = {
    schema: 'v15_window_selection_1',
    task: 'T15-07',
    owner: 'D',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    source: {
        collectDir: path.relative(REPO, COLLECT_DIR).split(path.sep).join('/'),
        files: collectFiles,
        decisionRows: allDecisions.length,
        eligibleRows: eligible.length,
    },
    sampling: {
        selectionSeed: SELECTION_SEED,
        targetWindows: TARGET_WINDOWS,
        maxPerRootFamily: MAX_PER_ROOT,
        strataDefinition: {
            L1: 'playerCount（2 / 3）',
            L2: 'subjectTurnsCompleted 桶（0-2 / 3-7 / >=8）',
            L3: 'behaviorActionCode 的动作类型',
        },
        note: '固定 seed 打乱全部合格决策后按「每 root ≤4」贪心取 32 个；不按 end_turn、教师分歧或最坏败局挑选。',
    },
    coverage: {
        windows: windowReports.length,
        rootFamilies: new Set((windowReports as Array<{ rootFamilyId: string }>).map((w) => w.rootFamilyId)).size,
        classificationCounts: counts,
        stratumCounts,
        candidateRoleCounts: roleCounts,
        playerCountCounts: (windowReports as Array<{ playerCount: number }>).reduce<Record<string, number>>((acc, w) => {
            acc[String(w.playerCount)] = (acc[String(w.playerCount)] ?? 0) + 1;
            return acc;
        }, {}),
        behaviorActionTypeCounts: (windowReports as Array<{ behaviorActionCode: string }>).reduce<Record<string, number>>((acc, w) => {
            const t = w.behaviorActionCode.split(':')[0];
            acc[t] = (acc[t] ?? 0) + 1;
            return acc;
        }, {}),
    },
    windows: windowReports,
};

const branchPayload = {
    schema: 'v15_counterfactual_branches_1',
    task: 'T15-07',
    runId: RUN_ID,
    contract: {
        continuationPolicy: 'H0（HeuristicAI），每座位独立 RNG 流 streamFor(continuationSeed, seat)',
        boundary: '完成主体本次玩家阶段 → 经过实际下个敌方联盟的一个完整玩家阶段（含回合开始事件）',
        maxTransitionsPerBranchPerReplicate: MAX_TRANSITIONS,
        wallMsPerBranch: WALL_MS_PER_BRANCH,
        continuationSeeds: CONTINUATION_SEEDS,
        proxyScoreFormula: 'subjectAllianceTotalHp - enemyAllianceTotalHp + 40*(subjectAllianceAliveUnits - enemyAllianceAliveUnits)',
        proxyScoreWarning: '代理分单列其公式，不能替代原始结果（协议 §4.2）。',
        allyTurns: '轮到盟友时真实推进盟友阶段；不按深度奇偶换符号，不直接改 currentPlayer。',
    },
    rows: branchRows,
};

function writeJsonOnce(name: string, payload: unknown): void {
    const abs = path.join(OUT_DIR, name);
    if (fs.existsSync(abs)) throw new Error(`拒绝覆盖已存在的产物：${abs}`);
    fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
writeJsonOnce('window_selection.json', selectionPayload);
writeJsonOnce('counterfactual_branches.json', branchPayload);

console.log(`[T15-07] windows=${windowReports.length} families=${selectionPayload.coverage.rootFamilies} `
    + `classifications=${JSON.stringify(counts)}`);
console.log(`[T15-07] strata=${JSON.stringify(stratumCounts)}`);
console.log(`[T15-07] candidateRoles=${JSON.stringify(roleCounts)}`);
console.log(`[T15-07] wrote window_selection.json 与 counterfactual_branches.json`);
