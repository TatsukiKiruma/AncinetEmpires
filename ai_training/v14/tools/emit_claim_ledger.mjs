/**
 * V14/T14-11：生成本轮声明台账（claim_ledger.json）。
 *
 * 台账的每一条只做两件事：
 * 1. 复述报告里的主张与它的类型（MEASURED / CODE_CONFIRMED / HISTORICAL / HYPOTHESIS）；
 * 2. 指向本轮原始记录文件，并由脚本**现场核对文件是否存在**（不靠人工声明）。
 *
 * 这样报告里的每个主结论都能被机械追溯，而不是靠上轮总结循环证明。
 *
 * 用法：
 *   node v14/tools/emit_claim_ledger.mjs --run-id <runId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, fileIdentity, writeJson, gitInfo } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260925_t14b');
const runDir = `v14/out/${runId}`;
const priorDir = 'v14/out/v14_20260924_t14';

const CLAIMS = [
    {
        id: 'C01-head-identity',
        claim: '真实 HEAD 与任务书声明基线一致，差异全部来自工作区的未提交修改。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-00/source_snapshot.json`, `${runDir}/T14-00/source_delta.json`],
        refutes: null,
    },
    {
        id: 'C02-review-counts',
        claim: 'V13 v3.1 子集的全部计数与审查记录逐项一致（3181 行 / 存储候选 764105 / 声明合法 803275 / 缺候选状态 1949 / 治疗缺行动者 2645 / 招募候选 99 且全为标签），输入 SHA 一致。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-00/recheck_v13_evidence.json`],
        refutes: null,
    },
    {
        id: 'C03-old-repro-broken',
        claim: 'v14/review/audit_v13_evidence.mjs 目前跑不通，原因是工作区的 decodeAction 改为引用模块级 UNIT_CONFIGS；这是源码差异导致复现入口失效，不是审查读数被推翻。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-00/review_repro_audit.txt`, `${runDir}/T14-00/recheck_v13_evidence.json`],
        refutes: null,
    },
    {
        id: 'C04-env-misjudgement',
        claim: '上一轮把 npx/tsc/vitest 记为不可用是入口解析问题（Windows 上 npx 是 .cmd），本轮直接执行本地 JS 入口后 tsc 与 vitest 均可运行；v11 的两个 unittest 失败是分支既有问题（账本命名与测试期望不一致）。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-00/environment.json`, `${runDir}/T14-00/acceptance_checklist.md`],
        refutes: '上一轮 environment.json 中 toolAvailability 的 ENOENT 判读',
    },
    {
        id: 'C05-rule-suite',
        claim: '规则与战术夹具套件本轮重跑：54 夹具 / 145 条已验证谓词全部通过，0 失败 0 UNKNOWN；oracle 由真实引擎一步执行支撑。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-01/rule_suite_results.json`],
        refutes: null,
    },
    {
        id: 'C06-codec',
        claim: '编解码往返本轮重跑：74/74 通过，19/19 非法输入被正确拒绝，覆盖 16 种动作类型。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-02/codec_roundtrip.json`],
        refutes: null,
    },
    {
        id: 'C07-duplicate-impact',
        claim: '数据集中存在跨分区完全相同的任务：150 组，val 3.31% 与 test 6.98% 的行在 train 中出现过；全量 top-1 59.53% → 去重后 58.39%（虚高 1.13 个百分点），val 36.69% → 35.42%，test 40.34% → 37.39%。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-02/dataset_duplicate_impact.json`, `${runDir}/T14-04/dataset_v14_collision_scan.json`],
        refutes: '「按 root 家族切分就足以保证离线读数无重复收益」的隐含假设',
    },
    {
        id: 'C08-parity-loader-bug',
        claim: 'python/verify_parity.py 的加载器写死 24 通道 / 32 维语义，导致 V14 检查点无法加载：修复前 48/48 个案例全部无法比对（casesCompared=0、pythonFailures=48）。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-03/forward_parity_report.md`],
        refutes: '「跨语言一致性已经验证过」的说法',
    },
    {
        id: 'C09-parity-fixed',
        claim: '修复后 TS 与 Python 在同一检查点、同一输入上：logits 最大绝对差 3.81e-06、trunk Z 1.19e-06、最高分动作下标不一致 0/48，覆盖 14/14 种动作类型。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-03/ts_python_forward_parity.json`],
        refutes: null,
    },
    {
        id: 'C10-tiny-no-alias',
        claim: '128 个 tiny 状态的目标候选输入两两不同、同行无重复、状态编码无重复、招募 one-hot 齐全 ⇒ 上一轮 96.09% 不是输入别名，不需要新增特征。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-04/tiny_fit_alias_diagnosis.json`],
        refutes: '「tiny-fit 失败说明还需要补特征/换网络」的猜测',
    },
    {
        id: 'C11-tiny-root-cause',
        claim: '预登记阶梯逐档隔离：M0 96.88% → M1（只改调度）96.88% → M2（去 weight decay）98.44% → M3（提到 8000 更新）100%；M4/M5 无额外收益。瓶颈是权重衰减 + 总更新预算。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-04/tiny_fit_ladder_v2.json`],
        refutes: null,
    },
    {
        id: 'C12-tiny-acceptance',
        claim: 'stageA（8000 更新）3 个 seed 中 2 个达标（seed 1337 为 126/128）；stageB（16000 更新）3/3 达标 128/128，seed 1337 在第 1022 个 epoch 拟合。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-04/tiny_fit_acceptance.json`],
        refutes: null,
    },
    {
        id: 'C13-tiny-export',
        claim: '导出后经 TS 推理路径复验：3 个 seed 均为 100%，与 Python 侧预测零不一致。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-04/tiny_fit_ts_verify.json`],
        refutes: null,
    },
    {
        id: 'C14-train-reproducible',
        claim: '三 seed 基础训练读数与上一轮逐位一致（best val 38.00% / 38.31% / 38.06%；各 3000 更新、96000 曝光、6400/6400 唯一优化样本、0 未优化）⇒ 训练链路可复现。',
        kind: 'MEASURED',
        evidence: [
            `${runDir}/T14-06/c1_s42/c1_s42.ledger_summary.json`,
            `${runDir}/T14-06/c1_s1337/c1_s1337.ledger_summary.json`,
            `${runDir}/T14-06/c1_s2026/c1_s2026.ledger_summary.json`,
        ],
        refutes: null,
    },
    {
        id: 'C15-2p-negative',
        claim: '2p Duel 三个 seed 各 8 对全部自然完成，候选 0 胜 0 平 8 负，配对差值 -0.5，区间 [-0.5,-0.5]（block=4，小样本）。',
        kind: 'MEASURED',
        evidence: [
            `${runDir}/T14-06/aggregate/duel2p_c1s42.aggregate.json`,
            `${runDir}/T14-06/aggregate/duel2p_c1s1337.aggregate.json`,
            `${runDir}/T14-06/aggregate/duel2p_c1s2026.aggregate.json`,
        ],
        refutes: null,
    },
    {
        id: 'C16-3p-completion-improved',
        claim: '把 3p 的 wall cap 从 60s 提高到 300s 后，完成率由上一轮 8.3% 提升到 75%（seed 42/1337 各 9/12、seed 2026 8/12），候选出现 1 场自然获胜；剩余 10 对截断全部是「候选已自然失利、镜像被墙钟截断」。',
        kind: 'MEASURED',
        evidence: [
            `${runDir}/T14-06/aggregate/frozen3p_c1s42.aggregate.json`,
            `${runDir}/T14-06/aggregate/frozen3p_c1s1337.aggregate.json`,
            `${runDir}/T14-06/aggregate/frozen3p_c1s2026.aggregate.json`,
            `${priorDir}/T14-06/aggregate/frozen3p_c1s42.aggregate.json`,
        ],
        refutes: null,
    },
    {
        id: 'C17-failure-attribution',
        claim: '2p 四 seed 共 237 个候选决策窗口：0 次错过引擎可判定的一步致胜；12/12 有占领机会时选择了占领；0 个窗口出现敌军站在己方城堡；每局各 1 次「仍有合法动作却结束回合」（同一 step=114 / turn=6）。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-06/failure_attribution_summary.json`, `${runDir}/T14-06/failure_windows_duel2p.jsonl`],
        refutes: '「失败可以直接归因于漏掉致命一击或不当占领」的假设（在本判据范围内不成立）',
    },
    {
        id: 'C18-end-turn-skew',
        claim: '训练数据里 end_turn 目标只占 113/9547 ≈ 1.2%，而 move/wait/attack 合计约 86%；每次对局都在仍有 5 个非 end_turn 合法动作时结束回合。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-06/failure_windows_duel2p.jsonl`, `${priorDir}/T14-02/dataset_contract.json`],
        refutes: null,
    },
    {
        id: 'C19-teacher-legal',
        claim: '启发式教师 T-legal 通过：40 个真实决策窗口，输出违规 0。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-07/teacher_qualification_probe.json`],
        refutes: null,
    },
    {
        id: 'C20-teacher-nondeterministic',
        claim: '启发式教师 T-label 可复现性未通过：40 个窗口里 1 个不可复现（seed1 step37，三次调用给出两个不同动作），原因定位到 heuristic_ai.ts:243 的 this.rng()*25。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-07/teacher_qualification_probe.json`, `${runDir}/T14-07/teacher_qualification_report.md`],
        refutes: '「教师是确定性函数，因此标签天然可复现」的隐含假设',
    },
    {
        id: 'C21-teacher-not-strong',
        claim: 'T-strong（GT）未取得：未运行独立开发对战，也未在冻结教师确认集上取得正向配对改善；搜索蒸馏分支保持 DEFERRED。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-07/teacher_qualification_probe.json`],
        refutes: null,
    },
    {
        id: 'C22-dagger-confounded',
        claim: '上一轮 D0/D1/D2 对照的混淆未控制：D1 只有 1070 个唯一状态（重复约 5.98×）而 D2 有 4787 个（约 1.34×），相差 3.5 倍，因此 D1 与 D2 之差不能归因于「教师访问状态 vs 学生访问状态」。',
        kind: 'HISTORICAL',
        evidence: [`${priorDir}/T14-08/dagger_groups_summary.json`],
        refutes: '「D0/D1/D2 已经分离出学生状态纠错的贡献」的读法',
    },
    {
        id: 'C23-no-promotion',
        claim: '发布建议 NO_PROMOTION：开发阶段方向明确为负（2p 区间不跨 0；3p 全计划区间上界 ≤ -0.083），无候选值得进入冻结确认；生产默认策略仍未改动。',
        kind: 'MEASURED',
        evidence: [`${runDir}/promotion_decision.json`],
        refutes: null,
    },
    {
        id: 'C24-train-curve-anomaly',
        claim: '训练循环末段会打印 train_loss=0.0000 / train_acc=0.00%，而同一时刻的 state.pt 重评正常且 logits 有限（degenerateCount=0）⇒ 这是上报口径异常，不是权重崩塌；本项未解释，已单列。',
        kind: 'MEASURED',
        evidence: [`${runDir}/T14-04/train_collapse_diagnosis.json`, `${runDir}/T14-04/ladder_L0/train.log`],
        refutes: '「训练在末段发生了数值崩塌」的读法',
    },
];

const ledger = {
    schema: 'v14_claim_ledger_1',
    task: 'T14-11',
    runId,
    generatedAt: new Date().toISOString(),
    codeIdentity: gitInfo(),
    note: '中文：每条主张都必须在 evidence 里指向本轮原始记录；脚本现场核对文件存在性。'
        + 'refutes 字段说明该主张推翻了哪一个既有读法，避免用上轮总结给本轮结论作循环证明。',
    claims: CLAIMS.map((entry) => ({
        ...entry,
        evidenceChecks: entry.evidence.map((file) => {
            const identity = fileIdentity(file);
            return { path: file, exists: identity.exists, sha256: identity.sha256, bytes: identity.bytes };
        }),
        allEvidenceExists: entry.evidence.every((file) => fileIdentity(file).exists),
    })),
};

ledger.summary = {
    total: ledger.claims.length,
    byKind: ledger.claims.reduce((acc, entry) => {
        acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
        return acc;
    }, {}),
    claimsWithMissingEvidence: ledger.claims.filter((entry) => !entry.allEvidenceExists).map((entry) => entry.id),
    refutations: ledger.claims.filter((entry) => entry.refutes).map((entry) => ({ id: entry.id, refutes: entry.refutes })),
};

writeJson(path.join(runDir, 'claim_ledger.json'), ledger);
console.log(`[T14-11] claims=${ledger.summary.total} byKind=${JSON.stringify(ledger.summary.byKind)}`);
console.log(`[T14-11] 缺证据的主张: ${ledger.summary.claimsWithMissingEvidence.length}`);
for (const id of ledger.summary.claimsWithMissingEvidence) console.log('   ' + id);
