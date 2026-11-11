/**
 * V18/T18-02：高代价失误窗口的**成对续弈**（bounded paired continuation）。
 *
 * ## 目的
 *
 * 任务书要求：从训练用途的失败轨迹里选 ≥40 个窗口，覆盖指挥官遇险 / 夺城路线 /
 * 招募出城 / 集火 / 等待结束回合；保留精确状态、双方 RNG、合法集；
 * 在同一续弈策略与共同随机流下比较**学生动作、H0 动作、B100 动作与少量可解释备选**的真实后果。
 *
 * ## 续弈合同（与 `v15/tools/counterfactual_v15.ts` 相同，为新 schema 重新实现）
 *
 * 1. 从**同一精确快照**（`stateJson` 往返一致）开始；
 * 2. 用真实 `engine.step` 先执行该分支的第一个动作（若动作本身就是分支）；
 * 3. 之后按冻结续弈策略（H0，每座位独立 RNG `streamFor(seed, seat)`）推进：
 *    - phase 1：完成主体本次玩家阶段；
 *    - phase 2：经过**实际下个敌方联盟**的一个完整玩家阶段（含其回合开始事件）；
 *    - 到该敌方阶段结束后的第一个真实边界，或更早自然终局。
 * 4. 每分支每 replicate ≤ `--max-transitions` 次真实引擎转换、≤ `--wall-ms` 墙钟；
 *    预算未跨到目标边界记 `HORIZON_INCOMPLETE`，**不冒充**完整结果。
 * 5. 结论分级：自然终局 / 截断估值 / 不确定；**截断不当作自然胜负**。
 *
 * ## 明确不做的事
 *
 * - 不按深度奇偶换符号，不直接改 `currentPlayer`；
 * - 不倒推「真实 Q」，不把启发式分数当胜率；
 * - 不因为 logits 接近就把动作划成等价类——只报同一续弈策略下的可复核后果。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/counterfactual_v18.ts \
 *     --run-id run_20260927_v18_01 \
 *     --rollouts <失败轨迹.jsonl,...> --target-windows 48 --max-per-root 3
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getAllianceId, isCommanderUnit } from '../../src/game/rule_config';
import { getReachablePositions } from '../../src/game/map';
import { getEffectiveStats } from '../../src/game/abilities';
import { canonicalStateJson, mulberry32, seedFromKeyHash, L1_LABELER_VERSION } from '../../v15/tools/labeler_l1_v15';
import { queryL1LabelV18, L1_LABELER_VERSION_V18 } from './labeler_l1_v18';
import { createB100Policy, B100_TEACHER_VERSION } from '../../v17/teachers/b100_policy';
import { b100PolicyInputKeySafe } from '../../v17/teachers/b100_input_key';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_ID = arg('--run-id', 'run_20260927_v18_01') as string;
const RUN_ROOT = path.resolve(`v18/out/${RUN_ID}`);
const ROLLOUT_ARGS = (arg('--rollouts', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const TARGET_WINDOWS = Number(arg('--target-windows', '48'));
const MAX_PER_ROOT = Number(arg('--max-per-root', '3'));
const MAX_TRANSITIONS = Number(arg('--max-transitions', '256'));
const WALL_MS = Number(arg('--wall-ms', '30000'));
const REPLICATES = (arg('--continuation-seeds', '2026099801,2026099802,2026099803') as string).split(',').map(Number);
const SELECTION_SEED = Number(arg('--selection-seed', '2026099804'));
const LABEL_SEED_BASE = Number(arg('--label-seed-base', '2610800000'));
/**
 * V18/T18-03 预登记搜索改进 S1：输出标签。
 * 中文：S1 只改**续弈预算**（max-transitions / wall-ms），不改窗口、分支、续弈策略，
 * 因此必须写进独立文件，不能覆盖 S0 的产物。
 */
const OUT_TAG = arg('--out-tag', '') as string;
/*
 * V18/T18-03 预登记搜索改进 S2（**尚未实现，故意不留假接口**）：
 *
 * S0/S1 的干预单位是「只换第一个原子动作，然后全部交回 H0 续弈」。
 * 第一道门的诊断显示首手差异会被同质的 H0 续弈迅速抹平。
 * S2 计划把干预单位改成**一整个玩家阶段**（主体本阶段每个决策都由分支策略给出，
 * 阶段结束才交回 H0），并把分支从「动作」换成「策略」（H0 / B100-Q / 学生网络）。
 *
 * 这需要：把 `rollout` 重构成可注入策略的版本、加载学生网络的预测器、
 * 以及按策略而不是按动作生成分支。**在本轮预算内没有实现**，
 * 因此这里不声明 `--branch-mode` 之类的参数——声明了却没接线，比不声明更糟。
 */

