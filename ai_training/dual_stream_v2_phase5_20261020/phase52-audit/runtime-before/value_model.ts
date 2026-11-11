import { tensor } from './tensor_workspace';
import { getAllianceId } from '../../game/rule_config';
import type { GameState } from '../../game/types';
import type { DualObservation, PlayerOrder } from './contract';
import { linear, norm, softmax, type TensorWeights } from './tensor_ops';

export function valueForward(input: DualObservation, ent: Float32Array, pooled: Float32Array, weights: TensorWeights) {
    const n = input.entityIndexMap.globalActorIdx, vectors = tensor(6 * 459);
    let armySum = 0;
    for (let s = 0; s < 6; s++) {
        const base = s * 459, mean = new Float64Array(128), max = tensor(128).fill(-Infinity); let count = 0;
        for (let i = 0; i < n; i++) if (input.entityTokens[i * 66] > .5 && input.entityTokens[i * 66 + 24 + s] > .5) {
            for (let c = 0; c < 128; c++) { const v = ent[i * 128 + c]; mean[c] += v; max[c] = Math.max(max[c], v); } count++;
        }
        vectors.set(input.playerOrder.features.subarray(s * 11, (s + 1) * 11), base);
        for (let c = 0; c < 128; c++) { vectors[base + 11 + c] = count ? mean[c] / count : 0; vectors[base + 139 + c] = count ? max[c] : 0; }
        vectors.set(ent.subarray(n * 128), base + 267); vectors.set(pooled, base + 395);
        armySum += Math.max(0, input.playerOrder.features[s * 11 + 7]) * input.playerOrder.active[s];
    }
    const hidden = linear(vectors, 6, 459, weights['value1.weight'], 128, weights['value1.bias']);
    const normalized = norm(hidden, 6, 128, weights['value_norm.weight'], weights['value_norm.bias'], 0, true);
    const valueLogits = linear(normalized, 6, 128, weights['value2.weight'], 1, weights['value2.bias']);
    for (let s = 0; s < 6; s++) valueLogits[s] = input.playerOrder.active[s] ? valueLogits[s] + weights.army_scale[0] * Math.max(0, input.playerOrder.features[s * 11 + 7]) / Math.max(1e-12, armySum) : -1e9;
    return { valueLogits, valueProbs: softmax(valueLogits, input.playerOrder.active) };
}

/** 以观测前态槽0为己方，将联盟胜率质量转为[-1,1]的搜索价值。 */
export function computeScalarValue(pVal: ArrayLike<number>, state: GameState, playerOrder: PlayerOrder, selfPlayer = playerOrder.playerIds[0]): number {
    if (pVal.length !== 6 || playerOrder.playerIds[0] === null) throw Error('价值槽位不完整');
    if (selfPlayer === null) throw Error('价值聚合缺少搜索玩家');
    const selfAlliance = getAllianceId(state, selfPlayer), groups = new Map<number, number>();
    for (let s = 0; s < 6; s++) {
        const id = playerOrder.playerIds[s]; if (id === null) continue;
        if (!Number.isFinite(pVal[s]) || pVal[s] < 0 || pVal[s] > 1) throw Error('价值概率无效');
        const alliance = getAllianceId(state, id); groups.set(alliance, (groups.get(alliance) ?? 0) + pVal[s]);
    }
    const enemies = [...groups].filter(([id]) => id !== selfAlliance).map(([, value]) => value);
    return (groups.get(selfAlliance) ?? 0) - Math.max(0, ...enemies);
}
