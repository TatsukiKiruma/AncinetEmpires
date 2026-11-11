import { tensor } from './tensor_workspace';
import type { DualObservation } from './contract';
import { linear, softmax, type TensorWeights } from './tensor_ops';

export function policyForward(input: DualObservation, ent: Float32Array, map: Float32Array, relations: Float32Array, weights: TensorWeights) {
    const n = input.entityIndexMap.globalActorIdx, t = n + 1, area = input.width * input.height;
    const dense = (x: Float32Array, rows: number, ci: number, co: number, key: string) => linear(x, rows, ci, weights[key + '.weight'], co, weights[key + '.bias']);
    const ptr = input.actions.pointers, tileRows = new Int32Array(area).fill(-1), usedTiles: number[] = [];
    for (let a = 0; a < ptr.length; a += 5) { const tile = ptr[a + 1]; if (tile >= 0 && tileRows[tile] < 0) { tileRows[tile] = usedTiles.length; usedTiles.push(tile); } }
    // 1×1卷积逐格独立，仅计算合法候选会引用的行，数值与全图投影完全相同。
    const tileFeatures = tensor(usedTiles.length * 64);
    for (let i = 0; i < usedTiles.length; i++) tileFeatures.set(map.subarray(usedTiles[i] * 64, (usedTiles[i] + 1) * 64), i * 64);
    const who = dense(ent, t, 128, 1, 'who'), query = dense(ent, t, 128, 64, 'tile_q'), keys = dense(tileFeatures, usedTiles.length, 64, 64, 'tile_k');
    const semanticEntity = dense(ent, t, 128, 36, 'what_entity'), semanticTile = dense(keys, usedTiles.length, 64, 36, 'what_tile');
    const logits = tensor(ptr.length / 5), headIndex: Record<number, number> = { 1: 0, 7: 1, 8: 2, 9: 3 };
    const targetQueries = new Map<number, Float32Array>(), targetKeys = new Map<number, Float32Array>();
    const projectTarget = (entity: number, hi: number, kind: 'q' | 'k', cache: Map<number, Float32Array>) => {
        const id = entity * 4 + hi; let result = cache.get(id);
        if (!result) {
            const key = `target_${kind}`;
            result = linear(ent.subarray(entity * 128, (entity + 1) * 128), 1, 128, weights[key + '.weight'].subarray(hi * 64 * 128, (hi + 1) * 64 * 128), 64, weights[key + '.bias'].subarray(hi * 64, (hi + 1) * 64));
            cache.set(id, result);
        }
        return result;
    };
    for (let a = 0; a < logits.length; a++) {
        const actor = ptr[a * 5], tile = ptr[a * 5 + 1], head = ptr[a * 5 + 2], cls = ptr[a * 5 + 3], target = ptr[a * 5 + 4];
        const tileRow = tile >= 0 ? tileRows[tile] : -1;
        let where = 0, targetScore = 0;
        if (tileRow >= 0) { for (let c = 0; c < 64; c++) where += query[actor * 64 + c] * keys[tileRow * 64 + c]; where = Math.fround(where) / 8; }
        let what = Math.fround(semanticEntity[actor * 36 + head] + (tileRow >= 0 ? semanticTile[tileRow * 36 + head] : 0));
        if (cls >= 0) what = Math.fround(what + Math.fround(semanticEntity[actor * 36 + 15 + cls] + (tileRow >= 0 ? semanticTile[tileRow * 36 + 15 + cls] : 0)));
        if (target >= 0) {
            const hi = headIndex[head]; let dot = 0, rel = 0;
            const tq = projectTarget(actor, hi, 'q', targetQueries), tk = projectTarget(target, hi, 'k', targetKeys);
            for (let c = 0; c < 64; c++) dot += tq[c] * tk[c];
            if (actor < n && target < n) for (let c = 0; c < 16; c++) rel += weights.target_rel[hi * 16 + c] * relations[(actor * n + target) * 16 + c];
            targetScore = Math.fround(Math.fround(dot) / 8 + Math.fround(rel));
        }
        logits[a] = Math.fround(Math.fround(Math.fround(who[actor] + where) + what) + targetScore) + weights.headBias[head];
    }
    const prior = softmax(logits), actorPrior = tensor(t), conditionalPrior = tensor(prior.length);
    // 用double累加边际，再一次写回，避免候选数量导致累积漂移。
    const marginal = new Float64Array(t);
    for (let a = 0; a < prior.length; a++) marginal[ptr[a * 5]] += prior[a];
    for (let actor = 0; actor < t; actor++) actorPrior[actor] = marginal[actor];
    const actorMax = tensor(t).fill(-Infinity), actorSum = new Float64Array(t);
    for (let a = 0; a < prior.length; a++) { const actor = ptr[a * 5]; actorMax[actor] = Math.max(actorMax[actor], logits[a]); }
    for (let a = 0; a < prior.length; a++) { const actor = ptr[a * 5]; conditionalPrior[a] = Math.exp(logits[a] - actorMax[actor]); actorSum[actor] += conditionalPrior[a]; }
    for (let a = 0; a < prior.length; a++) conditionalPrior[a] /= actorSum[ptr[a * 5]];
    return { logits, actorPrior, conditionalPrior };
}
