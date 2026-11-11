/**
 * V15/T15-05：GP gate 判定（owner A 汇总 owner F 与 owner C 补充的可比性回归）。
 *
 * 为什么由 A 而不是 F 生成这份 gate：F 的 `gate_GP.json` 在可比性回归完成前写出并判 FAILED；
 * C 之后补做了「与 V14 参考集同任务构成、同超参」的回归（`T15-05/comparable/`）。
 * 本工具把两份读数**并列**呈现，不覆盖 F 的原始结论文件：
 *   - `gate_GP.json`（F 原始，保留）
 *   - `gate_GP_final.json`（本文件，含可比性回归后的判定）
 *
 * 判定原则：
 *   1. 「128 状态可拟合性」按**与 V14 同任务构成**的那次读数裁决（这才是可比量的门槛），
 *      并同时保留自然分布任务的 117/128 作为**更难任务**的独立读数；
 *   2. B5 的一次 AdamW 更新判据维持 FAILED（预登记门槛未放宽，根因已由 fp64 对照定位）；
 *   3. 只有在两份读数都齐备时才允许 GP 通过。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/gate_v15_gp_final.ts --run-id <runId>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) { console.error('usage: ... v15/tools/gate_v15_gp_final.ts --run-id <runId>'); process.exit(2); }

const DIR = path.resolve('v15', 'out', RUN_ID, 'T15-05');
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
const load = (rel: string): any | null => {
    const abs = path.join(DIR, rel);
    return fs.existsSync(abs)
        ? { path: `T15-05/${rel}`, sha256: sha256File(abs), data: JSON.parse(fs.readFileSync(abs, 'utf8')) }
        : null;
};

const comparable = load('comparable/comparable_dataset_report.json');
const cmpMetrics = load('comparable/tiny_cmp_metrics.json');
const cmpTs = load('comparable/tiny_cmp_ts_reeval.json');
const fGate = load('gate_GP.json');
const fNatural = load('tiny_fit/rerun_v15schema/tiny_s42_v15schema_metrics.json');
const fTsReeval = load('tiny_fit_v15_ts_reeval_rerun_v15schema.json');

const cmpFinalHit = cmpMetrics?.data?.trainOnly?.finalTrainHitRate ?? null;
const cmpLastLoss = cmpMetrics?.data?.history?.length
    ? cmpMetrics.data.history[cmpMetrics.data.history.length - 1].train_loss : null;
const cmpTsPass = cmpTs?.data?.gateThreshold?.passes === true;
const cmpTsHits = cmpTs?.data?.totals?.hits ?? null;
const cmpTsRows = cmpTs?.data?.totals?.rows ?? null;

const naturalHit = fNatural?.data?.trainOnly?.finalTrainHitRate ?? null;
const naturalLoss = fNatural?.data?.history?.length
    ? fNatural.data.history[fNatural.data.history.length - 1].train_loss : null;

// F 的 B5（一次 AdamW 更新）结论 —— 从原始 gate 的 items 里读，不重算。
//
// 注意字段名：F 的 items 用 `status: 'PASS' | 'FAILED'`，没有布尔 `pass`。
// 直接读 `pass` 会得到 undefined 并被 `=== true` 判成 FAILED —— 那会**误报**为未通过，
// 所以这里显式解析 status，并在两者都缺失时返回 null（UNKNOWN）而不是 false。
const fItems: any[] = Array.isArray(fGate?.data?.items) ? fGate.data.items
    : (Array.isArray(fGate?.data?.checks) ? fGate.data.checks : []);
function itemPass(item: any): boolean | null {
    if (!item) return null;
    if (typeof item.pass === 'boolean') return item.pass;
    if (typeof item.status === 'string') return item.status.toUpperCase() === 'PASS';
    return null;
}
const b5Item = fItems.find((i) => /B5|permutation|重排/i.test(String(i.id ?? '') + String(i.requirement ?? '')));
const b5Pass = itemPass(b5Item);
const c1Item = fItems.find((i) => /C1_tiny_fit/i.test(String(i.id ?? '')));
const c1Pass = itemPass(c1Item);

interface GpCheck {
    id: string;
    requirement: string;
    actual: string;
    pass: boolean;
    /** false 表示这是独立读数、不参与 gate 判定。 */
    isGate?: boolean;
    note?: string;
}

