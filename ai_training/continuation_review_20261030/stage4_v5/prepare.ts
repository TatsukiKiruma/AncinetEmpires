import fs from 'node:fs';
import path from 'node:path';
import { HERE, S3, DATA, modelIdentity, fileSha, read, save } from './io';
import { runtimeIdentity } from './runtime_identity';

const model = modelIdentity();
if (!read(path.join(HERE, 'GPU_BATCH_PARITY.json')).passed) throw Error('GPU精度门禁失败');
if (!read(path.join(HERE, 'PUBLIC_CHECKS.json')).passed) throw Error('前置检查门禁失败');
const base = { modelVersion: model.binSha256, budgetMs: 3000, maxNodes: 5000, finalists: 8,
    rootCandidates: 8, maxUnits: 1, responseVariants: 1, responseUnits: 128, responseActors: 4, maxBatchSize: 128,
    ownFraction: .25, ownTurnRollout: true, ownRolloutPriorScale: 1, ownRolloutMaxChains: 24, enemyPriorScale: 1,
    priorTemperature: 4, candidateMaxGap: 20, teacherTemperature: .15, antiLeaderBeta: .25, leafMode: 'post_response' };
const configs = [
    { id: 'C1', priorScale: 1, priorAnchor: .1, valueMode: 'maxn_ffa' },
    { id: 'C2', priorScale: .7, priorAnchor: .04, valueMode: 'maxn_ffa' },
    { id: 'C3', priorScale: 1, priorAnchor: .1, valueMode: 'zero_sum_margin' }
];
for (const { id, ...options } of configs) await save(path.join(HERE, `config-${id}.json`), { ...base, ...options }, true);
const old = path.join(HERE, '../stage4'), preserved: Record<string, string> = {};
function snapshot(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) snapshot(file); else if (entry.isFile()) preserved[file] = fileSha(file);
    }
}
snapshot(old);
await save(path.join(HERE, 'PLAN.json'), { schema: 'stage4-v5-frozen', model, data: DATA, configs,
    runtime: runtimeIdentity(), preserved, subsetSha256: fileSha(path.join(HERE, 'DEV_SUBSET.json')),
    panelSha256: fileSha(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')),
    configHashes: Object.fromEntries(configs.map(c => [c.id, fileSha(path.join(HERE, `config-${c.id}.json`))])),
    trainingUpdates: 0, sealedAccess: 0, variantsByPlayers: { 2: 2, 3: 1, 4: 1 },
    baseline18: { equalWin: 2 / 9, equalRank: .4630 }, baseline54: { equalWin: .3468, equalRank: .4903, wins: [9, 5, 5] },
    stopOnScreenHealthFailure: true, selection: '三组健康均过关后按equalRank、equalWin、配置顺序选优；未达门禁立即停止',
    resume: '仅复用具有完整不可变SHA收据的已完成局；异常或未完整落盘局不重跑', created: new Date().toISOString() }, true);
