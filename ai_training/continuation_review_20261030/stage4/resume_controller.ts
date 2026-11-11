/** 修复后接续原计划；不覆盖原件，不重跑任何已记录的同配置对局。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, saveText, fileSha, modelIdentity } from './io';
import { runtimeIdentity } from './runtime_identity';
import { collectRecordedGames, remainingMatches, verifyPreservation, publishAggregate } from './resume_records';
import { scores, pairedComparison, telemetryAudit, evidence } from './analysis';
import { deliver } from './report';

const planFile = path.join(HERE, 'RESUME_V3_PLAN.json'), plan = read(planFile), planSha256 = fileSha(planFile);
const preservation = read(path.join(HERE, 'PRESERVED_GAMES_V3.json')), runtime = runtimeIdentity(), active = new Map<number, ChildProcess>();
const panelFile = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), rawPanel = read(panelFile), initial = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const initialManifestSha256 = fileSha(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const panel = { ...rawPanel, slots: initial.slots }, subsetIds: string[] = read(path.join(HERE, 'DEV_SUBSET.json')).ids;
const logRoot = path.join(DATA, 'logs-resume-v3'); fs.mkdirSync(logRoot, { recursive: true });
const completedJobs: any[] = [];
function validate() {
    if (fileSha(planFile) !== planSha256 || fileSha(panelFile) !== plan.developmentPanelSha256 || fileSha(path.join(HERE, 'DEV_SUBSET.json')) !== plan.subsetSha256 || fileSha(path.join(S3, 'DEV_INITIAL_MANIFEST.json')) !== initialManifestSha256 || initial.panelSha256 !== plan.developmentPanelSha256 || fileSha(path.join(HERE, 'PRESERVED_GAMES_V3.json')) !== plan.preservationSha256) throw Error('接续合同、开发初态清单或面板变化');
    const model = modelIdentity(); if (model.binSha256 !== plan.model.binSha256 || model.metadataSha256 !== plan.model.metadataSha256) throw Error('模型身份变化');
    for (const [file, digest] of Object.entries(runtime.files)) if (fileSha(path.join(ROOT, file)) !== digest) throw Error('接续时运行源码变化：' + file);
    for (const config of plan.configs) if (fileSha(path.join(HERE, config.file)) !== config.sha256) throw Error('已冻结搜索超参数变化');
    for (const [file, digest] of Object.entries(plan.preserved)) if (fileSha(path.join(HERE, '..', file)) !== digest) throw Error('历史冻结文件变化');
    verifyPreservation(preservation.files);
    if (fs.existsSync(path.join(HERE, 'STOP'))) throw Error('存在停止标志');
}
async function command(name: string, binary: string, args: string[]) {
    validate();
    const stdout = path.join(logRoot, name + '.stdout.log'), stderr = path.join(logRoot, name + '.stderr.log');
    const a = fs.openSync(stdout, 'wx'), b = fs.openSync(stderr, 'wx'), start = performance.now();
    const child = spawn(binary, args, { cwd: ROOT, stdio: ['ignore', a, b], windowsHide: true });
    if (child.pid) active.set(child.pid, child);
    let exitCode: number | null = null;
    try { exitCode = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => signal ? reject(Error('子进程被终止：' + signal)) : resolve(code ?? -1)); }); }
    finally { if (child.pid) active.delete(child.pid); fs.closeSync(a); fs.closeSync(b); }
    const row = { name, exitCode, pid: child.pid, seconds: (performance.now() - start) / 1000, stdout, stderr };
    await save(path.join(logRoot, name + '.json'), row, true); completedJobs.push(row);
    if (exitCode !== 0) throw Error(`${name}失败：${stderr}`);
    return row;
}
async function arena(name: string, config: any, split: string, ids?: string[]) {
    const output = path.join(DATA, name), args = ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'arena.ts'), path.join(HERE, config.file), output, split];
    if (ids) {
        const schedule = path.join(HERE, `SCHEDULE_${name}.json`);
        await save(schedule, { panelSha256: fileSha(panelFile), ids, reason: '仅含未记录的同配置开发局', preservationSha256: plan.preservationSha256 }, true); args.push(schedule);
    }
    await save(path.join(HERE, 'PROGRESS.json'), { stage: name, pid: process.pid, updated: new Date().toISOString(), noReplay: true });
    await command(name, process.execPath, args);
    const summary = read(path.join(output, 'SUMMARY.json'));
    if (!summary.complete || !summary.gpuExited || summary.retiredServices.some((s: any) => !s.exited) || summary.configSha256 !== config.sha256 || summary.runtimeSha256 !== runtime.sha256) throw Error('新评测的身份或退出合同不符');
    return output;
}
async function devGroup(config: any, matches: any[], name: string, directories: string[]) {
    let records = collectRecordedGames(directories, config.sha256, panel, plan.model.binSha256);
    const remaining = remainingMatches(matches, records);
    await save(path.join(HERE, `SCHEDULE_AUDIT_${name}.json`), { configSha256: config.sha256, reused: matches.filter(m => records.has(m.id)).map(m => m.id), pending: remaining.map(m => m.id), total: matches.length }, true);
    if (remaining.length) directories.push(await arena(name, config, 'dev', remaining.map(m => m.id)));
    records = collectRecordedGames(directories, config.sha256, panel, plan.model.binSha256);
    const output = path.join(DATA, name + '-aggregate');
    const summary = await publishAggregate(output, matches, records, { split: 'dev', configSha256: config.sha256, modelSha256: plan.model.binSha256, panelSha256: fileSha(panelFile) });
    verifyPreservation(preservation.files);
    return { id: config.id, config, directory: output, sources: directories.slice(), scores: scores(summary.games), games: summary.games, telemetry: await telemetryAudit(output, 'GPU_BATCH_PARITY_V3.json') };
}
async function main() {
    validate();
    if (fs.existsSync(path.join(HERE, 'RESUME_RUN_STARTED_V3.json'))) throw Error('本接续控制器不可重复启动');
    if (fs.existsSync(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')) || fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'))) throw Error('已锁定或已占用封存，禁止重复运行');
    await save(path.join(HERE, 'RESUME_RUN_STARTED_V3.json'), { pid: process.pid, started: new Date().toISOString(), planSha256, initialManifestSha256, runtime, retainedGames: 28, sealedAccess: 0 }, true);
    const checks = [];
    for (const [name, cmd] of [['public-lint', 'npm run lint'], ['public-test', 'npm test'], ['public-build', 'npm run build'], ['stage4-types', 'npx tsc --noEmit -p ai_training/continuation_review_20261030/stage4/tsconfig.json'], ['transport-and-resume-tests', 'npx vitest run --config ai_training/continuation_review_20261030/stage4/vitest.config.mjs'], ['analysis-contract', 'node ai_training/run.mjs node --import tsx continuation_review_20261030/stage4/check_analysis.ts ANALYSIS_CONTRACT_CHECK_V3.json']]) checks.push(await command(name, 'powershell.exe', ['-NoProfile', '-Command', `${cmd}; exit $LASTEXITCODE`]));
    await save(path.join(HERE, 'PUBLIC_CHECKS_V3.json'), { passed: true, runtimeSha256: runtime.sha256, results: checks }, true);
    await command('gpu-batch-parity-v3', process.execPath, ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'parity.ts'), 'GPU_BATCH_PARITY_V3.json']);
    const screen = [];
    for (const config of plan.configs) screen.push(await devGroup(config, panel.matches.filter((m: any) => subsetIds.includes(m.id)), 'resume-v3-screen-' + config.id, plan.sourcesByConfig[config.id].slice()));
    const eligible = screen.filter(r => r.id.startsWith('maxn-') && r.telemetry.substantiveRate > .9 && !r.telemetry.timeForfeits && !r.telemetry.invalidTeacher);
    if (!eligible.length) throw Error('没有Max^n配置满足预先健康门槛；封存保持未访问');
    const ordered = eligible.slice().sort((a, b) => Number(b.scores.allNatural) - Number(a.scores.allNatural) || b.scores.equalRank - a.scores.equalRank || b.scores.equalWin - a.scores.equalWin ||
        a.games.filter((r: any) => r.eliminatedBeforeFinalOpponent).length - b.games.filter((r: any) => r.eliminatedBeforeFinalOpponent).length || plan.configs.findIndex((c: any) => c.id === a.id) - plan.configs.findIndex((c: any) => c.id === b.id));
    const winner = ordered[0];
    await save(path.join(HERE, 'DEV_SCREEN_SELECTION.json'), { selected: winner.id, ordering: ordered.map(r => r.id), screen: screen.map(r => ({ id: r.id, scores: r.scores, runtimeVersions: [...new Set(r.games.map((g: any) => g.sourceRuntimeSha256))] })), sealedAccess: 0, noRecordedMatchesRerun: true }, true);
    const full = await devGroup(winner.config, panel.matches, 'resume-v3-full-' + winner.id, winner.sources.slice());
    await save(path.join(HERE, 'DEV_ABLATION_SUMMARY.json'), { screen, selected: winner.id, fullDevelopment: full.scores, fullDevelopmentDirectory: full.directory,
        utilityAblation: pairedComparison(screen.find(r => r.id === 'margin-prior1')!.games, screen.find(r => r.id === 'maxn-prior1')!.games),
        priorAblation: pairedComparison(screen.find(r => r.id === 'maxn-prior1')!.games, screen.find(r => r.id === 'maxn-prior035')!.games), fullDevelopmentTelemetry: full.telemetry,
        noRecordedMatchesRerun: true, runtimeMixtureDisclosure: plan.runtimeMixtureDisclosure, sealedPanelAccessBeforeLock: 0 }, true);
    if (full.telemetry.substantiveRate <= .9 || full.telemetry.timeForfeits || full.telemetry.invalidTeacher) throw Error('完整开发健康门槛未通过，封存保持未访问');
    validate(); const options = read(path.join(HERE, winner.config.file));
    await save(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json'), { schema: 'stage4-unique-omni-search-v3', locked: new Date().toISOString(), selectedId: winner.id,
        modelSha256: plan.model.binSha256, metadataSha256: plan.model.metadataSha256, modelPrefix: plan.model.prefix, options, configFile: winner.config.file, configSha256: winner.config.sha256,
        runtimeSha256: runtime.sha256, sources: runtime.files, developmentSha256: fileSha(path.join(HERE, 'DEV_ABLATION_SUMMARY.json')), sealedPanelAccessBeforeLock: 0, sealedForwardsBeforeLock: 0, finalTestAttempts: 1, noRetuningAfterLock: true }, true);
    await save(path.join(HERE, 'OMNI_SEARCH_MANIFEST.json'), { schema: 'stage4-search-teacher-v3', name: 'Omni-Search', model: plan.model, options, runtimeSha256: runtime.sha256,
        lockSha256: fileSha(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')), output: { available: '仅available=true可用于蒸馏', actionCodes: '根权威非投降合法动作码', qValues: '完整post_response的保守Q，未完成为null', evaluatedMask: '是否有完整反扑Q', vetoMask: '是否被完整安全替代方案否决', probabilities: '可用Q的温度softmax，和为1；不可用根为显式缺失零向量', value: '可用根Q最大值，缺失为null' },
        firstUnitOnly: true, deadlines: { nominalBudgetMs: options.budgetMs, softCutoff: '根预算减75ms，仅停止扩展且排空迟到包', transportWatchdogMs: 10000, actualTimeForfeit: '只按冻结面板maxDecisionMs实际超限判定' },
        responsePolicy: { perspective: '敌席自身视角', responseActors: options.responseActors, cohortSize: options.responseCohortSize, deferredCandidatesNotEvaluated: true }, deployAutomatically: false, trainingUpdates: 0 }, true);
    await arena('historical-final', winner.config, 'historical');
    validate();
    const attempt = { schema: 'stage4-single-sealed-attempt-v3', started: new Date().toISOString(), lockSha256: fileSha(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')), candidates: 1, games: 54 };
    await save(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'), attempt, true); await save(path.join(DATA, 'FINAL_TEST_ATTEMPT.json'), attempt, true);
    await arena('test-final', winner.config, 'test');
    validate(); await deliver({ planFile: 'RESUME_V3_PLAN.json', checksFile: 'PUBLIC_CHECKS_V3.json', parityFile: 'GPU_BATCH_PARITY_V3.json' });
    if (active.size) throw Error('仍有子进程未退出');
    await save(path.join(HERE, 'PRESERVED_GAMES_VERIFIED_V3.json'), { passed: true, checkedFiles: Object.keys(preservation.files).length, retainedGames: 28, noRecordedMatchesRerun: true }, true);
    const closed = { status: 'complete', finished: new Date().toISOString(), controllerPid: process.pid, evaluationChildrenRemaining: 0, inferenceChildrenRemaining: 0, finalTestRuns: 1, retainedGames: 28, noTrainingUpdates: true, completedJobs };
    await save(path.join(HERE, 'RUN_CLOSED.json'), closed, true); await save(path.join(DATA, 'RUN_CLOSED.json'), closed, true);
    await save(path.join(HERE, 'PROGRESS.json'), { stage: 'complete', completed: true, report: path.join(HERE, 'REPORT.md') });
    await evidence(); console.log(JSON.stringify(closed));
}
try { await main(); }
catch (error) {
    for (const child of active.values()) child.kill();
    await save(path.join(HERE, `RUN_FAILURE_${Date.now()}.json`), { error: String(error), at: new Date().toISOString(), pid: process.pid, children: [...active.keys()], finalTestStarted: fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json')), retainedRecordsUnchanged: true, noAutomaticMatchRetry: true }, true);
    await saveText(path.join(HERE, `INCOMPLETE_${Date.now()}.md`), `# 第四阶段接续未完成\n\n${String(error)}\n\n原对局及失败记录保留；不重跑已记录局，封存仅在唯一锁定后访问。\n`, true);
    process.exitCode = 1; console.error(error);
}