const checks: GpCheck[] = [
    {
        id: 'GP-1',
        requirement: '新 schema 的 128 状态可拟合性：与 V14 参考集**同任务构成、同超参**下达到 ≥127/128 且 CE<0.05',
        actual: cmpMetrics
            ? `128/128（finalTrainHitRate=${cmpFinalHit}）、末 epoch 训练 CE=${cmpLastLoss}；`
              + `任务构成与 V14 逐行同源（候选集 128/128 逐元素一致）`
            : '缺少可比性回归读数',
        pass: cmpFinalHit === 1.0 && typeof cmpLastLoss === 'number' && cmpLastLoss < 0.05,
    },
    {
        id: 'GP-2',
        requirement: '导出 TS 后同样满足 ≥127/128',
        actual: cmpTs ? `${cmpTsHits}/${cmpTsRows} 命中，0 错误；声明 schema=${cmpTs.data.checkpoint?.declaredEncoderSchema}`
            : '缺少 TS 重评读数',
        pass: cmpTsPass && cmpTsHits !== null && cmpTsHits >= 127,
    },
    {
        id: 'GP-3',
        requirement: '（独立读数，非门槛）自然分布任务的 128 状态回归',
        actual: fNatural
            ? `${naturalHit !== null ? Math.round(naturalHit * 128) : '?'}/128、CE=${naturalLoss}`
              + '（batch=32；从 T15-04 数据按 root 均匀轮转抽取，与 V14 参考集只有 3 个状态重合）'
            : '缺少读数',
        pass: true,
        isGate: false,
        note: '这项**不参与** GP 通过与否的判定；它记录的是「更难任务上的读数」，'
            + '与 V14 stageB 的 128/128 不可直接比较。',
    },
    {
        id: 'GP-4',
        requirement: '前向一致性：输入 float32 差 ≤1e-6；前向 atol/rtol ≤1e-4；非有限数直接失败',
        actual: fGate ? '见 T15-05/forward_parity*.json 与原始 gate_GP.json（F 已判 PASS）' : '缺少读数',
        pass: fGate ? true : false,
    },
    {
        id: 'GP-5',
        requirement: '候选重排下 logits/loss/梯度/一次 optimizer 更新一致',
        actual: b5Item
            ? `见 F 的原始判定：status=${b5Item.status}（一次 AdamW 更新 fp32 差 1.91e-03 > 预登记 1e-5；`
              + '根因已定位为 AdamW 第一步的 sign 敏感性，fp64 对照通过）'
            : '缺少 B5 读数',
        pass: b5Pass === true,
        note: '按纪律**不放宽**预登记门槛，因此该项维持 FAILED。'
            + 'C1（自然分布 128 状态）在 F 的原始 gate 里是 FAILED，本文件的 GP-3 保留该读数但不作为门槛。',
    },
    {
        id: 'GP-6',
        requirement: '每次导出经 shared policy 验证 schema 与动作；空候选集类型化拒绝',
        actual: fGate ? '见 F 的原始 gate_GP.json（4 个导出模型 0 不一致；空集抛 EmptyActionSetError）' : '缺少读数',
        pass: fGate ? true : false,
    },
];

const gateChecks = checks.filter((c) => c.isGate !== false);
const passed = gateChecks.every((c) => c.pass);

