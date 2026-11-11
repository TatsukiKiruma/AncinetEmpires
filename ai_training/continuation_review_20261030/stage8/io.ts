import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const here = import.meta.dirname;
export const data = 'D:/AncientEmpiresData/continuation_stage8_20261110_v1';
export const root = path.resolve(here, '../../..');
export const K1 = { prefix: path.join(root, 'public/models/dual_v3_stage7_k1/final'), sha256: '81012a047520fe038ca93383a2620c4d89d87d4a825b79025c5dfd8fc121cb2e' };
export const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export const fileSha = (file: string) => sha(fs.readFileSync(file));
export const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function save(file: string, value: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n'); fs.renameSync(tmp, file);
}
export class DrainStop extends Error { constructor() { super('Stage 8 已排空停止，禁止进入训练'); } }
export const stopRequested = (directory=here) => ['STOP','DRAIN'].some(name => fs.existsSync(path.join(directory,name)));
export function guard(directory=here) {
    if (stopRequested(directory)) throw new DrainStop();
    assert.equal(fileSha(K1.prefix + '.bin'), K1.sha256, 'K1 摘要不匹配');
}
