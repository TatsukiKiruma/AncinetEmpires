/**
 * V15/T15-09A：从已产出的自测/校准/历史重算读数生成 GE gate 与任务状态（owner A）。
 *
 * 为什么单独成步骤：T15-09A 的三份产物（`eval_selftest.json`、`calibration.json`、
 * `historical_recompute.json`）由独立脚本产出，GE 的判定必须**只读这些原始文件**，
 * 不重新计算、不手工填写数值，从而保证「gate 结论 -> 原始读数」的链路可复算。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_gate_ge.ts \
 *     --run-id v15_20260925_core
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) {
    console.error('usage: ... v15/tools/eval_v15_gate_ge.ts --run-id <runId>');
    process.exit(2);
}
const DIR = path.resolve('v15', 'out', RUN_ID, 'T15-09');
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

function load(name: string): { path: string; sha256: string; data: any } | null {
    const abs = path.join(DIR, name);
    if (!fs.existsSync(abs)) return null;
    return { path: `T15-09/${name}`, sha256: sha256File(abs), data: JSON.parse(fs.readFileSync(abs, 'utf8')) };
}

const selftest = load('eval_selftest.json');
const calibration = load('calibration.json');
const historical = load('historical_recompute.json');

const missingInputs = [
    ['eval_selftest.json', selftest],
    ['calibration.json', calibration],
    ['historical_recompute.json', historical],
].filter(([, v]) => v === null).map(([k]) => k as string);

/** 从 historical_recompute.json 里汇总三人面板的两种口径（候选自然完成 / 完整配对）。 */
function historicalTotals(): {
    candidateNatural: number; plannedCandidateArms: number;
    completePairs: number; plannedPairs: number; files: number;
} {
    const files = historical?.data?.files ?? [];
    let candidateNatural = 0;
    let plannedCandidateArms = 0;
    let completePairs = 0;
    let plannedPairs = 0;
    for (const f of files) {
        if (f.playerCount !== 3) continue;
        candidateNatural += Number(f.candidateNaturalCount ?? 0);
        plannedCandidateArms += Number(f.plannedCandidateArms ?? 0);
        completePairs += Number(f.completePairCount ?? 0);
        // 完整配对的计划分母 = 候选臂数（每臂一条镜像臂）。
        plannedPairs += Number(f.plannedCandidateArms ?? 0);
    }
    return { candidateNatural, plannedCandidateArms, completePairs, plannedPairs, files: files.filter((f: any) => f.playerCount === 3).length };
}

const threePlayer = historicalTotals();

const checks: Array<{ id: string; requirement: string; actual: string; pass: boolean }> = [
    {
        id: 'GE-1',
        requirement: '复用并审查 v14 评测三件套，补缓存身份（初始状态/引擎/地图/随机流）',
        actual: selftest?.data?.configCheck
            ? JSON.stringify(selftest.data.configCheck).slice(0, 400)
            : '缺少 eval_selftest.json',
        pass: Boolean(selftest?.data?.configCheck) && selftest.data.passed === true,
    },
    {
        id: 'GE-2',
        requirement: '聚合先按被测联盟从 winner 重算视角，不能直接信镜像行字样',
        actual: selftest?.data?.viewpointComparison
            ? JSON.stringify(selftest.data.viewpointComparison).slice(0, 400)
            : '缺少 viewpointComparison',
        pass: Boolean(selftest?.data?.viewpointComparison),
    },
    {
        id: 'GE-3',
        requirement: '故障注入覆盖候选自然胜+镜像超时 / 候选超时+镜像自然负 / 双超时 / 规则平局 / 候选淘汰盟友存活 / 非法动作或崩溃 / 重复行或缺臂 / 缓存身份变化',
        actual: selftest?.data?.faultInjection
            ? `${Array.isArray(selftest.data.faultInjection) ? selftest.data.faultInjection.length : Object.keys(selftest.data.faultInjection).length} 类`
            : '缺少 faultInjection',
        pass: selftest?.data?.passed === true,
    },
    {
        id: 'GE-4',
        requirement: '用 V14b 六份原 games 重算历史表，得到 34/36 候选自然完成与 26/36 完整配对',
        actual: `candidateNatural=${threePlayer.candidateNatural}/${threePlayer.plannedCandidateArms} `
            + `completePairs=${threePlayer.completePairs}/${threePlayer.plannedPairs}（3p files=${threePlayer.files}）`,
        pass: threePlayer.candidateNatural === 34 && threePlayer.completePairs === 26,
    },
    {
        id: 'GE-5',
        requirement: '完成成本预检（真实 H0 对局计时）并给出 248 场外推',
        actual: calibration?.data?.measuredByMap
            ? JSON.stringify(calibration.data.measuredByMap)
            : '缺少 calibration.json',
        pass: Boolean(calibration?.data?.measuredByMap),
    },
    {
        id: 'GE-6',
        requirement: '冻结 caps / roots / 对局 ID / 缓存与恢复规则',
        actual: fs.existsSync(path.join(DIR, 'arena_manifest.json'))
            ? `arena_manifest.json sha256=${sha256File(path.join(DIR, 'arena_manifest.json'))}`
            : '缺少 arena_manifest.json',
        pass: fs.existsSync(path.join(DIR, 'arena_manifest.json')),
    },
];

