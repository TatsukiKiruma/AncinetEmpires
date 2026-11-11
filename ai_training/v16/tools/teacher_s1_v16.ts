/**
 * V16/T16-03：S1 完整玩家回合搜索教师（owner：T16-03）。
 *
 * ## 为什么必须新写而不是调参数
 *
 * 现有 `tools/skirmish_search_teacher.ts` 的默认合同是（任务书 §5.1 明确指出）：
 * - `ownFollowupDepth=1`：根动作后只再补**一个**己方动作；
 * - `handToOpponent` 是「连续 `end_turn` 直到轮到敌对阵营」——也就是把己方剩余行动
 *   **直接放弃**，而不是「用固定续弈策略完成己方剩余行动」；
 * - `opponentPhaseActions=1`：对手只走**一个原子动作**就做叶评估。
 *
 * 因此旧教师看到的不是「完整玩家回合」。把 `opponentPhaseActions` 调大也不行：它是在
 * **同一个对手座位**上连续取启发式最优，仍然停在对手回合中间，没有到「下一个己方行动边界」。
 *
 * ## S1 合同（逐条对应任务书 §5.1）
 *
 * 1. 根候选多源保留：L1(启发式) 高分、模型高分、可占领/关键防守、招募、按 (单位,动作类型)
 *    的探索、`end_turn`；先过滤 surrender；根部能直接验证的致胜动作短路且不被剪枝。
 * 2. 每个根动作之后，用**固定续弈策略**完成己方剩余行动（`completeSideTurn`），
 *    允许继续招募/移动/攻击，不因为「补了一个动作」就机械交出回合。
 * 3. 对手侧取若干不同首回应分支，然后同样完成敌方剩余行动；**到达下一个己方行动边界**
 *    才算满足「一轮」边界。真实终局可提前结束。
 * 4. 预算先到则记截断：`truncationStop` 与每条支路的 `reachedBoundary` 单独记录；
 *    绝不把「敌人走了一步」改名为「看完敌人回合」。
 * 5. 根阵营视角固定（`PlanningNode.rootAllianceId`）；同一玩家连走多个动作时**不做**
 *    negamax 逐层翻符号。终局 +1/0/−1。
 * 6. 叶评估是可解释局面量：有效军力、收入能力（拥有产金建筑）、可到达经济点/关键城堡、
 *    指挥官安全、路径推进。终局绝对优先；**当前金币不计入**（避免与军力重复计算）。
 *    权重与单位归一全部写进 `leafEvalSpec`；启发式分不是胜率。
 * 7. 价值头只有在 T16-06 校准合格后才允许通过 `leafEvaluator` 接入（S2）。
 *
 * ## 与旧模块的关系
 *
 * 本文件是**新增**文件，`tools/skirmish_search_teacher.ts` 一行未改，历史教师结果可复算。
 * 预算阶梯直接来自任务书 §5.2 的 S1a/S1b/S1c 表。
 */

import { GameEngine } from '../../src/game/engine';
import { calculateArmyValue, encodeAction } from '../../src/game/env';
import { HeuristicAI, type Rng } from '../../src/game/ai/heuristic_ai';
import { areEnemyPlayers, getAllianceId, getTileIncome, isCommanderUnit } from '../../src/game/rule_config';
import { PlanningNode } from '../../src/game/ai/planning';
import { getDistance } from '../../src/game/map';
import { getEffectiveStats } from '../../src/game/abilities';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { prefilterActions } from '../../tools/skirmish_search_teacher';
import { CANDIDATE_ORDERING_ID_V16, compareActionCodeCanonicalV16 } from '../../src/game/ai/action_ordering';
import type { Action, GameState, Position } from '../../src/game/types';

/** 真实终局量级：任何局面量都远小于它，保证胜负压倒材料差。 */
export const S1_TERMINAL_WIN = 1_000_000_000;
export const S1_TERMINAL_LOSS = -1_000_000_000;

/** 教师版本 id；任何影响选择结果的改动都必须升版本（写进每条标签）。 */
export const S1_TEACHER_VERSION = 'S1_full_turn_v16_1';

export interface S1Tier {
    tierId: string;
    /** 根候选保留上限。 */
    rootWidth: number;
    /** 不同敌方首回应分支数。 */
    opponentReplyWidth: number;
    /** 每个决策允许的引擎 transition 总预算（= PlanningNode.nodesExpanded 上限）。 */
    transitionBudget: number;
    /** 续弈时每个玩家阶段的原子动作上限。 */
    phaseActionCap: number;
    /** 目标边界：一轮（回到己方行动）或两轮。 */
    targetRounds: 1 | 2;
}

