import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, fileSha, allowSealed } from './sealed_io';

/** 用户授权的并发续接：沿用唯一令牌，只运行从未启动的局。 */
const token = allowSealed();
const out = path.join(DATA, 'sealed-v1');
const amendment = read(path.join(HERE, 'TWO_WORKER_AUTHORIZATION.json'));
if (amendment.tokenSha256 !== fileSha(path.join(HERE, 'FINAL_TEST_ATTEMPT.json')) ||
    amendment.controllerSha256 !== fileSha(path.join(HERE, 'sealed_two_workers.ts'))) throw Error('并发续接身份不符');
await save(path.join(HERE, 'TWO_WORKER_ATTEMPT.json'), {started: new Date().toISOString(), workers: 2, sealedAccess: 1, amendment}, true);
for (const split of ['test', 'historical']) {
    const panelFile = split === 'test' ? path.join(S3, 'OMNI_ARENA_TEST_PANEL.json') : path.join(HERE, '../stage1/ARENA_PANEL.json');
    const panel = read(panelFile), expected = split === 'test' ? 54 : 40;
    const manifest = split === 'test' ? read(path.join(S3, 'TEST_INITIAL_MANIFEST.json')) : panel;
    if (panel.matches.length !== expected || new Set(panel.matches.map((m: any) => m.id)).size !== expected) throw Error('面板数量错误');
    const games = new Map<string, any>();
    const receiptPath = (id: string) => path.join(out, `${split}-${id}.receipt.json`);
    async function collect(match: any, recover = false) {
        const dir = path.join(out, split, match.id), summaryFile = path.join(dir, 'SUMMARY.json');
        const result = read(summaryFile), game = result.games?.[0];
        if (!result.complete || !result.gpuExited || result.games.length !== 1 || !game.natural || game.error ||
            result.configSha256 !== token.configSha256 || result.modelSha256 !== token.modelSha256 ||
            result.runtimeSha256 !== token.runtimeSha256 || result.panelSha256 !== fileSha(panelFile) ||
            game.initialSha256 !== manifest.slots[match.slot].sha256 ||
            ['id', 'slot', 'seed', 'seat', 'opponent'].some(k => game[k] !== match[k])) throw Error('收据或自然完赛身份不符：' + match.id);
        const receipt = receiptPath(match.id);
        if (fs.existsSync(receipt)) {
            const old = read(receipt);
            if (old.summarySha256 !== fileSha(summaryFile) || old.configSha256 !== token.configSha256) throw Error('历史收据摘要变化');
        } else {
            if (recover && `${split}/${match.id}` !== amendment.drainedMatch) throw Error('未授权补全收据');
            await save(receipt, {summarySha256: fileSha(summaryFile), configSha256: token.configSha256}, true);
        }
        games.set(match.id, {...game, artifactDirectory: path.join(dir, match.id)});
    }
    const pending: any[] = [];
    for (const match of panel.matches) {
        if (fs.existsSync(path.join(out, split, match.id))) await collect(match, true);
        else {
            if (fs.existsSync(receiptPath(match.id)) || fs.existsSync(path.join(out, `${split}-${match.id}.subset.json`))) throw Error('发现未完成尝试，禁止重跑');
            pending.push(match);
        }
    }
    const active = new Set<string>();
    let failure: unknown = null;
    async function progress() {
        await save(path.join(HERE, 'SEALED_PROGRESS.json'), {split, completed: games.size, total: expected, active: [...active], workers: 2, sealedAccess: 1});
    }
    // 两局一批；批次失败时排空另一个自然对局，不再派发后续任务。
    while (pending.length && !failure) {
        if (fs.existsSync(path.join(HERE, 'STOP')) || fs.existsSync(path.join(HERE, 'DRAIN_TWO_WORKERS'))) throw Error('停止派发');
        const batch = pending.splice(0, 2);
        for (const match of batch) active.add(match.id);
        await progress();
        const settled = await Promise.allSettled(batch.map(async match => {
            allowSealed();
            const subset = path.join(out, `${split}-${match.id}.subset.json`), dir = path.join(out, split, match.id);
            await save(subset, {panelSha256: fileSha(panelFile), ids: [match.id]}, true);
            const child = spawn(process.execPath, ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'sealed_arena.ts'), path.join(HERE, 'config-C1.json'), dir, split, subset], {cwd: ROOT, windowsHide: true, stdio: 'inherit', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
            await new Promise<void>((resolve, reject) => {child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error('子局失败：' + match.id)));});
            await collect(match);
            active.delete(match.id);
        }));
        for (const result of settled) if (result.status === 'rejected') failure = result.reason;
        await progress();
    }
    if (failure) throw failure;
    const summary = path.join(out, `${split}-SUMMARY.json`);
    if (!fs.existsSync(summary)) await save(summary, {games: panel.matches.map((m: any) => games.get(m.id)), complete: true, panelSha256: fileSha(panelFile), panelFile, sealedAccess: 1, concurrencyAmendment: amendment}, true);
}
await save(path.join(HERE, 'SEALED_MATCHES_COMPLETE.json'), {complete: true, sealedAccess: 1, offline329Complete: fs.existsSync(path.join(HERE, 'SEALED_OFFLINE_REPORT.json'))}, true);
