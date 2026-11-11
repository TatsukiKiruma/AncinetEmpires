import { tensor } from '../dual_v2/tensor_workspace';
import type { DualObservation } from '../dual_v2/contract';
import { add, linear, norm, type TensorWeights } from '../dual_v2/tensor_ops';
import { relationalAttention } from './attention';

export function entityForward(input: DualObservation, map: Float32Array, pooled: Float32Array, weights: TensorWeights): { entities: Float32Array; relations: Float32Array } {
    const n = input.entityIndexMap.globalActorIdx, t = n + 1;
    const dense = (x: Float32Array, rows: number, ci: number, co: number, key: string) => linear(x, rows, ci, weights[key + '.weight'], co, weights[key + '.bias']);
    const normalization = (x: Float32Array, rows: number, key: string, relu = false) => norm(x, rows, 192, weights[key + '.weight'], weights[key + '.bias'], 0, relu);
    const tokens = tensor(n * 162), relations = tensor(input.relationalBias.length);
    for (let i = 0; i < relations.length; i++) relations[i] = Math.max(-4, Math.min(4, input.relationalBias[i]));
    for (let i = 0; i < n; i++) {
        const raw = input.entityTokens.subarray(i * 66, (i + 1) * 66), tile = raw[34] * input.width + raw[33];
        for (let c = 0; c < 66; c++) tokens[i * 162 + c] = Math.max(-4, Math.min(4, raw[c] * (c === 33 || c === 34 ? 1 / 64 : 1)));
        tokens.set(map.subarray(tile * 96, (tile + 1) * 96), i * 162 + 66);
    }
    let ent = tensor(t * 192);
    ent.set(normalization(dense(tokens, n, 162, 192, 'entity_proj'), n, 'entity_norm', true));
    const global = tensor(162); global.set(pooled); global.set(input.playerOrder.features, 96);
    ent.set(normalization(dense(global, 1, 162, 192, 'global_proj'), 1, 'global_norm', true), n * 192);
    const hiddenRel = dense(relations, n * n, 16, 16, 'rel1'); for (let i = 0; i < hiddenRel.length; i++) hiddenRel[i] = Math.max(0, hiddenRel[i]);
    const bias = dense(hiddenRel, n * n, 16, 8, 'rel2');
    for (let layer = 0; layer < 4; layer++) {
        const key = `blocks.${layer}`, qkv = dense(normalization(ent, t, key + '.ln1'), t, 192, 576, key + '.qkv');
        const attended = relationalAttention(qkv, t, n, bias);
        ent = add(ent, dense(attended, t, 192, 192, key + '.proj'));
        const ff = dense(normalization(ent, t, key + '.ln2'), t, 192, 576, key + '.ff1');
        for (let i = 0; i < ff.length; i++) ff[i] = Math.max(0, ff[i]);
        ent = add(ent, dense(ff, t, 576, 192, key + '.ff2'));
    }
    return { entities: ent, relations };
}