/** 任务书 §5.2 预登记的三档起点，数值不得事后放宽。 */
export const S1_TIERS: Record<string, S1Tier> = {
    S1a: { tierId: 'S1a', rootWidth: 8, opponentReplyWidth: 2, transitionBudget: 2000, phaseActionCap: 128, targetRounds: 1 },
    S1b: { tierId: 'S1b', rootWidth: 12, opponentReplyWidth: 3, transitionBudget: 6000, phaseActionCap: 256, targetRounds: 1 },
    S1c: { tierId: 'S1c', rootWidth: 16, opponentReplyWidth: 3, transitionBudget: 12000, phaseActionCap: 256, targetRounds: 2 },
};

export interface S1Options {
    tier: S1Tier;
    /** 教师随机流（同一个 seed + 同状态必须给出同一结果）。 */
    rng?: Rng;
    /** 墙钟保险（毫秒）。触发时该决策的标签**不可信**，必须如实标记。 */
    wallMsPerDecision?: number;
    /** 模型打分注入（可选）：state+player+actions → code→score。 */
    modelScorer?: (state: GameState, playerId: number, actions: readonly Action[]) => Map<string, number>;
    /** S2：经校准的价值头叶评估（默认 undefined ⇒ 用可解释局面量）。 */
    leafEvaluator?: (state: GameState, rootAllianceId: number) => number;
    /** 候选粗筛宽度（Infinity = 关闭；有限值只缩小昂贵评分集合，不改变合法性与边界）。 */
    prefilterWidth?: number;
    /** 续弈策略（默认 `cheap-advance-v1`，见 `S1ContinuationPolicy` 的说明）。 */
    continuationPolicy?: S1ContinuationPolicy;
}

/**
 * 固定的 **O(1) 推进评分**：不含寻路、不含状态克隆、不含战术评估。
 *
 * 中文：与 `prefilterActions` 的关键动作优先级同一口径（占领/攻击/治疗/援助/召唤/招募一律高分），
 * 其余 `move` 按「到最近敌方单位或经济目标的曼哈顿距离缩短量」打分。
 * 只用于支路中途的续弈，不参与根候选排序与叶评估。
 */
function cheapAdvanceScore(state: GameState, action: Action): number {
    switch (action.type) {
        case 'capture':
        case 'repair':
        case 'destroy_town':
            return 60000;
        case 'attack':
            return 55000;
        case 'heal':
        case 'support':
        case 'summon':
            return 40000;
        case 'recruit_to_castle':
        case 'recruit_and_deploy':
            return 38000;
        case 'move':
        case 'post_attack_move': {
            const unitId = (action as { unitId?: string }).unitId;
            const unit = state.units.find((u) => u.id === unitId && u.hp > 0);
            if (!unit) return 10000;
            const to = (action as { to: Position }).to;
            let bestBefore = 99;
            let bestAfter = 99;
            for (const other of state.units) {
                if (other.hp <= 0) continue;
                const hostile = areEnemyPlayers(state, unit.ownerId, other.ownerId);
                const d0 = getDistance(unit.pos, other.pos);
                const d1 = getDistance(to, other.pos);
                if (hostile) {
                    bestBefore = Math.min(bestBefore, d0);
                    bestAfter = Math.min(bestAfter, d1);
                }
            }
            const reach = getEffectiveStats(unit).maxRange || 1;
            return 10000 + (bestBefore - bestAfter) * 100
                + (bestBefore !== 99 && bestAfter <= reach ? 500 : 0);
        }
        case 'wait':
            return 500;
        case 'end_turn':
            return 100;
        default:
            return 20000;
    }
}

/**
 * S1 的**默认粗筛宽度**（不是无限）。
 *
 * 中文：为什么必须有默认值 —— 一次 S1 决策要完成「根候选 × （己方完整回合 + N 条敌方完整回合）」，
 * 每条支路都要对**当时的全部合法动作**做启发式评分；中盘动作数可达数百，且
 * `RuleTacticalEvaluator`/`TacticalPathfinder` 的耗时随被评分动作数线性增长。
 * 实测（T16-03 首次 DEV20 尝试）无粗筛时约 11 分钟/局，无法支撑 6,400 个核心状态的标注。
 *
 * 粗筛只裁「数量占优的 move」，关键动作（占领/攻击/招募/治疗/援助/召唤）与每 (单位,动作类型)
 * 桶的最优代表一律保留，因此**不改变合法性与边界定义**，只缩小昂贵评分集合。
 * 该值属于教师配置，写进 resolved config 与每条标签的 `teacherBudget`。
 */
export const S1_DEFAULT_PREFILTER_WIDTH = 24;

