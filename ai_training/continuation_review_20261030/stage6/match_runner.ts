import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, ROOT, DATA, read, save, fileSha, reserve } from './arena_io';
import { scores, telemetryAudit } from '../stage4_v7/analysis';
import { runtimeIdentity } from '../stage4_v7/runtime_identity';

/** 已完成逐局收据可复用；不完整尝试不自动重跑。每次两局，失败时先排空同批另一局。 */
export async function runPanel(id: string, panelFile: string, ids: string[], split: string, label: string) {
    const root = path.join(DATA, split === 'dev' ? 'development-v1' : 'sealed-v1');
    const configFile = path.join(HERE, `config-${id}.json`), configSha256 = fileSha(configFile);
    const config = read(configFile), runtime = runtimeIdentity();
    const sources = Object.fromEntries(['arena.ts','arena_client.ts','arena_io.ts','arena_writer.ts','accurate_batch.py','infer.py','match_runner.ts','gates.ts'].map(name=>[name,fileSha(path.join(HERE,name))]));
    const panel = read(panelFile), panelSha256 = fileSha(panelFile);
    const selected = panel.matches.filter((m: any) => ids.includes(m.id));
    if (selected.length !== ids.length || new Set(ids).size !== ids.length) throw Error('面板子集身份不符');
    const games: any[] = [];
    async function game(match: any) {
        const key = `${split}-${id}-${match.id}`, dir = path.join(root, key), receipt = path.join(root, `${key}.receipt.json`);
        if (fileSha(configFile) !== configSha256 || runtimeIdentity().sha256 !== runtime.sha256) throw Error('评测中途源码或配置变化');
        for (const [name, hash] of Object.entries(sources)) if (fileSha(path.join(HERE,name)) !== hash) throw Error('评测推理服务或执行器源码变化');
        if (!fs.existsSync(receipt)) {
            if (fs.existsSync(dir)) throw Error('发现不完整尝试，拒绝自动重跑：' + key);
            const subset = path.join(root, `${key}.subset.json`);
            await save(subset, {panelSha256, ids: [match.id]}, true);
            reserve(1048576); // 为单局控制台日志预留有界余量，主轨迹另按实际压缩字节计费。
            const log = fs.openSync(path.join(root, `${key}.log`), 'wx');
            try {
                const child = spawn(process.execPath, ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'arena.ts'), configFile, dir, split, subset], {cwd: ROOT, windowsHide: true, stdio: ['ignore', log, log], env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
                await new Promise<void>((resolve, reject) => {child.once('error',reject); child.once('exit',code => code === 0 ? resolve() : reject(Error(`评测子进程失败：${key}/${code}`)));});
            } finally {fs.closeSync(log);}
            const summary = read(path.join(dir, 'SUMMARY.json'));
            if (!summary.complete || !summary.gpuExited || summary.games.length !== 1 || summary.configSha256 !== configSha256 || summary.runtimeSha256 !== runtime.sha256 || summary.panelSha256 !== panelSha256 || summary.modelSha256 !== config.modelVersion) throw Error('逐局完成收据身份不符');
            await save(receipt, {configSha256, runtimeSha256: runtime.sha256, sources, summarySha256: fileSha(path.join(dir, 'SUMMARY.json'))}, true);
        }
        const r = read(receipt), summary = read(path.join(dir, 'SUMMARY.json'));
        if (r.configSha256 !== configSha256 || r.runtimeSha256 !== runtime.sha256 || r.summarySha256 !== fileSha(path.join(dir, 'SUMMARY.json'))) throw Error('已完成收据不可复用');
        if (JSON.stringify(r.sources)!==JSON.stringify(sources)) throw Error('复用收据的推理服务源码不符');
        const g = summary.games[0];
        if (['id','seed','seat','slot','opponent'].some(k => g[k] !== match[k])) throw Error('对局身份变化');
        return {...g, artifactDirectory: path.join(dir, match.id)};
    }
    for (let offset = 0; offset < selected.length; offset += 2) {
        if (fs.existsSync(path.join(HERE, 'STOP'))) throw Error('停止派发标志');
        await save(path.join(HERE, 'ARENA_PROGRESS.json'), {id, split, label, completed: games.length, total: selected.length, active: selected.slice(offset,offset+2).map((m: any) => m.id), workers: 2, sealedAccess: split === 'dev' ? 0 : 1});
        const settled = await Promise.allSettled(selected.slice(offset,offset+2).map(game));
        const failure = settled.find(r => r.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        settled.forEach(r => {if (r.status === 'fulfilled') games.push(r.value);});
        console.log(JSON.stringify({label,id,completed:games.length,total:selected.length,wins:games.filter(g => g.firstPlace === 1).length}));
    }
    const dir = path.join(root, label);
    await save(path.join(dir, 'SUMMARY.json'), {complete: true, games, configSha256, panelSha256, runtimeSha256: runtime.sha256}, true);
    const telemetry = await telemetryAudit(dir, '../stage6/VALUE_ONLY_PARITY.json');
    const result = {id, games, scores: scores(games), telemetry, configSha256, runtimeSha256: runtime.sha256, sources, workers: 2};
    await save(path.join(dir, 'ANALYSIS.json'), result, true);
    return result;
}