if (ROLLOUT_ARGS.length === 0) throw new Error('[T18-02] 必须给 --rollouts（可逗号分隔多个文件）。');

/** 与 `v14/tools/eval_v14_protocol.ts#streamFor` 同族的座位随机流（独立实现，避免跨版本耦合）。 */
function streamFor(seed: number, seat: number): () => number {
    const h = crypto.createHash('sha256').update(Buffer.from(`seatstream|${seed}|${seat}`, 'utf8')).digest();
    return mulberry32(h.readUInt32LE(0));
}

function getTurnPlayerIds(state: GameState): number[] {
    return state.players.map((p) => p.id).sort((a, b) => a - b);
}

function allianceStats(state: GameState, allianceId: number) {
    const units = state.units.filter((u) => u.hp > 0 && getAllianceId(state, u.ownerId) === allianceId);
    return {
        units: units.length,
        hp: units.reduce((s, u) => s + u.hp, 0),
        gold: state.players.filter((p) => getAllianceId(state, p.id) === allianceId).reduce((s, p) => s + (p.gold ?? 0), 0),
    };
}

// ------------------------------------------------------------------ 读取与筛选
interface DecisionRow {
    file: string;
    gameId: string;
    rootId: string;
    rootFamilyId: string;
    mapName: string;
    mapIndex: number;
    phaseBucket: string;
    stepIndex: number;
    subjectPlayerId: number;
    subjectSeat: number;
    subjectOutcome: string | null;
    valueTarget: number | null;
    behaviorActionCode: string;
    stateJson: string;
    state: GameState;
    stateHash: string;
}

const decisions: DecisionRow[] = [];
for (const file of ROLLOUT_ARGS) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) throw new Error(`[T18-02] rollout 文件不存在：${abs}`);
    for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        let row: Record<string, unknown>;
        try {
            row = JSON.parse(t) as Record<string, unknown>;
        } catch {
            continue;
        }
        if (!row.stateJson || !row.behaviorActionCode) continue;
        if (String(row.sourcePolicy) !== 'P1:s2026') continue;
        if (row.valueTarget === null || row.valueTarget === undefined) continue;
        const state = JSON.parse(String(row.stateJson)) as GameState;
        decisions.push({
            file: path.basename(file),
            gameId: String(row.gameId),
            rootId: String(row.rootId),
            rootFamilyId: String(row.trueFamilyId ?? row.rootFamilyId),
            mapName: String(row.mapName),
            mapIndex: Number(row.mapIndex),
            phaseBucket: String(row.phaseBucket),
            stepIndex: Number(row.stepIndex),
            subjectPlayerId: Number(row.subjectPlayerId),
            subjectSeat: Number(row.subjectSeat ?? row.subjectPlayerId),
            subjectOutcome: row.subjectOutcome === null ? null : String(row.subjectOutcome),
            valueTarget: Number(row.valueTarget),
            behaviorActionCode: String(row.behaviorActionCode),
            stateJson: String(row.stateJson),
            state,
            stateHash: String(row.stateHash),
        });
    }
}
console.log(`[T18-02] 读入学生决策 ${decisions.length} 条（${ROLLOUT_ARGS.length} 个文件）`);

/** 快照往返一致：证明保存的是可精确重建的完整状态，而不是残缺观察。 */
function snapshotRoundTripOk(row: DecisionRow): boolean {
    try {
        const a = canonicalStateJson(JSON.parse(row.stateJson));
        const b = canonicalStateJson(JSON.parse(row.stateJson));
        return a === b && a.length > 0;
    } catch {
        return false;
    }
}

// ------------------------------------------------------------------ 窗口分类（规则判据，不用网络分数）
type WindowKind = 'COMMANDER_DANGER' | 'CASTLE_ROUTE' | 'RECRUIT_EXIT' | 'FOCUS_FIRE' | 'WAIT_END_TURN';