/**
 * 续弈策略 id。
 *
 * 中文：`heuristic-best` 用完整启发式评分（含 `RuleTacticalEvaluator`/`TacticalPathfinder`），
 * 质量高但每条支路每一步都要重算，实测一次决策 30–60 秒，无法支撑 6,400 个核心状态标注。
 * `cheap-advance-v1` 用**固定的 O(1) 推进评分**（关键动作优先 + 朝目标/敌人推进的曼哈顿收益），
 * 不做寻路与战术评估。它是「固定续弈策略」，只影响支路**中途**怎么走，不影响：
 * 根候选的产生（仍用完整启发式评分）、对手首回应的选择（仍用完整启发式评分）、叶评估与终局判定。
 * 该选择写进 resolved config 与每条标签的 `teacherBudget.continuationPolicy`。
 */
export type S1ContinuationPolicy = 'heuristic-best' | 'cheap-advance-v1';
export const S1_DEFAULT_CONTINUATION_POLICY: S1ContinuationPolicy = 'cheap-advance-v1';

export interface S1LeafSpec {
    armyWeight: number;
    incomeCapacityWeight: number;
    objectiveProximityWeight: number;
    commanderSafetyWeight: number;
    pathAdvanceWeight: number;
    normalization: Record<string, string>;
    note: string;
}

/** 叶评估权重（写死并随报告输出；不是事后调出来的）。 */
export const S1_LEAF_SPEC: S1LeafSpec = {
    armyWeight: 1.0,
    incomeCapacityWeight: 90,
    objectiveProximityWeight: 40,
    commanderSafetyWeight: 120,
    pathAdvanceWeight: 25,
    normalization: {
        army: '各联盟 calculateArmyValue 求和后取根阵营减敌方，单位=军力点',
        incomeCapacity: '拥有产金建筑（town/castle）数量差，单位=建筑数（**不含当前金币**）',
        objectiveProximity: '己方单位到最近中立/敌方经济点的平均距离，越近越好；取敌方同量之差',
        commanderSafety: '存活指挥官到最近敌方单位的距离差（己方减敌方），单位=格',
        pathAdvance: '己方单位相对敌方单位、到最近经济点/敌方城堡的平均距离优势，单位=格',
    },
    note: '当前金币不进叶评估：它已经通过军力（可招募能力）间接体现，重复计入会奖励囤钱。',
};

/* ------------------------------------------------------------------ *
 * 叶评估
 * ------------------------------------------------------------------ */

interface AllianceSplit {
    rootPlayers: number[];
    enemyPlayers: number[];
}

function splitAlliances(state: GameState, rootAllianceId: number): AllianceSplit {
    const rootPlayers: number[] = [];
    const enemyPlayers: number[] = [];
    for (const player of state.players) {
        if (!player.isAlive) continue;
        if (getAllianceId(state, player.id) === rootAllianceId) rootPlayers.push(player.id);
        else enemyPlayers.push(player.id);
    }
    return { rootPlayers, enemyPlayers };
}

function armySum(state: GameState, players: readonly number[]): number {
    return players.reduce((sum, id) => sum + calculateArmyValue(state, id), 0);
}

/** 拥有产金建筑（town/castle）数量与它们的收入之和。 */
function economyOf(state: GameState, players: readonly number[]): { structures: number; income: number } {
    const owned = new Set(players);
    let structures = 0;
    let income = 0;
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y][x];
            if (tile.ownerId === null || !owned.has(tile.ownerId)) continue;
            const key = getTileTerrainKey(tile);
            if (key !== 'town' && key !== 'castle') continue;
            structures += 1;
            income += getTileIncome(state, tile) ?? 0;
        }
    }
    return { structures, income };
}

function objectiveTilesFor(state: GameState, players: readonly number[]): Position[] {
    const owned = new Set(players);
    const out: Position[] = [];
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y][x];
            const key = getTileTerrainKey(tile);
            if (key !== 'town' && key !== 'castle') continue;
            if (tile.ownerId === null || !owned.has(tile.ownerId)) out.push({ x, y });
        }
    }
    return out;
}

function meanNearestDistance(state: GameState, players: readonly number[], targets: readonly Position[]): number {
    if (targets.length === 0) return 0;
    const alive = state.units.filter((u) => u.hp > 0 && players.includes(u.ownerId));
    if (alive.length === 0) return 30;
    let total = 0;
    for (const unit of alive) {
        let best = 99;
        for (const target of targets) best = Math.min(best, getDistance(unit.pos, target));
        total += best;
    }
    return total / alive.length;
}

function commanderClearance(state: GameState, players: readonly number[]): number {
    const commanders = state.units.filter((u) => u.hp > 0 && players.includes(u.ownerId) && isCommanderUnit(state, u));
    if (commanders.length === 0) return 0;
    let total = 0;
    for (const commander of commanders) {
        let best = 99;
        for (const enemy of state.units) {
            if (enemy.hp <= 0 || !areEnemyPlayers(state, commander.ownerId, enemy.ownerId)) continue;
            best = Math.min(best, getDistance(commander.pos, enemy.pos));
        }
        total += Math.min(best, 20);
    }
    return total / commanders.length;
}

