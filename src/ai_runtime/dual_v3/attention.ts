import { tensor } from '../dual_v2/tensor_workspace';
import { linear } from '../dual_v2/tensor_ops';

/** 按头组织连续Q/K/V，复用分块矩阵内核完成两次指针乘法。 */
export function relationalAttention(qkv: Float32Array, tokens: number, entities: number, bias: Float32Array): Float32Array {
    const out = tensor(tokens * 192);
    for (let head = 0; head < 8; head++) {
        const q = tensor(tokens * 24), k = tensor(tokens * 24), vTranspose = tensor(tokens * 24);
        for (let i = 0; i < tokens; i++) for (let c = 0; c < 24; c++) {
            q[i * 24 + c] = qkv[i * 576 + head * 24 + c];
            k[i * 24 + c] = qkv[i * 576 + 192 + head * 24 + c];
            vTranspose[c * tokens + i] = qkv[i * 576 + 384 + head * 24 + c];
        }
        const scores = linear(q, tokens, 24, k, tokens, undefined, false);
        for (let i = 0; i < tokens; i++) {
            let max = -Infinity, sum = 0;
            for (let j = 0; j < tokens; j++) {
                const idx = i * tokens + j;
                scores[idx] = Math.fround(scores[idx] / Math.sqrt(24)) + (i < entities && j < entities ? bias[(i * entities + j) * 8 + head] : 0);
                max = Math.max(max, scores[idx]);
            }
            for (let j = 0; j < tokens; j++) { const idx = i * tokens + j; scores[idx] = Math.exp(scores[idx] - max); sum += scores[idx]; }
            for (let j = 0; j < tokens; j++) scores[i * tokens + j] /= sum;
        }
        const attended = linear(scores, tokens, tokens, vTranspose, 24, undefined, false);
        for (let i = 0; i < tokens; i++) out.set(attended.subarray(i * 24, (i + 1) * 24), i * 192 + head * 24);
    }
    return out;
}
