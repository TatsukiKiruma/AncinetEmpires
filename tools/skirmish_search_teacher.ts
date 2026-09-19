/**
 * T07 有限预算浅层战术搜索教师（beam / 少量候选 rollout）。
 *
 * 目标（任务书 T07）：让教师比较"行动后的局势 + 对手回应"，而不只是拟合现有单步打分。
 *
 * 设计约束：
 * 1. 全部推演走 T05 只读规划接口 PlanningNode（真实 GameEngine 克隆、逐动作合法性校验、
 *    规则终局与预算截断分离）。不修改真实对局，不放松规则，不重写引擎。
 * 2. 多来源候选：启发式高分、模型高分（可选注入）、关键占领/防守（capture 及战术必需动作）、
 *    按单位与动作类型分层的探索项；马上获胜的动作优先保留并短路。
 *    —— 风险剪枝（只搜候选集而非全动作空间）是【策略】而非规则，不保证剪枝后仍全局最优。
 * 3. 可构造 move→attack、move→capture 等局部组合：靠"施加一个动作后引擎给出新的合法动作"
 *    自然展开，逐个底层动作真实引擎校验；保留单步与单位交错行动路径，不强制固定单位顺序。
 * 4. 必看对手阶段：己方必要后续行动后交出击给对手，至少模拟一个对手行动阶段；
 *    对多个不同对手回应取保守聚合（取最劣），但该聚合是启发式 rollout，
 *    【不得】称为已证明的 minimax。预算不足时在 trace 记录截断位置。
 * 5. 叶评价：真实规则终局（rootViewValue）绝对优先；未终局用可解释局面量
 *    （军队价值差 + 领地归属差 + 金币已含于军队价值），不把启发式动作分直接当胜率。
 * 6. 每个决策产出结构化 trace：候选、最终选择、主要变化序列(PV)、评价、对手回应、
 *    节点与耗时、fallback 原因。
 */
import { GameEngine } from '../src/game/engine';
import { calculateArmyValue } from '../src/game/env';
import { HeuristicAI, type Rng } from '../src/game/ai/heuristic_ai';
import { getAllianceId, getTurnPlayerIds } from '../src/game/rule_config';
import { PlanningNode, type PlanningBudgetSpec } from '../src/game/ai/planning';
import { encodeAction } from '../src/game/env';
import type { Action, GameState } from '../src/game/types';
import type { SkirmishPolicy, SkirmishPolicyContext, SkirmishPolicyFactory } from './skirmish_training_runner';

/** 真实终局的量级：任何局面量评估都远小于它，保证胜负永远压倒材料差。 */
export const TERMINAL_WIN = 1_000_000_000;
export const TERMINAL_LOSS = -1_000_000_000;

export interface SearchTeacherConfig extends PlanningBudgetSpec {
    /** 参与推演的根候选上限（风险剪枝宽度）。 */
    beamWidth: number;
    /** 启发式来源保留的高分候选数。 */
    heuristicTopK: number;
    /** 模型来源保留的高分候选数（无模型评分时忽略）。 */
    modelTopK: number;
    /** 每个 (单位, 动作类型) 分层桶额外保留的探索代表数。 */
    explorePerBucket: number;
    /** 根动作之后、交出击前再补的己方后续动作层数（0 或 1）。 */
    ownFollowupDepth: number;
    /** 每个候选模拟的不同对手回应数（保守聚合的样本数）。 */
    opponentReplyWidth: number;
    /** 对手阶段内连续行动的最大动作数（≥1 才算"看过对手行动阶段"）。 */
    opponentPhaseActions: number;
    /** 领地归属差在局面量里的权重。 */
    territoryWeight: number;
}

export const DEFAULT_SEARCH_TEACHER_CONFIG: SearchTeacherConfig = {
    nodeBudget: 984,
    decisionMsBudget: 3000,
    beamWidth: 8,
    heuristicTopK: 6,
    modelTopK: 4,
    explorePerBucket: 1,
    ownFollowupDepth: 1,
    opponentReplyWidth: 2,
    opponentPhaseActions: 1,
    territoryWeight: 250
};

