import { tensor } from '../dual_v2/tensor_workspace';
import type { DualObservation } from '../dual_v2/contract';
export { computeScalarValue } from './search_value';
import { linear, norm, softmax, type TensorWeights } from '../dual_v2/tensor_ops';

export function valueForward(input: DualObservation, ent: Float32Array, pooled: Float32Array, weights: TensorWeights) {
    const n = input.entityIndexMap.globalActorIdx, vectors = tensor(6 * 683);
    let armySum = 0;
    for (let s = 0; s < 6; s++) {
        const base = s * 683, mean = new Float64Array(192), max = tensor(192).fill(-Infinity); let count = 0;
        for (let i = 0; i < n; i++) if (input.entityTokens[i * 66] > .5 && input.entityTokens[i * 66 + 24 + s] > .5) {
            for (let c = 0; c < 192; c++) { const v = ent[i * 192 + c]; mean[c] += v; max[c] = Math.max(max[c], v); } count++;
        }
        vectors.set(input.playerOrder.features.subarray(s * 11, (s + 1) * 11), base);
        for (let c = 0; c < 192; c++) { vectors[base + 11 + c] = count ? mean[c] / count : 0; vectors[base + 203 + c] = count ? max[c] : 0; }
        vectors.set(ent.subarray(n * 192), base + 395); vectors.set(pooled, base + 587);
        armySum += Math.max(0, input.playerOrder.features[s * 11 + 7]) * input.playerOrder.active[s];
    }
    const hidden = linear(vectors, 6, 683, weights['value1.weight'], 256, weights['value1.bias']);
    const normalized = norm(hidden, 6, 256, weights['value_norm.weight'], weights['value_norm.bias'], 0, true);
    const valueLogits = linear(normalized, 6, 256, weights['value2.weight'], 1, weights['value2.bias']);
    for (let s = 0; s < 6; s++) valueLogits[s] = input.playerOrder.active[s] ? valueLogits[s] + weights.army_scale[0] * Math.max(0, input.playerOrder.features[s * 11 + 7]) / Math.max(1e-12, armySum) : -1e9;
    return { valueLogits, valueProbs: softmax(valueLogits, input.playerOrder.active) };
}