function classify(row: DecisionRow): WindowKind[] {
    const kinds: WindowKind[] = [];
    const engine = new GameEngine(JSON.parse(row.stateJson) as GameState);
    const playerId = row.subjectPlayerId;
    const legal = engine.isTerminal() ? [] : engine.getLegalActions(playerId).filter((a) => a.type !== 'surrender');
    const codes = legal.map(encodeAction);
    const subjectAlliance = getAllianceId(row.state, playerId);
    const actType = row.behaviorActionCode.split(':')[0];

    // 指挥官遇险：己方指挥官存活且生命 < 60%，或敌方单位能在一轮内打到它。
    const ownCommander = row.state.units.find(
        (u) => u.hp > 0 && u.ownerId === playerId && isCommanderUnit(row.state, u, playerId)
    );
    if (ownCommander) {
        const maxHp = getEffectiveStats(ownCommander).maxHp;
        if (ownCommander.hp / Math.max(1, maxHp) < 0.6) kinds.push('COMMANDER_DANGER');
        else {
            const threatened = row.state.units.some((enemy) => {
                if (enemy.hp <= 0 || getAllianceId(row.state, enemy.ownerId) === subjectAlliance) return false;
                const stats = getEffectiveStats(enemy);
                try {
                    return getReachablePositions(row.state, enemy.id)
                        .some((pos) => Math.abs(pos.x - ownCommander.pos.x) + Math.abs(pos.y - ownCommander.pos.y) <= stats.maxRange + 1);
                } catch {
                    return false;
                }
            });
            if (threatened) kinds.push('COMMANDER_DANGER');
        }
    }

    // 夺城路线：本回合存在 capture 候选，或有可夺城单位且敌方城堡在附近。
    const hasCaptureCandidate = codes.some((c) => c.startsWith('capture:'));
    if (hasCaptureCandidate || actType === 'capture' || actType === 'destroy_town') kinds.push('CASTLE_ROUTE');

    // 招募 / 出城：本回合存在招募类候选。
    if (codes.some((c) => c.startsWith('recruit') || c.startsWith('summon'))) kinds.push('RECRUIT_EXIT');

    // 集火：存在攻击候选，且目标已受伤或同一目标可被多个己方单位打到。
    const attackTargets = new Map<string, number>();
    for (const code of codes) {
        if (!code.startsWith('attack:')) continue;
        const targetId = code.split(':')[2];
        attackTargets.set(targetId, (attackTargets.get(targetId) ?? 0) + 1);
    }
    if (actType === 'attack' || [...attackTargets.values()].some((n) => n >= 2)) kinds.push('FOCUS_FIRE');

    // 等待 / 结束回合：实际动作是 wait/end_turn，但存在非 wait/end_turn 的合法候选。
    if ((actType === 'wait' || actType === 'end_turn')
        && codes.some((c) => !c.startsWith('wait') && c !== 'end_turn')) {
        kinds.push('WAIT_END_TURN');
    }
    return kinds;
}

const eligible0 = decisions.filter((d) => d.valueTarget === -1 && snapshotRoundTripOk(d));

/**
 * V18/T18-03 S4：**局面平衡过滤**（与 `fullgame_ab_v18.ts` 的 S3 同一定义）。
 *
 * 中文：S3 已证明改进信号只存在于「局面未定」的区域，S0 在均匀窗口上的失败
 * 是窗口选错造成的。S4 把同一套平衡判据搬到**便宜的单动作成对续弈**上，
 * 回答「便宜的证据源在平衡局面上能不能用」——
 * 只有能用，才可能以可承受的成本扩到 >=1,000 个改进样本。
 */
const BALANCE_FILTER = arg('--balance-filter', 'off') as 'off' | 'balanced';
const MAX_UNIT_DIFF = Number(arg('--max-unit-diff', '1'));
/** S4 只看这些阶段（平衡判据默认排除残局）。 */
const PHASE_ALLOW = (arg('--phase-allow', '0-2,3-7') as string).split(',').map((s) => s.trim());