export type CandidateSource = 'heuristic' | 'model' | 'capture' | 'tactical-necessity' | 'explore' | 'win-now';

export interface SearchTeacherCandidate {
    actionCode: string;
    action: Action;
    sources: CandidateSource[];
    heuristicScore: number;
    modelScore: number | null;
    /** 该候选推演出的保守聚合值（对手多回应取最劣）；未推演为 null。 */
    value: number | null;
    immediateWin: boolean;
    truncated: boolean;
    principalVariation: string[];
    opponentReplyCodes: string[];
}

export interface SearchTeacherDecision {
    action: Action;
    actionCode: string;
    fixedActionIndexHint: string | null;
    reason: 'selected' | 'win-now' | 'budget-fallback-heuristic' | 'budget-fallback-first-legal' | 'single-candidate';
    candidates: SearchTeacherCandidate[];
    selectedCode: string;
    nodesExpanded: number;
    rawActions: number;
    playerTurnTransitions: number;
    fullRounds: number;
    elapsedMs: number;
    sawOpponentPhase: boolean;
    truncationStop: 'node_budget' | 'decision_ms' | null;
}

/** 模型评分注入：返回 actionCode → 分数（越大越好）；无有效评分的候选可省略。 */
export type ModelScorer = (state: GameState, playerId: number, actions: readonly Action[]) => Map<string, number>;

function allianceSet(state: GameState): Map<number, number[]> {
    const byAlliance = new Map<number, number[]>();
    for (const playerId of getTurnPlayerIds(state)) {
        const allianceId = getAllianceId(state, playerId);
        const list = byAlliance.get(allianceId) ?? [];
        list.push(playerId);
        byAlliance.set(allianceId, list);
    }
    return byAlliance;
}

function territoryCount(state: GameState, allianceIds: Set<number>): number {
    let count = 0;
    for (const row of state.map.tiles) {
        for (const tile of row) {
            if (tile.ownerId === null) continue;
            if (allianceIds.has(getAllianceId(state, tile.ownerId))) count += 1;
        }
    }
    return count;
}

/** 可解释局面量（根阵营视角，未终局时）：军队价值差 + 领地差。启发式动作分不参与。 */
export function evaluatePositionForRoot(state: GameState, rootAllianceId: number, territoryWeight: number): number {
    const byAlliance = allianceSet(state);
    const rootPlayers = new Set(byAlliance.get(rootAllianceId) ?? []);
    let ownArmy = 0;
    let enemyArmy = 0;
    const rootAllianceIds = new Set<number>([rootAllianceId]);
    const enemyAllianceIds = new Set<number>();
    for (const [allianceId, players] of byAlliance) {
        const army = players.reduce((sum, id) => sum + calculateArmyValue(state, id), 0);
        if (allianceId === rootAllianceId) ownArmy += army;
        else {
            enemyArmy += army;
            enemyAllianceIds.add(allianceId);
        }
    }
    void rootPlayers;
    const ownTerritory = territoryCount(state, rootAllianceIds);
    const enemyTerritory = territoryCount(state, enemyAllianceIds);
    return (ownArmy - enemyArmy) + territoryWeight * (ownTerritory - enemyTerritory);
}

/** 叶节点根视角值：真实终局压倒一切，否则局面量。返回有限数值（非胜率）。 */
function leafValue(node: PlanningNode, territoryWeight: number): number {
    const verdict = node.terminalVerdict();
    if (verdict === 'win') return TERMINAL_WIN;
    if (verdict === 'loss') return TERMINAL_LOSS;
    if (verdict === 'draw') return 0;
    return evaluatePositionForRoot(node.getState(), node.rootAllianceId, territoryWeight);
}

function heuristicRank(ai: HeuristicAI, engine: GameEngine, playerId: number, actions: readonly Action[]): Map<string, number> {
    const scored = ai.scoreCandidateActions(engine, playerId, actions.slice() as Action[]);
    const map = new Map<string, number>();
    for (const item of scored) map.set(encodeAction(item.action), item.score);
    return map;
}

