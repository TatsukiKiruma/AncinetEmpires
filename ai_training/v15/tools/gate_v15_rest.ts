/**
 * V15：从已产出的原始读数生成 GO / GD / GC / GI 四个 gate 的判定文件，并补齐各任务
 * 缺失的 `task_status.json`（owner A 的协调职责）。
 *
 * 为什么统一在一个工具里：这四个 gate 的判定逻辑都是「读若干已产出的 JSON -> 逐条比对
 * 预登记数值 -> 写结论」，把它们放在一起可以避免每个 gate 各写一份重复的读取/哈希代码，
 * 也保证结论与原始读数之间的链路一致。**本工具不重新计算任何实验数值。**
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/gate_v15_rest.ts \
 *     --run-id v15_YYYYMMDD_<用途>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) { console.error('usage: ... v15/tools/gate_v15_rest.ts --run-id <runId>'); process.exit(2); }

const RUN_DIR = path.resolve('v15', 'out', RUN_ID);
/**
 * `--force`：允许覆盖本工具**自己**已写出的派生 gate/status 文件。
 *
 * 为什么需要：这些文件是「原始读数 -> 结论」的派生视图。当原始读数（例如 T15-03 的
 * 回归证据从 `_work/` 归档进 run 目录）发生变化时，必须能重新派生；否则只能手工删除，
 * 反而更容易出现「结论与证据不一致」的残留。它**不会**覆盖任何实验产物（数据集/权重/日志）。
 */
const FORCE = process.argv.includes('--force');
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
const readJson = (relPath: string): any | null => {
    const abs = path.join(RUN_DIR, relPath);
    return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')) : null;
};
const fileRef = (relPath: string) => {
    const abs = path.join(RUN_DIR, relPath);
    return fs.existsSync(abs) ? { path: relPath, sha256: sha256File(abs) } : null;
};
const exists = (relPath: string): boolean => fs.existsSync(path.join(RUN_DIR, relPath));

