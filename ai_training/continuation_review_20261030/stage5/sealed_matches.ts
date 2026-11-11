import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, fileSha } from './arena_io';
import { runtimeIdentity } from '../stage4_v7/runtime_identity';

/** 唯一封存实战：先独立验证门禁，再占用令牌；本模块不训练或调参。 */
const proof = spawnSync(path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe'), ['-B', '-X', 'utf8', path.join(HERE, 'sealed_guard.py')], {encoding: 'utf8', windowsHide: true});
if (proof.status !== 0) throw Error('封存门禁拒绝：' + proof.stderr);
const guard = JSON.parse(proof.stdout);
if (fs.existsSync(path.join(DATA, 'development-v2/CONTROLLER.lock'))) throw Error('开发控制器尚未退出');
const sources = Object.fromEntries(['sealed_matches.ts', 'sealed_arena.ts', 'sealed_io.ts', 'sealed_guard.py', 'arena_io.ts', 'arena_client.ts', 'arena_writer.ts'].map(name => [name, fileSha(path.join(HERE, name))]));
await save(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'), {...guard, sources, attempts: 1, runtimeSha256: runtimeIdentity().sha256, started: new Date().toISOString()}, true);
const output = path.join(DATA, 'sealed-v1');
if (fs.existsSync(output)) throw Error('封存目录已存在，禁止重跑');
fs.mkdirSync(output);
for (const split of ['test', 'historical']) {
    // 历史40沿用Stage4实际使用的冻结ARENA_PANEL，不创建同名猜测面板。
    const panelFile = split === 'test' ? path.join(S3, 'OMNI_ARENA_TEST_PANEL.json') : path.join(HERE, '../stage1/ARENA_PANEL.json');
    const panel = read(panelFile), expected = split === 'test' ? 54 : 40;
    if (panel.matches.length !== expected || new Set(panel.matches.map((m: any) => m.id)).size !== expected) throw Error('封存面板覆盖数量不符');
    const games = [];
    for (const match of panel.matches) {
        if (fs.existsSync(path.join(HERE, 'STOP'))) throw Error('停止标志');
        const subset = path.join(output, `${split}-${match.id}.subset.json`), dir = path.join(output, split, match.id);
        await save(subset, {panelSha256: fileSha(panelFile), ids: [match.id]}, true);
        await save(path.join(HERE, 'SEALED_PROGRESS.json'), {split, match: match.id, completed: games.length, total: expected, sealedAccess: 1});
        const child = spawn(process.execPath, ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'sealed_arena.ts'), path.join(HERE, 'config-C1.json'), dir, split, subset], {cwd: ROOT, windowsHide: true, stdio: 'inherit', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
        const code = await new Promise<number | null>((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);});
        if (code !== 0) throw Error('封存对局失败，保留现场且禁止重跑');
        const result = read(path.join(dir, 'SUMMARY.json'));
        if (!result.complete || !result.gpuExited || result.games.length !== 1 || result.configSha256 !== guard.configSha256 || result.modelSha256 !== guard.modelSha256) throw Error('封存收据不完整');
        games.push({...result.games[0], artifactDirectory: path.join(dir, match.id)});
        await save(path.join(output, `${split}-${match.id}.receipt.json`), {summarySha256: fileSha(path.join(dir, 'SUMMARY.json')), configSha256: guard.configSha256}, true);
    }
    await save(path.join(output, `${split}-SUMMARY.json`), {games, complete: true, panelSha256: fileSha(panelFile), panelFile, sealedAccess: 1}, true);
}
await save(path.join(HERE, 'SEALED_MATCHES_COMPLETE.json'), {complete: true, sealedAccess: 1, offline329Complete: false}, true);
