import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { getAllianceId } from '../env/src/game/rule_config';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy, PolicyContext } from './match_runner';
import { evaluateStateValue, EvaluatorWeights, DEFAULT_EVALUATOR_WEIGHTS } from './state_evaluator';
import { selectRootCandidates, CandidateSelectionResult } from './candidate_selector';

export interface SearchTeacherConfig {
    targetK?: number;
    opponentPolicies?: ('heuristic' | 'apk_like')[];
    responseAggregation?: 'min' | 'mean';
    evaluatorWeights?: EvaluatorWeights;
    useFullResponse?: boolean; // 消融：完整回应 vs 根贪心
    maxSimulationSteps?: number;
    maxOwnSteps?: number;
    maxWallMs?: number;
    seed?: number;
}

export const DEFAULT_TEACHER_CONFIG_V1: Required<SearchTeacherConfig> = {
    targetK: 4,
    opponentPolicies: ['heuristic', 'apk_like'],
    responseAggregation: 'min',
    evaluatorWeights: DEFAULT_EVALUATOR_WEIGHTS,
    useFullResponse: true,
    maxSimulationSteps: 40,
    maxOwnSteps: 20,
    maxWallMs: 3000,
    seed: 42
};

export type LeafPhaseStatus =
    | 'direct_terminal'
    | 'greedy_root_only'
    | 'completed_unified_phase'
    | 'incomplete_own_limit'
    | 'incomplete_opp_limit';

export type CandidateStopReason =
    | 'natural_terminal'
    | 'reached_unified_phase'
    | 'own_steps_exceeded'
    | 'opp_steps_exceeded'
    | 'wall_clock_timeout'
    | 'root_greedy';

export interface CandidateEvaluationTrace {
    actionCode: string;
    selectionReason: string;
    engineStepCalls: number;
    actualHandoffs: number;
    leafPhase: LeafPhaseStatus;
    opponentPolicy: string;
    isCompleted: boolean;
    stopReason: CandidateStopReason;
    valueComponents: {
        rawScore: number;
        leafQ: number;
    };
    finalQ: number;
}

export interface SearchTraceV1 {
    chosenActionCode: string;
    fallbackReason: string | null;
    totalLegalCandidates: number;
    searchedCount: number;
    completedCount: number;
    candidateTraces: Record<string, CandidateEvaluationTrace>;
    bestQ: number;
    searchDurationMs: number;
    engineStepCallsTotal: number;
    isGreedyRootOnly: boolean;
    opponentPolicyCount: number;
}

/**
 * 根候选统一相位搜索教师 (修复版 v1 对照)
 * 严格解决：推演相位未对齐、未完成推演伪装、探索配额失效、预算中断无回退、非确定性等问题。
 */
export class CorrectedSearchTeacherV1 implements Policy {
    public id: string;
    protected config: Required<SearchTeacherConfig>;
    protected hAI: HeuristicAI;
    protected apkAI: ApkLikeAI;

    constructor(id: string = 'search_teacher_v1_corrected', config: SearchTeacherConfig = {}) {
        this.id = id;
        this.config = { ...DEFAULT_TEACHER_CONFIG_V1, ...config };
        this.hAI = new HeuristicAI();
        this.apkAI = new ApkLikeAI();
    }

    protected getPolicyAction(policyType: 'heuristic' | 'apk_like', engine: GameEngine, playerId: number): Action | null {
        if (policyType === 'heuristic') {
            return this.hAI.getAction(engine, playerId);
        } else {
            return this.apkAI.getAction(engine, playerId);
        }
    }

    public async chooseAction(ctx: PolicyContext): Promise<string> {
        const trace = this.search(ctx);
        return trace.chosenActionCode;
    }

