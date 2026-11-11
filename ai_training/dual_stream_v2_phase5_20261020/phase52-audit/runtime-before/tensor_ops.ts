import { tensor } from './tensor_workspace';
/** 小型CPU张量内核。内部空间布局为[H*W,C]，权重沿用PyTorch的输出维优先布局。 */
import { MATRIX_KERNELS } from './matrix_kernels';
export type TensorWeights = Readonly<Record<string, Float32Array>>;
const packedMatrices = new WeakMap<Float32Array, Float32Array>();
const packedFourMatrices = new WeakMap<Float32Array, Float32Array>();

function packedWeight(weight: Float32Array, input: number, output: number, cache: boolean): Float32Array {
    let packed = cache ? packedMatrices.get(weight) : undefined;
    if (packed) return packed;
    packed = cache ? new Float32Array(Math.floor(output / 8) * input * 8) : tensor(Math.floor(output / 8) * input * 8);
    for (let o = 0; o + 7 < output; o += 8) for (let k = 0; k < input; k++) for (let j = 0; j < 8; j++) packed[o * input + k * 8 + j] = weight[(o + j) * input + k];
    if (cache) packedMatrices.set(weight, packed);
    return packed;
}

export function linear(x: Float32Array, rows: number, input: number, weight: Float32Array, output: number, bias?: Float32Array, cache = true): Float32Array {
    const kernel = MATRIX_KERNELS[`${input}:${output}`];
    if (kernel) {
        let packed = cache ? packedFourMatrices.get(weight) : undefined;
        if (!packed) {
            packed = cache ? new Float32Array(weight.length) : tensor(weight.length);
            for (let o = 0; o < output; o += 4) for (let k = 0; k < input; k++) for (let j = 0; j < 4; j++) packed[o * input + k * 4 + j] = weight[(o + j) * input + k];
            if (cache) packedFourMatrices.set(weight, packed);
        }
        return kernel(x, rows, packed, bias);
    }
    const y = tensor(rows * output, false);
    const packed = packedWeight(weight, input, output, cache);
    for (let r = 0; r < rows; r++) {
        const xi = r * input, yi = r * output;
        let o = 0;
        // 同时积累四个输出，复用输入读取；只在算子边界舍入为float32。
        for (; o + 7 < output; o += 8) {
            let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0;
            let wi = o * input;
            for (let k = 0; k < input; k++, wi += 8) {
                const v = x[xi + k];
                if (v === 0) continue;
                a += v * packed[wi]; b += v * packed[wi + 1];
                c += v * packed[wi + 2]; d += v * packed[wi + 3];
                e += v * packed[wi + 4]; f += v * packed[wi + 5];
                g += v * packed[wi + 6]; h += v * packed[wi + 7];
            }
            y[yi + o] = a + (bias?.[o] ?? 0); y[yi + o + 1] = b + (bias?.[o + 1] ?? 0);
            y[yi + o + 2] = c + (bias?.[o + 2] ?? 0); y[yi + o + 3] = d + (bias?.[o + 3] ?? 0);
            y[yi + o + 4] = e + (bias?.[o + 4] ?? 0); y[yi + o + 5] = f + (bias?.[o + 5] ?? 0);
            y[yi + o + 6] = g + (bias?.[o + 6] ?? 0); y[yi + o + 7] = h + (bias?.[o + 7] ?? 0);
        }
        for (; o < output; o++) { let sum = 0; for (let k = 0; k < input; k++) sum += x[xi + k] * weight[o * input + k]; y[yi + o] = sum + (bias?.[o] ?? 0); }
    }
    return y;
}

