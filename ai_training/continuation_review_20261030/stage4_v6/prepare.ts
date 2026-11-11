import fs from 'node:fs';
import path from 'node:path';
import { HERE, S3, DATA, modelIdentity, fileSha, read, save } from './io';
import { runtimeIdentity } from './runtime_identity';

if (fs.existsSync(path.join(HERE, 'PLAN.json'))) throw Error('V6计划已冻结，不可覆盖');
if (!read(path.join(HERE, 'PUBLIC_CHECKS.json')).passed || !read(path.join(HERE, 'GPU_BATCH_PARITY.json')).passed) throw Error('前置门禁未通过');
const model = modelIdentity();
const base = { modelVersion: model.binSha256, budgetMs: 3000, maxNodes: 5000, finalists: 8, rootCandidates: 8,
    maxUnits: 1, responseVariants: 1, responseUnits: 128, responseActors: 3, responseCohortSize: 4,
    responseLightUnitThreshold: 16, maxBatchSize: 128, ownFraction: .25, ownTurnRollout: true,
    ownRolloutPriorScale: 1, ownRolloutMaxChains: 64, enemyPriorScale: 1, priorTemperature: 4,
    candidateMaxGap: 20, teacherTemperature: .15, antiLeaderBeta: .25, leafMode: 'post_response' };
const configs = [
    { id: 'C1', valueMode: 'maxn_ffa', priorScale: 1, priorAnchor: .1 },
    { id: 'C2', valueMode: 'maxn_ffa', priorScale: .7, priorAnchor: .04 },
    { id: 'C3', valueMode: 'zero_sum_margin', priorScale: 1, priorAnchor: .1 }
];
for (const { id, ...options } of configs) await save(path.join(HERE, `config-${id}.json`), { ...base, ...options }, true);
const preserved = read(path.join(HERE, 'HISTORICAL_PRESERVED.json'));
for (const [file, digest] of Object.entries(preserved)) if (fileSha(file) !== digest) throw Error('历史文件变化：' + file);
await save(path.join(HERE, 'PLAN.json'), { schema: 'stage4-v6-preregistered', model, data: DATA, configs,
    runtime: runtimeIdentity(), preserved, subsetSha256: fileSha(path.join(HERE, 'DEV_SUBSET.json')),
    panelSha256: fileSha(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')),
    configHashes: Object.fromEntries(configs.map(c => [c.id, fileSha(path.join(HERE, `config-${c.id}.json`))])),
    created: new Date().toISOString(), trainingUpdates: 0, sealedAccess: 0, noProgressSeconds: 180, wallSeconds: 7200,
    developmentConcurrency: 1, responseTailReserveMs: 450, sourceMixingAllowed: false,
    gate1: 'C1完整18局健康通过后执行C2/C3；只在健康通过的C1/C2中按equalRank、equalWin、健康率、C1顺序选优',
    gate2: '复用同哈希Dev18收据，只补36局；健康与棋力双门禁全部通过才锁定唯一候选',
    gate3: '唯一封存令牌；逐局收据只允许同一次尝试内接续，不覆盖或重跑已有异常目录',
    completeMeans: '完整记录全部冻结局及根遥测；自然结果、环境截断与运行错误分别记录',
    baselineDev54: { equalWin: .3468, equalRank: .4903, wins: { 2: 9, 3: 5, 4: 5 } },
    finalTestAttempts: 1, bootstrapSamples: 10000, bootstrapSeed: 20261101 }, true);
