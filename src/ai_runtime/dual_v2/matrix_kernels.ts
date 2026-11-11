import { tensor } from './tensor_workspace';

/** 固定维度双行四列矩阵内核；由阶段2 generate_kernels.py 确定生成。 */

type Kernel = (x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array) => Float32Array;

function matrix306x48(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 306, yi = r * 48;
        for (let o = 0; o < 48; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 306;
            for (let k = 0; k < 306; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 306 + k]; if (v0 === 0 && v1 === 0) continue;
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 306;
        for (let k = 0; k < 306; k++, wi += 4) { const v = x[r * 306 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 48 + o] = a + (bias?.[o] ?? 0); y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix48x8(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 8, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 48, yi = r * 8;
        for (let o = 0; o < 8; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 48;
            for (let k = 0; k < 48; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 48 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 8 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 8 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 8 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 8 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 8; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 48;
        for (let k = 0; k < 48; k++, wi += 4) { const v = x[r * 48 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 8 + o] = a + (bias?.[o] ?? 0); y[r * 8 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 8 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 8 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix8x48(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 8, yi = r * 48;
        for (let o = 0; o < 48; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 8;
            for (let k = 0; k < 8; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 8 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 8;
        for (let k = 0; k < 8; k++, wi += 4) { const v = x[r * 8 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 48 + o] = a + (bias?.[o] ?? 0); y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix64x8(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 8, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 64, yi = r * 8;
        for (let o = 0; o < 8; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
            for (let k = 0; k < 64; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 64 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 8 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 8 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 8 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 8 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 8; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) { const v = x[r * 64 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 8 + o] = a + (bias?.[o] ?? 0); y[r * 8 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 8 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 8 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix8x64(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 8, yi = r * 64;
        for (let o = 0; o < 64; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 8;
            for (let k = 0; k < 8; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 8 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 8;
        for (let k = 0; k < 8; k++, wi += 4) { const v = x[r * 8 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 64 + o] = a + (bias?.[o] ?? 0); y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix96x16(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 16, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 96, yi = r * 16;
        for (let o = 0; o < 16; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 96;
            for (let k = 0; k < 96; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 96 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 16 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 16 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 16 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 16 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 16; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 96;
        for (let k = 0; k < 96; k++, wi += 4) { const v = x[r * 96 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 16 + o] = a + (bias?.[o] ?? 0); y[r * 16 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 16 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 16 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix16x96(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 16, yi = r * 96;
        for (let o = 0; o < 96; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
            for (let k = 0; k < 16; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 16 + k]; if (v0 === 0 && v1 === 0) continue;
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) { const v = x[r * 16 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 96 + o] = a + (bias?.[o] ?? 0); y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix48x64(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 48, yi = r * 64;
        for (let o = 0; o < 64; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 48;
            for (let k = 0; k < 48; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 48 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 48;
        for (let k = 0; k < 48; k++, wi += 4) { const v = x[r * 48 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 64 + o] = a + (bias?.[o] ?? 0); y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix64x96(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 64, yi = r * 96;
        for (let o = 0; o < 96; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
            for (let k = 0; k < 64; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 64 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) { const v = x[r * 64 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 96 + o] = a + (bias?.[o] ?? 0); y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix66x96(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 66, yi = r * 96;
        for (let o = 0; o < 96; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 66;
            for (let k = 0; k < 66; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 66 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 66;
        for (let k = 0; k < 66; k++, wi += 4) { const v = x[r * 66 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 96 + o] = a + (bias?.[o] ?? 0); y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix96x64(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 96, yi = r * 64;
        for (let o = 0; o < 64; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 96;
            for (let k = 0; k < 96; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 96 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 96;
        for (let k = 0; k < 96; k++, wi += 4) { const v = x[r * 96 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 64 + o] = a + (bias?.[o] ?? 0); y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix64x48(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 64, yi = r * 48;
        for (let o = 0; o < 48; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
            for (let k = 0; k < 64; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 64 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) { const v = x[r * 64 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 48 + o] = a + (bias?.[o] ?? 0); y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix130x128(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 130, yi = r * 128;
        for (let o = 0; o < 128; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 130;
            for (let k = 0; k < 130; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 130 + k]; if (v0 === 0 && v1 === 0) continue;
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 130;
        for (let k = 0; k < 130; k++, wi += 4) { const v = x[r * 130 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 128 + o] = a + (bias?.[o] ?? 0); y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix16x16(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 16, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 16, yi = r * 16;
        for (let o = 0; o < 16; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
            for (let k = 0; k < 16; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 16 + k]; if (v0 === 0 && v1 === 0) continue;
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 16 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 16 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 16 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 16 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 16; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) { const v = x[r * 16 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 16 + o] = a + (bias?.[o] ?? 0); y[r * 16 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 16 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 16 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix16x4(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 4, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 16, yi = r * 4;
        for (let o = 0; o < 4; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
            for (let k = 0; k < 16; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 16 + k]; if (v0 === 0 && v1 === 0) continue;
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 4 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 4 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 4 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 4 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 4; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) { const v = x[r * 16 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 4 + o] = a + (bias?.[o] ?? 0); y[r * 4 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 4 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 4 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix128x384(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 384, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 128, yi = r * 384;
        for (let o = 0; o < 384; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
            for (let k = 0; k < 128; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 128 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 384 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 384 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 384 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 384 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 384; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) { const v = x[r * 128 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 384 + o] = a + (bias?.[o] ?? 0); y[r * 384 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 384 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 384 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix128x128(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 128, yi = r * 128;
        for (let o = 0; o < 128; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
            for (let k = 0; k < 128; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 128 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) { const v = x[r * 128 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 128 + o] = a + (bias?.[o] ?? 0); y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix128x256(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 256, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 128, yi = r * 256;
        for (let o = 0; o < 256; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
            for (let k = 0; k < 128; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 128 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 256 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 256 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 256 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 256 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 256; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) { const v = x[r * 128 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 256 + o] = a + (bias?.[o] ?? 0); y[r * 256 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 256 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 256 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix256x128(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 256, yi = r * 128;
        for (let o = 0; o < 128; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 256;
            for (let k = 0; k < 256; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 256 + k]; if (v0 === 0 && v1 === 0) continue;
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 256;
        for (let k = 0; k < 256; k++, wi += 4) { const v = x[r * 256 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 128 + o] = a + (bias?.[o] ?? 0); y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix128x64(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 128, yi = r * 64;
        for (let o = 0; o < 64; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
            for (let k = 0; k < 128; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 128 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) { const v = x[r * 128 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 64 + o] = a + (bias?.[o] ?? 0); y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix64x64(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 64, yi = r * 64;
        for (let o = 0; o < 64; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
            for (let k = 0; k < 64; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 64 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) { const v = x[r * 64 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 64 + o] = a + (bias?.[o] ?? 0); y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix128x36(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 36, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 128, yi = r * 36;
        for (let o = 0; o < 36; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
            for (let k = 0; k < 128; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 128 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 36 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 36 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 36 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 36 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 36; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) { const v = x[r * 128 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 36 + o] = a + (bias?.[o] ?? 0); y[r * 36 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 36 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 36 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix64x36(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 36, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 64, yi = r * 36;
        for (let o = 0; o < 36; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
            for (let k = 0; k < 64; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 64 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 36 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 36 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 36 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 36 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 36; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) { const v = x[r * 64 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 36 + o] = a + (bias?.[o] ?? 0); y[r * 36 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 36 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 36 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

function matrix459x128(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
        const xi = r * 459, yi = r * 128;
        for (let o = 0; o < 128; o += 4) {
            let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 459;
            for (let k = 0; k < 459; k++, wi += 4) {
                const v0 = x[xi + k], v1 = x[xi + 459 + k]; 
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                s00 += v0 * w0;
                s01 += v0 * w1;
                s02 += v0 * w2;
                s03 += v0 * w3;
                s10 += v1 * w0;
                s11 += v1 * w1;
                s12 += v1 * w2;
                s13 += v1 * w3;
            }
            y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
            y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
            y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
            y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
            y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
            y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
            y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
            y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
        }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
        let a = 0, b = 0, c = 0, d = 0, wi = o * 459;
        for (let k = 0; k < 459; k++, wi += 4) { const v = x[r * 459 + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }
        y[r * 128 + o] = a + (bias?.[o] ?? 0); y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
}

export const MATRIX_KERNELS: Record<string, Kernel> = {'306:48': matrix306x48, '48:8': matrix48x8, '8:48': matrix8x48, '64:8': matrix64x8, '8:64': matrix8x64, '96:16': matrix96x16, '16:96': matrix16x96, '48:64': matrix48x64, '64:96': matrix64x96, '66:96': matrix66x96, '96:64': matrix96x64, '64:48': matrix64x48, '130:128': matrix130x128, '16:16': matrix16x16, '16:4': matrix16x4, '128:384': matrix128x384, '128:128': matrix128x128, '128:256': matrix128x256, '256:128': matrix256x128, '128:64': matrix128x64, '64:64': matrix64x64, '128:36': matrix128x36, '64:36': matrix64x36, '459:128': matrix459x128};
