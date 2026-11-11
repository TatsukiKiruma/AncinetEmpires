import type { GameState } from '../../src/game/types';
import { getLegalActions } from '../../src/game/rules';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { encodePlayerOrder } from '../../src/ai_runtime/dual_v2/player_order';
import { calibrateValue, valueCalibrationFeatures, type ValueCalibration } from '../../src/ai_runtime/dual_v2/value_calibration';

/** 当前代策略与父代价值插值分别核验，旧阶段管线保持原件。 */
export function pipelineOutput(input: { state: GameState; sourceIndices: number[]; heads: number[] }, out: { logits: Float32Array; valueLogits: Float32Array }, headBias: number[], config: ValueCalibration, parentLogits?: Float32Array) {
    const legal = getLegalActions(input.state, input.state.currentPlayer), prior = tacticalActionPriors(input.state, legal), order = encodePlayerOrder(input.state);
    const scores = Float64Array.from(out.logits, (x, i) => x + headBias[input.heads[i]] + prior[input.sourceIndices[i]].prior);
    return { scores, valueProbs: calibrateValue(out.valueLogits, order.active, valueCalibrationFeatures(input.state, order), config, parentLogits) };
}
