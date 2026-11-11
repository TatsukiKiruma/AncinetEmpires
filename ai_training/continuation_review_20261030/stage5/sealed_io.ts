import fs from 'node:fs';
import path from 'node:path';
import { HERE, read, fileSha } from './arena_io';
import { runtimeIdentity } from '../stage4_v7/runtime_identity';
export { HERE, ROOT, S3, DATA, read, save, sha, fileSha, modelIdentity } from './arena_io';

/** 只有同一候选、门禁和单次令牌绑定的封存执行器能够读取封存面板。 */
export function allowSealed() {
    const tokenFile = path.join(HERE, 'FINAL_TEST_ATTEMPT.json');
    if (!fs.existsSync(tokenFile)) throw Error('封存单次令牌不存在');
    const token = read(tokenFile), gateFile = path.join(HERE, 'GATE_DECISION.json');
    if (token.attempts !== 1 || token.selectedId !== 'C1' || token.gateSha256 !== fileSha(gateFile) || !read(gateFile).passed) throw Error('封存门禁或令牌不符');
    if (token.runtimeSha256 !== runtimeIdentity().sha256) throw Error('封存运行时发生变化');
    for (const [name, hash] of Object.entries(token.sources)) if (fileSha(path.join(HERE, name)) !== hash) throw Error('封存执行器源码变化');
    const configFile = path.join(HERE, 'config-C1.json');
    if (fileSha(configFile) !== token.configSha256) throw Error('封存候选配置变化');
    const config = read(configFile);
    if (fileSha(config.modelPrefix + '.bin') !== token.modelSha256) throw Error('封存模型变化');
    return token;
}