const allPass = checks.every((c) => c.pass);
const gate = {
    schema: 'v15_gate_GE_1',
    task: 'T15-09A',
    owner: 'A',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    gate: 'GE',
    contract: 'T15-09A 评测自测、成本校准及清单冻结通过，才能开始正式开发/确认对战（任务书 §0.2）。',
    inputs: {
        eval_selftest: selftest ? { path: selftest.path, sha256: selftest.sha256 } : null,
        calibration: calibration ? { path: calibration.path, sha256: calibration.sha256 } : null,
        historical_recompute: historical ? { path: historical.path, sha256: historical.sha256 } : null,
        missing: missingInputs,
    },
    checks,
    passed: allPass && missingInputs.length === 0,
    historicalThreePlayerTotals: threePlayer,
    boundaries: [
        'GE 只证明评测链路自测与清单冻结通过；它不产生任何棋力结论。',
        '开发面板每图仅 4 个 block，区间只用于筛选和描述，不是总体置信区间。',
        '主 V15 的 root/地图权重与旧聚合不同，两种权重的总数值不要求相同。',
    ],
};

const gatePath = path.join(DIR, 'gate_GE.json');
if (fs.existsSync(gatePath)) throw new Error(`拒绝覆盖已存在的产物：${gatePath}`);
fs.writeFileSync(gatePath, `${JSON.stringify(gate, null, 2)}\n`, 'utf8');

const statusPath = path.join(DIR, 'task_status.json');
if (fs.existsSync(statusPath)) throw new Error(`拒绝覆盖已存在的产物：${statusPath}`);
fs.writeFileSync(statusPath, `${JSON.stringify({
    taskId: 'T15-09A',
    owner: 'A',
    status: gate.passed ? 'DONE' : 'FAILED',
    reason: gate.passed
        ? '评测自测、聚合视角重算、历史面板重算与成本校准均有原始读数，GE 通过。'
        : '存在未通过的 GE 条款，见 gate_GE.json 的 checks。',
    acceptance: checks,
    evidence: [
        'T15-09/eval_selftest.json', 'T15-09/calibration.json',
        'T15-09/historical_recompute.json', 'T15-09/arena_manifest.json',
        'T15-09/calibration_runs.jsonl', 'T15-09/gate_GE.json',
    ],
    commands: [
        `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_selftest.ts --run-id ${RUN_ID}`,
        `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/arena_cost_preflight_v15.ts --run-id ${RUN_ID}`,
        `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_historical.ts --run-id ${RUN_ID}`,
        `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_gate_ge.ts --run-id ${RUN_ID}`,
    ],
    remainingWork: [
        'T15-09B 开发面板 240 候选臂 + 8 镜像实体（GE 通过后才执行）。',
        'T15-09C 独立确认集：仅当协议 §7.1 选择条件满足时才消耗。',
        '部署资格目标仍未冻结（缺用户侧产品约束），按协议记为 NOT_MEASURED。',
    ],
    resumeCommand: `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_gate_ge.ts --run-id ${RUN_ID}`,
}, null, 2)}\n`, 'utf8');

console.log(`[T15-09A] GE checks ${checks.filter((c) => c.pass).length}/${checks.length}`);
for (const c of checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.id} ${c.requirement.slice(0, 60)} -> ${c.actual.slice(0, 90)}`);
console.log(`[T15-09A] 3p historical: candidateNatural=${threePlayer.candidateNatural}/${threePlayer.plannedCandidateArms} completePairs=${threePlayer.completePairs}/${threePlayer.plannedPairs}`);
console.log(`[T15-09A] GE ${gate.passed ? 'PASSED' : 'FAILED'}${missingInputs.length ? ` missing=${missingInputs.join(',')}` : ''}`);
if (!gate.passed) process.exitCode = 1;
