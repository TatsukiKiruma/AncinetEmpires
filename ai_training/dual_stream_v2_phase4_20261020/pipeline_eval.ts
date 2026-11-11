import type { GameState } from '../../src/game/types';
import { getLegalActions } from '../../src/game/rules';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { encodePlayerOrder } from '../../src/ai_runtime/dual_v2/player_order';
import { calibrateValue, valueCalibrationFeatures, type ValueCalibration } from '../../src/ai_runtime/dual_v2/value_calibration';
export function pipelineOutput(input: { state: GameState; sourceIndices: number[]; heads: number[] }, out: { logits: Float32Array; valueLogits: Float32Array }, headBias: number[], config: ValueCalibration) {
    const legal = getLegalActions(input.state, input.state.currentPlayer), prior = tacticalActionPriors(input.state, legal), order = encodePlayerOrder(input.state);
    const scores = Float64Array.from(out.logits, (x, i) => x + headBias[input.heads[i]] + prior[input.sourceIndices[i]].prior);
    return { scores, valueProbs: calibrateValue(out.valueLogits, order.active, valueCalibrationFeatures(input.state, order), config) };
}
