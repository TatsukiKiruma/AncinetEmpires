/** 固定预算串行控制器：开发预筛→完整开发→唯一锁定→历史40→唯一封存54→审计与停机。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { HERE, ROOT, S3, DATA, read, save, saveText, fileSha, modelIdentity } from './io';
import { scores, pairedComparison, telemetryAudit, evidence } from './analysis';
import { deliver } from './report';

const active = new Map<number, ChildProcess>();
const plan = read(path.join(HERE, 'PLAN_V2.json')), logRoot = path.join(DATA, 'logs-v2');
const planSha256 = fileSha(path.join(HERE, 'PLAN_V2.json'));
fs.mkdirSync(logRoot, { recursive: true });
function sources() {
    const result: Record<string, string> = {};
    function visit(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (!['__pycache__', 'revisions'].includes(entry.name)) visit(file); }
            else if (/\.(ts|tsx|py)$/.test(entry.name)) result[path.relative(ROOT, file)] = fileSha(file);
        }
    }
    visit(path.join(ROOT, 'src/ai_runtime')); visit(path.join(ROOT, 'src/game')); visit(HERE);
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'ai_training/gpu/common.py', 'ai_training/gpu/data.py', 'ai_training/expert_iteration_2m_20261022/model.py', 'ai_training/dual_stream_v2_phase2_20261020/accurate_ops.py', 'ai_training/dual_stream_v2_phase1_20261020/tensor_bridge.ts', 'ai_training/continuation_review_20261030/stage3/ragged_batch.py', 'ai_training/continuation_review_20261030/stage3/ragged_map.py']) result[file] = fileSha(path.join(ROOT, file));
    return result;
}
const frozen = sources();
function validate() {
    const model = modelIdentity();
    if (model.binSha256 !== plan.model.binSha256 || model.metadataSha256 !== plan.model.metadataSha256) throw Error('基座权重或元数据变化');
    if (fileSha(path.join(HERE, 'PLAN_V2.json')) !== planSha256 || fileSha(path.join(HERE, 'DEV_SUBSET.json')) !== plan.subsetSha256 || fileSha(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')) !== plan.developmentPanelSha256) throw Error('冻结开发计划、子集或面板变化');
    for (const [file, digest] of Object.entries(frozen)) if (fileSha(path.join(ROOT, file)) !== digest) throw Error('本次执行中源码变化：' + file);
    for (const [file, digest] of Object.entries(plan.preserved)) if (fileSha(path.join(HERE, '..', file)) !== digest) throw Error('历史冻结交付变化：' + file);
    for (const config of plan.configs) if (fileSha(path.join(HERE, config.file)) !== config.sha256) throw Error('预注册搜索参数变化');
    if (fs.existsSync(path.join(HERE, 'STOP'))) throw Error('存在用户停止标志');
}
function ledger(value: unknown) { fs.appendFileSync(path.join(DATA, 'PROCESS_LEDGER.jsonl'), JSON.stringify(value) + '\n'); }
async function command(name: string, binary: string, args: string[]) {
    validate();
    const stdout = path.join(logRoot, name + '.stdout.log'), stderr = path.join(logRoot, name + '.stderr.log');
    const outFd = fs.openSync(stdout, 'wx'), errFd = fs.openSync(stderr, 'wx'), started = Date.now();
    const child = spawn(binary, args, { cwd: ROOT, stdio: ['ignore', outFd, errFd], windowsHide: true });
    if (child.pid) active.set(child.pid, child);
    ledger({ name, event: 'start', pid: child.pid, at: new Date().toISOString(), binary, args });
    let exitCode: number | null = null;
    try {
        exitCode = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => signal ? reject(Error(`${name}被信号终止：${signal}`)) : resolve(code ?? -1)); });
    } finally {
        if (child.pid) active.delete(child.pid); fs.closeSync(outFd); fs.closeSync(errFd);
        ledger({ name, event: 'exit', pid: child.pid, exitCode, at: new Date().toISOString() });
    }
    const result = { name, exitCode, seconds: (Date.now() - started) / 1000, stdout, stderr };
    await save(path.join(logRoot, name + '.json'), result, true);
    if (exitCode !== 0) throw Error(`${name}失败，exit=${exitCode}，日志${stderr}`);
    return result;
}
async function arena(name: string, config: any, split: string, subset = false) {
    const output = path.join(DATA, name), configFile = path.join(HERE, config.file);
    const args = ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'arena.ts'), configFile, output, split];
    if (subset) args.push(path.join(HERE, 'DEV_SUBSET.json'));
    await save(path.join(HERE, 'PROGRESS.json'), { stage: name, started: new Date().toISOString(), pid: process.pid, completed: false, finalTestStarted: fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json')) });
    await command(name, process.execPath, args);
    const result = read(path.join(output, 'SUMMARY.json'));
    if (!result.complete || !result.gpuExited || result.configSha256 !== config.sha256) throw Error('实战合同或推理退出见证不完整');
    return result;
}

async function main() {
    validate();
    if (fs.existsSync(path.join(HERE, 'RUN_STARTED_V2.json'))) throw Error('本控制器不允许重复启动或自动重跑已有实验');
    await save(path.join(HERE, 'RUN_STARTED_V2.json'), { pid: process.pid, started: new Date().toISOString(), planSha256, sources: frozen, trainingUpdates: 0 }, true);
    // 先等独立冒烟局收尾，正式测量不与调试GPU进程争用硬件。
    const smoke = plan.smokeDirectory, gateStart = performance.now();
    while (!fs.existsSync(path.join(smoke, 'SUMMARY.json'))) {
        const resultFile = path.join(smoke, 'p3-12-s0/result.json');
        if (fs.existsSync(resultFile) && read(resultFile).error) throw Error('冒烟实战失败，禁止正式调度');
        if (performance.now() - gateStart > 1920000) throw Error('冒烟收尾等待超过冻结单局墙钟加清理上限');
        validate(); await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const smokeHealth = await telemetryAudit(smoke);
    await save(path.join(HERE, 'SMOKE_V2_HEALTH.json'), smokeHealth, true);
    if (smokeHealth.substantiveRate <= .9 || smokeHealth.timeForfeits || smokeHealth.invalidTeacher) throw Error('整盘开发冒烟搜索健康度门槛未通过，禁止正式消融与封存');
    await command('gpu-parity-final', process.execPath, ['ai_training/run.mjs', 'node', '--import', 'tsx', path.join(HERE, 'parity.ts'), 'GPU_BATCH_PARITY_V2.json']);
    const checks = [];
    for (const [name, cmd] of [['public-lint', 'npm run lint'], ['public-test', 'npm test'], ['public-build', 'npm run build'], ['stage4-types', 'npx tsc --noEmit -p ai_training/continuation_review_20261030/stage4/tsconfig.json'], ['analysis-contract', 'node ai_training/run.mjs node --import tsx continuation_review_20261030/stage4/check_analysis.ts ANALYSIS_CONTRACT_CHECK_V2.json']]) checks.push(await command(name, 'powershell.exe', ['-NoProfile', '-Command', `${cmd}; exit $LASTEXITCODE`]));
    checks.push(await command('windows-io-retry', path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe'), ['-X', 'utf8', path.join(HERE, 'check_io.py'), '--v2']));
    await save(path.join(HERE, 'PUBLIC_CHECKS_V2.json'), { passed: true, results: checks, sourcesSha256: fileSha(path.join(HERE, 'RUN_STARTED_V2.json')), finished: new Date().toISOString() }, true);
    const screen = [];
    // 旧效用只作对照，最终在Max^n的两个先验尺度中选择；在任何受控开发成绩产生前固定。
    await save(path.join(HERE, 'CANDIDATE_ELIGIBILITY_V2.json'), { finalEligible: ['maxn-prior1', 'maxn-prior035'], controlOnly: ['margin-prior1'], reason: '本阶段交付要求多人Max^n自利效用，旧效用用于受控消融；控制组若更强仍如实报告', sealedAccess: 0, healthGate: '最终配置的开发实质比较率必须>90%，无时间判负或非法教师分布' }, true);
    for (const config of plan.configs) {
        const result = await arena('dev-v2-screen-' + config.id, config, 'dev', true);
        screen.push({ id: config.id, config, scores: scores(result.games), games: result.games, telemetry: await telemetryAudit(path.join(DATA, 'dev-v2-screen-' + config.id)) });
        await save(path.join(DATA, 'DEV_SCREEN_COMPLETED_V2.json'), { completed: screen.map(r => ({ id: r.id, scores: r.scores })), planned: plan.configs.map((c: any) => c.id) });
    }
    const eligible = screen.filter(r => r.id.startsWith('maxn-') && r.telemetry.substantiveRate > .9 && !r.telemetry.timeForfeits && !r.telemetry.invalidTeacher);
    if (!eligible.length) throw Error('Max^n开发配置均未通过搜索健康门槛；禁止锁定和触碰封存');
    const ordered = eligible.slice().sort((a, b) => Number(b.scores.allNatural) - Number(a.scores.allNatural) || b.scores.equalRank - a.scores.equalRank || b.scores.equalWin - a.scores.equalWin ||
        a.games.filter((r: any) => r.eliminatedBeforeFinalOpponent).length - b.games.filter((r: any) => r.eliminatedBeforeFinalOpponent).length || plan.configs.findIndex((c: any) => c.id === a.id) - plan.configs.findIndex((c: any) => c.id === b.id));
    const winner = ordered[0];
    await save(path.join(HERE, 'DEV_SCREEN_SELECTION.json'), { selected: winner.id, ordering: ordered.map(r => r.id), scores: screen.map(r => ({ id: r.id, scores: r.scores })), sealedAccess: 0 }, true);
    const full = await arena('dev-v2-full-selected', winner.config, 'dev');
    const fullTelemetry = await telemetryAudit(path.join(DATA, 'dev-v2-full-selected'));
    await save(path.join(HERE, 'DEV_ABLATION_SUMMARY.json'), { screen, selected: winner.id, fullDevelopment: scores(full.games),
        utilityAblation: pairedComparison(screen.find(r => r.id === 'margin-prior1')!.games, screen.find(r => r.id === 'maxn-prior1')!.games),
        priorAblation: pairedComparison(screen.find(r => r.id === 'maxn-prior1')!.games, screen.find(r => r.id === 'maxn-prior035')!.games),
        fullDevelopmentTelemetry: fullTelemetry, sealedPanelAccessBeforeLock: 0, optional80kRun: false }, true);
    if (fullTelemetry.substantiveRate <= .9 || fullTelemetry.timeForfeits || fullTelemetry.invalidTeacher) throw Error('完整开发搜索健康门槛未通过；禁止最终锁定与封存');
    validate();
    const options = read(path.join(HERE, winner.config.file));
    await save(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json'), { schema: 'stage4-unique-omni-search-v1', locked: new Date().toISOString(), selectedId: winner.id, modelSha256: plan.model.binSha256,
        metadataSha256: plan.model.metadataSha256, modelPrefix: plan.model.prefix, options, configFile: winner.config.file, configSha256: winner.config.sha256,
        sources: frozen, developmentSha256: fileSha(path.join(HERE, 'DEV_ABLATION_SUMMARY.json')), sealedPanelAccessBeforeLock: 0, sealedForwardsBeforeLock: 0, finalTestAttempts: 1, noRetuningAfterLock: true }, true);
    await save(path.join(HERE, 'OMNI_SEARCH_MANIFEST.json'), { schema: 'stage4-search-teacher-v1', name: 'Omni-Search', model: plan.model, lockSha256: fileSha(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')), options,
        output: { available: '是否有完整反扑根Q；训练必须只消费available=true', actionCodes: '根非投降权威合法菜单的encodeAction代码', qValues: '完整反扑Q；未完成为null；同动作多个有效计划取最高保守值', evaluatedMask: '是否具有完整post_response结果', vetoMask: '是否全部完整计划均被安全替代方案否决', probabilities: '已评估且未否决Q的温度softmax；教师可用时和为1', value: '完整根Q的最大保守值，缺失为null', missing: '完全无完整Q时零向量表示教师不可用，训练必须过滤，不能作为概率标签', temperature: options.teacherTemperature },
        firstUnitOnly: true, responsePolicy: { perspective: '当前敌席自身观测', proposal: '自身网络预筛移动行动者，保留即时非移动战术、招募、城堡相关行动者；候选内按logits+priorScale*softPriors排序', responseActors: options.responseActors, cohortSize: options.responseCohortSize, deferredCandidatesNotEvaluated: true, horizon: '己方下一次轮回，包含权威引擎自动跳过无行动己方的情况' },
        deadlineContract: '与旧同步类一致，20至4000ms；本配置3000ms，GPU IPC按根绝对截止硬终止，超时单列且停止后续调度', deployAutomatically: false, trainingUpdates: 0 }, true);
    await arena('historical-final', winner.config, 'historical');
    validate();
    const attempt = { schema: 'stage4-single-sealed-attempt-v1', started: new Date().toISOString(), lockSha256: fileSha(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')), candidates: 1, games: 54, sourceChecksPassed: true };
    await save(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'), attempt, true); await save(path.join(DATA, 'FINAL_TEST_ATTEMPT.json'), attempt, true);
    await arena('test-final', winner.config, 'test');
    validate(); await deliver();
    if (active.size) throw Error('仍有控制器子进程存活');
    const arenas = [...plan.configs.map((c: any) => 'dev-v2-screen-' + c.id), 'dev-v2-full-selected', 'historical-final', 'test-final'].map(name => ({ name, gpuPid: read(path.join(DATA, name, 'SUMMARY.json')).gpuPid, exited: read(path.join(DATA, name, 'SUMMARY.json')).gpuExited }));
    const closed = { status: 'complete', finished: new Date().toISOString(), pid: process.pid, evaluationChildrenRemaining: active.size, inferenceChildrenRemaining: arenas.filter(r => !r.exited).length, arenas, finalTestRuns: 1, noTrainingUpdates: true };
    await save(path.join(HERE, 'RUN_CLOSED.json'), closed, true); await save(path.join(DATA, 'RUN_CLOSED.json'), closed, true);
    await save(path.join(HERE, 'PROGRESS.json'), { stage: 'complete', completed: true, report: path.join(HERE, 'REPORT.md'), finished: new Date().toISOString() });
    await evidence(); console.log(JSON.stringify(closed));
}
try { await main(); }
catch (error) {
    for (const child of active.values()) child.kill();
    await save(path.join(HERE, `RUN_FAILURE_${Date.now()}.json`), { error: String(error), at: new Date().toISOString(), pid: process.pid, children: [...active.keys()], finalTestStarted: fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json')), noRetry: true }, true);
    await saveText(path.join(HERE, `INCOMPLETE_${Date.now()}.md`), `# 第四阶段执行未完成\n\n${String(error)}\n\n保留全部已完成与失败证据；没有自动重试封存或更换配置。查看D盘logs与RUN_FAILURE。\n`, true);
    process.exitCode = 1; console.error(error);
}
