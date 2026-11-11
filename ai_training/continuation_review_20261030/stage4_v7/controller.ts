import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, saveText, fileSha, modelIdentity, allowSealed } from './io';
import { runtimeIdentity } from './runtime_identity';
import { scores, telemetryAudit } from './analysis';
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
async function run(name: string, args: string[], supervised = false) {
    validate();
    const log = path.join(DATA, `${name}-${Date.now()}`), out = fs.openSync(log + '.stdout.log', 'wx'), err = fs.openSync(log + '.stderr.log', 'wx');
    const child = spawn(supervised ? path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe') : process.execPath, supervised ? ['-X', 'utf8', '-u', path.join(HERE, 'supervise.py'), ...args] : ['ai_training/run.mjs', 'node', '--import', 'tsx', ...args], { cwd: ROOT, windowsHide: true, stdio: ['ignore', out, err] });
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
async function game(id: string, match: string, split = 'dev') {
    validate();
    const folder = path.join(DATA, split === 'dev' ? id : `${split}-final-games`, match), receipt = folder + '.receipt.json';
    if (fs.existsSync(receipt)) {
        const r = read(receipt);
        if (r.runtime !== plan.runtime.sha256 || r.config !== plan.configHashes[id]) throw Error('断点身份变化');
        for (const [file, hash] of Object.entries(r.files)) if (fileSha(file) !== hash) throw Error('断点文件摘要不符：' + file);
        const result = read(path.join(folder, 'SUMMARY.json'));
        if (result.runtimeSha256 !== plan.runtime.sha256 || result.configSha256 !== plan.configHashes[id] || result.modelSha256 !== plan.model.binSha256 || !result.complete || !result.gpuExited || result.games.length !== 1 || result.games[0].error) throw Error('异常局保留，禁止重跑');
        return { ...result.games[0], artifactDirectory: path.join(folder, match) };
    }
    if (fs.existsSync(folder)) throw Error('存在无完整哈希收据的历史尝试，禁止覆盖或重跑：' + folder);
    const subset = path.join(DATA, `${split}-${id}-${match}-subset.json`);
    if (!fs.existsSync(subset)) await save(subset, { panelSha256: split === 'dev' ? plan.panelSha256 : fileSha(path.join(split === 'test' ? S3 : path.join(HERE, '../stage1'), split === 'test' ? 'OMNI_ARENA_TEST_PANEL.json' : 'ARENA_PANEL.json')), ids: [match] }, true);
    await save(path.join(HERE, 'PROGRESS.json'), { stage: split, config: id, match, pid: process.pid, updated: new Date().toISOString(), sealedAccess: Number(split !== 'dev') });
    await run(`${id}-${match}`, [path.join(HERE, `config-${id}.json`), folder, split, subset], true);
    const result = read(path.join(folder, 'SUMMARY.json'));
    if (result.runtimeSha256 !== plan.runtime.sha256 || result.configSha256 !== plan.configHashes[id] || result.modelSha256 !== plan.model.binSha256 || !result.complete || !result.gpuExited || result.games.length !== 1 || result.games[0].error) throw Error('对局或推理退出合同失败');
    await save(receipt, { runtime: plan.runtime.sha256, config: plan.configHashes[id], files: fileHashes(folder) }, true);
    return { ...result.games[0], artifactDirectory: path.join(folder, match) };
}
async function panel(id: string, ids: string[], name: string, split = 'dev') {
    if (new Set(ids).size !== ids.length || ids.length !== (split === 'dev' && name.startsWith('screen-') ? 18 : split === 'historical' ? 40 : 54)) throw Error('冻结面板覆盖数量不符');
    const games = [];
    for (const match of ids) games.push(await game(id, match, split));
    const folder = path.join(DATA, name);
    if (!fs.existsSync(path.join(folder, 'SUMMARY.json'))) await save(path.join(folder, 'SUMMARY.json'), { games, complete: true }, true);
    const telemetry = await telemetryAudit(folder);
    return { id, games, scores: scores(games), telemetry };
}
async function reject(stage: string, details: unknown) {
    await save(path.join(HERE, 'DEVELOPMENT_GATE_REPORT.json'), { status: 'development_gate_rejected', stage, details, sealedAccess: 0, trainingUpdates: 0 }, true);
    await saveText(path.join(HERE, 'DEVELOPMENT_GATE_REPORT.md'), `# V7开发门禁未通过\n\n阶段：${stage}。流程已停止，未锁定候选、未创建封存令牌，封存访问为0，训练更新为0。\n\n详细成绩和遥测见同名JSON。\n\n\
${JSON.stringify(details, null, 2)}\n`, true);
    const d = details as any, t = d.telemetry, s = d.scores;
    const table = s ? [2, 3, 4].map(n => `| ${n}P | ${s.byPlayers[n].attempted} | ${s.byPlayers[n].wins} | ${(100 * t.substantiveByPlayers[n].rate).toFixed(2)}% |`).join('\n') : '';
    await saveText(path.join(HERE, 'REPORT.md'), `# V7开发阶段报告\n\n开发门禁未通过（${stage}），流程已停止。训练更新0、封存访问0，未创建候选锁或唯一验收令牌。\n\n| 人数 | 完成 | 独胜 | 实质比较率 |\n|---|---:|---:|---:|\n${table}\n\n${t ? `完整遥测覆盖${t.completeCoverage}，总体实质比较率${(100 * t.substantiveRate).toFixed(2)}%，4P ${(100 * t.substantiveByPlayers[4].rate).toFixed(2)}%，时间判负${t.timeForfeits}，非法教师${t.invalidTeacher}；等权独胜${s.equalWin.toFixed(4)}、排名${s.equalRank.toFixed(4)}。` : ''}\n\n本版排除占领待机及推演禁手，单轨完成首链并跳过半回合Wave B，每步重新搜索；单挑双反扑仅由冻结配置启用。延迟、舍弃或未闭合分支严格没有教师标签；纯Q和锚定J分别保存。公共lint/test/build、独立合同和真实GPU一致性见PUBLIC_CHECKS.json及GPU_BATCH_PARITY.json。\n\n历史stage4/V5目录和数据保持原样。评测对手为项目困难AI复刻，不能等同APK原生实战；小样本开发结果不能替代封存结论。详细结果、配置、源码、收据、预算原因及GPU退出见证见DEVELOPMENT_GATE_REPORT.json与EVIDENCE_MANIFEST.json。\n`, true);
}
async function main() {
    validate();
    if (fs.existsSync(path.join(HERE, 'RUN_CLOSED.json'))) throw Error('任务已经关闭');
    if (fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'))) {
        const lock = allowSealed(), development = read(path.join(HERE, 'DEV_ABLATION_SUMMARY.json')).full;
        if (!healthGate(development.telemetry) || development.telemetry.waitOverCaptureCount !== 0 || !strengthGate(development.scores)) throw Error('封存断点的开发门禁证明无效');
        await runFinal(lock.selectedId); return;
    }
    const screen = [], ids = read(path.join(HERE, 'DEV_SUBSET.json')).ids;
    for (const config of plan.configs) {
        const row = await panel(config.id, ids, `screen-${config.id}`); screen.push(row);
        if (config.id === 'C1' && !healthGate(row.telemetry)) { await reject(`Dev-18/${config.id}`, row); return; }
    }
    await save(path.join(HERE, 'DEV_SCREEN_SUMMARY.json'), screen, true);
    const eligible = screen.filter(r => ['C1', 'C2'].includes(r.id) && healthGate(r.telemetry));
    const winner = eligible.sort((a, b) => b.scores.equalRank - a.scores.equalRank || b.scores.equalWin - a.scores.equalWin || b.scores.byPlayers[2].wins - a.scores.byPlayers[2].wins || b.telemetry.substantiveRate - a.telemetry.substantiveRate || a.id.localeCompare(b.id))[0];
    if (!winner) { await reject('Dev-18筛选', screen); return; }
    const full = await panel(winner.id, read(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')).matches.map((m: any) => m.id), `full-${winner.id}`);
    await save(path.join(HERE, 'DEV_ABLATION_SUMMARY.json'), { screen, full, fullDevelopment: full.scores }, true);
    if (!healthGate(full.telemetry) || full.telemetry.waitOverCaptureCount !== 0 || !strengthGate(full.scores)) { await reject('Dev-54双重门禁', full); return; }
    validate();
    const configFile = path.join(HERE, `config-${winner.id}.json`);
    await save(path.join(HERE, 'STAGE4_V7_CANDIDATE_LOCK.json'), { selectedId: winner.id, configSha256: fileSha(configFile), options: read(configFile),
        modelSha256: plan.model.binSha256, metadataSha256: plan.model.metadataSha256, sources: plan.runtime.files, development: full.scores }, true);
    await save(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'), { lockSha256: fileSha(path.join(HERE, 'STAGE4_V7_CANDIDATE_LOCK.json')), attempts: 1, started: new Date().toISOString() }, true);
    await runFinal(winner.id);

}
async function runFinal(selectedId: string) {
    for (const split of ['test', 'historical']) {
        const panelFile = split === 'test' ? path.join(S3, 'OMNI_ARENA_TEST_PANEL.json') : path.join(HERE, '../stage1/ARENA_PANEL.json');
        const ids = read(panelFile).matches.map((m: any) => m.id);
        await panel(selectedId, ids, `${split}-final`, split);
    }
    await run('final-report', [path.join(HERE, 'final_report.ts')]);
}

try {
    await main();
    await save(path.join(HERE, 'RUN_CLOSED.json'), { closed: new Date().toISOString(), childrenRemaining: active.size, trainingUpdates: 0, sealedAccess: fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json')) ? 1 : 0 }, true);
} catch (error) {
    await save(path.join(HERE, `RUN_FAILURE_${Date.now()}.json`), { error: String(error), childrenRemaining: active.size }, true); throw error;
}