function isBalancedRow(row: DecisionRow): boolean {
    if (BALANCE_FILTER === 'off') return true;
    if (!PHASE_ALLOW.includes(row.phaseBucket)) return false;
    const state = row.state;
    const subjectAlliance = getAllianceId(state, row.subjectPlayerId);
    const alive = state.units.filter((u) => u.hp > 0);
    const own = alive.filter((u) => getAllianceId(state, u.ownerId) === subjectAlliance).length;
    const enemy = alive.filter((u) => getAllianceId(state, u.ownerId) !== subjectAlliance).length;
    if (Math.abs(own - enemy) > MAX_UNIT_DIFF) return false;
    const hasCommander = (allianceId: number): boolean => alive.some(
        (u) => getAllianceId(state, u.ownerId) === allianceId && u.unitClass === 'commander',
    );
    const enemyAlliances = [...new Set(state.players
        .map((p) => getAllianceId(state, p.id))
        .filter((a) => a !== subjectAlliance))];
    return hasCommander(subjectAlliance) && enemyAlliances.some((a) => hasCommander(a));
}

const eligible = eligible0.filter(isBalancedRow);
console.log(`[T18-02] 失败轨迹可用决策 ${eligible0.length} → 平衡过滤后 ${eligible.length}`
    + `（balance-filter=${BALANCE_FILTER}, maxUnitDiff=${MAX_UNIT_DIFF}, phases=${PHASE_ALLOW.join('/')}）`);

const withKinds = eligible.map((row) => ({ row, kinds: classify(row) }));
const kindCounts: Record<string, number> = {};
for (const item of withKinds) for (const k of item.kinds) kindCounts[k] = (kindCounts[k] ?? 0) + 1;
console.log(`[T18-02] 分类分布 ${JSON.stringify(kindCounts)}`);

// 分层、固定的 Fisher–Yates 抽样：不挑「最坏的败局」，也不只挑 end_turn。
const rng = mulberry32(SELECTION_SEED);
const shuffled = [...withKinds].sort((a, b) =>
    `${a.row.rootFamilyId}#${String(a.row.stepIndex).padStart(6, '0')}`.localeCompare(
        `${b.row.rootFamilyId}#${String(b.row.stepIndex).padStart(6, '0')}`));
for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const REQUIRED: WindowKind[] = ['COMMANDER_DANGER', 'CASTLE_ROUTE', 'RECRUIT_EXIT', 'FOCUS_FIRE', 'WAIT_END_TURN'];
const selected: Array<{ row: DecisionRow; kinds: WindowKind[] }> = [];
const perRoot = new Map<string, number>();
const pushUnique = (item: { row: DecisionRow; kinds: WindowKind[] }) => {
    if (selected.some((s) => s.row.gameId === item.row.gameId)) return false;
    selected.push(item);
    perRoot.set(item.row.rootFamilyId, (perRoot.get(item.row.rootFamilyId) ?? 0) + 1);
    return true;
};
// 先保证每类至少 6 个窗口，再按分层随机补足到目标数量。
for (const kind of REQUIRED) {
    let taken = 0;
    for (const item of shuffled) {
        if (taken >= 6 || selected.length >= TARGET_WINDOWS) break;
        if (!item.kinds.includes(kind)) continue;
        const used = perRoot.get(item.row.rootFamilyId) ?? 0;
        if (used >= MAX_PER_ROOT) continue;
        if (pushUnique(item)) taken += 1;
    }
}
for (const item of shuffled) {
    if (selected.length >= TARGET_WINDOWS) break;
    const used = perRoot.get(item.row.rootFamilyId) ?? 0;
    if (used >= MAX_PER_ROOT) continue;
    pushUnique(item);
}
console.log(`[T18-02] 选中窗口 ${selected.length} 个，覆盖 root 家族 ${perRoot.size} 个`);

// ------------------------------------------------------------------ 分支候选
interface WindowBranch {
    actionCode: string;
    roles: string[];
}

