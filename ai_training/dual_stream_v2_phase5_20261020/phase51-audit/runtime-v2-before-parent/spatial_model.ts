import { tensor } from './tensor_workspace';
import type { DualObservation } from './contract';
import { add, depthwise, linear, norm, pool, upsample, type TensorWeights } from './tensor_ops';

export function spatialForward(input: DualObservation, weights: TensorWeights): { map: Float32Array; pooled: Float32Array } {
    const { height: h, width: w } = input, area = h * w;
    const dense = (x: Float32Array, rows: number, ci: number, co: number, key: string) => linear(x, rows, ci, weights[key + '.weight'], co, weights[key + '.bias']);
    const normalization = (x: Float32Array, rows: number, c: number, key: string, relu = true) => norm(x, rows, c, weights[key + '.weight'], weights[key + '.bias'], 8, relu);
    const block = (x: Float32Array, hh: number, ww: number, c: number, key: string) => {
        const rank = c === 96 ? 16 : 8;
        let z = normalization(dense(x, hh * ww, c, rank, key + '.reduce'), hh * ww, rank, key + '.norm1');
        z = normalization(depthwise(z, hh, ww, rank, weights[key + '.depth.weight'], weights[key + '.depth.bias']), hh * ww, rank, key + '.norm2');
        return add(x, normalization(dense(z, hh * ww, rank, c, key + '.expand'), hh * ww, c, key + '.norm3', false), .5, true);
    };
    const patches = tensor(area * 306);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 34; c++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (y + dy >= 0 && y + dy < h && x + dx >= 0 && x + dx < w) patches[(y * w + x) * 306 + c * 9 + (dy + 1) * 3 + dx + 1] = input.spatialTensor[c * area + (y + dy) * w + x + dx];
    }
    let z0 = normalization(dense(patches, area, 306, 48, 'map.stem'), area, 48, 'map.stem_norm');
    z0 = block(block(z0, h, w, 48, 'map.stage0.0'), h, w, 48, 'map.stage0.1');
    const h1 = Math.ceil(h / 2), w1 = Math.ceil(w / 2), h2 = Math.ceil(h1 / 2), w2 = Math.ceil(w1 / 2);
    let z1 = dense(pool(z0, h, w, 48), h1 * w1, 48, 64, 'map.down1');
    z1 = block(block(z1, h1, w1, 64, 'map.stage1.0'), h1, w1, 64, 'map.stage1.1');
    let z2 = dense(pool(z1, h1, w1, 64), h2 * w2, 64, 96, 'map.down2');
    z2 = block(block(z2, h2, w2, 96, 'map.stage2.0'), h2, w2, 96, 'map.stage2.1');
    const context = dense(input.playerOrder.features, 1, 66, 96, 'map.context');
    for (let i = 0; i < z2.length; i++) z2[i] += context[i % 96];
    let z = block(add(dense(upsample(z2, w2, h1, w1, 96), h1 * w1, 96, 64, 'map.up1'), z1), h1, w1, 64, 'map.decode1');
    z = block(add(dense(upsample(z, w1, h, w, 64), area, 64, 48, 'map.up0'), z0), h, w, 48, 'map.decode0');
    const map = dense(z, area, 48, 64, 'map.out'), pooled = tensor(64);
    for (let c = 0; c < 64; c++) { let sum = 0; for (let tile = 0; tile < area; tile++) sum += map[tile * 64 + c]; pooled[c] = sum / area; }
    return { map, pooled };
}