function actionBucket(action: Action): string {
    if (action.type === 'move' || action.type === 'post_attack_move') return `move:${action.unitId}`;
    if (action.type === 'attack') return `attack:${action.attackerId}`;
    if (action.type === 'capture' || action.type === 'repair' || action.type === 'wait' || action.type === 'destroy_town') return `${action.type}:${action.unitId}`;
    if (action.type === 'heal') return `heal:${action.healerId}`;
    if (action.type === 'support') return `support:${action.supporterId}`;
    if (action.type === 'summon') return `summon:${action.summonerId}`;
    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') return `recruit:${action.unitClass}`;
    return action.type;
}

function buildCandidatePool(
    actions: readonly Action[],
    heuristicScores: Map<string, number>,
    modelScores: Map<string, number> | null,
    urgentCodes: Set<string>,
    config: SearchTeacherConfig
): Map<string, { action: Action; code: string; sources: Set<CandidateSource>; heuristicScore: number; modelScore: number | null }> {
    const pool = new Map<string, { action: Action; code: string; sources: Set<CandidateSource>; heuristicScore: number; modelScore: number | null }>();
    const add = (action: Action, source: CandidateSource) => {
        const code = encodeAction(action);
        const existing = pool.get(code);
        if (existing) {
            existing.sources.add(source);
            return;
        }
        pool.set(code, {
            action,
            code,
            sources: new Set([source]),
            heuristicScore: heuristicScores.get(code) ?? -Infinity,
            modelScore: modelScores?.get(code) ?? null
        });
    };

    // 启发式高分
    [...actions]
        .sort((a, b) => (heuristicScores.get(encodeAction(b)) ?? -Infinity) - (heuristicScores.get(encodeAction(a)) ?? -Infinity))
        .slice(0, config.heuristicTopK)
        .forEach(action => add(action, 'heuristic'));

    // 模型高分
    if (modelScores && modelScores.size > 0) {
        [...actions]
            .filter(action => modelScores.has(encodeAction(action)))
            .sort((a, b) => (modelScores.get(encodeAction(b)) ?? -Infinity) - (modelScores.get(encodeAction(a)) ?? -Infinity))
            .slice(0, config.modelTopK)
            .forEach(action => add(action, 'model'));
    }

    // 关键占领 / 战术必需（capture 全收，≥50000 urgent 保留）
    actions.forEach(action => {
        const code = encodeAction(action);
        if (action.type === 'capture') add(action, 'capture');
        else if (urgentCodes.has(code)) add(action, 'tactical-necessity');
    });

    // 分层探索：每个 (单位, 动作类型) 桶保留桶内启发式最优的一个代表
    const buckets = new Map<string, Action>();
    for (const action of actions) {
        const bucket = actionBucket(action);
        const current = buckets.get(bucket);
        if (!current || (heuristicScores.get(encodeAction(action)) ?? -Infinity) > (heuristicScores.get(encodeAction(current)) ?? -Infinity)) {
            buckets.set(bucket, action);
        }
    }
    let exploreKept = 0;
    for (const action of buckets.values()) {
        if (exploreKept >= config.explorePerBucket * buckets.size && exploreKept > config.explorePerBucket) break;
        add(action, 'explore');
        exploreKept += 1;
        if (exploreKept >= config.beamWidth) break;
    }

    return pool;
}

/** 交出击：连续 end_turn 直到 currentPlayer 属于敌对阵营（或终局/预算耗尽）。 */
function handToOpponent(node: PlanningNode, rootAllianceId: number, guard = 8): { node: PlanningNode; stop: 'node_budget' | 'decision_ms' | 'terminal' | 'ok' | 'guard' } {
    let current = node;
    for (let i = 0; i < guard; i += 1) {
        if (current.isTerminal()) return { node: current, stop: 'terminal' };
        const stop = current.budget.stopReason();
        if (stop) return { node: current, stop };
        if (current.currentAllianceId !== rootAllianceId) return { node: current, stop: 'ok' };
        const endTurn = current.legalActions().find(a => a.type === 'end_turn');
        if (!endTurn) return { node: current, stop: 'ok' };
        const res = current.apply(endTurn);
        if (res.status !== 'ok') return { node: current, stop: res.status === 'budget' ? res.stop : 'terminal' };
        current = res.child;
    }
    return { node: current, stop: 'guard' };
}

