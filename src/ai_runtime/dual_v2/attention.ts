import { tensor } from './tensor_workspace';
import { linear } from './tensor_ops';

/** 按头组织连续Q/K/V，复用分块矩阵内核完成两次指针乘法。 */
export function relationalAttention(qkv: Float32Array, tokens: number, entities: number, bias: Float32Array): Float32Array {
    const out = tensor(tokens * 128);
    for (let head = 0; head < 4; head++) {
        const q = tensor(tokens * 32), k = tensor(tokens * 32), vTranspose = tensor(tokens * 32);
        for (let i = 0; i < tokens; i++) for (let c = 0; c < 32; c++) {
            q[i * 32 + c] = qkv[i * 384 + head * 32 + c];
            k[i * 32 + c] = qkv[i * 384 + 128 + head * 32 + c];
            vTranspose[c * tokens + i] = qkv[i * 384 + 256 + head * 32 + c];
        }
        const scores = linear(q, tokens, 32, k, tokens, undefined, false);
        for (let i = 0; i < tokens; i++) {
            let max = -Infinity, sum = 0;
            for (let j = 0; j < tokens; j++) {
                const idx = i * tokens + j;
                scores[idx] = Math.fround(scores[idx] / Math.sqrt(32)) + (i < entities && j < entities ? bias[(i * entities + j) * 4 + head] : 0);
                max = Math.max(max, scores[idx]);
            }
            for (let j = 0; j < tokens; j++) { const idx = i * tokens + j; scores[idx] = Math.exp(scores[idx] - max); sum += scores[idx]; }
            for (let j = 0; j < tokens; j++) scores[i * tokens + j] /= sum;
        }
        const attended = linear(scores, tokens, tokens, vTranspose, 32, undefined, false);
        for (let i = 0; i < tokens; i++) out.set(attended.subarray(i * 32, (i + 1) * 32), i * 128 + head * 32);
    }
    return out;
}
