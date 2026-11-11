import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { read, sha, fileSha, save as originalSave } from '../stage4_v7/io';
export {read, sha, fileSha};
export const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../..'), S3 = path.join(HERE, '../stage3');
export const DATA = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1';
export function reserve(bytes: number) {
    const result = spawnSync('python', ['-X', 'utf8', path.join(HERE, 'write_budget.py'), String(bytes)], {windowsHide: true, encoding: 'utf8'});
    if (result.status !== 0) throw Error('写入预算失败：' + result.stderr);
}
const heartbeatTimes = new Map<string, number>();
const credits = new Map<string, number>();
export async function save(file: string, value: unknown, immutable = false) {
    if (file.endsWith('HEARTBEAT.json')) {
        if (Date.now() - (heartbeatTimes.get(file) ?? 0) < 5000) return;
        heartbeatTimes.set(file, Date.now());
    }
    const size = Buffer.byteLength(JSON.stringify(value, null, 2)) + 1;
    if (!immutable && /(?:HEARTBEAT|PROGRESS)\.json$/.test(file)) {
        // 分块预留并逐次扣减，既避免频繁启动Python，也计入覆盖产生的累计写入。
        let available = credits.get(file) ?? 0;
        if (available < size) {const block = Math.max(65536, size); reserve(block); available += block;}
        credits.set(file, available - size);
    } else reserve(size);
    await originalSave(file, value, immutable);
}
export function modelIdentity() {
    const config = read(path.resolve(process.argv[2]));
    const prefix = config.modelPrefix;
    if (!prefix || fileSha(prefix + '.bin') !== config.modelVersion) throw Error('Stage5候选模型身份不符');
    return {prefix, binSha256: config.modelVersion, metadataSha256: fileSha(prefix + '.json')};
}
export function allowSealed(): any {throw Error('Stage5封存尚未授权：必须先通过Dev54双门禁');}
