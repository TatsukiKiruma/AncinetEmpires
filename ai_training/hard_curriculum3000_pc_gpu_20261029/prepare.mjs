/** 冻结第三批完整输入、独立授权和零启动账本；不启动任何采集器。 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { digest, rowDigest, selectThird, validate } from './contract.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../..');
const execution = 'ai_training/hard_curriculum3000_execution_20261027';
const proposal = 'ai_training/hard_curriculum3000_plan_20261027';
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const sourceJobs = read(`${execution}/JOBS.json`), sequence = read(`${execution}/EXECUTION_SEQUENCE.json`);
const design = read(`${proposal}/DESIGN_SLOTS.json`), maps = read(`${proposal}/MAP_INVENTORY.json`);
const jobs = selectThird(sourceJobs.jobs);
if (sourceJobs.schema !== 'hard-curriculum-jobs-v1' || sourceJobs.dispatchable !== true) throw Error('来源任务尚未生成');
const summary = validate(jobs, sequence.rows, design.slots, maps.maps);
if (fs.existsSync(path.join(out, 'JOBS.json'))) throw Error('冻结输入已存在，拒绝覆盖；使用test_contract.mjs复核');
for (const directory of ['inputs', 'source', 'evidence']) fs.mkdirSync(path.join(out, directory), { recursive: true });
const sourcePaths = [
    `${proposal}/PLAN.json`, `${proposal}/DESIGN_SLOTS.json`, `${proposal}/MAP_INVENTORY.json`, `${proposal}/COLLECTOR_AUDIT.json`, `${proposal}/REPORT.md`,
    `${execution}/JOBS.json`, `${execution}/EXECUTION_SEQUENCE.json`, `${execution}/GENERATION.json`, `${execution}/AUTHORIZATION.json`,
    `${execution}/SAMSUNG_ACTIVE_COLLECTION.json`, `${execution}/samsung-v1/REPORT.md`,
    `${execution}/samsung-v1/SEGMENT_PLAN.json`, `${execution}/samsung-v1/production/PLAN.json`,
    'tools/phone_training_hard/curriculum_v1/README.md', 'tools/phone_training_hard/curriculum_v1/html.py',
    'docs/rules/original-apk-hard-ai.md', 'tools/extract_apk_hard_runtime.mjs',
    'src/game/ai/runtime/apk_hard_runtime.ts', 'src/game/ai/runtime/apk_hard_policy.generated.js',
    'src/game/ai/original_apk_like_hard_ai.ts',
    'ai_training/hard_native_1000_20261022/production-independent-05/hard-ai-runtime.fixed.html',
    'ai_training/gpu/README.md', 'ai_training/gpu/REPORT.md',
    ...['common.py', 'batch_model.py', 'infer.py', 'inference_client.ts', 'collect.ts', 'train.py'].map(name => `ai_training/gpu/${name}`),
    ...['worker.rhino.js', 'runtime.frida.js', 'native_engine.rhino.js', 'projection.rhino.js', 'controller.sh', 'master.sh', 'schedule.py', 'queue_policy.sh', 'CurriculumAudit.java', 'BUILD.json'].map(name => `${execution}/collector-v5/${name}`),
    ...['patch-ResourcePackHardAi.dad.java', 'patch-ResourcePackHardAi.dex.txt', 'patch-ResourcePackHardAi$1.dad.java', 'patch-ResourcePackHardAi$2.dad.java', 'patch-b.dex.txt'].map(name => `deliverables/original_apk_hard_20261021/static/${name}`),
];
const identity = [];
for (const relative of sourcePaths) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) { identity.push({ path: relative, exists: false }); continue; }
    const bytes = fs.readFileSync(absolute);
    const record = { path: relative, exists: true, bytes: bytes.length, sha256: digest(bytes) };
    // 大型原始全集只记录哈希；第三批逐字段副本在JOBS中独立保存。
    if (relative !== `${execution}/JOBS.json` && relative !== `${proposal}/DESIGN_SLOTS.json` && !relative.endsWith('/SEGMENT_PLAN.json') && !relative.endsWith('/production/PLAN.json')) {
        const target = path.join('source', relative);
        fs.mkdirSync(path.dirname(path.join(out, target)), { recursive: true });
        fs.writeFileSync(path.join(out, target), bytes, { flag: 'wx' }); record.snapshot = target.replaceAll('\\', '/');
    }
    identity.push(record);
}
save('JOBS.json', { ...sourceJobs, jobs });
save('inputs/DESIGN_SLOTS.json', { ...design, slots: design.slots.filter(slot => jobs.some(job => job.designSlotId === slot.slotId)) });
save('INPUT_IDENTITY.json', {
    generatedAt: new Date().toISOString(), sources: identity,
    jobs: jobs.map(job => ({ executionSequence: job.executionSequence, parentId: job.parentId, seed: job.seed,
        fullJobSha256: rowDigest(job), initialStateSha256: job.initialStateSha256 })),
    selection: '按冻结executionSequence 2001—3000筛选，全部原字段保持；不重新洗牌或生成seed',
});
save('AUTHORIZATION.json', {
    schema: 'hard-curriculum-pc-gpu-authorization-v1', date: '2026-10-29',
    source: '本对话用户明确委派；第三批电脑GPU采集覆盖旧未指定设备快照',
    userRequest: '当前在使用手机训练3000局困难AI多场景对局，已经下发了0-2000局给手机。请你查看其他对话或者项目文档了解情况后，发起新对话，使用gpt 6.1 sol xhigh，去让当前电脑使用GPU跑2001-3000局的训练集。',
    authorized: ['必要调查和不改变原生规则/困难AI语义的适配', '第三批执行局号2001—3000在当前电脑使用GPU采集'],
    requiredOrigin: '原始c.a.b.c.j.b.call及原APK结算；保留hard_js_primary/hard_java_fallback真实路径',
    originSubstitutionAuthorized: false, cpuOnlyProductionAuthorized: false,
    previousAuthorizationPreserved: `source/${execution}/AUTHORIZATION.json`,
    strict: 'disabled_by_user', forced: 'disabled_by_user', apkNativeReplay: 'disabled_by_user',
    training: false, tensorGeneration: false, automaticDatasetAdmission: false,
    phoneOperationsAuthorized: false, existingSplit: '2414/268保持',
});
save('ASSIGNMENT.json', {
    schema: 'hard-curriculum-assignment-overlay-v1', sourceDeviceValue: 'unassigned', assignedDevice: 'current_pc_gpu',
    computer: os.hostname(), platform: process.platform, executionSequences: jobs.map(job => job.executionSequence),
    sourceJobObjectsUnchanged: true, runtimeReady: false,
    note: '设备指定已获授权；来源及GPU兼容能力未通过前不启动生产，不能将来源dispatchable解释为桌面已就绪',
});
const parents = jobs.map(job => ({ executionSequence: job.executionSequence, parentId: job.parentId,
    category: job.category, actualPlayerCount: job.actualPlayerCount, map: job.map, observation: job.observation,
    status: 'unattempted_runtime_incompatible', actualStarts: 0, naturalEnd: false, failureKind: null,
    note: '未实际启动；不是原生执行失败或观察格门禁跳过',
}));
save('PARENT_LEDGER.json', { schema: 'hard-curriculum-parent-ledger-v1', parents });
save('ATTEMPTS.json', { schema: 'hard-curriculum-attempt-ledger-v1', attempts: [], actualStarts: 0, nextRunOrdinalPerParent: 1 });
save('QUOTA_CHECK.json', summary);
save('RUN_STATE.json', {
    schema: 'hard-curriculum-pc-gpu-state-v1', updatedAt: new Date().toISOString(),
    phase: 'awaiting_runtime_choice', collectionAuthorized: true, collectorStarted: false, collectorPid: null,
    planned: 1000, actualStarts: 0, naturalEnds: 0, runtimeErrors: 0, initialStateMismatches: 0,
    actionTruncations: 0, timeTruncations: 0, observationGateSkipped: 0, unattempted: 1000,
    replay: 'disabled_by_user', trainingUpdates: 0,
    stopReason: '现有原生APK困难路径没有GPU计算入口；项目GPU神经策略来源不同，等待用户选择技术约束',
});
const group = key => Object.entries(summary[key]).map(([name, target]) => ({ name, target, natural: 0, actualStarts: 0, unattempted: target, gap: target }));
save('RESULTS.json', { phase: 'not_started', planned: 1000, natural: 0, actualStarts: 0, gap: 1000,
    byCategory: group('category'), byPlayers: group('players'), byMap: group('maps'), byCell: group('cells'),
    qualification: '静态准备完成；兼容性阻塞，不是1000局已执行失败，也不是采集完成',
});
console.log(JSON.stringify({ output: out, ...summary }));