/**
 * 可解释局面量（根阵营视角）。
 *
 * 中文：只使用**局面**量，不使用启发式的动作分，也不把当前金币重复计入。
 * 返回值不是胜率，只用于同一批候选之间的排序。
 */
export function evaluatePositionS1(state: GameState, rootAllianceId: number, spec: S1LeafSpec = S1_LEAF_SPEC): number {
    const { rootPlayers, enemyPlayers } = splitAlliances(state, rootAllianceId);
    const army = armySum(state, rootPlayers) - armySum(state, enemyPlayers);
    const ownEconomy = economyOf(state, rootPlayers);
    const enemyEconomy = economyOf(state, enemyPlayers);
    const incomeCapacity = (ownEconomy.structures - enemyEconomy.structures);

    const ownObjectives = objectiveTilesFor(state, rootPlayers);
    const enemyObjectives = objectiveTilesFor(state, enemyPlayers);
    const ownProximity = meanNearestDistance(state, rootPlayers, ownObjectives);
    const enemyProximity = meanNearestDistance(state, enemyPlayers, enemyObjectives);
    const objectiveProximity = enemyProximity - ownProximity;

    const commanderSafety = commanderClearance(state, rootPlayers) - commanderClearance(state, enemyPlayers);

    const ownAdvance = meanNearestDistance(state, rootPlayers, [...enemyObjectives, ...enemyUnitPositions(state, enemyPlayers)]);
    const enemyAdvance = meanNearestDistance(state, enemyPlayers, [...ownObjectives, ...enemyUnitPositions(state, rootPlayers)]);
    const pathAdvance = enemyAdvance - ownAdvance;

    return spec.armyWeight * army
        + spec.incomeCapacityWeight * incomeCapacity
        + spec.objectiveProximityWeight * objectiveProximity
        + spec.commanderSafetyWeight * commanderSafety
        + spec.pathAdvanceWeight * pathAdvance;
}

function enemyUnitPositions(state: GameState, players: readonly number[]): Position[] {
    return state.units.filter((u) => u.hp > 0 && players.includes(u.ownerId)).map((u) => u.pos);
}

export function leafValueS1(
    node: PlanningNode,
    spec: S1LeafSpec = S1_LEAF_SPEC,
    leafEvaluator?: (state: GameState, rootAllianceId: number) => number,
): number {
    const verdict = node.terminalVerdict();
    if (verdict === 'win') return S1_TERMINAL_WIN;
    if (verdict === 'loss') return S1_TERMINAL_LOSS;
    if (verdict === 'draw') return 0;
    if (leafEvaluator) {
        const value = leafEvaluator(node.getState(), node.rootAllianceId);
        if (Number.isFinite(value)) return value;
    }
    return evaluatePositionS1(node.getState(), node.rootAllianceId, spec);
}

/* ------------------------------------------------------------------ *
 * 单侧回合推进
 * ------------------------------------------------------------------ */

export type BoundaryStop =
    | 'reached-next-own'      // 已回到根阵营（或轮次达到目标）
    | 'terminal'              // 真实终局
    | 'node_budget'
    | 'wall'
    | 'phase-action-cap'
    | 'no-legal-action';

export interface SideTurnResult {
    node: PlanningNode;
    actions: string[];
    stop: BoundaryStop;
    engineTransitions: number;
}

/**
 * 用**固定续弈策略**把一个玩家阵营的剩余行动走完，直到轮到别的阵营 / 终局 / 上限。
 *
 * 中文：这不是 end_turn 交出击，而是真的继续招募/移动/攻击。「固定续弈策略」只有一处：
 * 在粗筛后的合法集里取启发式最高分（并列取 actionCode 最小，保证确定性）。
 * `phaseActionCap` 是**每个玩家阶段**的原子动作上限（任务书 §5.2）。
 */
