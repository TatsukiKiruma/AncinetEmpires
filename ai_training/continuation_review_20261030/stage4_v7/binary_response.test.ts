import { expect, it } from 'vitest';
import { decodeResponse } from './binary_response';

it('float32响应精确往返并拒绝截断、尾部和非有限值', () => {
    const fields = [[.1, -2, 3], [1, 2, 3, 4, 5, 6], [.1, .2, .3, .1, .2, .1], [0, 1]];
    const parts = [Buffer.alloc(8)]; parts[0].writeUInt32LE(0x35454149); parts[0].writeUInt32LE(1, 4);
    for (const values of fields) {
        const bytes = Buffer.alloc(4 + values.length * 4); bytes.writeUInt32LE(values.length);
        values.forEach((v, i) => bytes.writeFloatLE(v, 4 + i * 4)); parts.push(bytes);
    }
    const raw = Buffer.concat(parts), result = decodeResponse(raw)[0];
    Object.values(result).forEach((v, i) => expect([...v]).toEqual([...Float32Array.from(fields[i])]));
    expect(() => decodeResponse(raw.subarray(0, -1))).toThrow();
    expect(() => decodeResponse(Buffer.concat([raw, Buffer.alloc(1)]))).toThrow();
    const bad = Buffer.from(raw); bad.writeFloatLE(NaN, 12);
    expect(() => decodeResponse(bad)).toThrow();
});