export function searchTeacherAction(options: {
    state: GameState;
    playerId: number;
    config?: Partial<SearchTeacherConfig>;
    rng?: Rng;
    modelScorer?: ModelScorer;
    now?: () => number;
}): SearchTeacherDecision {
    const config: SearchTeacherConfig = { ...DEFAULT_SEARCH_TEACHER_CONFIG, ...options.config };
    const rng = options.rng ?? (() => 0.5);
    const now = options.now ?? Date.now;
    const startedAt = now();
    const ai = new HeuristicAI(rng);
    const rootEngine = new GameEngine(options.state);
    const root = PlanningNode.root(options.state, options.playerId, {
        nodeBudget: config.nodeBudget,
        decisionMsBudget: config.decisionMsBudget
    });

    const allLegal = root.legalActions();
    const nonSurrender = allLegal.filter(a => a.type !== 'surrender');
    const searchable = nonSurrender.length > 0 ? nonSurrender : allLegal;
    const rootAllianceId = root.rootAllianceId;

    const heuristicScores = heuristicRank(ai, rootEngine, options.playerId, searchable);
    const modelScores = config.modelTopK > 0 && options.modelScorer
        ? options.modelScorer(options.state, options.playerId, searchable)
        : null;
    const urgentCodes = new Set<string>();
    for (const action of searchable) {
        if ((heuristicScores.get(encodeAction(action)) ?? -Infinity) >= 50000) urgentCodes.add(encodeAction(action));
    }

    const pool = buildCandidatePool(searchable, heuristicScores, modelScores, urgentCodes, config);
    const orderedPool = [...pool.values()]
        .sort((a, b) => (b.heuristicScore - a.heuristicScore) || (a.code < b.code ? -1 : 1))
        .slice(0, config.beamWidth);

    const candidates: SearchTeacherCandidate[] = [];
    let truncationStop: 'node_budget' | 'decision_ms' | null = null;
    let sawOpponentPhase = false;
    let winNowCode: string | null = null;

    const evalOpponentReply = (afterOwn: PlanningNode): { worst: number; replies: string[]; pv: string[]; truncated: boolean; terminal: boolean } => {
        // afterOwn 现在轮到对手（或已终局）
        if (afterOwn.isTerminal()) {
            return { worst: leafValue(afterOwn, config.territoryWeight), replies: [], pv: [], truncated: false, terminal: true };
        }
        const enemyId = afterOwn.currentPlayer;
        const enemyEngine = new GameEngine(afterOwn.getState());
        const enemyActions = afterOwn.legalActions().filter(a => a.type !== 'surrender');
        if (enemyActions.length === 0) {
            return { worst: leafValue(afterOwn, config.territoryWeight), replies: [], pv: [], truncated: false, terminal: false };
        }
        const enemyScores = heuristicRank(ai, enemyEngine, enemyId, enemyActions);
        const replies = [...enemyActions]
            .sort((a, b) => (enemyScores.get(encodeAction(b)) ?? -Infinity) - (enemyScores.get(encodeAction(a)) ?? -Infinity))
            .slice(0, config.opponentReplyWidth);

        let worst = Infinity;
        const replyCodes: string[] = [];
        let pv: string[] = [];
        let truncated = false;
        for (const reply of replies) {
            const res = afterOwn.apply(reply);
            if (res.status !== 'ok') {
                truncated = true;
                if (res.status === 'budget') truncationStop = res.stop;
                continue;
            }
            let leaf = res.child;
            replyCodes.push(encodeAction(reply));
            // 对手阶段可连续多动作（同阵营仍行动时继续取启发式最优）
            for (let k = 1; k < config.opponentPhaseActions; k += 1) {
                if (leaf.isTerminal() || leaf.currentAllianceId !== getAllianceId(leaf.getState(), enemyId)) break;
                const contEngine = new GameEngine(leaf.getState());
                const contActions = leaf.legalActions().filter(a => a.type !== 'surrender');
                if (contActions.length === 0) break;
                const contScores = heuristicRank(ai, contEngine, leaf.currentPlayer, contActions);
                const best = contActions.reduce((acc, act) => ((contScores.get(encodeAction(act)) ?? -Infinity) > (contScores.get(encodeAction(acc)) ?? -Infinity) ? act : acc), contActions[0]);
                const cont = leaf.apply(best);
                if (cont.status !== 'ok') { truncated = true; if (cont.status === 'budget') truncationStop = cont.stop; break; }
                leaf = cont.child;
            }
            const value = leafValue(leaf, config.territoryWeight);
            if (value < worst) {
                worst = value;
                pv = [encodeAction(reply), ...(leaf.lastActionCode && leaf.lastActionCode !== encodeAction(reply) ? [leaf.lastActionCode] : [])];
            }
            if (root.budget.stopReason()) { truncated = true; truncationStop = root.budget.stopReason(); break; }
        }
        if (replyCodes.length > 0) sawOpponentPhase = true;
        if (worst === Infinity) { worst = leafValue(afterOwn, config.territoryWeight); truncated = true; }
        return { worst, replies: replyCodes, pv, truncated, terminal: false };
    };

    for (const cand of orderedPool) {
        if (root.budget.stopReason()) {
            truncationStop = root.budget.stopReason();
            break;
        }
        const applied = root.apply(cand.action);
        if (applied.status === 'illegal') continue;
        if (applied.status === 'budget') { truncationStop = applied.stop; break; }
        if (applied.status !== 'ok') continue;
        let node = applied.child;
        let ownTruncated = false;
        const pv: string[] = [cand.code];

        // 立即获胜短路
        if (node.isTerminal() && node.terminalVerdict() === 'win') {
            candidates.push({
                actionCode: cand.code, action: cand.action, sources: [...cand.sources, 'win-now'],
                heuristicScore: cand.heuristicScore, modelScore: cand.modelScore,
                value: TERMINAL_WIN, immediateWin: true, truncated: false,
                principalVariation: pv, opponentReplyCodes: []
            });
            winNowCode = cand.code;
            break;
        }

        // 己方必要后续行动（move→attack/capture 组合在此自然出现）
        for (let d = 0; d < config.ownFollowupDepth; d += 1) {
            if (node.isTerminal() || node.currentAllianceId !== rootAllianceId) break;
            if (node.budget.stopReason()) { ownTruncated = true; truncationStop = node.budget.stopReason(); break; }
            const ownEngine = new GameEngine(node.getState());
            const ownActions = node.legalActions().filter(a => a.type !== 'surrender');
            if (ownActions.length === 0) break;
            const ownScores = heuristicRank(ai, ownEngine, node.currentPlayer, ownActions);
            const best = ownActions.reduce((acc, act) => ((ownScores.get(encodeAction(act)) ?? -Infinity) > (ownScores.get(encodeAction(acc)) ?? -Infinity) ? act : acc), ownActions[0]);
            const res = node.apply(best);
            if (res.status !== 'ok') { ownTruncated = true; if (res.status === 'budget') truncationStop = res.stop; break; }
            node = res.child;
            pv.push(encodeAction(best));
            if (node.isTerminal() && node.terminalVerdict() === 'win') {
                candidates.push({
                    actionCode: cand.code, action: cand.action, sources: [...cand.sources, 'win-now'],
                    heuristicScore: cand.heuristicScore, modelScore: cand.modelScore,
                    value: TERMINAL_WIN, immediateWin: true, truncated: false,
                    principalVariation: pv, opponentReplyCodes: []
                });
                winNowCode = cand.code;
                break;
            }
        }
        if (winNowCode === cand.code) break;

        // 交出击并模拟对手阶段
        const handed = handToOpponent(node, rootAllianceId);
        if (handed.stop === 'node_budget' || handed.stop === 'decision_ms') { ownTruncated = true; truncationStop = handed.stop; }
        const replyEval = evalOpponentReply(handed.node);
        const value = replyEval.worst;
        candidates.push({
            actionCode: cand.code, action: cand.action, sources: [...cand.sources],
            heuristicScore: cand.heuristicScore, modelScore: cand.modelScore,
            value, immediateWin: false, truncated: ownTruncated || replyEval.truncated,
            principalVariation: [...pv, ...replyEval.pv], opponentReplyCodes: replyEval.replies
        });
    }

    const elapsedMs = now() - startedAt;

    // 选择：真实胜 > 保守聚合值 > 启发式分 > 代码字典序
    let selected: SearchTeacherCandidate | undefined;
    let reason: SearchTeacherDecision['reason'] = 'selected';
    if (winNowCode) {
        selected = candidates.find(c => c.actionCode === winNowCode);
        reason = 'win-now';
    } else if (candidates.length > 0) {
        selected = candidates.reduce((best, cand) => {
            const bv = best.value ?? -Infinity;
            const cv = cand.value ?? -Infinity;
            if (cv > bv) return cand;
            if (cv === bv && (cand.heuristicScore ?? -Infinity) > (best.heuristicScore ?? -Infinity)) return cand;
            return best;
        }, candidates[0]);
        if (candidates.length === 1) reason = 'single-candidate';
    }

    // 兜底：完全没推演出候选时用启发式最优（仍是已检查合法动作）
    if (!selected) {
        const fallback = searchable.reduce((acc, act) => ((heuristicScores.get(encodeAction(act)) ?? -Infinity) > (heuristicScores.get(encodeAction(acc)) ?? -Infinity) ? act : acc), searchable[0]);
        reason = truncationStop ? 'budget-fallback-heuristic' : 'budget-fallback-first-legal';
        selected = {
            actionCode: encodeAction(fallback), action: fallback, sources: ['heuristic'],
            heuristicScore: heuristicScores.get(encodeAction(fallback)) ?? 0, modelScore: null,
            value: null, immediateWin: false, truncated: true, principalVariation: [], opponentReplyCodes: []
        };
    }

    return {
        action: selected.action,
        actionCode: selected.actionCode,
        fixedActionIndexHint: selected.actionCode,
        reason,
        candidates,
        selectedCode: selected.actionCode,
        nodesExpanded: root.budget.nodesExpanded,
        rawActions: root.budget.rawActions,
        playerTurnTransitions: root.budget.playerTurnTransitions,
        fullRounds: root.budget.fullRounds,
        elapsedMs,
        sawOpponentPhase,
        truncationStop
    };
}