    /**
     * 核心搜索逻辑
     */
    public search(ctx: PolicyContext): SearchTraceV1 {
        const startTime = performance.now();
        const rootEngine = ctx.engineClone;
        const rootPlayerId = ctx.observerPlayerId;
        const rootAllianceId = getAllianceId(rootEngine.getState(), rootPlayerId);
        const legalActions = ctx.legalActions;

        // 若仅剩 1 个动作，直接返回
        if (legalActions.length === 1) {
            const code = encodeAction(legalActions[0]);
            const singleTrace: CandidateEvaluationTrace = {
                actionCode: code,
                selectionReason: 'only_legal_action',
                engineStepCalls: 0,
                actualHandoffs: 0,
                leafPhase: 'direct_terminal',
                opponentPolicy: 'none',
                isCompleted: true,
                stopReason: 'natural_terminal',
                valueComponents: { rawScore: 0, leafQ: 0 },
                finalQ: 0
            };
            return {
                chosenActionCode: code,
                fallbackReason: null,
                totalLegalCandidates: 1,
                searchedCount: 1,
                completedCount: 1,
                candidateTraces: { [code]: singleTrace },
                bestQ: 0,
                searchDurationMs: performance.now() - startTime,
                engineStepCallsTotal: 0,
                isGreedyRootOnly: !this.config.useFullResponse,
                opponentPolicyCount: this.config.opponentPolicies.length
            };
        }

        // 1. 确定性根候选选择 (含真实探索配额保证)
        const seed = ctx.stepIndex * 1000 + (this.config.seed ?? 42);
        const selection: CandidateSelectionResult = selectRootCandidates(
            rootEngine,
            rootPlayerId,
            legalActions,
            {
                targetK: this.config.targetK,
                nonTopPriorFraction: 0.20,
                seed
            }
        );

        const candidateTraces: Record<string, CandidateEvaluationTrace> = {};
        let stepCallsTotal = 0;
        let bestCode = selection.selectedCodes[0];
        let bestQ = -Infinity;
        let fallbackReason: string | null = null;
        let completedCandidatesCount = 0;

        // 2. 逐一评估被选中的根候选
        for (let i = 0; i < selection.selectedActions.length; i++) {
            // 检查硬墙钟预算
            if (performance.now() - startTime > this.config.maxWallMs) {
                fallbackReason = completedCandidatesCount > 0
                    ? 'completed_partial_budget'
                    : 'budget_exceeded_before_any_completion';
                break;
            }

            const rootAction = selection.selectedActions[i];
            const rootCode = selection.selectedCodes[i];
            const selReason = selection.selectionReasons[rootCode] || 'unknown';

            let candidateStepCalls = 0;
            let actualHandoffs = 0;

            const simEngine = rootEngine.clone();
            simEngine.step(rootAction);
            candidateStepCalls++;
            stepCallsTotal++;

            // A. 若根动作直接产生自然终局，立即结算并记录
            if (simEngine.isTerminal()) {
                const q = evaluateStateValue(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                candidateTraces[rootCode] = {
                    actionCode: rootCode,
                    selectionReason: selReason,
                    engineStepCalls: candidateStepCalls,
                    actualHandoffs: 0,
                    leafPhase: 'direct_terminal',
                    opponentPolicy: 'none',
                    isCompleted: true,
                    stopReason: 'natural_terminal',
                    valueComponents: { rawScore: q, leafQ: q },
                    finalQ: q
                };
                completedCandidatesCount++;
                if (q > bestQ) {
                    bestQ = q;
                    bestCode = rootCode;
                }
                continue;
            }

            // B. 若为根贪心消融（不模拟后续对手回应）
            if (!this.config.useFullResponse) {
                const q = evaluateStateValue(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                candidateTraces[rootCode] = {
                    actionCode: rootCode,
                    selectionReason: selReason,
                    engineStepCalls: candidateStepCalls,
                    actualHandoffs: 0,
                    leafPhase: 'greedy_root_only',
                    opponentPolicy: 'none',
                    isCompleted: true,
                    stopReason: 'root_greedy',
                    valueComponents: { rawScore: q, leafQ: q },
                    finalQ: q
                };
                completedCandidatesCount++;
                if (q > bestQ) {
                    bestQ = q;
                    bestCode = rootCode;
                }
                continue;
            }

            // C. 推进完成本方剩余行动，直至换手或终局
            let ownSteps = 0;
            let ownCompletedToHandoff = false;
            while (!simEngine.isTerminal() &&
                   simEngine.getState().currentPlayer === rootPlayerId &&
                   ownSteps < this.config.maxOwnSteps) {
                const act = this.hAI.getAction(simEngine, rootPlayerId);
                if (!act) break;
                simEngine.step(act);
                candidateStepCalls++;
                stepCallsTotal++;
                ownSteps++;
            }

            if (simEngine.getState().currentPlayer !== rootPlayerId) {
                ownCompletedToHandoff = true;
                actualHandoffs++;
            }

            // 若本方回合即终局
            if (simEngine.isTerminal()) {
                const q = evaluateStateValue(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                candidateTraces[rootCode] = {
                    actionCode: rootCode,
                    selectionReason: selReason,
                    engineStepCalls: candidateStepCalls,
                    actualHandoffs,
                    leafPhase: 'direct_terminal',
                    opponentPolicy: 'none',
                    isCompleted: true,
                    stopReason: 'natural_terminal',
                    valueComponents: { rawScore: q, leafQ: q },
                    finalQ: q
                };
                completedCandidatesCount++;
                if (q > bestQ) {
                    bestQ = q;
                    bestCode = rootCode;
                }
                continue;
            }

            // 检查本方推演是否被步数上限截断且未换手
            if (!ownCompletedToHandoff) {
                const q = evaluateStateValue(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                // 未到达统一相位，扣除惩罚分，标记为未完成，不得伪装成完整结果！
                const penalizedQ = q - 0.20;
                candidateTraces[rootCode] = {
                    actionCode: rootCode,
                    selectionReason: selReason,
                    engineStepCalls: candidateStepCalls,
                    actualHandoffs,
                    leafPhase: 'incomplete_own_limit',
                    opponentPolicy: 'own_baseline',
                    isCompleted: false,
                    stopReason: 'own_steps_exceeded',
                    valueComponents: { rawScore: q, leafQ: penalizedQ },
                    finalQ: penalizedQ
                };
                if (penalizedQ > bestQ) {
                    bestQ = penalizedQ;
                    bestCode = rootCode;
                }
                continue;
            }

            // D. 模拟对手回应，支持 min / mean 聚合
            const oppValues: number[] = [];
            let allOpponentsCompleted = true;
            let primaryOppStopReason: CandidateStopReason = 'reached_unified_phase';

            for (const oppPolicy of this.config.opponentPolicies) {
                const oppEngine = simEngine.clone();
                let oppSteps = 0;
                let reachedUnifiedPhase = false;

                while (!oppEngine.isTerminal() && oppSteps < this.config.maxSimulationSteps) {
                    const currState = oppEngine.getState();
                    const currAlliance = getAllianceId(currState, currState.currentPlayer);
                    if (currAlliance === rootAllianceId) {
                        reachedUnifiedPhase = true;
                        break;
                    }
                    const oppAct = this.getPolicyAction(oppPolicy, oppEngine, currState.currentPlayer);
                    if (!oppAct) break;
                    oppEngine.step(oppAct);
                    candidateStepCalls++;
                    stepCallsTotal++;
                    oppSteps++;
                }

                if (oppEngine.isTerminal()) {
                    reachedUnifiedPhase = true;
                    actualHandoffs++;
                } else if (reachedUnifiedPhase) {
                    actualHandoffs++;
                } else {
                    allOpponentsCompleted = false;
                    primaryOppStopReason = 'opp_steps_exceeded';
                }

                const v = evaluateStateValue(oppEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                oppValues.push(v);
            }

            let aggregatedQ = this.config.responseAggregation === 'min'
                ? Math.min(...oppValues)
                : oppValues.reduce((a, b) => a + b, 0) / (oppValues.length || 1);

            let leafPhase: LeafPhaseStatus = 'completed_unified_phase';
            let stopReason: CandidateStopReason = 'reached_unified_phase';

            if (!allOpponentsCompleted) {
                leafPhase = 'incomplete_opp_limit';
                stopReason = primaryOppStopReason;
                // 未完成统一相位的候选受罚，不能优先于已完成候选
                aggregatedQ -= 0.15;
            } else {
                completedCandidatesCount++;
            }

            candidateTraces[rootCode] = {
                actionCode: rootCode,
                selectionReason: selReason,
                engineStepCalls: candidateStepCalls,
                actualHandoffs,
                leafPhase,
                opponentPolicy: this.config.opponentPolicies.join('+'),
                isCompleted: allOpponentsCompleted,
                stopReason,
                valueComponents: { rawScore: aggregatedQ, leafQ: aggregatedQ },
                finalQ: aggregatedQ
            };

            if (aggregatedQ > bestQ) {
                bestQ = aggregatedQ;
                bestCode = rootCode;
            }
        }

        // 若因超时无任何候选完成评估，安全回退到启发式推荐动作
        if (completedCandidatesCount === 0 && Object.keys(candidateTraces).length === 0) {
            const fallbackAction = this.hAI.getAction(rootEngine, rootPlayerId);
            bestCode = fallbackAction ? encodeAction(fallbackAction) : encodeAction(legalActions[0]);
            fallbackReason = 'heuristic_top1';
        }

        const duration = performance.now() - startTime;

        return {
            chosenActionCode: bestCode,
            fallbackReason,
            totalLegalCandidates: legalActions.length,
            searchedCount: Object.keys(candidateTraces).length,
            completedCount: completedCandidatesCount,
            candidateTraces,
            bestQ,
            searchDurationMs: duration,
            engineStepCallsTotal: stepCallsTotal,
            isGreedyRootOnly: !this.config.useFullResponse,
            opponentPolicyCount: this.config.opponentPolicies.length
        };
    }
}
