/** 新导出模型与Python单样本前向逐项对照，不重放历史动作。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DualStreamModel } from '../../../src/ai_runtime/dual_v3/model_runtime';
import { HERE, read, save, sha, fileSha } from '../stage1/io';
import { S3 } from './identity';
const prefix = path.resolve(process.argv[2]), modelBytes = fs.readFileSync(prefix + '.bin'), meta = read(prefix + '.json');
const model = new DualStreamModel(meta, modelBytes.buffer.slice(modelBytes.byteOffset, modelBytes.byteOffset + modelBytes.byteLength));
const bytes = fs.readFileSync(path.join(S3, 'parity.frames')), expected = read(path.join(S3, 'parity-reference.json'));
let offset = 0; const errors: any = {}, ranks: any[] = [];
for (const e of expected) {
    const ms = bytes.readUInt32LE(offset), bs = bytes.readUInt32LE(offset + 4); offset += 8;
    const metadata = JSON.parse(bytes.subarray(offset, offset + ms).toString()); offset += ms; const raw = bytes.subarray(offset, offset + bs); offset += bs;
    assert.equal(sha(raw), metadata.sha256); const arrays: any = {};
    for (const a of metadata.arrays) { const b = raw.subarray(a.offset, a.offset + a.bytes), data = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); arrays[a.name] = a.dtype === '<f4' ? new Float32Array(data) : a.dtype === '<i4' ? new Int32Array(data) : new Uint8Array(data); }
    const shape = metadata.arrays.find((a: any) => a.name === 'spatial').shape, n = metadata.arrays.find((a: any) => a.name === 'entities').shape[0];
    const output = model.forward({ schema: meta.schema, width: shape[2], height: shape[1], spatialTensor: arrays.spatial, entityTokens: arrays.entities, relationalBias: arrays.relations, entityIndexMap: { globalActorIdx: n }, playerOrder: { features: arrays.players, active: arrays.active }, actions: { sourceIndices: arrays.sourceIndices, pointers: arrays.pointers, actorMask: arrays.actorMask } } as any);
    for (const key of ['logits', 'valueLogits', 'valueProbs'] as const) {
        let maxAbs = 0; for (let i = 0; i < output[key].length; i++) maxAbs = Math.max(maxAbs, Math.abs(output[key][i] - e.outputs[key][i])); errors[key] = Math.max(errors[key] ?? 0, maxAbs); assert(maxAbs < 2e-5, `${key}/${maxAbs}`);
        const order = (a: ArrayLike<number>) => Array.from(a).map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
        const actual = order(output[key]), reference = order(e.outputs[key]);
        const margin = reference.length > 1 ? reference[0].v - reference[1].v : null;
        ranks.push({ id: e.id, key, actual: actual[0].i, reference: reference[0].i, referenceMargin: margin, forced: reference.length === 1 });
        if (margin === null || margin > 4e-5) assert.equal(actual[0].i, reference[0].i);
    }
}
save(path.join(S3, 'EXPORT_PARITY.json'), { passed: true, samples: expected.length, modelSha256: fileSha(prefix + '.bin'), errors, ranks, maxAbsoluteTolerance: 2e-5, nearTiePolicy: '参考前两名间隔<=4e-5时单列排序，不要求不稳定并列逐位相同' });
console.log(JSON.stringify({ passed: true, samples: expected.length, errors }));
