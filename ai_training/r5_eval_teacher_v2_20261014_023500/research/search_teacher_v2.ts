import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { getAllianceId } from '../env/src/game/rule_config';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy, PolicyContext } from './match_runner';
import {
    evaluateStateValueV2,
    EvaluatorWeightsV2,
    DEFAULT_EVALUATOR_WEIGHTS_V2
} from './state_evaluator_v2';
import { selectRootCandidates, CandidateSelectionResult } from './candidate_selector';
import {
    CandidateEvaluationTrace,
    LeafPhaseStatus,
    CandidateStopReason,
    SearchTraceV1
} from './search_teacher_v1';

export interface SearchTeacherConfigV2 {
    targetK?: number;
    opponentPolicies?: ('heuristic' | 'apk_like')[];
    responseAggregation?: 'min' | 'mean';
    evaluatorWeights?: EvaluatorWeightsV2;
    useFullResponse?: boolean;
    multiHandoffDepth?: number; // 换手周期深度：1 表示 1 轮对手回应；2 表示 2 轮对抗换手
    maxSimulationSteps?: number;
    maxOwnSteps?: number;
    maxWallMs?: number;
    seed?: number;
}

export const DEFAULT_TEACHER_CONFIG_V2: Required<SearchTeacherConfigV2> = {
    targetK: 4,
    opponentPolicies: ['heuristic', 'apk_like'],
    responseAggregation: 'min',
    evaluatorWeights: DEFAULT_EVALUATOR_WEIGHTS_V2,
    useFullResponse: true,
    multiHandoffDepth: 1,
    maxSimulationSteps: 40,
    maxOwnSteps: 20,
    maxWallMs: 3000,
    seed: 42
};

/**
 * 根候选统一相位搜索教师 v2 (支持推进势场、控图激励与多轮对抗)
 */
export class SearchTeacherV2 implements Policy {
    public id: string;
    protected config: Required<SearchTeacherConfigV2>;
    protected hAI: HeuristicAI;
    protected apkAI: ApkLikeAI;

    constructor(id: string = 'search_teacher_v2', config: SearchTeacherConfigV2 = {}) {
        this.id = id;
        this.config = { ...DEFAULT_TEACHER_CONFIG_V2, ...config };
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

        for (let i = 0; i < selection.selectedActions.length; i++) {
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

            if (simEngine.isTerminal()) {
                const q = evaluateStateValueV2(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
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

            if (!this.config.useFullResponse) {
                const q = evaluateStateValueV2(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
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

            // 完成本方剩余行动
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

            if (simEngine.isTerminal()) {
                const q = evaluateStateValueV2(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
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

            if (!ownCompletedToHandoff) {
                const q = evaluateStateValueV2(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
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

            // 模拟对手回应，支持多策略对抗与多轮对抗深度
            const oppValues: number[] = [];
            let allOpponentsCompleted = true;
            let primaryOppStopReason: CandidateStopReason = 'reached_unified_phase';

            for (const oppPolicy of this.config.opponentPolicies) {
                const oppEngine = simEngine.clone();
                let oppSteps = 0;
                let reachedUnifiedPhase = false;

                // 推进一轮或多轮换手
                const targetCycles = this.config.multiHandoffDepth;
                let cyclesCompleted = 0;

                while (!oppEngine.isTerminal() && oppSteps < this.config.maxSimulationSteps) {
                    const currState = oppEngine.getState();
                    const currAlliance = getAllianceId(currState, currState.currentPlayer);
                    if (currAlliance === rootAllianceId) {
                        cyclesCompleted++;
                        if (cyclesCompleted >= targetCycles) {
                            reachedUnifiedPhase = true;
                            break;
                        }
                    }
                    const policyToUse = (currAlliance === rootAllianceId) ? 'heuristic' : oppPolicy;
                    const act = this.getPolicyAction(policyToUse, oppEngine, currState.currentPlayer);
                    if (!act) break;
                    oppEngine.step(act);
                    candidateStepCalls++;
                    stepCallsTotal++;
                    oppSteps++;
                }

                if (oppEngine.isTerminal() || reachedUnifiedPhase) {
                    actualHandoffs += cyclesCompleted;
                } else {
                    allOpponentsCompleted = false;
                    primaryOppStopReason = 'opp_steps_exceeded';
                }

                const v = evaluateStateValueV2(oppEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
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