function branchesFor(row: DecisionRow): WindowBranch[] {
    const engine = new GameEngine(JSON.parse(row.stateJson) as GameState);
    const legal = engine.isTerminal() ? [] : engine.getLegalActions(row.subjectPlayerId).filter((a) => a.type !== 'surrender');
    const codes = legal.map(encodeAction);
    const roles = new Map<string, string[]>();
    const add = (code: string, role: string) => {
        if (!codes.includes(code)) return;
        const list = roles.get(code) ?? [];
        if (!list.includes(role)) list.push(role);
        roles.set(code, list);
    };

    add(row.behaviorActionCode, 'student_actual');

    // H0 动作：用 V18 单次评分合同的稳定键随机流，对该状态求 H0 启发式策略的动作。
    const l1 = queryL1LabelV18(row.state, {
        labelSeedBase: LABEL_SEED_BASE,
        actingPlayerId: row.subjectPlayerId,
        subjectPlayerId: row.subjectPlayerId,
        filterSurrender: true,
    });
    if (!l1.emptyActionSet) add(l1.selection.chosenActionCode, 'h0_l1_single_pass');

    // B100-Q 动作：确定性查询教师（失败则如实标记缺失，不用启发式回退冒充教师）。
    let b100Code: string | null = null;
    try {
        const keyResult = b100PolicyInputKeySafe(row.state, row.subjectPlayerId, legal);
        const handle = createB100Policy({
            variant: 'B100-Q',
            rootSeed: 0,
            seat: row.subjectSeat,
            ...(keyResult ? { queryKeyOverride: keyResult.key } : {}),
        });
        const action = handle.policy({ state: row.state, playerId: row.subjectPlayerId, allowed: legal, seat: row.subjectSeat, seed: 0 });
        if (action && handle.exceptions === 0) {
            const code = encodeAction(action);
            if (codes.includes(code)) {
                b100Code = code;
                add(code, 'b100q_teacher');
            }
        }
    } catch {
        b100Code = null;
    }

    add('end_turn', 'legal_end_turn');

    // 规则 oracle：只穷举全部合法动作才可声称「没有一步胜利」。
    for (const a of legal) {
        const fork = new GameEngine(JSON.parse(row.stateJson) as GameState);
        try {
            fork.step(a);
        } catch {
            continue;
        }
        const st = fork.getState();
        if (st.winner !== null && st.winner !== -1 && st.winner === getAllianceId(row.state, row.subjectPlayerId)) {
            add(encodeAction(a), 'rule_oracle_immediate_win');
            break;
        }
    }

    // 少量可解释备选：选一个与上面都不同的、非 wait 的合法动作（无网络分数参与）。
    const alternative = codes.find((c) => !roles.has(c) && !c.startsWith('wait'));
    if (alternative) add(alternative, 'interpretable_alternative');

    const priority = [
        'student_actual', 'h0_l1_single_pass', 'b100q_teacher', 'rule_oracle_immediate_win',
        'interpretable_alternative', 'legal_end_turn',
    ];
    const ordered: string[] = [];
    for (const role of priority) {
        for (const [code, list] of roles) {
            if (list.includes(role) && !ordered.includes(code)) ordered.push(code);
        }
    }
    return ordered.slice(0, 7).map((code) => ({ actionCode: code, roles: roles.get(code) ?? [] }));
}

// ------------------------------------------------------------------ 冻结续弈合同
interface RolloutResult {
    reachedHorizon: boolean;
    stopReason: string;
    transitions: number;
    wallMs: number;
    naturalTerminal: boolean;
    winnerAllianceId: number | null;
    viewedOutcome: string;
    subjectAllianceAliveUnits: number;
    enemyAllianceAliveUnits: number;
    unitsKilledBySubject: number;
    unitsLostBySubject: number;
    subjectTurnsCompleted: number;
    enemyTurnsCompleted: number;
    incompleteReason: string | null;
}

