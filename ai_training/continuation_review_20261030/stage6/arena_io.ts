import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { read, sha, fileSha, save as originalSave } from '../stage4_v7/io';
import { runtimeIdentity } from '../stage4_v7/runtime_identity';
import { healthy, strength } from './gates';
export {read, sha, fileSha};
export const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../..'), S3 = path.join(HERE, '../stage3');
export const DATA = 'D:/AncientEmpiresData/continuation_stage6_20261106_v1';
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
    if (!prefix || fileSha(prefix + '.bin') !== config.modelVersion) throw Error('Stage6候选模型身份不符');
    return {prefix, binSha256: config.modelVersion, metadataSha256: fileSha(prefix + '.json')};
}
export function allowSealed(): any {
    const gateFile = path.join(HERE, 'GATE_DECISION.json'), tokenFile = path.join(HERE, 'FINAL_TEST_ATTEMPT.json');
    if (!fs.existsSync(gateFile) || !fs.existsSync(tokenFile)) throw Error('第六阶段封存保持锁定');
    const gate = read(gateFile), token = read(tokenFile);
    if (!gate.passed || gate.stage !== 'Dev54' || !healthy(gate.full,54) || !strength(gate.full.games) || token.attempts !== 1 || token.gateSha256 !== fileSha(gateFile) || token.selectedId !== gate.selectedId) throw Error('封存硬门禁或唯一令牌不符');
    if (token.runtimeSha256 !== runtimeIdentity().sha256) throw Error('封存期间公共运行时变化');
    for (const [name, hash] of Object.entries(token.sources)) if (fileSha(path.join(HERE,name)) !== hash) throw Error('封存执行源码变化');
    const configFile = path.join(HERE,`config-${token.selectedId}.json`), config = read(configFile);
    if (fileSha(configFile) !== token.configSha256 || fileSha(config.modelPrefix+'.bin') !== token.modelSha256) throw Error('封存配置或模型身份变化');
    return token;
}