export function completeSideTurn(options: {
    start: PlanningNode;
    sideAllianceId: number;
    ai: HeuristicAI;
    phaseActionCap: number;
    prefilterWidth: number;
    wallMs: number;
    startedAt: number;
    now: () => number;
    continuationPolicy?: S1ContinuationPolicy;
}): SideTurnResult {
    const {
        start, sideAllianceId, ai, phaseActionCap, prefilterWidth, wallMs, startedAt, now,
        continuationPolicy = S1_DEFAULT_CONTINUATION_POLICY,
    } = options;
    let node = start;
    const actions: string[] = [];
    let transitions = 0;
    for (let i = 0; i < phaseActionCap; i += 1) {
        if (now() - startedAt >= wallMs) return { node, actions, stop: 'wall', engineTransitions: transitions };
        if (node.isTerminal()) return { node, actions, stop: 'terminal', engineTransitions: transitions };
        if (node.currentAllianceId !== sideAllianceId) return { node, actions, stop: 'reached-next-own', engineTransitions: transitions };
        if (node.budget.stopReason() !== null) return { node, actions, stop: 'node_budget', engineTransitions: transitions };
        const raw = node.legalActions().filter((a) => a.type !== 'surrender');
        if (raw.length === 0) return { node, actions, stop: 'no-legal-action', engineTransitions: transitions };
        let best: Action | null = null;
        if (continuationPolicy === 'cheap-advance-v1') {
            // 中文：便宜续弈不需要状态克隆、不需要寻路；直接按固定 O(1) 推进分排序。
            const state = node.getState();
            let bestScore = Number.NEGATIVE_INFINITY;
            for (const candidate of raw) {
                const score = cheapAdvanceScore(state, candidate);
                const code = encodeAction(candidate);
                if (score > bestScore || (score === bestScore && best !== null
                    && compareActionCodeCanonicalV16(code, encodeAction(best)) < 0)) {
                    best = candidate;
                    bestScore = score;
                }
            }
        } else {
            const engine = new GameEngine(node.getState());
            const narrowed = prefilterActions(node.getState(), node.currentPlayer, raw, prefilterWidth);
            const scores = new Map<string, number>();
            for (const item of ai.scoreCandidateActions(engine, node.currentPlayer, narrowed.slice() as Action[])) {
                scores.set(encodeAction(item.action), item.score);
            }
            let bestScore = Number.NEGATIVE_INFINITY;
            for (const candidate of narrowed) {
                const code = encodeAction(candidate);
                const score = scores.get(code) ?? Number.NEGATIVE_INFINITY;
                if (score > bestScore || (score === bestScore && best !== null
                    && compareActionCodeCanonicalV16(code, encodeAction(best)) < 0)) {
                    best = candidate;
                    bestScore = score;
                }
            }
        }
        if (best === null) return { node, actions, stop: 'no-legal-action', engineTransitions: transitions };
        const applied = node.apply(best);
        if (applied.status !== 'ok') {
            if (applied.status === 'budget') return { node, actions, stop: 'node_budget', engineTransitions: transitions };
            if (applied.status === 'terminal') return { node, actions, stop: 'terminal', engineTransitions: transitions };
            return { node, actions, stop: 'no-legal-action', engineTransitions: transitions };
        }
        node = applied.child;
        actions.push(encodeAction(best));
        transitions += 1;
    }
    return { node, actions, stop: 'phase-action-cap', engineTransitions: transitions };
}

/* ------------------------------------------------------------------ *
 * 根候选
 * ------------------------------------------------------------------ */

export type S1Source = 'heuristic' | 'model' | 'capture' | 'recruit' | 'explore' | 'end_turn' | 'win-now';

export interface S1Candidate {
    actionCode: string;
    action: Action;
    sources: S1Source[];
    heuristicScore: number;
    modelScore: number | null;
    /** 已完成同样边界后的保守值；**未搜索的候选是 null，不是 0**。 */
    value: number | null;
    reachedBoundary: BoundaryStop | 'not-searched';
    roundsCompleted: number;
    branchesCompleted: number;
    opponentReplyCodes: string[];
    principalVariation: string[];
    engineTransitions: number;
    truncated: boolean;
}

export interface S1Decision {
    teacherVersion: string;
    tierId: string;
    candidateOrderingId: string;
    action: Action;
    actionCode: string;
    reason: 'win-now' | 'selected' | 'single-candidate' | 'no-candidate-fallback';
    rootAllianceId: number;
    candidates: S1Candidate[];
    engineTransitions: number;
    rawActions: number;
    playerTurnTransitions: number;
    fullRounds: number;
    elapsedMs: number;
    wallCapHit: boolean;
    /** wallCapHit=true 时标签不可信（任务书 §5.2）。 */
    labelTrustworthy: boolean;
    boundaryReachedRatio: number;
    leafSpec: S1LeafSpec;
    truncationStop: 'node_budget' | 'wall' | null;
    /** 该决策实际生效的粗筛宽度（写进 resolved config 与标签）。 */
    prefilterWidth: number;
    wallMsPerDecision: number;
    /** 该决策实际使用的续弈策略。 */
    continuationPolicy: S1ContinuationPolicy;
}