export function norm(x: Float32Array, rows: number, channels: number, weight: Float32Array, bias: Float32Array, groups = 0, relu = false): Float32Array {
    const y = tensor(x.length, false);
    if (!groups) {
        for (let row = 0; row < rows; row++) {
            const base = row * channels; let mean = 0, square = 0;
            for (let c = 0; c < channels; c++) { const v = x[base + c]; mean += v; square += v * v; } mean /= channels;
            const inv = 1 / Math.sqrt(Math.max(0, square / channels - mean * mean) + 1e-5);
            for (let c = 0; c < channels; c++) { const v = (x[base + c] - mean) * inv * weight[c] + bias[c]; y[base + c] = relu ? Math.max(0, v) : v; }
        }
    } else {
        const size = channels / groups;
        for (let g = 0; g < groups; g++) {
            let mean = 0, square = 0;
            for (let r = 0; r < rows; r++) for (let c = g * size; c < (g + 1) * size; c++) { const v = x[r * channels + c]; mean += v; square += v * v; }
            mean /= rows * size;
            const inv = 1 / Math.sqrt(Math.max(0, square / (rows * size) - mean * mean) + 1e-5);
            for (let r = 0; r < rows; r++) for (let c = g * size; c < (g + 1) * size; c++) { const v = (x[r * channels + c] - mean) * inv * weight[c] + bias[c]; y[r * channels + c] = relu ? Math.max(0, v) : v; }
        }
    }
    return y;
}

export function add(x: Float32Array, y: Float32Array, scale = 1, relu = false): Float32Array {
    const out = tensor(x.length, false);
    for (let i = 0; i < out.length; i++) { const v = x[i] + scale * y[i]; out[i] = relu ? Math.max(0, v) : v; }
    return out;
}

export function pool(x: Float32Array, height: number, width: number, channels: number): Float32Array {
    const h = Math.ceil(height / 2), w = Math.ceil(width / 2), out = tensor(h * w * channels, false);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) for (let c = 0; c < channels; c++) {
        let sum = 0, count = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (2 * y + dy < height && 2 * xx + dx < width) { sum += x[((2 * y + dy) * width + 2 * xx + dx) * channels + c]; count++; }
        out[(y * w + xx) * channels + c] = sum / count;
    }
    return out;
}

export function upsample(x: Float32Array, sourceWidth: number, height: number, width: number, channels: number): Float32Array {
    const out = tensor(height * width * channels, false);
    for (let y = 0; y < height; y++) for (let xx = 0; xx < width; xx++) {
        const src = (Math.floor(y / 2) * sourceWidth + Math.floor(xx / 2)) * channels;
        out.set(x.subarray(src, src + channels), (y * width + xx) * channels);
    }
    return out;
}

export function depthwise(x: Float32Array, height: number, width: number, channels: number, weight: Float32Array, bias: Float32Array): Float32Array {
    const out = tensor(x.length, false);
    const stride = (width + 2) * channels, padded = tensor((height + 2) * stride);
    for (let y = 0; y < height; y++) padded.set(x.subarray(y * width * channels, (y + 1) * width * channels), (y + 1) * stride + channels);
    for (let y = 0; y < height; y++) for (let xx = 0; xx < width; xx++) for (let c = 0; c < channels; c++) {
        const i = y * stride + xx * channels + c, wi = c * 9;
        let sum = padded[i] * weight[wi];
        sum += padded[i + channels] * weight[wi + 1]; sum += padded[i + 2 * channels] * weight[wi + 2];
        sum += padded[i + stride] * weight[wi + 3]; sum += padded[i + stride + channels] * weight[wi + 4]; sum += padded[i + stride + 2 * channels] * weight[wi + 5];
        sum += padded[i + 2 * stride] * weight[wi + 6]; sum += padded[i + 2 * stride + channels] * weight[wi + 7]; sum += padded[i + 2 * stride + 2 * channels] * weight[wi + 8];
        out[(y * width + xx) * channels + c] = sum + bias[c];
    }
    return out;
}

export function softmax(x: Float32Array, mask?: ArrayLike<number>): Float32Array {
    const out = tensor(x.length); let max = -Infinity, sum = 0;
    for (let i = 0; i < x.length; i++) if (!mask || mask[i]) max = Math.max(max, x[i]);
    if (!Number.isFinite(max)) throw Error('概率分布没有有效候选');
    for (let i = 0; i < x.length; i++) if (!mask || mask[i]) { out[i] = Math.exp(x[i] - max); sum += out[i]; }
    for (let i = 0; i < x.length; i++) out[i] /= sum;
    return out;
}
