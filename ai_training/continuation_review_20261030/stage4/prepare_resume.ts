/** 冻结不重跑接续清单，既有自然、截断和失败结果全部占用原局号。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, S3, DATA, read, save, fileSha, modelIdentity } from './io';
import { collectRecordedGames, remainingMatches, preservationFiles } from './resume_records';

if (fs.existsSync(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')) || fs.existsSync(path.join(HERE, 'FINAL_TEST_ATTEMPT.json'))) throw Error('锁定或封存已启动，禁止按开发接续入口回调');
if (!read(path.join(HERE, 'GPU_TIMEOUT_REPAIR_CHECK.json')).passed) throw Error('真实GPU修复检查未通过');
const original = read(path.join(HERE, 'PLAN_V2.json')), model = modelIdentity();
const panelFile = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), raw = read(panelFile), initial = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
if (fileSha(panelFile) !== initial.panelSha256) throw Error('开发初态面板身份变化');
const panel = { ...raw, slots: initial.slots }, ids = read(path.join(HERE, 'DEV_SUBSET.json')).ids;
const sources: Record<string, string[]> = {}, pending: Record<string, string[]> = {}, retained: any[] = [], files: Record<string, string> = {};
for (const config of original.configs) {
    sources[config.id] = [path.join(DATA, 'dev-v2-screen-' + config.id)];
    const records = collectRecordedGames(sources[config.id], config.sha256, panel, model.binSha256);
    pending[config.id] = remainingMatches(panel.matches.filter((m: any) => ids.includes(m.id)), records).map((m: any) => m.id);
    Object.assign(files, preservationFiles(records));
    retained.push({ id: config.id, games: [...records.values()].map(r => ({ id: r.game.id, classification: r.game.classification, directory: r.directory, resultSha256: r.resultSha256 })) });
}
if (retained.reduce((n, r) => n + r.games.length, 0) !== 28) throw Error('接续基线不再是核定的28条结果，需要重新审计');
await save(path.join(HERE, 'PRESERVED_GAMES_V3.json'), { created: new Date().toISOString(), retained, files, retainedCount: 28, failureRetried: false }, true);
await save(path.join(HERE, 'GPU_TIMEOUT_DIAGNOSIS.json'), { created: new Date().toISOString(),
    originalFailure: { file: path.join(DATA, 'dev-v2-screen-maxn-prior1/p3-12-s0/result.json'), sha256: fileSha(path.join(DATA, 'dev-v2-screen-maxn-prior1/p3-12-s0/result.json')), classificationUnchanged: 'time_forfeit' },
    confirmedCause: '旧桥把单根搜索剩余预算作为IPC硬超时，截止时杀死常驻服务；搜索层未捕获预算耗尽，评测器按字符串把它当作整局时间判负并退出。',
    uncertainty: '原故障未记录最后一请求的batch、打包和GPU耗时，无法据此证明GPU硬件挂死或精确还原慢请求耗时。',
    repair: ['纯运行时类型化软截止，保留已完成合法分支，迟到结果不进入缓存或教师Q', '桥接层保持单在途请求，迟到包排空后再发下一包，独立10秒看门狗只处理真正服务无响应', '记录请求编号、原根标签、batch、字节和耗时，避免后续定位缺信息', '保留旧time_forfeit原记录；新time_forfeit只由面板maxDecisionMs实际超限触发，传输故障单列runtime_error', '失败局不重试；真实传输故障后只为下一未评局重建服务'],
    configHyperparametersChanged: false, weightsChanged: false, checks: 'GPU_TIMEOUT_REPAIR_CHECK.json与协议延迟/串包/看门狗回归', sealedAccess: 0 }, true);
await save(path.join(HERE, 'RESUME_V3_PLAN.json'), { ...original, schema: 'stage4-no-replay-resume-v3', created: new Date().toISOString(),
    originalPlanSha256: fileSha(path.join(HERE, 'PLAN_V2.json')), preservationSha256: fileSha(path.join(HERE, 'PRESERVED_GAMES_V3.json')),
    sourcesByConfig: sources, pendingIds: pending, retainedGames: 28, remainingScreenGames: Object.values(pending).reduce((n, a) => n + a.length, 0),
    fullDevelopmentPolicy: '复用优胜配置已记录的18局预筛，仅补36局构成完整54局，不重跑已评初态；失败与截断同样保留',
    runtimeMixtureDisclosure: '开发预筛混合修复前后运行时，按局记录来源；不能把差异单独解释为效用或先验的因果收益。最终封存统一使用锁定后的新运行时。',
    scoring: '既有失败原始分留空，保守计0与[0,1]界限不变；不将失败改成自然输赢，不用成功冒烟替换失败实战',
    sealedPanelAccessBeforeLock: 0, noModelTraining: true }, true);
console.log(JSON.stringify({ retained: 28, remaining: pending, sealedAccess: 0 }));
