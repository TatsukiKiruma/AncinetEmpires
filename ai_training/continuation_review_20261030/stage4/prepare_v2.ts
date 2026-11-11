/** 首轮整盘开发诊断后的工程修订预注册；封存仍未访问，旧尝试与源码快照保留。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, DATA, read, save, fileSha } from './io';
const original = read(path.join(HERE, 'PLAN.json')), healthFile = path.join(DATA, 'response-health-v4/SUMMARY.json');
if (!fs.existsSync(healthFile) || read(healthFile).substantiveRate < .9) throw Error('复杂开发前态的实质比较率门槛未通过');
if (fs.existsSync(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json'))) throw Error('锁定后禁止工程回调');
const configs = [];
for (const old of original.configs) {
    const file = `config-v2-${old.id}.json`, config = { ...read(path.join(HERE, old.file)), responseUnits: 128, responseActors: 2, responseCohortSize: 2, responseLightUnitThreshold: 8 };
    await save(path.join(HERE, file), config, true); configs.push({ id: old.id, file, sha256: fileSha(path.join(HERE, file)) });
}
await save(path.join(HERE, 'ENGINEERING_REVISION_V2.json'), { created: new Date().toISOString(), stage4SealedAccess: 0,
    reason: '首轮整盘开发冒烟的实质比较率仅0.79%，不合格；首个控制组已开始44步，在工程停止时终止，不进入消融评分。',
    rawStoppedClassification: 'user_stop为原runner统一停止标记；本次由代理工程诊断主动触发，不是用户撤销第四阶段授权',
    oldSmoke: path.join(DATA, 'dev-smoke-v1'), interruptedControl: path.join(DATA, 'dev-screen-margin-prior1'),
    oldSourceSnapshot: path.join(HERE, 'revisions/response-health-v1'),
    changes: ['复杂盘面响应按两个决赛候选组成的小波次依次闭合，未启动候选明确计为cohort_deferred', '响应移动行动者按敌席自身网络预筛，保留所有即时非移动战术、招募与城堡相关行动者；候选池内严格使用logits+priorScale*softPriors', '独立记录完整与延迟分支，不把缩小响应池伪称为全菜单最优', '修复权威引擎自动跳过无行动己方回合时的cycle误判', '先验计算保留截止余量，敌方链上限128'],
    health: { file: healthFile, sha256: fileSha(healthFile), substantiveRate: read(healthFile).substantiveRate },
    sourcesChangedBeforeLockOnly: true, automaticSealedRetries: 0 }, true);
await save(path.join(HERE, 'PLAN_V2.json'), { ...original, schema: 'stage4-preregistered-engineering-v2', started: new Date().toISOString(), configs,
    originalPlanSha256: fileSha(path.join(HERE, 'PLAN.json')), revisionSha256: fileSha(path.join(HERE, 'ENGINEERING_REVISION_V2.json')),
    smokeDirectory: path.join(DATA, 'dev-smoke-v2'), preSealHealthGate: { substantiveRateMinExclusive: .9, timeForfeits: 0, invalidTeacher: 0 },
    noModelTraining: true, sealedPanelAccessBeforeLock: 0 }, true);
console.log(JSON.stringify({ prepared: true, configs, sealedAccess: 0 }));