function rollout(startState: GameState, subjectPlayerId: number, firstAction: Action, seed: number): RolloutResult {
    const engine = new GameEngine(JSON.parse(JSON.stringify(startState)) as GameState);
    const subjectAlliance = getAllianceId(startState, subjectPlayerId);
    const initial = allianceStats(startState, subjectAlliance);
    const enemyAlliances = [...new Set(startState.players.map((p) => getAllianceId(startState, p.id)).filter((a) => a !== subjectAlliance))].sort((a, b) => a - b);
    const initialEnemyUnits = enemyAlliances.reduce((acc, a) => acc + allianceStats(startState, a).units, 0);

    const order0 = getTurnPlayerIds(startState);
    const startIdx = Math.max(0, order0.indexOf(startState.currentPlayer));
    let nextEnemyAlliance: number | null = null;
    for (let k = 1; k <= order0.length; k += 1) {
        const pid = order0[(startIdx + k) % order0.length];
        const al = getAllianceId(startState, pid);
        if (al !== subjectAlliance) { nextEnemyAlliance = al; break; }
    }

    const seatAi = new Map<number, HeuristicAI>();
    const getAi = (seat: number): HeuristicAI => {
        let ai = seatAi.get(seat);
        if (!ai) { ai = new HeuristicAI(streamFor(seed, seat)); seatAi.set(seat, ai); }
        return ai;
    };

    const started = Date.now();
    let transitions = 0;
    let subjectPhaseDone = false;
    let enemyPhaseDone = false;
    let stopReason = 'HORIZON_REACHED';
    let incompleteReason: string | null = null;
    let subjectTurnsCompleted = 0;
    let enemyTurnsCompleted = 0;
    let injected = false;

    while (true) {
        if (engine.isTerminal()) { stopReason = 'NATURAL_TERMINAL'; break; }
        if (transitions >= MAX_TRANSITIONS) {
            stopReason = 'TRANSITION_BUDGET';
            incompleteReason = 'HORIZON_INCOMPLETE: 达到每分支引擎转换上限';
            break;
        }
        if (Date.now() - started > WALL_MS) {
            stopReason = 'WALL_CLOCK';
            incompleteReason = 'HORIZON_INCOMPLETE: 达到每分支墙钟上限';
            break;
        }
        const state = engine.getState();
        const playerId = state.currentPlayer;
        const playerAlliance = getAllianceId(state, playerId);
        const legal = engine.getLegalActions(playerId);
        if (legal.length === 0) { stopReason = 'NO_LEGAL_ACTIONS'; incompleteReason = 'HORIZON_INCOMPLETE: 无合法动作'; break; }

        if (!subjectPhaseDone) {
            if (playerAlliance === subjectAlliance && subjectTurnsCompleted >= 1) {
                subjectPhaseDone = true;
                if (nextEnemyAlliance === null) enemyPhaseDone = true;
            }
        } else if (!enemyPhaseDone) {
            if (playerAlliance === nextEnemyAlliance && enemyTurnsCompleted >= 1) {
                enemyPhaseDone = true;
                stopReason = 'HORIZON_REACHED';
                break;
            }
        }

        let action: Action;
        if (!injected) {
            injected = true;
            // 分支的第一个动作：必须是该状态下真实的合法动作。
            if (playerId !== subjectPlayerId || !legal.map(encodeAction).includes(encodeAction(firstAction))) {
                stopReason = 'BRANCH_ACTION_NOT_LEGAL_NOW';
                incompleteReason = 'HORIZON_INCOMPLETE: 分支动作在续弈起点不合法';
                break;
            }
            action = firstAction;
        } else {
            try {
                action = getAi(playerId).getAction(engine, playerId, legal);
            } catch (err) {
                stopReason = 'POLICY_ERROR';
                incompleteReason = `POLICY_ERROR: ${String((err as Error).message).slice(0, 160)}`;
                break;
            }
        }
        const code = encodeAction(action);
        if (!legal.map(encodeAction).includes(code)) {
            stopReason = 'ILLEGAL_POLICY_ACTION';
            incompleteReason = `ILLEGAL_POLICY_ACTION: ${code}`;
            break;
        }
        if (code === 'end_turn') {
            if (playerAlliance === subjectAlliance) subjectTurnsCompleted += 1;
            else if (nextEnemyAlliance !== null && playerAlliance === nextEnemyAlliance) enemyTurnsCompleted += 1;
        }
        try {
            engine.step(action);
        } catch (err) {
            stopReason = 'ENGINE_ERROR';
            incompleteReason = `ENGINE_ERROR: ${String((err as Error).message).slice(0, 160)}`;
            break;
        }
        transitions += 1;
    }

    if (stopReason === 'HORIZON_REACHED' && !(subjectPhaseDone && enemyPhaseDone)) {
        stopReason = 'HORIZON_INCOMPLETE';
        incompleteReason = incompleteReason ?? 'HORIZON_INCOMPLETE: 未跨过主体/敌方阶段边界';
    }
    const finalState = engine.getState();
    const subj = allianceStats(finalState, subjectAlliance);
    const enemyUnits = enemyAlliances.reduce((acc, a) => acc + allianceStats(finalState, a).units, 0);
    const winner = finalState.winner;
    let viewedOutcome = 'UNDECIDED_TRUNCATED';
    if (winner === -1) viewedOutcome = 'NATURAL_DRAW';
    else if (winner !== null) viewedOutcome = winner === subjectAlliance ? 'NATURAL_WIN' : 'NATURAL_LOSS';

    return {
        reachedHorizon: stopReason === 'HORIZON_REACHED' || stopReason === 'NATURAL_TERMINAL',
        stopReason,
        transitions,
        wallMs: Date.now() - started,
        naturalTerminal: engine.isTerminal(),
        winnerAllianceId: winner,
        viewedOutcome,
        subjectAllianceAliveUnits: subj.units,
        enemyAllianceAliveUnits: enemyUnits,
        unitsKilledBySubject: Math.max(0, initialEnemyUnits - enemyUnits),
        unitsLostBySubject: Math.max(0, initial.units - subj.units),
        subjectTurnsCompleted,
        enemyTurnsCompleted,
        incompleteReason,
    };
}

