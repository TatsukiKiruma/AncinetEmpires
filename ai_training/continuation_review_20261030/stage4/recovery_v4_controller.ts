/** 修复后接续原计划；不覆盖原件，不重跑任何已记录的同配置对局。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, saveText, fileSha, modelIdentity } from './io';
import { runtimeIdentity } from './runtime_identity';
import { collectRecordedGames, remainingMatches, verifyPreservation, publishAggregate } from './resume_records';
import { scores, pairedComparison, telemetryAudit, evidence } from './analysis';
import { deliver } from './report_v4';

const planFile = path.join(HERE, 'RESUME_V4_RECOVERY_FINAL_PLAN.json'), plan = read(planFile), planSha256 = fileSha(planFile);
const preservation = read(path.join(HERE, 'PRESERVED_INTERRUPTION_V4.json')), runtime = runtimeIdentity(), active = new Map<number, ChildProcess>();
const panelFile = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), rawPanel = read(panelFile), initial = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const initialManifestSha256 = fileSha(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const panel = { ...rawPanel, slots: initial.slots };
const logRoot = path.join(DATA, 'logs-recovery-v4'); fs.mkdirSync(logRoot, { recursive: true });
const completedJobs: any[] = [];
function validate() {
    if (fileSha(path.join(HERE, 'SELECTION_PROTOCOL_APPROVED_V4.json')) !== plan.approvalSha256) throw Error('批准收据变化');
    if (fileSha(planFile) !== planSha256 || fileSha(panelFile) !== plan.developmentPanelSha256 || fileSha(path.join(HERE, 'DEV_SUBSET.json')) !== plan.subsetSha256 || fileSha(path.join(S3, 'DEV_INITIAL_MANIFEST.json')) !== initialManifestSha256 || initial.panelSha256 !== plan.developmentPanelSha256 || fileSha(path.join(HERE, 'PRESERVED_INTERRUPTION_V4.json')) !== plan.preservationSha256) throw Error('接续合同、开发初态清单或面板变化');
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
    return { id: config.id, config, directory: output, sources: directories.slice(), scores: scores(summary.games), games: summary.games, telemetry: await telemetryAudit(output, 'GPU_BATCH_PARITY_RESUME_V4.json') };
}
async function main() {
    validate();
    if (fs.existsSync(path.join(HERE, 'RECOVERY_RUN_STARTED_V4.json'))) throw Error('本接续控制器不可重复启动');
    if (fs.existsSync(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')) || fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'))) throw Error('已锁定或已占用封存，禁止重复运行');
    await save(path.join(HERE, 'RECOVERY_RUN_STARTED_V4.json'), { pid: process.pid, started: new Date().toISOString(), planSha256, initialManifestSha256, runtime, retainedGames: 57, sealedAccess: 0 }, true);
    const checks = [];
    for (const [name, cmd] of [['recovery-types', 'npx tsc --noEmit -p ai_training/continuation_review_20261030/stage4/tsconfig.json'], ['recovery-contracts', 'npx vitest run --config ai_training/continuation_review_20261030/stage4/vitest.config.mjs']]) checks.push(await command(name, 'powershell.exe', ['-NoProfile', '-Command', `${cmd}; exit $LASTEXITCODE`]));
    await save(path.join(HERE, 'RECOVERY_CHECKS_V4.json'), { passed: true, runtimeSha256: runtime.sha256, results: checks, publicChecksReused: 'PUBLIC_CHECKS_RESUME_V4.json', publicGameSourcesUnchanged: true }, true);
    const diagnostic = read(path.join(HERE, 'DEV_ENGINEERING_CHECK_V4.json'));
    if (diagnostic.telemetry.substantiveRate <= .9 || diagnostic.telemetry.timeForfeits || diagnostic.telemetry.invalidTeacher || !diagnostic.gpuExited) throw Error('三个独立工程验证局未通过原门槛');
    const screen = read(path.join(HERE, 'DEV_ABLATION_PRESERVED_V4.json')).groups;
    const config = plan.configs.find((c: any) => c.id === 'maxn-prior035');
    const winner = { id: config.id, config, sources: plan.sourcesByConfig[config.id] };
    const recorded = collectRecordedGames(winner.sources, config.sha256, panel, plan.model.binSha256);
    const pendingIds = remainingMatches(panel.matches, recorded).map((m: any) => m.id);
    if (JSON.stringify(pendingIds) !== JSON.stringify(plan.approvedRemainingIds) || pendingIds.length !== 13 || recorded.size !== 41) throw Error('实际已记录41局/未启动13局与批准方案不符');
    await save(path.join(HERE, 'DEV_RECOVERY_SELECTION_V4.json'), { selected: winner.id, originalScreenPassed: false,
        basis: '用户明确批准新资格方案：原18局失败不追改，修复后三个未评局通过原门槛后补33局；完整54局仍须通过原门槛',
        approvalSha256: plan.approvalSha256, diagnosticSha256: fileSha(path.join(HERE, 'DEV_ENGINEERING_CHECK_V4.json')), sealedAccess: 0, noRecordedMatchesRerun: true }, true);
    const full: any = await devGroup(winner.config, panel.matches, 'recovery-v4-full-' + winner.id, winner.sources.slice());
    full.telemetry.incompleteGameIds = full.games.filter((g: any) => g.telemetryIncomplete).map((g: any) => g.id);
    full.telemetry.completeCoverage = full.telemetry.incompleteGameIds.length === 0;
    await save(path.join(HERE, 'DEV_ABLATION_SUMMARY.json'), { screen, selected: winner.id, fullDevelopment: full.scores, fullDevelopmentDirectory: full.directory,
        utilityAblation: pairedComparison(screen.find(r => r.id === 'margin-prior1')!.games, screen.find(r => r.id === 'maxn-prior1')!.games),
        priorAblation: pairedComparison(screen.find(r => r.id === 'maxn-prior1')!.games, screen.find(r => r.id === 'maxn-prior035')!.games), fullDevelopmentTelemetry: full.telemetry,
        noRecordedMatchesRerun: true, runtimeMixtureDisclosure: plan.runtimeMixtureDisclosure, sealedPanelAccessBeforeLock: 0 }, true);
    if (!full.telemetry.completeCoverage || full.telemetry.substantiveRate <= .9 || full.telemetry.timeForfeits || full.telemetry.invalidTeacher) {
        const rejected = { status: 'development_gate_rejected', fullDevelopment: full.scores, telemetry: full.telemetry, finalTestStarted: false, candidateLocked: false, originalThresholdsUnchanged: true, childrenRemaining: active.size, finished: new Date().toISOString() };
        await save(path.join(HERE, 'DEVELOPMENT_GATE_REJECTED_V4.json'), rejected, true);
        await save(path.join(HERE, 'SEARCH_TELEMETRY_AUDIT.json'), { development: full.telemetry, sealed: null, historical: null, reason: '完整54局包含遥测缺失的工程中断，不能证明原门槛，未锁定及未访问封存' }, true);
        await saveText(path.join(HERE, 'REPORT.md'), `# 第四阶段完整开发评测：未获最终验收资格

原21局复用，原追加19局完成、1局工程中断保留，另13个未启动局已补齐；原失败不变，未训练、未替换默认模型。完整54局健康门槛未通过，唯一锁定、历史40局及封存54局均未执行。

遥测不完整局：${JSON.stringify(full.telemetry.incompleteGameIds)}。原压缩日志尾部缺失，以下仅为已保存根的观测比例，不能证明全量门槛，故不得锁定或访问封存。

观测实质比较率：${full.telemetry.substantiveRate}（要求严格>0.9）；时间判负：${full.telemetry.timeForfeits}（要求0）；非法教师：${full.telemetry.invalidTeacher}（要求0）。

等权保守独胜率：${full.scores.equalWin}；等权保守排名：${full.scores.equalRank}。自然与非自然结果、配对消融及分人数指标见DEV_ABLATION_SUMMARY.json。旧18局与新36局的运行时混合已披露，不将旧失败改称新版本成功。

工程、逐值等价检查和敌方响应模型偏差诊断见REVISION_V4_REPORT.md；本次完整公共检查见PUBLIC_CHECKS_RESUME_V4.json，GPU一致性见GPU_BATCH_PARITY_RESUME_V4.json。最终验收未完成，不能根据未访问的封存推断提升。全部本次评测子进程已退出，不进入第五阶段。
`, true);
        await save(path.join(HERE, 'PROGRESS.json'), { stage: 'development_gate_rejected', completed: false, sealedAccess: 0 });
        await evidence(); console.log(JSON.stringify(rejected)); return;
    }
    validate(); const options = read(path.join(HERE, winner.config.file));
    await save(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json'), { schema: 'stage4-unique-omni-search-v4', locked: new Date().toISOString(), selectedId: winner.id,
        modelSha256: plan.model.binSha256, metadataSha256: plan.model.metadataSha256, modelPrefix: plan.model.prefix, options, configFile: winner.config.file, configSha256: winner.config.sha256,
        runtimeSha256: runtime.sha256, sources: runtime.files, developmentSha256: fileSha(path.join(HERE, 'DEV_ABLATION_SUMMARY.json')), sealedPanelAccessBeforeLock: 0, sealedForwardsBeforeLock: 0, finalTestAttempts: 1, noRetuningAfterLock: true }, true);
    await save(path.join(HERE, 'OMNI_SEARCH_MANIFEST.json'), { schema: 'stage4-search-teacher-v4', name: 'Omni-Search', model: plan.model, options, runtimeSha256: runtime.sha256,
        lockSha256: fileSha(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')), output: { available: '仅available=true可用于蒸馏', actionCodes: '根权威非投降合法动作码', qValues: '完整post_response的保守Q，未完成为null', evaluatedMask: '是否有完整反扑Q', vetoMask: '是否被完整安全替代方案否决', probabilities: '可用Q的温度softmax，和为1；不可用根为显式缺失零向量', value: '可用根Q最大值，缺失为null' },
        firstUnitOnly: true, deadlines: { nominalBudgetMs: options.budgetMs, softCutoff: '根预算减75ms，仅停止扩展且排空迟到包', transportWatchdogMs: 10000, actualTimeForfeit: '只按冻结面板maxDecisionMs实际超限判定' },
        responsePolicy: { perspective: '敌席自身视角', responseActors: options.responseActors, cohortSize: options.responseCohortSize, deferredCandidatesNotEvaluated: true }, deployAutomatically: false, trainingUpdates: 0 }, true);
    await arena('historical-final', winner.config, 'historical');
    validate();
    const attempt = { schema: 'stage4-single-sealed-attempt-v4', started: new Date().toISOString(), lockSha256: fileSha(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')), candidates: 1, games: 54 };
    await save(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'), attempt, true); await save(path.join(DATA, 'FINAL_TEST_ATTEMPT.json'), attempt, true);
    await arena('test-final', winner.config, 'test');
    validate(); await deliver({ planFile: 'RESUME_V4_RECOVERY_FINAL_PLAN.json', checksFile: 'PUBLIC_CHECKS_RESUME_V4.json', parityFile: 'GPU_BATCH_PARITY_RESUME_V4.json' });
    if (active.size) throw Error('仍有子进程未退出');
    await save(path.join(HERE, 'PRESERVED_GAMES_FINAL_V4.json'), { passed: true, checkedFiles: Object.keys(preservation.files).length, retainedGames: 57, noRecordedMatchesRerun: true }, true);
    const closed = { status: 'complete', finished: new Date().toISOString(), controllerPid: process.pid, evaluationChildrenRemaining: 0, inferenceChildrenRemaining: 0, finalTestRuns: 1, retainedGames: 57, noTrainingUpdates: true, completedJobs };
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
