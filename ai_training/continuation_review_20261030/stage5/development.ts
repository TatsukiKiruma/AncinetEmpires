import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, fileSha } from './arena_io';
import { scores, telemetryAudit } from '../stage4_v7/analysis';
import { healthGate } from '../stage4_v7/gates';

/** 单次控制器按固定身份自动衔接Dev18与Dev54，封存由独立门禁接入。 */
const folder = path.join(DATA, 'development-v2');
fs.mkdirSync(folder, {recursive: true});
const lock = fs.openSync(path.join(folder, 'CONTROLLER.lock'), 'wx');
const configs = ['C1', 'C2', 'C3'];
const configHashes = Object.fromEntries(configs.map(id => [id, fileSha(path.join(HERE, `config-${id}.json`))]));
const sources = Object.fromEntries(['arena.ts', 'arena_client.ts', 'arena_io.ts', 'arena_writer.ts', 'development.ts'].map(name => [name, fileSha(path.join(HERE, name))]));
const subset = read(path.join(HERE, 'DEV_SUBSET.json')), panel = read(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'));
const panelSha = fileSha(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'));
if (subset.panelSha256 !== panelSha || subset.ids.length !== 18) throw Error('开发子集身份无效');
function validate() {
    if (fs.existsSync(path.join(HERE, 'STOP'))) throw Error('用户停止');
    for (const [name, hash] of Object.entries(sources)) if (fileSha(path.join(HERE, name)) !== hash) throw Error('运行期间源码变化');
    for (const [id, hash] of Object.entries(configHashes)) if (fileSha(path.join(HERE, `config-${id}.json`)) !== hash) throw Error('运行期间配置变化');
}
async function game(id: string, match: string) {
    validate();
    const dir = path.join(folder, id, match), receipt = path.join(folder, `${id}-${match}.receipt.json`);
    if (fs.existsSync(receipt)) {
        const r = read(receipt);
        if (r.configSha256 !== configHashes[id] || fileSha(path.join(dir, 'SUMMARY.json')) !== r.summarySha256) throw Error('复用收据身份不一致');
        return {...read(path.join(dir, 'SUMMARY.json')).games[0], artifactDirectory: path.join(dir, match)};
    }
    if (fs.existsSync(dir)) throw Error('已有不完整尝试，禁止静默重跑：' + dir);
    const selection = path.join(folder, `${id}-${match}.subset.json`);
    await save(selection, {panelSha256: panelSha, ids: [match]}, true);
    await save(path.join(HERE, 'DEVELOPMENT_PROGRESS.json'), {id, match, state: 'running', updated: new Date().toISOString(), sealedAccess: 0});
    const child = spawn(process.execPath, ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'arena.ts'), path.join(HERE, `config-${id}.json`), dir, 'dev', selection], {cwd: ROOT, windowsHide: true, stdio: 'inherit', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
    const code = await new Promise<number | null>((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);});
    if (code !== 0) throw Error('实战子进程失败：' + id + '/' + match);
    const summary = read(path.join(dir, 'SUMMARY.json'));
    if (!summary.complete || !summary.gpuExited || summary.games.length !== 1 || summary.games[0].error || summary.configSha256 !== configHashes[id]) throw Error('实战收据未完成');
    await save(receipt, {configSha256: configHashes[id], summarySha256: fileSha(path.join(dir, 'SUMMARY.json'))}, true);
    return {...summary.games[0], artifactDirectory: path.join(dir, match)};
}
async function runPanel(id: string, ids: string[], name: string) {
    const games = [];
    for (const match of ids) games.push(await game(id, match));
    const dir = path.join(folder, name);
    await save(path.join(dir, 'SUMMARY.json'), {games, complete: true}, true);
    const telemetry = await telemetryAudit(dir);
    const result = {id, games, scores: scores(games), telemetry};
    await save(path.join(dir, 'ANALYSIS.json'), result, true);
    return result;
}
const healthy = (r: any) => r.scores.allNatural && healthGate(r.telemetry) && r.telemetry.waitOverCaptureCount === 0;
try {
    await save(path.join(folder, 'RUN.json'), {configHashes, sources, panelSha, subsetSha: fileSha(path.join(HERE, 'DEV_SUBSET.json')), sealedAccess: 0}, true);
    const screen = [];
    for (const id of configs) screen.push(await runPanel(id, subset.ids, `screen-${id}`));
    await save(path.join(HERE, 'DEV_SCREEN_SUMMARY.json'), screen, true);
    const offline = read(path.join(HERE, 'OFFLINE_CALIBRATION_REPORT.json')).candidates;
    const totalWins = (r: any) => r.games.filter((g: any) => g.firstPlace === 1).length;
    const selected = screen.filter(healthy).sort((a, b) => b.scores.equalRank - a.scores.equalRank || b.scores.equalWin - a.scores.equalWin || totalWins(b) - totalWins(a) || offline[a.id.replace('C', 'H')].oodDev.equalBrier - offline[b.id.replace('C', 'H')].oodDev.equalBrier || a.id.localeCompare(b.id))[0];
    if (!selected) {
        await save(path.join(HERE, 'DEVELOPMENT_GATE_REPORT.json'), {passed: false, stage: 'Dev18', sealedAccess: 0}, true);
    } else {
        const full = await runPanel(selected.id, panel.matches.map((m: any) => m.id), `full-${selected.id}`);
        const s = full.scores;
        const strength = (s.equalRank >= .6597 || s.equalWin >= .5602) && totalWins(full) >= 31 && s.byPlayers[2].wins >= 14 && s.byPlayers[3].wins >= 9 && s.byPlayers[4].wins >= 6;
        await save(path.join(HERE, 'DEVELOPMENT_GATE_REPORT.json'), {passed: healthy(full) && strength, stage: 'Dev54', selectedId: selected.id, configSha256: configHashes[selected.id], full, sealedAccess: 0}, true);
    }
    await save(path.join(HERE, 'DEVELOPMENT_PROGRESS.json'), {state: 'development_finished', next: '读取门禁报告，通过则执行唯一封存，否则失败收尾', sealedAccess: 0});
} catch (error) {
    await save(path.join(HERE, 'DEVELOPMENT_PROGRESS.json'), {state: 'error', error: String(error), sealedAccess: 0});
    throw error;
} finally {fs.closeSync(lock); fs.unlinkSync(path.join(folder, 'CONTROLLER.lock'));}
