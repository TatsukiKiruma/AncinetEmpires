/** 开发消融预注册；不读取封存面板或封存初态。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, ROOT, S3, DATA, read, save, fileSha, modelIdentity } from './io';

if (fs.existsSync(path.join(HERE, 'PLAN.json'))) throw Error('开发计划已冻结，不可覆盖');
if (!read(path.join(HERE, 'GPU_BATCH_PARITY.json')).passed) throw Error('GPU数值门槛未通过');
const model = modelIdentity(), panelFile = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), panel = read(panelFile);
const ids = panel.matches.filter((m: any) => [0, 8, 9, 10, 12].includes(m.slot) || [16, 18].includes(m.slot) && m.seat < 3).map((m: any) => m.id);
if (ids.length !== 18) throw Error('预筛子集必须为固定18局');
await save(path.join(HERE, 'DEV_SUBSET.json'), { schema: 'stage4-stratified-dev18-v1', panelSha256: fileSha(panelFile), ids,
    players: { 2: 6, 3: 6, 4: 6 }, selection: '预注册固定槽；2P正常/多单位/技能，3P与4P正常/优势残局；4P每槽先三席，最终完整开发和封存覆盖全部席位', sealedAccess: 0 }, true);
const base = { modelVersion: model.binSha256, budgetMs: 3000, maxNodes: 2400, rootCandidates: 28, innerCandidates: 14,
    beamWidth: 16, maxUnits: 5, finalists: 12, responseVariants: 2, responseUnits: 24, maxBatchSize: 128,
    ownFraction: .15, leafMode: 'post_response', antiLeaderBeta: .25, teacherTemperature: .15 };
const configs = [
    { id: 'margin-prior1', priorScale: 1, valueMode: 'zero_sum_margin' },
    { id: 'maxn-prior1', priorScale: 1, valueMode: 'maxn_ffa' },
    { id: 'maxn-prior035', priorScale: .35, valueMode: 'maxn_ffa' }
];
for (const { id, ...options } of configs) await save(path.join(HERE, `config-${id}.json`), { ...base, ...options }, true);
const preserved: Record<string, string> = {};
for (const relative of ['stage3/REPORT.md', 'stage3/OMNI_BASE_MODEL_MANIFEST.json', 'stage3/FINAL_CANDIDATE_LOCK.json', 'stage3/TACTICAL_TRACE_ANALYSIS.json', 'stage3/acceptance_v1/SEALED_TRUNCATION_AUDIT.json', 'stage3/ragged_batch.py', 'stage3/ragged_map.py', 'stage1/ARENA_PANEL.json']) preserved[relative] = fileSha(path.join(HERE, '..', relative));
await save(path.join(HERE, 'PLAN.json'), { schema: 'stage4-preregistered-execution-v1', started: new Date().toISOString(), model, data: DATA,
    configs: configs.map(c => ({ id: c.id, file: `config-${c.id}.json`, sha256: fileSha(path.join(HERE, `config-${c.id}.json`)) })),
    developmentPanelSha256: fileSha(panelFile), subsetSha256: fileSha(path.join(HERE, 'DEV_SUBSET.json')),
    developmentConcurrency: 1, finalConcurrency: 1, selection: ['完整自然覆盖优先', '2P/3P/4P等权保守排名分', '等权保守独胜率', '提前淘汰率较低', '固定配置顺序破同分'],
    fullDevelopmentAfterScreen: '只对预筛优胜者执行完整54局，最终锁定前完成；不依据封存结果调整',
    finalTestAttempts: 1, historicalGames: 40, sealedGames: 54, bootstrapSamples: 10000, bootstrapSeed: 20261101,
    optional80kDiagnostic: false, noTraining: true, sealedPanelAccessBeforeLock: 0,
    calibration: { directory: path.join(DATA, 'calibration-v5'), finalistDeviation: '16候选4P测速未闭合；12候选满足三个测速初态的3000ms合同，完整实战闭合率另行报告', ownNodeAndTimeFraction: .15 },
    preserved, root: ROOT }, true);
console.log(JSON.stringify({ prepared: true, ids, base, sealedAccess: 0 }));
