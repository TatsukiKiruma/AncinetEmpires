import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { getAllianceId } from '../env/src/game/rule_config';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy, PolicyContext } from './match_runner';
import { evaluateStateValue, EvaluatorWeights, DEFAULT_EVALUATOR_WEIGHTS } from './state_evaluator';
import { selectRootCandidates } from './candidate_selector';

export interface SearchTeacherConfig {
    targetK?: number;
    opponentPolicies?: ('heuristic' | 'apk_like')[];
    responseAggregation?: 'min' | 'mean';
    evaluatorWeights?: EvaluatorWeights;
    useFullResponse?: boolean; // 消融：完整回应 vs 根贪心
    maxSimulationSteps?: number;
    maxWallMs?: number;
}

export const DEFAULT_TEACHER_CONFIG: Required<SearchTeacherConfig> = {
    targetK: 4,
    opponentPolicies: ['heuristic', 'apk_like'],
    responseAggregation: 'min',
    evaluatorWeights: DEFAULT_EVALUATOR_WEIGHTS,
    useFullResponse: true,
    maxSimulationSteps: 40,
    maxWallMs: 3000
};

export interface SearchTrace {
    chosenActionCode: string;
    totalCandidates: number;
    searchedCount: number;
    candidateQMap: Record<string, number | null>;
    bestQ: number;
    searchDurationMs: number;
    engineStepCallsTotal: number;
    isGreedyRootOnly: boolean;
    opponentPolicyCount: number;
}

/**
 * 根候选统一相位搜索教师
 */
export class RootRolloutSearchTeacher implements Policy {
    public id: string;
    private config: Required<SearchTeacherConfig>;
    private hAI: HeuristicAI;
    private apkAI: ApkLikeAI;

    constructor(id: string = 'search_teacher_v1', config: SearchTeacherConfig = {}) {
        this.id = id;
        this.config = { ...DEFAULT_TEACHER_CONFIG, ...config };
        this.hAI = new HeuristicAI();
        this.apkAI = new ApkLikeAI();
    }

    private getPolicyAction(policyType: 'heuristic' | 'apk_like', engine: GameEngine, playerId: number): Action | null {
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
    public search(ctx: PolicyContext): SearchTrace {
        const startTime = performance.now();
        const rootEngine = ctx.engineClone;
        const rootPlayerId = ctx.observerPlayerId;
        const rootAllianceId = getAllianceId(rootEngine.getState(), rootPlayerId);
        const legalActions = ctx.legalActions;

        // 若仅剩 1 个动作，直接返回
        if (legalActions.length === 1) {
            const code = encodeAction(legalActions[0]);
            return {
                chosenActionCode: code,
                totalCandidates: 1,
                searchedCount: 1,
                candidateQMap: { [code]: 0 },
                bestQ: 0,
                searchDurationMs: performance.now() - startTime,
                engineStepCallsTotal: 0,
                isGreedyRootOnly: !this.config.useFullResponse,
                opponentPolicyCount: this.config.opponentPolicies.length
            };
        }

        // 1. 根候选选择
        const selection = selectRootCandidates(rootEngine, rootPlayerId, legalActions, {
            targetK: this.config.targetK,
            nonTopPriorFraction: 0.20
        });

        const candidateQMap: Record<string, number | null> = {};
        for (const code of ctx.candidateCodes) {
            candidateQMap[code] = null; // 默认未搜索标为 null
        }

        let stepCallsTotal = 0;
        let bestCode = selection.selectedCodes[0];
        let bestQ = -Infinity;

        // 2. 逐一评估被选中的根候选
        for (let i = 0; i < selection.selectedActions.length; i++) {
            // 检查硬时间预算
            if (performance.now() - startTime > this.config.maxWallMs) {
                break;
            }

            const rootAction = selection.selectedActions[i];
            const rootCode = selection.selectedCodes[i];

            const simEngine = rootEngine.clone();
            simEngine.step(rootAction);
            stepCallsTotal++;

            // 若根动作直接产生自然终局，立即结算
            if (simEngine.isTerminal()) {
                const q = evaluateStateValue(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                candidateQMap[rootCode] = q;
                if (q > bestQ) {
                    bestQ = q;
                    bestCode = rootCode;
                }
                continue;
            }

            // 若开启了消融项（根贪心，不模拟后续），直接评估当前局面
            if (!this.config.useFullResponse) {
                const q = evaluateStateValue(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                candidateQMap[rootCode] = q;
                if (q > bestQ) {
                    bestQ = q;
                    bestCode = rootCode;
                }
                continue;
            }

            // 推进完成本方剩余行动，直至换手或终局
            let ownSteps = 0;
            while (!simEngine.isTerminal() &&
                   simEngine.getState().currentPlayer === rootPlayerId &&
                   ownSteps < 20) {
                const act = this.hAI.getAction(simEngine, rootPlayerId);
                if (!act) break;
                simEngine.step(act);
                stepCallsTotal++;
                ownSteps++;
            }

            if (simEngine.isTerminal()) {
                const q = evaluateStateValue(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                candidateQMap[rootCode] = q;
                if (q > bestQ) {
                    bestQ = q;
                    bestCode = rootCode;
                }
                continue;
            }

            // 模拟对手回应，支持 min 聚合
            const oppValues: number[] = [];
            for (const oppPolicy of this.config.opponentPolicies) {
                const oppEngine = simEngine.clone();
                let oppSteps = 0;

                // 推进对手行动，直到重新换手回 root 联盟或终局
                while (!oppEngine.isTerminal() && oppSteps < this.config.maxSimulationSteps) {
                    const currState = oppEngine.getState();
                    const currAlliance = getAllianceId(currState, currState.currentPlayer);
                    if (currAlliance === rootAllianceId) {
                        // 成功到达 root 下次行动的统一相位！
                        break;
                    }
                    const oppAct = this.getPolicyAction(oppPolicy, oppEngine, currState.currentPlayer);
                    if (!oppAct) break;
                    oppEngine.step(oppAct);
                    stepCallsTotal++;
                    oppSteps++;
                }

                const v = evaluateStateValue(oppEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
                oppValues.push(v);
            }

            const aggregatedQ = this.config.responseAggregation === 'min'
                ? Math.min(...oppValues)
                : oppValues.reduce((a, b) => a + b, 0) / (oppValues.length || 1);

            candidateQMap[rootCode] = aggregatedQ;
            if (aggregatedQ > bestQ) {
                bestQ = aggregatedQ;
                bestCode = rootCode;
            }
        }

        const duration = performance.now() - startTime;
        let searchedCount = 0;
        for (const v of Object.values(candidateQMap)) {
            if (v !== null) searchedCount++;
        }

        return {
            chosenActionCode: bestCode,
            totalCandidates: legalActions.length,
            searchedCount,
            candidateQMap,
            bestQ,
            searchDurationMs: duration,
            engineStepCallsTotal: stepCallsTotal,
            isGreedyRootOnly: !this.config.useFullResponse,
            opponentPolicyCount: this.config.opponentPolicies.length
        };
    }
}