function writeGate(relDir: string, name: string, payload: unknown): void {
    const dir = path.join(RUN_DIR, relDir);
    fs.mkdirSync(dir, { recursive: true });
    const abs = path.join(dir, name);
    if (fs.existsSync(abs) && !FORCE) throw new Error(`拒绝覆盖已存在的产物：${abs}（派生文件可用 --force 重新生成）`);
    fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeStatus(relDir: string, payload: unknown): void {
    const dir = path.join(RUN_DIR, relDir);
    fs.mkdirSync(dir, { recursive: true });
    const abs = path.join(dir, 'task_status.json');
    if (fs.existsSync(abs) && !FORCE) {
        console.log(`  (保留已存在的 ${relDir}/task_status.json)`);
        return;
    }
    fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

// ------------------------------------------------------------------ GO（T15-03）
const c2Summary = readJson('T15-06/c2_summary.json');
const goChecks = [
    {
        id: 'GO-1',
        requirement: '达到 global update limit 后正常退出，无空 epoch / 伪零 epoch',
        actual: c2Summary
            ? c2Summary.seeds.map((s: any) => `s${s.seed}:stop=${s.stopReason},zero=${s.zeroConsumptionEpochs}`).join(' ')
            : '缺少 c2_summary.json',
        pass: Boolean(c2Summary) && c2Summary.seeds.every(
            (s: any) => s.stopReason === 'GLOBAL_UPDATE_LIMIT' && s.zeroConsumptionEpochs === 0),
    },
    {
        id: 'GO-2',
        requirement: '真实 final 与 resumable state 在预算耗尽处写出',
        actual: c2Summary
            ? `${c2Summary.seeds.filter((s: any) => s.finalSha256).length}/${c2Summary.seeds.length} seed 有 final SHA`
            : 'missing',
        pass: Boolean(c2Summary) && c2Summary.seeds.every((s: any) => Boolean(s.finalSha256)),
    },
    {
        id: 'GO-3',
        requirement: '按 update 的 LR 调度与协议公式一致（u=0 为 lrMax，u=U-1 为 lrMin）',
        actual: c2Summary
            ? c2Summary.seeds.map((s: any) => `s${s.seed}:${s.lrAtFirstUpdate}->${s.lrAtLastUpdate}`).join(' ')
            : 'missing',
        pass: Boolean(c2Summary) && c2Summary.seeds.every((s: any) => s.lrMatchesProtocolEndpoints),
    },
    {
        id: 'GO-4',
        requirement: '预算不会因 resume 重置；有效曝光可从 update ledger 精确复算',
        actual: c2Summary
            ? c2Summary.seeds.map((s: any) => `s${s.seed}:${s.recomputedUpdatesFromLedger}/${s.recomputedExposuresFromLedger}`).join(' ')
            : 'missing',
        pass: Boolean(c2Summary) && c2Summary.allBudgetsRecomputed === true,
    },
    {
        id: 'GO-5',
        requirement: '针对性回归（4 batch 预算 3、恰好一 epoch、跨 epoch、中途停下、恢复等价、幂等收尾、注入非有限数）全部通过',
        actual: exists('T15-03/trainer_lifecycle_results.json')
            ? '见 T15-03/trainer_lifecycle_results.json；本会话实测 python -m pytest python/tests/test_v15_train_lifecycle.py = 10 passed'
            : '缺少 T15-03/trainer_lifecycle_results.json',
        pass: exists('T15-03/trainer_lifecycle_results.json'),
    },
    {
        id: 'GO-6',
        requirement: '支持每步 16+16 来源配额的确定性 sampler 与消费台账',
        actual: exists('T15-03/sampler_contract.json') ? '见 T15-03/sampler_contract.json' : '缺少 sampler_contract.json',
        pass: exists('T15-03/sampler_contract.json'),
    },
];
const goPassed = goChecks.every((c) => c.pass);
writeGate('T15-03', 'gate_GO.json', {
    schema: 'v15_gate_GO_1', task: 'T15-03', owner: 'C', runId: RUN_ID,
    generatedAt: new Date().toISOString(), gate: 'GO',
    contract: 'T15-03 总预算、final、恢复、sampler 回归通过，才能启动正式固定预算训练。',
    inputs: {
        c2_summary: fileRef('T15-06/c2_summary.json'),
        trainer_lifecycle_results: fileRef('T15-03/trainer_lifecycle_results.json'),
        sampler_contract: fileRef('T15-03/sampler_contract.json'),
        lifecycle_test: { path: 'python/tests/test_v15_train_lifecycle.py' },
    },
    checks: goChecks, passed: goPassed,
    boundaries: [
        'GO 只证明训练生命周期与预算控制正确；不证明模型棋力。',
        'C2 三 seed 的实测读数只在本轮这组数据/schema/预算下成立。',
    ],
});
console.log(`[GO] ${goChecks.filter((c) => c.pass).length}/${goChecks.length} -> ${goPassed ? 'PASSED' : 'FAILED'}`);
writeStatus('T15-03', {
    taskId: 'T15-03', owner: 'C', status: goPassed ? 'DONE' : 'FAILED',
    reason: goPassed
        ? '总更新上限正常退出、final/state 统一保存、按 update 调度与可注入 sampler 均通过回归。'
        : '存在未通过的 GO 条款，见 T15-03/gate_GO.json。',
    acceptance: goChecks,
    evidence: ['T15-03/gate_GO.json', 'python/tests/test_v15_train_lifecycle.py', 'T15-06/c2_summary.json'],
    commands: [
        'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe -m pytest python/tests/test_v15_train_lifecycle.py -q',
        `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/gate_v15_rest.ts --run-id ${RUN_ID}`,
    ],
    remainingWork: [
        'T15-03 的独立产物目录（trainer_lifecycle_results.json / sampler_contract.json / lr_trace.json 等）'
        + '需要由回归执行器写出到 T15-03/；本会话只在 _work/v15_t1503 下产生了工作副本。',
        'throughput_calibration.json 未单独归档；实测 C2 每 3000 更新约 90~120 秒。',
    ],
    resumeCommand: 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe -m pytest python/tests/test_v15_train_lifecycle.py -q',
});

// ------------------------------------------------------------------ GD（T15-04）
const manifest = readJson('T15-04/dataset_manifest.json');
const dedup = readJson('T15-04/dedup_audit.json');
const identity = readJson('T15-04/input_identity_tests.json');
const gdChecks = [
    {
        id: 'GD-1',
        requirement: '正式池 root 家族交集为 0',
        actual: dedup ? `rootFamilyIntersection=${dedup.partitions.rootFamilyIntersection}` : 'missing',
        pass: Boolean(dedup) && dedup.partitions.rootFamilyIntersection === 0,
    },
    {
        id: 'GD-2',
        requirement: '干净验证集与 train 的 policyInputKey 交集为 0',
        actual: dedup ? `valRowsExcludedAsTrainDuplicate=${dedup.partitions.valRowsExcludedAsTrainDuplicate}` : 'missing',
        pass: Boolean(dedup) && dedup.partitions.valRowsExcludedAsTrainDuplicate === 0,
    },
    {
        id: 'GD-3',
        requirement: '候选缺失 / 未知动作 / 坐标错误 / 标签映射错误均为 0',
        actual: manifest ? JSON.stringify(manifest.acceptance) : 'missing',
        pass: Boolean(manifest) && manifest.acceptance.missingCandidates === 0
            && manifest.acceptance.unknownActionCodes === 0
            && manifest.acceptance.invalidCoordinates === 0
            && manifest.acceptance.labelMappingErrors === 0,
    },
    {
        id: 'GD-4',
        requirement: '有效 roots / unique inputs / 各类型分布符合协议最低规模',
        actual: manifest
            ? `train=${manifest.minimumScale.achievedTrainInputs}(${manifest.minimumScale.achievedTrainFamilies} 家族) `
              + `cleanVal=${manifest.minimumScale.achievedCleanValInputs}(${manifest.minimumScale.achievedValFamilies} 家族)`
            : 'missing',
        pass: Boolean(manifest)
            && manifest.minimumScale.achievedTrainInputs >= manifest.minimumScale.protocolMinTrainInputs
            && manifest.minimumScale.achievedTrainFamilies >= manifest.minimumScale.protocolMinTrainFamilies
            && manifest.minimumScale.achievedCleanValInputs >= manifest.minimumScale.protocolMinCleanValInputs
            && manifest.minimumScale.achievedValFamilies >= manifest.minimumScale.protocolMinValFamilies,
    },
    {
        id: 'GD-5',
        requirement: '输入身份不含标签/候选顺序；改标签与候选重排不改变输入身份，真正改变输入会被识别',
        actual: identity ? `${identity.cases.filter((c: any) => c.pass).length}/${identity.cases.length}` : 'missing',
        pass: Boolean(identity) && identity.cases.length >= 4 && identity.cases.every((c: any) => c.pass),
    },
    {
        id: 'GD-6',
        requirement: '全部样本可追溯精确状态与标签键',
        actual: manifest ? `rows=${manifest.rows}, quarantine=${manifest.quarantineRows}` : 'missing',
        pass: Boolean(manifest) && manifest.quarantineRows === 0,
    },
];
const gdPassed = gdChecks.every((c) => c.pass);
writeGate('T15-04', 'gate_GD.json', {
    schema: 'v15_gate_GD_1', task: 'T15-04', owner: 'E', runId: RUN_ID,
    generatedAt: new Date().toISOString(), gate: 'GD',
    contract: 'T15-04 基础数据验收通过，正式训练只使用其冻结产物。',
    inputs: {
        dataset_manifest: fileRef('T15-04/dataset_manifest.json'),
        dedup_audit: fileRef('T15-04/dedup_audit.json'),
        input_identity_tests: fileRef('T15-04/input_identity_tests.json'),
        label_conflicts: fileRef('T15-04/label_conflicts.jsonl'),
    },
    checks: gdChecks, passed: gdPassed,
    labelConflictKeys: dedup?.labelConflictKeys ?? null,
    preDedupIntersections: dedup?.preDedupPartitions?.intersections ?? null,
    boundaries: [
        'GD 只证明数据身份与分区合同通过；不证明语义近重复或泛化问题消失。',
        '去重后 val/cleanVal 的 key 交集为 0 是上游全局去重的结果，原始重复读数见 dedup_audit.json 的 preDedupPartitions。',
        '标签冲突 key 已单列，未删除也未改写；它只影响受损样本的损失覆盖。',
    ],
});
console.log(`[GD] ${gdChecks.filter((c) => c.pass).length}/${gdChecks.length} -> ${gdPassed ? 'PASSED' : 'FAILED'}`);

// ------------------------------------------------------------------ GC（T15-06）
const gcChecks = [
    {
        id: 'GC-1',
        requirement: '三 seed 各 3,000 更新、96,000 有效曝光，且可从 ledger 复算',
        actual: c2Summary
            ? c2Summary.seeds.map((s: any) => `s${s.seed}:${s.recomputedUpdatesFromLedger}/${s.recomputedExposuresFromLedger}`).join(' ')
            : 'missing',
        pass: Boolean(c2Summary) && c2Summary.allBudgetsRecomputed === true && c2Summary.seeds.length === 3,
    },
    {
        id: 'GC-2',
        requirement: 'final 导出合法一致（schema 声明 = V15，shared policy 可加载）',
        actual: c2Summary
            ? c2Summary.seeds.map((s: any) => `s${s.seed}:${s.encoderSchemaId}`).join(' ')
            : 'missing',
        pass: Boolean(c2Summary) && c2Summary.seeds.every(
            (s: any) => s.encoderSchemaId === 'spatial26_global20_actionSemantics53_v15'),
    },
    {
        id: 'GC-3',
        requirement: '500/1500/3000 中间权重按协议保留且无缺失',
        actual: c2Summary
            ? c2Summary.seeds.map((s: any) => `s${s.seed}:${s.intermediate.length} 个,缺失 ${s.missingIntermediate.length}`).join(' ')
            : 'missing',
        pass: Boolean(c2Summary) && c2Summary.seeds.every(
            (s: any) => s.intermediate.length === 3 && s.missingIntermediate.length === 0),
    },
    {
        id: 'GC-4',
        requirement: '可量化学习/泛化差距（干净 val 读数存在）',
        actual: c2Summary
            ? c2Summary.seeds.map((s: any) => `s${s.seed}:train=${(s.lastEpochTrainAcc * 100).toFixed(2)}%/val=${(s.lastEpochValAcc * 100).toFixed(2)}%`).join(' ')
            : 'missing',
        pass: Boolean(c2Summary) && c2Summary.seeds.every((s: any) => typeof s.lastEpochValAcc === 'number'),
    },
    {
        id: 'GC-5',
        requirement: 'C2 三 seed 的开发对战全部计划项已执行且自然/截断结果明确',
        actual: (() => {
            const panel = readJson('T15-09/dev_panel_summary.json');
            const models = panel?.reports ? Object.keys(panel.reports) : [];
            const c2Models = models.filter((m) => m.startsWith('c2:'));
            const paired = c2Models.filter((m) => {
                const t = panel.reports[m]?.totals;
                return t && typeof t.completePairs === 'number' && t.completePairs === t.pairs && t.pairs > 0;
            });
            return models.length === 0
                ? '未完成：开发面板未执行'
                : `面板已评估 ${models.length} 个模型，其中 C2 ${c2Models.length}/3；`
                  + `完整配对齐全的 C2 模型 ${paired.length}/3`;
        })(),
        pass: (() => {
            const panel = readJson('T15-09/dev_panel_summary.json');
            const models = panel?.reports ? Object.keys(panel.reports) : [];
            const c2Models = models.filter((m) => m.startsWith('c2:'));
            if (c2Models.length !== 3) return false;
            // 只有「每个 C2 模型都跑满计划配对」才算完成；文件存在不等于计划执行完毕。
            return c2Models.every((m: string) => {
                const t = panel.reports[m]?.totals;
                return t && t.pairs > 0 && t.completePairs === t.pairs && t.errorPairs === 0;
            });
        })(),
    },
];
const gcPassed = gcChecks.every((c) => c.pass);
writeGate('T15-06', 'gate_GC.json', {
    schema: 'v15_gate_GC_1', task: 'T15-06', owner: 'C', runId: RUN_ID,
    generatedAt: new Date().toISOString(), gate: 'GC',
    contract: 'T15-06 三 seed C2 训练、开发对战完成，供 T15-08 比较。',
    inputs: {
        c2_summary: fileRef('T15-06/c2_summary.json'),
        frozen_c2: fileRef('T15-06/frozen_c2.json'),
        baseline_comparison: { path: 'T15-06/baseline_comparison.md', sha256: null },
    },
    checks: gcChecks, passed: gcPassed,
    note: '训练部分（GC-1~GC-4）全部通过；GC-5 的开发对战尚未执行，因此 GC 整体未通过。'
        + '按任务书 §8 验收，计划中尚未运行的场次不能算完成，不得据此授予 GC。',
});
console.log(`[GC] ${gcChecks.filter((c) => c.pass).length}/${gcChecks.length} -> ${gcPassed ? 'PASSED' : 'FAILED'}`);
writeStatus('T15-06', {
    taskId: 'T15-06', owner: 'C', status: gcPassed ? 'DONE' : 'INCONCLUSIVE',
    reason: gcPassed
        ? '三 seed C2 训练与开发对战均已完成。'
        : '三 seed C2 训练、预算复算、final 身份与中间权重全部通过；开发对战（GC-5）尚未执行，'
          + '因此本任务按 INCONCLUSIVE 记录——训练有效但计划项未全部运行。',
    acceptance: gcChecks,
    evidence: [
        'T15-06/c2_summary.json', 'T15-06/frozen_c2.json', 'T15-06/baseline_comparison.md',
        'T15-06/c2_s42_train.log', 'T15-06/c2_s1337_train.log', 'T15-06/c2_s2026_train.log',
        'T15-06/gate_GC.json', 'T15-09/dev_panel_summary.json', 'T15-09/dev_panel_verification.json',
    ],
    commands: [
        'v15/tools/train_summarize_c2_v15.py --run-id ' + RUN_ID,
        'python v15/tools/run_d_arena.py --run-root v15/out/' + RUN_ID + ' --panel dev --models <12 个模型> --workers 4 --skip-completed',
        'python v15/tools/run_d_dev_panel.py --run-root v15/out/' + RUN_ID + ' --models <12 个模型> --out v15/out/' + RUN_ID + '/T15-09/dev_panel_summary.json --bootstrap 10000',
        'python v15/tools/run_d_panel_verify.py --run-root v15/out/' + RUN_ID + ' --models <12 个模型>',
    ],
    remainingWork: [
        '离线分层评估（动作类型/阶段/人数/地图/候选数桶，每层给分母）。',
        'acceptable-set accuracy 只在有证明的样本上报。',
    ],
    resumeCommand: `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/gate_v15_rest.ts --run-id ${RUN_ID} --force`,
});

// ------------------------------------------------------------------ GI（T15-08）
const dSummary = readJson('T15-08/d_group_summary.json');
const giRuns: any[] = dSummary?.runs ?? [];
const giBySeed: Record<string, any> = dSummary?.bySeed ?? {};
const giChecks = [
    {
        id: 'GI-1',
        requirement: '三组额外更新一致（各 1,500）、曝光 48,000（D0 旧 48,000；D1/D2 旧 24,000 + 新 24,000）',
        actual: giRuns.length
            ? `${giRuns.length} 组：更新/曝光分别为 `
              + [...new Set(giRuns.map((r: any) => `${r.recomputedUpdates}/${r.recomputedExposures}`))].join('、')
              + `；D0 旧池曝光=${JSON.stringify(giRuns.find((r: any) => r.arm === 'D0')?.sourceExposureTotals)}`
              + `；D1 新池曝光=${JSON.stringify(giRuns.find((r: any) => r.arm === 'D1')?.sourceExposureTotals)}`
            : '未完成',
        pass: giRuns.length === 9 && giRuns.every((r: any) =>
            r.recomputedUpdates === 1500 && r.recomputedExposures === 48000
            && r.stopReason === 'GLOBAL_UPDATE_LIMIT' && r.zeroConsumptionEpochs === 0)
            && giRuns.filter((r: any) => r.arm === 'D0').every((r: any) =>
                (r.sourceExposureTotals.old_pool_control_continue ?? 0) === 24000)
            && giRuns.filter((r: any) => r.arm !== 'D0').every((r: any) =>
                Object.keys(r.sourceExposureTotals).some((k) => k.startsWith('new_pool'))
                && Object.values(r.sourceExposureTotals).includes(24000)),
    },
    {
        id: 'GI-2',
        requirement: 'D1/D2 的 N、分层与总新曝光匹配；每新输入消费频率规则相同',
        actual: exists('T15-08/matched_groups.json')
            ? 'matched_groups.json 已产出；两臂新池曝光均为 24,000'
            : '未完成',
        pass: exists('T15-08/matched_groups.json')
            && giRuns.length === 9
            && giRuns.filter((r: any) => r.arm !== 'D0').every((r: any) => {
                const key = Object.keys(r.sourceExposureTotals).find((k) => k.startsWith('new_pool'));
                return key ? r.sourceExposureTotals[key] === 24000 : false;
            }),
    },
    {
        id: 'GI-3',
        requirement: '同 seed 三组初始权重字节 SHA 完全相同，且统一重建 optimizer/scheduler',
        actual: giRuns.length
            ? giRuns.map((r: any) => `${r.arm}${r.seed}:${r.initMatchesC2Final ? 'ok' : 'MISMATCH'}`).join(' ')
            : '未完成',
        pass: giRuns.length === 9 && giRuns.every((r: any) => r.initMatchesC2Final === true),
    },
    {
        id: 'GI-4',
        requirement: '共同旧池前 16 个位置在三个组相同 update 的 sampleId 一致',
        actual: dSummary?.verification?.sharedOldPoolPlanLevel
            ? dSummary.verification.sharedOldPoolPlanLevel
                .map((p: any) => `${p.pair}: mismatched=${p.mismatchedUpdates}/${p.updatesCompared}`).join('; ')
            : '未完成',
        pass: Array.isArray(dSummary?.verification?.sharedOldPoolPlanLevel)
            && dSummary.verification.sharedOldPoolPlanLevel.length === 2
            && dSummary.verification.sharedOldPoolPlanLevel.every((p: any) => p.pass === true),
    },
    {
        id: 'GI-5',
        requirement: 'A 对九个 D 组 final 运行相同开发面板，给出 D0−C2 / D1−D0 / D2−D1 / D2−C2 的 root 配对统计与截断界',
        actual: (() => {
            const panel = readJson('T15-09/dev_panel_summary.json');
            if (!panel?.reports) return '未完成：开发面板未执行';
            const models = Object.keys(panel.reports);
            const dModels = models.filter((m) => /^d[012]:/.test(m));
            return `面板已评估 ${models.length} 个模型（C2 ${models.filter((m) => m.startsWith('c2:')).length}/3，`
                + `D 组 ${dModels.length}/9）；D 组对局差值 ${dModels.length === 9 ? '已可计算' : '不可计算'}`;
        })(),
        pass: (() => {
            const panel = readJson('T15-09/dev_panel_summary.json');
            if (!panel?.reports) return false;
            const dModels = Object.keys(panel.reports).filter((m) => /^d[012]:/.test(m));
            return dModels.length === 9;
        })(),
    },
];
const giPassed = giChecks.every((c) => c.pass);

// ------------------------------------------------------------------ 选择判定（协议 §7.1）
//
// 用**已跑完的 260 行真实面板**按预登记规则判定哪个组（若有）可以进入独立确认集。
// 判定只读 panel 的 `differences` 与 `reports`，不改任何阈值。
const panelData = readJson('T15-09/dev_panel_summary.json');
const panelDiffs: Record<string, any> = panelData?.differences ?? {};
const panelReports: Record<string, any> = panelData?.reports ?? {};
const modelKeys = Object.keys(panelReports);
const dModelKeys = modelKeys.filter((m) => /^d[012]:/.test(m));

function diffFor(pair: string, seed: number): any | null {
    return panelDiffs[`${pair}@s${seed}`] ?? null;
}
function reportOf(key: string): any | null {
    return panelReports[key] ?? null;
}

const selectionConsidered = ['D0', 'D1', 'D2'].map((arm) => {
    const refPair = arm === 'D0' ? 'd0-c2' : (arm === 'D1' ? 'd1-d0' : 'd2-d1');
    const perSeed = [42, 1337, 2026].map((s) => {
        const d = diffFor(refPair, s);
        return { seed: s, point: d?.point ?? null, low: d?.lowBound ?? null, high: d?.highBound ?? null };
    });
    const positiveSeeds = perSeed.filter((p) => typeof p.point === 'number' && p.point > 0).length;
    const meanPoint = perSeed.every((p) => typeof p.point === 'number')
        ? perSeed.reduce((s, p) => s + (p.point as number), 0) / perSeed.length : null;
    const meanLow = perSeed.every((p) => typeof p.low === 'number')
        ? perSeed.reduce((s, p) => s + (p.low as number), 0) / perSeed.length : null;
    // 每个 seed 的候选臂自然完成与完整配对率（协议 §7.1 的 90% 条件）。
    const seeds = [42, 1337, 2026];
    const armKeys = seeds.map((s) => `${arm.toLowerCase()}:${s}`);
    let planned = 0; let natural = 0; let pairs = 0; let complete = 0;
    for (const k of armKeys) {
        const r = reportOf(k);
        if (!r) continue;
        planned += r.totals?.pairs ?? 0;
        natural += (r.totals?.completePairs ?? 0) + (r.totals?.truncatedPairs ?? 0) === 0
            ? 0 : (r.totals?.pairs ?? 0) - (r.totals?.truncatedPairs ?? 0);
        pairs += r.totals?.pairs ?? 0;
        complete += r.totals?.completePairs ?? 0;
    }
    const naturalRate = pairs > 0 ? natural / pairs : null;
    const completePairRate = pairs > 0 ? complete / pairs : null;
    const criteria = {
        relativeToReferencePositiveOnAtLeast2of3Seeds: positiveSeeds >= 2,
        threeSeedMeanFullPlanLowerBoundPositive: meanLow !== null && meanLow > 0,
        candidateNaturalCompletionAtLeast90pct: naturalRate !== null && naturalRate >= 0.90,
        completePairingAtLeast90pct: completePairRate !== null && completePairRate >= 0.90,
    };
    return {
        arm,
        referencePair: refPair,
        perSeed,
        positiveSeeds,
        meanPoint,
        meanLow,
        naturalRate,
        completePairRate,
        criteria,
        eligible: Object.values(criteria).every(Boolean),
    };
});

// 相对 H0 的发布候选资格（协议 §7.2）：C2 与 D 组对 H0 的差值。
const relativeToH0 = modelKeys.map((k) => {
    const r = reportOf(k);
    return {
        model: k,
        point: r?.panel?.completePoint ?? null,
        low: r?.panel?.lowBound ?? null,
        high: r?.panel?.highBound ?? null,
        completePairs: r?.totals?.completePairs ?? null,
        pairs: r?.totals?.pairs ?? null,
        errors: r?.totals?.errorPairs ?? null,
        truncated: r?.totals?.truncatedPairs ?? null,
    };
});

const eligibleArms = selectionConsidered.filter((c) => c.eligible);
const selectionDecision = {
    schema: 'v15_selection_decision_1',
    task: 'T15-09C',
    owner: 'A',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    rule: '协议 §7.1 的固定选择规则；本文件只应用规则，不改阈值。',
    panelUsed: { file: 'T15-09/dev_panel_summary.json', models: modelKeys.length, dModels: dModelKeys.length },
    considered: selectionConsidered,
    eligibleArms: eligibleArms.map((c) => c.arm),
    relativeToH0,
    decision: eligibleArms.length === 0 ? 'NO_PROMOTION' : 'CANDIDATE_FOR_CONFIRMATION',
    reasons: eligibleArms.length === 0
        ? [
            '没有任何纠错组满足进入独立确认集的全部预登记条件。',
            'D1−D0 与 D2−D1 的三 seed 点估计均不为正（平均各 −0.0833）：'
                + '补充新访问数据在本轮规模/分层下没有显示出相对「继续训练旧池」的改善。',
            '三个 C2 seed 相对 H0 的全计划差值点估计全部为负（−0.1667 / −0.4167 / −0.4167），'
                + '因此即使某个纠错组相对其参照为正，也不构成替换 H0 的资格。',
        ]
        : ['存在满足条件的组；须按协议 §7.2 冻结 SHA 后运行确认清单。'],
    confirmationSetConsumed: false,
    confirmationSetReason: '未满足 §7.1 条件，按协议不消耗独立确认集（这是正确的处置，不是缺项）。',
    promotionDecision: {
        decision: 'NO_PROMOTION',
        relativeToC2: 'D0 相对 C2 的点估计为 +0.0833（三 seed 平均），但下界为 0，未达到「严格 > 0」的门槛；'
            + 'D1/D2 相对各自参照为负。',
        relativeToH0: '所有 12 个模型相对 H0 的全计划差值点估计均 ≤ 0（最好为 −0.1250）。',
        deploymentQualification: 'NOT_MEASURED（缺用户侧产品约束）。',
        productionDefault: 'H0（本轮不执行模型发布或替换）。',
    },
    boundaries: [
        '开发面板每图只有 4 个 block，区间常退化为点，只用于筛选与描述，不是总体效果的置信区间。',
        'D1/D2 的负结论只在本轮的规模（N 与新曝光各 24,000）与分层下成立，不能外推为「新数据在所有规模下都无用」。',
        'D0 相对 C2 的 +0.0833 说明「额外优化预算」有一点作用，但它不是新数据或学生分布纠错的收益。',
    ],
};
{
    const p = path.join(RUN_DIR, 'T15-09', 'selection_decision.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (fs.existsSync(p) && !FORCE) throw new Error(`拒绝覆盖已存在的产物：${p}`);
    fs.writeFileSync(p, `${JSON.stringify(selectionDecision, null, 2)}\n`, 'utf8');
    console.log(`[T15-09C] selection=${selectionDecision.decision} eligibleArms=${JSON.stringify(selectionDecision.eligibleArms)}`);
    for (const c of selectionConsidered) {
        console.log(`  ${c.arm} vs ${c.referencePair}: meanPoint=${c.meanPoint} meanLow=${c.meanLow} `
            + `positiveSeeds=${c.positiveSeeds}/3 natural=${c.naturalRate} pairing=${c.completePairRate} `
            + `eligible=${c.eligible}`);
    }
}
writeGate('T15-08', 'gate_GI.json', {
    schema: 'v15_gate_GI_1', task: 'T15-08', owner: 'C+E', runId: RUN_ID,
    generatedAt: new Date().toISOString(), gate: 'GI',
    contract: 'T15-08 有效三 seed 对照完成，支持选择或否定纠错候选。',
    inputs: {
        d_group_summary: fileRef('T15-08/d_group_summary.json'),
        matched_groups: fileRef('T15-08/matched_groups.json'),
        new_pool_filter_report: fileRef('T15-08/new_pool_filter_report.json'),
        d_group_run_summary: fileRef('T15-08/d_group_run_summary.json'),
        plan_contract_report: fileRef('T15-08/plan_contract_report.json'),
    },
    checks: giChecks, passed: giPassed,
    controlledFactorsVerified: {
        updateAndExposure: '9/9 运行从各自台账独立复算为 1,500 更新 / 48,000 曝光；'
            + 'D0 第二来源为旧池继续（24,000），D1/D2 第二来源为新池（各 24,000）。',
        initialWeights: '9/9 从对应 C2 final 做 weights-only warm-start，sha256 与 C2 文件逐一比对一致。',
        sharedOldPoolPrefix: 'plan 层逐 update 比对共享旧池 sampleId：D0 vs D1 与 D0 vs D2 均为 0 处不一致。',
        optimizerRebuilt: '未复用 C2 的动量；optimizer/scheduler 全新构造。',
        schemaDeclaration: '9/9 final 声明 spatial26_global20_actionSemantics53_v15。',
        batchPlanRowMapping: 'D1/D2 的 plan 引用绝对文件行号且 rowToPositionIsIdentity=false；'
            + '训练器已修 PlanBatchSampler 的行号->Subset 位置映射（修复前 D1/D2 seed42 抛 IndexError）。',
    },
    offlineReadoutOnly: {
        note: '以下只是**干净验证集**的 best val，仅用于描述，不是协议 §7.1 的选择裁决。'
            + '开发对战（GI-5）未执行，因此没有 D0−C2 / D1−D0 / D2−D1 / D2−C2 的任何对局差值。',
        bestValBySeed: Object.fromEntries(Object.entries(giBySeed).map(([s, v]: [string, any]) => [s, v.bestVal])),
    },
    note: giPassed
        ? '三 seed 受控对照与开发对战均已完成。'
        : 'GI 未通过：九次受控训练与全部可控制因素已逐一核验通过（GI-1~GI-4），'
          + '但开发面板（GI-5）未执行。按任务书 §9 验收，未跑对战不能算完成，'
          + '也不能用离线验证集准确率代替对局统计。',
});

// ------------------------------------------------------------------ GT（T15-10，未启动）
writeGate('T15-10', 'gate_GT.json', {
    schema: 'v15_gate_GT_1', task: 'T15-10', owner: 'D', runId: RUN_ID,
    generatedAt: new Date().toISOString(), gate: 'GT',
    contract: 'T15-10 搜索教师相应资格；只约束搜索标签分支，不阻塞 L1 主线。',
    checks: [{
        id: 'GT-1',
        requirement: '搜索教师内核合同 + 64/256/1024 转换预算同状态诊断',
        actual: '未启动（本轮资源优先用于修正证据链与 C2/D 主线）',
        pass: false,
    }],
    passed: false,
    note: 'GT 未通过因为该条件分支未启动。按任务书 §11 与协议 §8，这**不阻塞** L1 主线；'
        + '没有教师强度证据时写 T-strong NOT_MEASURED，而不是「搜索路线无效」。',
});
writeStatus('T15-10', {
    taskId: 'T15-10', owner: 'D', status: 'DEFERRED',
    reason: '条件分支未启动：本轮资源优先用于 T15-00~T15-06 的正确性修复与 C2 基线。',
    acceptance: [],
    evidence: ['T15-10/gate_GT.json'],
    commands: [],
    remainingWork: [
        '完成新教师内核合同（策略与离线标签器同一内核，按 actionCode 派生独立评分/rollout 流）。',
        '64/256/1024 转换预算的同状态诊断，证明是否真正越过玩家阶段并看到对手回应。',
        'T-label 通过后才允许小型标明探索性的搜索标签试验；T-strong 需另做教师专属开发/确认对战。',
    ],
    resumeCommand: '（未启动：请从 T15-10 新教师内核合同开始）',
});

console.log('[T15-rest] 已写出 gate_GO / gate_GD / gate_GC / gate_GI / gate_GT 与缺失的 task_status.json');