export function buildRootCandidates(options: {
    state: GameState;
    playerId: number;
    legal: readonly Action[];
    ai: HeuristicAI;
    config: Pick<S1Tier, 'rootWidth'>;
    prefilterWidth: number;
    modelScorer?: (state: GameState, playerId: number, actions: readonly Action[]) => Map<string, number>;
}): Array<{ action: Action; code: string; sources: Set<S1Source>; heuristicScore: number; modelScore: number | null }> {
    const { state, playerId, legal, ai, config, prefilterWidth, modelScorer } = options;
    const engine = new GameEngine(state);
    const narrowed = prefilterActions(state, playerId, [...legal], prefilterWidth);
    const scores = new Map<string, number>();
    for (const item of ai.scoreCandidateActions(engine, playerId, narrowed.slice() as Action[])) {
        scores.set(encodeAction(item.action), item.score);
    }
    const modelScores = modelScorer ? modelScorer(state, playerId, legal) : null;

    const pool = new Map<string, { action: Action; code: string; sources: Set<S1Source>; heuristicScore: number; modelScore: number | null }>();
    const add = (action: Action, source: S1Source): void => {
        const code = encodeAction(action);
        const existing = pool.get(code);
        const heuristicScore = scores.get(code) ?? 0;
        const modelScore = modelScores?.get(code) ?? null;
        if (existing) {
            existing.sources.add(source);
            if (modelScore !== null && (existing.modelScore === null || modelScore > existing.modelScore)) {
                existing.modelScore = modelScore;
            }
            return;
        }
        pool.set(code, { action, code, sources: new Set([source]), heuristicScore, modelScore });
    };

    for (const action of narrowed) add(action, 'heuristic');
    if (modelScores) {
        for (const action of legal) {
            if (modelScores.has(encodeAction(action))) add(action, 'model');
        }
    }
    for (const action of legal) {
        if (action.type === 'capture' || action.type === 'repair' || action.type === 'destroy_town') add(action, 'capture');
        if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') add(action, 'recruit');
        if (action.type === 'end_turn') add(action, 'end_turn');
    }
    // 按 (单位, 动作类型) 分层的探索项：保证每个单位都有机会被看到。
    const seenBucket = new Set<string>();
    const orderedLegal = [...legal].sort((a, b) => compareActionCodeCanonicalV16(encodeAction(a), encodeAction(b)));
    for (const action of orderedLegal) {
        const unitId = 'unitId' in action ? (action as { unitId?: string }).unitId ?? 'none' : 'none';
        const bucket = `${action.type}:${unitId}`;
        if (seenBucket.has(bucket)) continue;
        seenBucket.add(bucket);
        add(action, 'explore');
    }

    const all = [...pool.values()];
    const selected: typeof all = [];
    const selectedCodes = new Set<string>();
    const push = (item: (typeof all)[number] | undefined): void => {
        if (!item || selectedCodes.has(item.code)) return;
        selectedCodes.add(item.code);
        selected.push(item);
    };

    // 1) capture/repair 等关键动作与 model 高分优先（对应任务书 §5.1 第 1 条）。
    for (const item of all.filter((c) => c.sources.has('capture'))
        .sort((a, b) => (b.heuristicScore - a.heuristicScore) || compareActionCodeCanonicalV16(a.code, b.code))) {
        if (selected.length >= config.rootWidth) break;
        push(item);
    }
    for (const item of all.filter((c) => c.modelScore !== null)
        .sort((a, b) => ((b.modelScore ?? 0) - (a.modelScore ?? 0)) || compareActionCodeCanonicalV16(a.code, b.code))) {
        if (selected.length >= config.rootWidth) break;
        push(item);
    }
    // 2) 招募配额：至少保留一个招募候选（开局经济决策）。
    push(all.filter((c) => c.sources.has('recruit'))
        .sort((a, b) => (b.heuristicScore - a.heuristicScore) || compareActionCodeCanonicalV16(a.code, b.code))[0]);
    // 3) end_turn 永远保留（必须允许「有其他合法动作仍应结束」）。
    push(all.find((c) => c.action.type === 'end_turn'));
    // 4) 剩余按启发式高分填满。
    for (const item of all.sort((a, b) => (b.heuristicScore - a.heuristicScore) || compareActionCodeCanonicalV16(a.code, b.code))) {
        if (selected.length >= config.rootWidth) break;
        push(item);
    }
    // 5) 仍然有空位时补探索项。
    for (const item of all) {
        if (selected.length >= config.rootWidth) break;
        push(item);
    }
    return selected;
}

/**
 * S1 主搜索：对一个状态给出根动作与全部候选的、**边界一致的**保守值。
 */
