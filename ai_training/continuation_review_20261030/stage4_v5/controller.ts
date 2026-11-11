import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, saveText, fileSha, modelIdentity } from './io';
import { runtimeIdentity } from './runtime_identity';
import { scores, telemetryAudit, evidence } from './analysis';
import { healthGate, strengthGate } from './gates';

const plan = read(path.join(HERE, 'PLAN.json'));
const active = new Set<number>();
function validate() {
    if (runtimeIdentity().sha256 !== plan.runtime.sha256 || modelIdentity().binSha256 !== plan.model.binSha256) throw Error('运行时或权重身份变化');
    for (const [file, hash] of Object.entries(plan.preserved)) if (fileSha(file) !== hash) throw Error('历史文件发生变化：' + file);
    if (fileSha(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')) !== plan.panelSha256 || fileSha(path.join(HERE, 'DEV_SUBSET.json')) !== plan.subsetSha256) throw Error('开发面板变化');
    for (const c of plan.configs) if (fileSha(path.join(HERE, `config-${c.id}.json`)) !== plan.configHashes[c.id]) throw Error('配置变化');
    if (fs.existsSync(path.join(HERE, 'STOP'))) throw Error('停止标志存在');
}
async function run(name: string, args: string[]) {
    validate();
    const log = path.join(DATA, `${name}-${Date.now()}`), out = fs.openSync(log + '.stdout.log', 'wx'), err = fs.openSync(log + '.stderr.log', 'wx');
    const child = spawn(process.execPath, ['ai_training/run.mjs', 'node', '--import', 'tsx', ...args], { cwd: ROOT, windowsHide: true, stdio: ['ignore', out, err] });
    if (child.pid) active.add(child.pid);
    try {
        const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
        if (code !== 0) throw Error(`子任务${name}失败，退出码${code}，日志${log}`);
    } finally { if (child.pid) active.delete(child.pid); fs.closeSync(out); fs.closeSync(err); }
}
function fileHashes(dir: string): Record<string, string> {
    const hashes: Record<string, string> = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) Object.assign(hashes, fileHashes(file)); else hashes[file] = fileSha(file);
    }
    return hashes;
}
async function game(id: string, match: string) {
    validate();
    const folder = path.join(DATA, id, match), receipt = folder + '.receipt.json';
    if (fs.existsSync(receipt)) {
        const r = read(receipt);
        if (r.runtime !== plan.runtime.sha256 || r.config !== plan.configHashes[id]) throw Error('断点身份变化');
        for (const [file, hash] of Object.entries(r.files)) if (fileSha(file) !== hash) throw Error('断点文件摘要不符：' + file);
        const result = read(path.join(folder, 'SUMMARY.json'));
        if (!result.complete || !result.gpuExited || result.games.length !== 1 || result.games[0].error) throw Error('异常局保留，禁止重跑');
        return { ...result.games[0], artifactDirectory: path.join(folder, match) };
    }
    if (fs.existsSync(folder)) throw Error('存在无完整哈希收据的历史尝试，禁止覆盖或重跑：' + folder);
    const subset = path.join(DATA, `${id}-${match}-subset.json`);
    if (!fs.existsSync(subset)) await save(subset, { panelSha256: plan.panelSha256, ids: [match] }, true);
    await save(path.join(HERE, 'PROGRESS.json'), { stage: 'development', config: id, match, pid: process.pid, updated: new Date().toISOString(), sealedAccess: 0 });
    await run(`${id}-${match}`, [path.join(HERE, 'arena.ts'), path.join(HERE, `config-${id}.json`), folder, 'dev', subset]);
    const result = read(path.join(folder, 'SUMMARY.json'));
    if (!result.complete || !result.gpuExited || result.games.length !== 1 || result.games[0].error) throw Error('对局或推理退出合同失败');
    await save(receipt, { runtime: plan.runtime.sha256, config: plan.configHashes[id], files: fileHashes(folder) }, true);
    return { ...result.games[0], artifactDirectory: path.join(folder, match) };
}
async function panel(id: string, ids: string[], name: string) {
    const games = [];
    for (const match of ids) games.push(await game(id, match));
    const folder = path.join(DATA, name);
    if (!fs.existsSync(path.join(folder, 'SUMMARY.json'))) await save(path.join(folder, 'SUMMARY.json'), { games, complete: true }, true);
    const telemetry = await telemetryAudit(folder);
    return { id, games, scores: scores(games), telemetry };
}
async function reject(stage: string, details: unknown) {
    await save(path.join(HERE, 'DEVELOPMENT_GATE_REPORT.json'), { status: 'development_gate_rejected', stage, details, sealedAccess: 0, trainingUpdates: 0 }, true);
    await saveText(path.join(HERE, 'DEVELOPMENT_GATE_REPORT.md'), `# V5开发门禁未通过\n\n阶段：${stage}。流程已停止，未锁定候选、未创建封存令牌，封存访问为0，训练更新为0。\n\n详细成绩和遥测见同名JSON。\n\n\
${JSON.stringify(details, null, 2)}\n`, true);
    await saveText(path.join(HERE, 'REPORT.md'), `# V5阶段报告\n\n开发门禁未通过（${stage}），未进入封存验收。模型权重未训练，历史目录未改写。\n\n详见 DEVELOPMENT_GATE_REPORT.md 与 EVIDENCE_MANIFEST.json。\n`, true);
}
async function main() {
    validate();
    if (fs.existsSync(path.join(HERE, 'RUN_CLOSED.json')) || fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'))) throw Error('任务已关闭或封存尝试已占用，禁止重启');
    const screen = [], ids = read(path.join(HERE, 'DEV_SUBSET.json')).ids;
    for (const config of plan.configs) {
        const row = await panel(config.id, ids, `screen-${config.id}`); screen.push(row);
        if (!healthGate(row.telemetry)) { await reject(`Dev-18/${config.id}`, row); return; }
    }
    const winner = screen.slice().sort((a, b) => b.scores.equalRank - a.scores.equalRank || b.scores.equalWin - a.scores.equalWin)[0];
    const full = await panel(winner.id, read(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')).matches.map((m: any) => m.id), `full-${winner.id}`);
    await save(path.join(HERE, 'DEV_ABLATION_SUMMARY.json'), { screen, full, fullDevelopment: full.scores }, true);
    if (!healthGate(full.telemetry) || !strengthGate(full.scores)) { await reject('Dev-54双重门禁', full); return; }
    validate();
    const configFile = path.join(HERE, `config-${winner.id}.json`);
    await save(path.join(HERE, 'STAGE4_V5_CANDIDATE_LOCK.json'), { selectedId: winner.id, configSha256: fileSha(configFile), options: read(configFile),
        modelSha256: plan.model.binSha256, metadataSha256: plan.model.metadataSha256, sources: plan.runtime.files, development: full.scores }, true);
    await save(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'), { lockSha256: fileSha(path.join(HERE, 'STAGE4_V5_CANDIDATE_LOCK.json')), attempts: 1, started: new Date().toISOString() }, true);
    for (const split of ['historical', 'test']) await run(`${split}-final`, [path.join(HERE, 'arena.ts'), configFile, path.join(DATA, `${split}-final`), split]);
    await run('final-report', [path.join(HERE, 'final_report.ts')]);
}
const mutex = path.join(DATA, 'CONTROLLER_ACTIVE.json');
fs.writeFileSync(mutex, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' });
try {
    await main();
    await save(path.join(HERE, 'RUN_CLOSED.json'), { closed: new Date().toISOString(), childrenRemaining: active.size, trainingUpdates: 0, sealedAccess: fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json')) ? 1 : 0 }, true);
    await evidence();
} catch (error) {
    await save(path.join(HERE, `RUN_FAILURE_${Date.now()}.json`), { error: String(error), childrenRemaining: active.size }, true); throw error;
} finally { fs.unlinkSync(mutex); }