export interface SearchTeacherPolicyOptions {
    config?: Partial<SearchTeacherConfig>;
    rng?: Rng;
    modelScorer?: ModelScorer;
    onTrace?: (decision: SearchTeacherDecision, context: SkirmishPolicyContext) => void;
}

/**
 * 把搜索教师接进 runSkirmishEpisode 的 policy 协议：
 * 决策得到的 actionCode 映射回 fixedActionIndex，绝不返回非法索引（兜底首个合法动作）。
 */
export function createSearchTeacherPolicyFactory(
    options: SearchTeacherPolicyOptions = {},
    name = 'search-teacher'
): SkirmishPolicyFactory {
    return (playerId, _playerIds, _episodeSeed): SkirmishPolicy => ({
        name,
        selectFixedActionIndex(context: SkirmishPolicyContext): number {
            const decision = searchTeacherAction({
                state: context.result.state,
                playerId: context.playerId,
                config: options.config,
                rng: options.rng,
                modelScorer: options.modelScorer
            });
            options.onTrace?.(decision, context);
            const matched = context.result.legalActionEntries.find(
                entry => entry.code === decision.actionCode && entry.fixedActionIndex !== null
            );
            const candidateIndex = matched?.fixedActionIndex ?? -1;
            if (candidateIndex >= 0 && context.result.fixedLegalActionIndexes.includes(candidateIndex)) {
                return candidateIndex;
            }
            const anyLegal = context.result.legalActionEntries.find(entry => entry.fixedActionIndex !== null);
            return anyLegal?.fixedActionIndex ?? context.result.fixedLegalActionIndexes[0] ?? -1;
        }
    });
}