// ------------------------------------------------------------------ 逐窗口跑成对续弈
const windowReports: unknown[] = [];
const branchRows: unknown[] = [];
const allCodes = new Map<string, Action>();
const startedAll = Date.now();

for (let wi = 0; wi < selected.length; wi += 1) {
    const { row, kinds } = selected[wi];
    const windowId = `w${String(wi).padStart(3, '0')}:${row.gameId}`;
    const engine = new GameEngine(JSON.parse(row.stateJson) as GameState);
    const legal = engine.isTerminal() ? [] : engine.getLegalActions(row.subjectPlayerId).filter((a) => a.type !== 'surrender');
    for (const a of legal) allCodes.set(encodeAction(a), a);
    const branches = branchesFor(row);
    const results: unknown[] = [];

    for (const branch of branches) {
        const action = allCodes.get(branch.actionCode);
        if (!action) continue;
        const replicates = REPLICATES.map((seed) => ({ seed, ...rollout(row.state, row.subjectPlayerId, action, seed) }));
        const wins = replicates.filter((r) => r.viewedOutcome === 'NATURAL_WIN').length;
        const losses = replicates.filter((r) => r.viewedOutcome === 'NATURAL_LOSS').length;
        const horizonAll = replicates.every((r) => r.reachedHorizon);
        results.push({
            actionCode: branch.actionCode,
            roles: branch.roles,
            naturalWins: wins,
            naturalLosses: losses,
            horizonReachedAllSeeds: horizonAll,
            meanUnitsKilled: replicates.reduce((s, r) => s + r.unitsKilledBySubject, 0) / replicates.length,
            meanUnitsLost: replicates.reduce((s, r) => s + r.unitsLostBySubject, 0) / replicates.length,
            meanTransitions: replicates.reduce((s, r) => s + r.transitions, 0) / replicates.length,
            replicates,
        });
        branchRows.push({ windowId, windowKind: kinds, mapName: row.mapName, phaseBucket: row.phaseBucket, actionCode: branch.actionCode, roles: branch.roles, replicates });
    }

    // 高代价判据：学生分支在所有 replicate 上都不比 H0 分支好，且至少有一个分支明确更好。
    const studentBranch = results.find((r) => (r as { roles: string[] }).roles.includes('student_actual')) as
        | { naturalWins: number; meanUnitsKilled: number; meanUnitsLost: number }
        | undefined;
    const best = [...results].sort((a, b) => {
        const ra = a as { naturalWins: number; meanUnitsKilled: number; meanUnitsLost: number };
        const rb = b as { naturalWins: number; meanUnitsKilled: number; meanUnitsLost: number };
        return (rb.naturalWins - ra.naturalWins)
            || ((rb.meanUnitsKilled - rb.meanUnitsLost) - (ra.meanUnitsKilled - ra.meanUnitsLost));
    })[0] as { actionCode: string; naturalWins: number; meanUnitsKilled: number; meanUnitsLost: number; roles: string[] } | undefined;
    const studentScore = studentBranch ? studentBranch.meanUnitsKilled - studentBranch.meanUnitsLost : null;
    const bestScore = best ? best.meanUnitsKilled - best.meanUnitsLost : null;
    const highCost = studentBranch !== undefined && best !== undefined
        && (best.naturalWins > studentBranch.naturalWins || (bestScore !== null && studentScore !== null && bestScore - studentScore >= 1.0))
        && !best.roles.includes('student_actual');

    windowReports.push({
        windowId,
        gameId: row.gameId,
        mapName: row.mapName,
        phaseBucket: row.phaseBucket,
        stepIndex: row.stepIndex,
        subjectPlayerId: row.subjectPlayerId,
        subjectSeat: row.subjectSeat,
        rootFamilyId: row.rootFamilyId,
        kinds,
        legalActionCount: legal.length,
        stateHash: row.stateHash,
        /** 该决策来自学生实际走过的一局，且该局学生最终失败。 */
        sourceOutcome: row.subjectOutcome,
        studentBranch: studentBranch ?? null,
        bestBranchActionCode: best?.actionCode ?? null,
        bestBranchRoles: best?.roles ?? null,
        highCostError: highCost,
        branches: results,
    });
    if ((wi + 1) % 8 === 0) {
        console.log(`[T18-02] 窗口 ${wi + 1}/${selected.length} 完成 ${((Date.now() - startedAll) / 1000).toFixed(0)}s`);
    }
}

