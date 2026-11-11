/**
 * Shared Spatial Policy Contract for Path B Spatial ResNet
 *
 * Unifies inference across frontend, benchmark evaluation, and DAgger.
 * Guarantees identical action selection and aligned logits from the same state
 * and checkpoint across all entry points.
 */

import type { Action, GameState } from '../types';
import {
    SpatialResNetPredictor
} from './spatial_conv_net';
import {
    encodeGameStateSpatial,
    encodeCandidateActionsSpatialForSchema,
    type SpatialActionFeatures
} from './spatial_tensor_encoder';
import {
    CANDIDATE_ORDERING_ID_V16,
    canonicalActionOrderV16,
    stableArgmaxV16,
} from './action_ordering';

export interface SpatialPredictionResult {
    action: Action;
    /**
     * 选中动作在**规范顺序**候选数组中的下标（T16-02 §4.1）。
     *
     * 中文：V16 起 `actionLogits`/`actionProbs` 也按同一规范顺序排列，
     * 因此 `bestActionIndex` 与 logits 下标始终一致。历史调用方若需要「输入数组下标」，
     * 用 `selectedInputIndex`。
     */
    bestActionIndex: number;
    /** 选中动作在调用方传入的原始数组中的下标（重排前的下标）。 */
    selectedInputIndex: number;
    /** 规范顺序下的 actionCode 列表（与 `actionLogits` 一一对应）。 */
    orderedActionCodes: string[];
    /** 选中动作的 actionCode。 */
    bestActionCode: string;
    /** 候选顺序合同 id；训练/标签/推理必须一致。 */
    candidateOrderingId: string;
    actionLogits: number[];
    actionProbs: number[];
    value: number;
}

/**
 * V15/T15-02：合法动作集为空时的类型化拒绝。
 *
 * 调用方必须显式处理该情形（跳过本座位 / 记为无动作诊断），
 * 不允许把它当成模型选择了 end_turn。
 */
export class EmptyActionSetError extends Error {
    public readonly code = 'EMPTY_ACTION_SET';
    constructor(message: string) {
        super(message);
        this.name = 'EmptyActionSetError';
    }
}

/**
 * Shared deterministic predictor execution.
 * Ensures the exact same encoding, candidate extraction, and index selection logic.
 */
export function predictSpatialAction(
    predictor: SpatialResNetPredictor,
    state: GameState,
    playerId: number,
    legalActions: readonly Action[],
    version?: 'v1' | 'v2'
): SpatialPredictionResult {
    if (legalActions.length === 0) {
        // V15/T15-02：空候选集不得凭空生成 end_turn。
        // 任务书 §6 明确要求：空候选的 shared policy 必须「明确拒绝或返回类型化无动作结果」，
        // 调用方处理；输出一个不在合法集中的 end_turn 会让上层把非法动作当成模型决策。
        throw new EmptyActionSetError(
            'predictSpatialAction: 合法动作集为空，拒绝构造 end_turn。'
            + '这是无动作（例如该玩家没有任何可行动单位且不能结束）的诊断情形，'
            + '必须由调用方按 NoAction 处理，不能当成模型选择了 end_turn。'
        );
    }

    // Auto-detect version from predictor if not explicitly specified
    const encVersion = version ?? (predictor.isV2 ? 'v2' : 'v1');

    if (predictor.isV2 && encVersion !== 'v2') {
        throw new Error('Contract mismatch: Predictor is v2 but v1 encoding requested');
    }

    // V14/T14-03：通道数必须与已加载权重的 stem 输入通道数一致。
    // 历史 24 通道权重继续用 24 通道编码（v13 语义），v14/v15 权重用 26 通道，
    // V19/T19-01 权重用 34 通道；不允许把任一通道数的张量喂给另一种权重。
    const predictorChannels = predictor.spatialChannels;
    const supportedChannels = [24, 26, 34];
    if (encVersion === 'v2' && !supportedChannels.includes(predictorChannels)) {
        throw new Error(
            `Unsupported predictor spatial channel count: ${predictorChannels}`
            + `（已登记的 schema 通道数为 ${supportedChannels.join(' / ')}）`,
        );
    }

    // V15/T15-02：候选与状态编码一律按权重**声明的 schema**分派语义变体。
    // 不能只按通道数/语义维度判断：v14 与 v15 形状相同而语义不同，
    // 旧做法会让历史权重收到修好后的反击语义（V14b 审核 G1 反例）。
    const encSpatial = encodeGameStateSpatial(state, playerId, encVersion, { channels: predictorChannels });
    // 中文（V16/T16-02 §4.1）：先按 actionCode 的 Unicode 代码点字典序排成规范顺序，
    // 再编码与打分。这样 exact tie 时 stableArgmax 取到的一定是**最小 actionCode**，
    // 与引擎产生顺序、localeCompare、来源数组顺序都无关。
    const ordered = canonicalActionOrderV16(legalActions);
    const candSpatial: SpatialActionFeatures[] = encodeCandidateActionsSpatialForSchema(
        state, playerId, ordered.map((item) => item.action), encVersion, predictor.encoderSchemaId,
    );

    const pred = predictor.predict(encSpatial, candSpatial);
    // 中文：predict 内部已是严格大于才换，索引即规范顺序下标；这里再用 stableArgmaxV16
    // 复核一次，保证「精确并列取最小 actionCode」这条合同在任何 predictor 实现下都成立。
    const bestIdx = stableArgmaxV16(pred.actionLogits);
    if (bestIdx !== pred.bestActionIndex) {
        throw new Error(
            `[T16-02] predict 返回的 bestActionIndex=${pred.bestActionIndex} 与稳定 argmax=${bestIdx} 不一致；`
            + '两者必须都按规范顺序、精确并列取最小下标，否则说明 predictor 实现被改过。'
        );
    }

    if (bestIdx === undefined || bestIdx < 0 || bestIdx >= ordered.length) {
        throw new Error(
            `Spatial predictor returned invalid bestActionIndex ${bestIdx} for ${ordered.length} legal actions`
        );
    }

    const chosen = ordered[bestIdx];
    if (!chosen) {
        throw new Error(`Chosen action at index ${bestIdx} is undefined`);
    }
    const chosenAction = chosen.action;

    return {
        action: chosenAction,
        bestActionIndex: bestIdx,
        selectedInputIndex: chosen.inputIndex,
        orderedActionCodes: ordered.map(item => item.code),
        bestActionCode: chosen.code,
        candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
        actionLogits: pred.actionLogits,
        actionProbs: pred.actionProbs,
        value: pred.value
    };
}