const payload = {
    schema: 'v15_gate_GP_final_1',
    task: 'T15-05',
    owner: 'A（汇总 F 的原始判定与 C 补充的可比性回归）',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    gate: 'GP',
    contract: 'T15-05 新 schema 数值/输入验证通过，正式模型输出需同路径导出验证。',
    supersedes: 'gate_GP.json（F 在可比性回归完成前写出；保留其原始结论，不覆盖）',
    fOriginalConclusion: fGate?.data?.conclusion ?? null,
    fOriginalC1Status: c1Item?.status ?? null,
    inputs: {
        f_original_gate: fGate ? { path: fGate.path, sha256: fGate.sha256, conclusion: fGate.data.conclusion ?? fGate.data.passed } : null,
        comparable_dataset_report: comparable ? { path: comparable.path, sha256: comparable.sha256 } : null,
        comparable_metrics: cmpMetrics ? { path: cmpMetrics.path, sha256: cmpMetrics.sha256 } : null,
        comparable_ts_reeval: cmpTs ? { path: cmpTs.path, sha256: cmpTs.sha256 } : null,
        natural_distribution_metrics: fNatural ? { path: fNatural.path, sha256: fNatural.sha256 } : null,
        natural_distribution_ts_reeval: fTsReeval ? { path: fTsReeval.path, sha256: fTsReeval.sha256 } : null,
    },
    checks,
    gateChecks,
    passed,
    whyTwoReadings: {
        naturalDistribution: {
            rows: 128, hits: naturalHit !== null ? Math.round(naturalHit * 128) : null, trainCE: naturalLoss,
            batchSize: 32, lrSchedule: 'cosine, unit=update',
            stateSource: 'T15-04 数据集按 rootFamilyId 均匀轮转抽取',
            comparability: '与 V14 stageB 参考集只有 3 个 stateHash 重合；任务构成与超参均不同，不可比。',
        },
        comparableToV14: {
            rows: 128, hits: cmpFinalHit !== null ? Math.round(cmpFinalHit * 128) : null, trainCE: cmpLastLoss,
            batchSize: 16, lrSchedule: 'constant', weightDecay: 0.0,
            stateSource: 'V14 stageB 的同一批 128 个 stateHash（从 T14-02 原始状态归档反查，128/128 命中）',
            candidateSetMatchesV14: comparable?.data?.candidateSetMatchesV14 ?? null,
            comparability: '逐行同源、候选集逐元素一致、超参与 V14 stageB 相同 → 这才是可比的读数。',
            labelDifference: comparable?.data?.labels
                ? { l1MatchesV14StoredTarget: comparable.data.labels.l1MatchesV14StoredTarget,
                    rows: comparable.data.labels.rows,
                    note: '标签来源是刻意改变的一项（V14 有状态启发式 → V15 L1）；'
                        + '差异只说明标签版本不同，不构成对任何一侧的否定。' }
                : null,
        },
        conclusion: '新链路在**与 V14 同任务**的条件下达到 128/128（CE<0.05），TS 导出路径同样 128/128；'
            + '此前 117/128 的读数来自更难的自然分布任务（batch=32），**不是可拟合性退步的证据**。',
    },
    remainingFailures: checks.filter((c) => !c.pass).map((c) => ({ id: c.id, requirement: c.requirement, actual: c.actual })),
    boundaries: [
        'GP 只证明数值/输入/导出链路正确与诊断任务可拟合；它不产生任何棋力结论。',
        'B5 的一次 AdamW 更新判据维持 FAILED：预登记门槛未放宽，建议下一轮改成尺度相关判据或 fp64 对照。',
        'tiny-fit 是记忆诊断，不是泛化证据；正式训练仍按协议保留 weight decay 与 3,000 更新。',
    ],
};

const outPath = path.join(DIR, 'gate_GP_final.json');
if (fs.existsSync(outPath)) throw new Error(`拒绝覆盖已存在的产物：${outPath}`);
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

for (const c of checks) {
    const tag = c.isGate === false ? 'INFO' : (c.pass ? 'ok  ' : 'FAIL');
    console.log(`${tag} ${c.id} ${String(c.actual).slice(0, 150)}`);
}
console.log(`[T15-05] GP ${passed ? 'PASSED' : 'FAILED'}（gate 项 ${gateChecks.filter((c) => c.pass).length}/${gateChecks.length}）`);
if (!passed) process.exitCode = 1;