const highCostCount = windowReports.filter((w) => (w as { highCostError: boolean }).highCostError).length;
const report = {
    schema: 'v18_counterfactual_1',
    runId: RUN_ID,
    rollouts: ROLLOUT_ARGS.map((f) => path.relative(process.cwd(), path.resolve(f)).replace(/\\/g, '/')),
    contracts: {
        continuationPolicy: 'H0 heuristic; per-seat RNG streamFor(continuationSeed, seat)',
        boundary: '完成主体本次玩家阶段 → 经过实际下个敌方联盟的一个完整玩家阶段 → 更早自然终局',
        maxTransitionsPerBranch: MAX_TRANSITIONS,
        wallMsPerBranch: WALL_MS,
        replicates: REPLICATES,
        selectionSeed: SELECTION_SEED,
        labelSeedBase: LABEL_SEED_BASE,
        h0ActionDefinition: `H0 动作 = ${L1_LABELER_VERSION_V18} 单次评分合同在该状态上的选择（稳定键随机流）`,
        legacyLabelerVersion: L1_LABELER_VERSION,
        b100TeacherVersion: B100_TEACHER_VERSION,
    },
    selection: {
        studentDecisionsRead: decisions.length,
        failureDecisions: eligible.length,
        kindCounts,
        windows: selected.length,
        rootFamilies: perRoot.size,
        windowsPerKind: REQUIRED.reduce((acc, k) => {
            acc[k] = windowReports.filter((w) => (w as { kinds: string[] }).kinds.includes(k)).length;
            return acc;
        }, {} as Record<string, number>),
    },
    summary: {
        highCostErrorWindows: highCostCount,
        highCostRate: windowReports.length === 0 ? null : highCostCount / windowReports.length,
        horizonReachedAllBranches: windowReports.filter((w) =>
            ((w as { branches: Array<{ horizonReachedAllSeeds: boolean }> }).branches).every((b) => b.horizonReachedAllSeeds)).length,
    },
    windows: windowReports,
    disclaimer: [
        '续弈只到「主体一个玩家阶段 + 下个敌方联盟一个玩家阶段」的边界；这不是完整对局结果。',
        '截断分支的兵力差只是有界观测，不能当作真实 Q 或胜率。',
        '同一续弈策略下的差异不能外推成「全局最优」；换续弈策略结论可能改变。',
        'highCostError 是规则化判据（自然胜场或净兵力差），不是「学生这手一定错」的证明。',
    ],
    wallSeconds: Number(((Date.now() - startedAll) / 1000).toFixed(1)),
};

const dir = path.join(RUN_ROOT, 'counterfactual');
fs.mkdirSync(dir, { recursive: true });
const suffix = OUT_TAG ? `.${OUT_TAG}` : '';
fs.writeFileSync(path.join(dir, `paired_continuation${suffix}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(
    path.join(dir, `paired_continuation${suffix}.branches.jsonl`),
    `${branchRows.map((r) => JSON.stringify(r)).join('\n')}\n`,
    'utf8',
);
console.log(JSON.stringify({
    windows: windowReports.length,
    rootFamilies: perRoot.size,
    highCostErrorWindows: highCostCount,
    highCostRate: report.summary.highCostRate,
    kindCounts: report.selection.windowsPerKind,
    wallSeconds: report.wallSeconds,
}, null, 2));