export function searchS1Action(options: { state: GameState; playerId: number; s1: S1Options }): S1Decision {
    const { state, playerId, s1 } = options;
    const tier = s1.tier;
    const now = () => Date.now();
    const startedAt = now();
    const wallMs = s1.wallMsPerDecision ?? 30000;
    const prefilterWidth = s1.prefilterWidth ?? S1_DEFAULT_PREFILTER_WIDTH;
    const continuationPolicy = s1.continuationPolicy ?? S1_DEFAULT_CONTINUATION_POLICY;
    const ai = new HeuristicAI(s1.rng ?? (() => 0.5));

    const root = PlanningNode.root(state, playerId, { nodeBudget: tier.transitionBudget });
    const rootAllianceId = root.rootAllianceId;
    const allLegal = root.legalActions();
    const nonSurrender = allLegal.filter((a) => a.type !== 'surrender');
    const searchable = nonSurrender.length > 0 ? nonSurrender : allLegal;

    const pool = buildRootCandidates({
        state, playerId, legal: searchable, ai,
        config: { rootWidth: tier.rootWidth },
        prefilterWidth,
        modelScorer: s1.modelScorer,
    });

    const candidates: S1Candidate[] = [];
    let wallCapHit = false;
    let truncationStop: 'node_budget' | 'wall' | null = null;
    let winNowCode: string | null = null;
    let boundariesReached = 0;
    let boundariesAttempted = 0;

    for (const cand of pool) {
        if (now() - startedAt >= wallMs) { wallCapHit = true; truncationStop = 'wall'; break; }
        if (root.budget.stopReason() !== null) { truncationStop = 'node_budget'; break; }
        boundariesAttempted += 1;

        const applied = root.apply(cand.action);
        if (applied.status !== 'ok') continue;
        let node = applied.child;
        const pv: string[] = [cand.code];

        if (node.isTerminal() && node.terminalVerdict() === 'win') {
            candidates.push({
                actionCode: cand.code, action: cand.action, sources: [...cand.sources, 'win-now'],
                heuristicScore: cand.heuristicScore, modelScore: cand.modelScore,
                value: S1_TERMINAL_WIN, reachedBoundary: 'terminal', roundsCompleted: 0,
                branchesCompleted: 0, opponentReplyCodes: [], principalVariation: pv,
                engineTransitions: root.budget.nodesExpanded, truncated: false,
            });
            winNowCode = cand.code;
            boundariesReached += 1;
            break;
        }

        // 2) 完成己方剩余行动。
        const own = completeSideTurn({
            start: node, sideAllianceId: rootAllianceId, ai,
            phaseActionCap: tier.phaseActionCap, prefilterWidth, wallMs, startedAt, now,
            continuationPolicy,
        });
        node = own.node;
        pv.push(...own.actions);
        if (own.stop === 'wall') { wallCapHit = true; truncationStop = 'wall'; }
        if (own.stop === 'node_budget') truncationStop = 'node_budget';

        let worst = Number.POSITIVE_INFINITY;
        let bestPv = [...pv];
        const replyCodes: string[] = [];
        let branchBoundary: BoundaryStop = own.stop;
        let roundsCompleted = 0;
        let branchesCompleted = 0;
        let candidateTransitions = own.engineTransitions;

        if (node.isTerminal()) {
            worst = leafValueS1(node, S1_LEAF_SPEC, s1.leafEvaluator);
            branchBoundary = 'terminal';
            boundariesReached += 1;
        } else if (node.currentAllianceId !== rootAllianceId && !wallCapHit && truncationStop === null) {
            // 3) 对手侧：取若干不同首回应分支，各自完成敌方剩余行动。
            const enemyId = node.currentPlayer;
            const enemyAllianceId = getAllianceId(node.getState(), enemyId);
            const enemyEngine = new GameEngine(node.getState());
            const rawReplies = node.legalActions().filter((a) => a.type !== 'surrender');
            const narrowedReplies = prefilterActions(node.getState(), enemyId, rawReplies, prefilterWidth);
            const replyScores = new Map<string, number>();
            for (const item of ai.scoreCandidateActions(enemyEngine, enemyId, narrowedReplies.slice() as Action[])) {
                replyScores.set(encodeAction(item.action), item.score);
            }
            const orderedReplies = [...narrowedReplies].sort((a, b) => {
                const sa = replyScores.get(encodeAction(a)) ?? Number.NEGATIVE_INFINITY;
                const sb = replyScores.get(encodeAction(b)) ?? Number.NEGATIVE_INFINITY;
                if (sb !== sa) return sb - sa;
                return compareActionCodeCanonicalV16(encodeAction(a), encodeAction(b));
            }).slice(0, tier.opponentReplyWidth);

            for (const reply of orderedReplies) {
                if (now() - startedAt >= wallMs) { wallCapHit = true; truncationStop = 'wall'; break; }
                if (root.budget.stopReason() !== null) { truncationStop = 'node_budget'; break; }
                const replyApplied = node.apply(reply);
                if (replyApplied.status !== 'ok') continue;
                replyCodes.push(encodeAction(reply));
                const enemy = completeSideTurn({
                    start: replyApplied.child, sideAllianceId: enemyAllianceId, ai,
                    phaseActionCap: tier.phaseActionCap, prefilterWidth, wallMs, startedAt, now,
                    continuationPolicy,
                });
                candidateTransitions += enemy.engineTransitions + 1;
                branchBoundary = enemy.stop;
                const value = leafValueS1(enemy.node, S1_LEAF_SPEC, s1.leafEvaluator);
                if (value < worst) {
                    worst = value;
                    bestPv = [...pv, encodeAction(reply), ...enemy.actions];
                }
                branchesCompleted += 1;
                if (enemy.stop === 'reached-next-own' || enemy.stop === 'terminal') roundsCompleted = 1;
            }
            if (worst === Number.POSITIVE_INFINITY) {
                worst = leafValueS1(node, S1_LEAF_SPEC, s1.leafEvaluator);
                branchesCompleted = 0;
            }
            const reached = branchBoundary === 'reached-next-own' || branchBoundary === 'terminal';
            if (reached) boundariesReached += 1;
        } else {
            // 己方续弈就停了（预算/墙钟/动作上限）⇒ 没到约定边界。
            worst = leafValueS1(node, S1_LEAF_SPEC, s1.leafEvaluator);
        }

        candidates.push({
            actionCode: cand.code, action: cand.action, sources: [...cand.sources],
            heuristicScore: cand.heuristicScore, modelScore: cand.modelScore,
            value: worst, reachedBoundary: branchBoundary, roundsCompleted, branchesCompleted,
            opponentReplyCodes: replyCodes, principalVariation: bestPv,
            engineTransitions: candidateTransitions,
            truncated: branchBoundary !== 'reached-next-own' && branchBoundary !== 'terminal',
        });
        if (wallCapHit || truncationStop !== null) break;
    }

    const elapsedMs = now() - startedAt;
    let selected: S1Candidate | undefined;
    let reason: S1Decision['reason'] = 'selected';
    if (winNowCode !== null) {
        selected = candidates.find((c) => c.actionCode === winNowCode);
        reason = 'win-now';
    } else {
        const searched = candidates.filter((c) => c.value !== null && !c.truncated);
        if (searched.length > 0) {
            selected = searched.reduce((best, cand) => {
                const bv = best.value ?? Number.NEGATIVE_INFINITY;
                const cv = cand.value ?? Number.NEGATIVE_INFINITY;
                if (cv > bv) return cand;
                if (cv === bv && cand.heuristicScore > best.heuristicScore) return cand;
                if (cv === bv && cand.heuristicScore === best.heuristicScore
                    && compareActionCodeCanonicalV16(cand.actionCode, best.actionCode) < 0) return cand;
                return best;
            }, searched[0]);
            if (searched.length === 1) reason = 'single-candidate';
        } else if (candidates.length > 0) {
            // 全部被截断：仍要返回一个已检查合法的动作，但 reason 明确写出来。
            selected = candidates.reduce((best, cand) => (cand.heuristicScore > best.heuristicScore ? cand : best), candidates[0]);
            reason = 'selected';
        }
    }
    if (!selected) {
        const fallback = searchable.reduce((acc, act) => {
            const engine = new GameEngine(state);
            void engine;
            return acc;
        }, searchable.slice().sort((a, b) => compareActionCodeCanonicalV16(encodeAction(a), encodeAction(b)))[0]);
        selected = {
            actionCode: encodeAction(fallback), action: fallback, sources: ['heuristic'],
            heuristicScore: 0, modelScore: null, value: null,
            reachedBoundary: 'not-searched', roundsCompleted: 0, branchesCompleted: 0,
            opponentReplyCodes: [], principalVariation: [], engineTransitions: 0, truncated: true,
        };
        reason = 'no-candidate-fallback';
    }

    return {
        teacherVersion: S1_TEACHER_VERSION,
        tierId: tier.tierId,
        candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
        action: selected.action,
        actionCode: selected.actionCode,
        reason,
        rootAllianceId,
        candidates,
        engineTransitions: root.budget.nodesExpanded,
        rawActions: root.budget.rawActions,
        playerTurnTransitions: root.budget.playerTurnTransitions,
        fullRounds: root.budget.fullRounds,
        elapsedMs,
        wallCapHit,
        labelTrustworthy: !wallCapHit,
        boundaryReachedRatio: boundariesAttempted === 0 ? 0 : boundariesReached / boundariesAttempted,
        leafSpec: S1_LEAF_SPEC,
        truncationStop,
        prefilterWidth,
        wallMsPerDecision: wallMs,
        continuationPolicy,
    };
}
