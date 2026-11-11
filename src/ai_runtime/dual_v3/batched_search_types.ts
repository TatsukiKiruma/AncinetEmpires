import type { GameState, Action } from '../../game/types';
import type { DualObservation } from '../dual_v2/contract';
import type { BeamOptions } from './beam_search';
import type { SearchTeacher } from './search_teacher';

export interface BatchedModelOutput { logits: ArrayLike<number>; valueLogits: ArrayLike<number>; valueProbs: ArrayLike<number> }
export interface BatchedSearchModel {
    /** 仅显式声明能力的客户端接收零动作纯价值请求，旧服务继续完整前向。 */
    readonly supportsValueOnly?: boolean;
    // deadline为软截止；桥必须接收并排空已发送的迟到响应，不能据此杀死服务。
    forwardBatch(observations: DualObservation[], context?: { deadline: number; valueOnly?: boolean }): Promise<readonly BatchedModelOutput[]>;
}
export interface BatchedBeamOptions extends BeamOptions { twoPlayerResponseVariants?: number; ownTurnRollout?: boolean; ownRolloutPriorScale?: number; ownRolloutMaxChains?: number; enemyPriorScale?: number; priorAnchor?: number; priorTemperature?: number; candidateMaxGap?: number; teacherTemperature?: number; ownFraction?: number; maxBatchSize?: number; responseActors?: number; responseCohortSize?: number; responseLightUnitThreshold?: number }
export interface SearchStep { state: GameState; action: Action }
export interface FinalistRecord {
    id: string; rootAction: string; value: number; score: number; ownChains: number;
    responseComplete: boolean; responseActions: number; unsafe: boolean; safe: boolean;
    eliminated: boolean; vetoed?: boolean; selected: boolean;
    responseReasons?: string[];
}
export function freshBatchTelemetry() {
    return { queued: false, budgetMs: 0, rootMs: 0, overBudget: false, nodes: 0, ownNodes: 0, responseNodes: 0,
        clones: 0, cloneMs: 0, legalCalls: 0, legalMs: 0, encodeCalls: 0, encodeMs: 0, priorMs: 0,
        networkCalls: 0, networkMs: 0, observations: 0, budgetExpirations: 0, budgetDiscardedObservations: 0, budgetWaitMs: 0, batchSizes: [] as number[], waveBatches: { A: 0, B: 0, C: 0, root: 0 },
        cacheHits: 0, priorSkips: 0, responseFullActions: 0, responseProposalActions: 0, stopReason: 'candidate_exhaustion', selectedUnits: 0, rootLegal: 0, rootRuleLegal: 0,
        rootProposed: [] as string[], rootCovered: [] as string[], rootCompleted: [] as string[],
        rootOmitted: [] as string[], rootPolicyExcluded: [] as string[], responseComplete: 0, responseTruncated: 0,
        candidates: [] as FinalistRecord[], teacher: null as SearchTeacher | null };
}
