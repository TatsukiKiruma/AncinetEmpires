/**
 * V15/T15-11：生成证据链清单（`claim_ledger.json` 与 `package_manifest.json`）。
 *
 * 为什么必须由工具生成而不是手写：
 *   任务书 §12 第 3 条要求「校验源码、协议、数据、模型、输出 hash 链」。
 *   手写清单无法保证与磁盘一致；本工具对每个引用文件计算**真实字节 SHA256**，
 *   并显式区分「已证明」与「未执行」，避免把目录存在当成结论存在。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/package_v15_manifest.ts \
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
if (!RUN_ID) { console.error('usage: ... v15/tools/package_v15_manifest.ts --run-id <runId>'); process.exit(2); }

const REPO = process.cwd();
const RUN_DIR = path.resolve(REPO, 'v15', 'out', RUN_ID);
const rel = (abs: string): string => path.relative(REPO, abs).split(path.sep).join('/');
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

function entry(relPath: string, role: string): { path: string; role: string; present: boolean; bytes: number | null; sha256: string | null } {
    const abs = path.resolve(REPO, relPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return { path: relPath, role, present: false, bytes: null, sha256: null };
    }
    return { path: relPath, role, present: true, bytes: fs.statSync(abs).size, sha256: sha256File(abs) };
}

// ------------------------------------------------------------------ 证据文件清单
const EVIDENCE: Array<[string, string]> = [
    // 协议与身份
    ['v15/out/' + RUN_ID + '/T15-00/source_start.json', '启动时源码身份（40 个受管文件的字节 SHA + git 身份）'],
    ['v15/out/' + RUN_ID + '/T15-00/protocol.json', '冻结实验协议（seeds、roots、预算、caps、统计设置）'],
    ['v15/out/' + RUN_ID + '/T15-00/prior_evidence.json', '可复用测量与必须重跑接口的引用清单'],
    ['v15/out/' + RUN_ID + '/T15-00/v14b_errata.md', 'V14b 审核八条勘误'],
    ['v15/out/' + RUN_ID + '/T15-00/ownership.md', '文件所有权与集成次序'],
    // T15-01
    ['v15/out/' + RUN_ID + '/T15-01/replay_contract.json', '精确恢复合同与逐窗口 fidelity'],
    ['v15/out/' + RUN_ID + '/T15-01/labeler_contract.json', 'L1 键/PRNG/版本与标签在允许集内统计'],
    ['v15/out/' + RUN_ID + '/T15-01/labeler_reproducibility.json', '固定键复现 + 跨键多样性 + 候选重排不变性'],
    ['v15/out/' + RUN_ID + '/T15-01/query_isolation.json', '标签查询开/关的行为轨迹比对'],
    ['v15/out/' + RUN_ID + '/T15-01/gate_GL.json', 'GL gate 逐条结论'],
    // T15-02
    ['v15/out/' + RUN_ID + '/T15-02/combat_projection_results.json', '18 个战斗案例的引擎/预测/三 schema 读数'],
    ['v15/out/' + RUN_ID + '/T15-02/schema_contract.json', 'schema → 通道/语义维/语义变体分派表'],
    ['v15/out/' + RUN_ID + '/T15-02/schema_compatibility.json', '历史权重接受/拒绝与历史 golden'],
    ['v15/out/' + RUN_ID + '/T15-02/cost_record.json', '编码成本（不调用引擎 step）'],
    ['v15/out/' + RUN_ID + '/T15-02/gate_GR.json', 'GR gate 逐条结论'],
    // T15-03
    ['v15/out/' + RUN_ID + '/T15-03/trainer_lifecycle_results.json', '六条针对性回归的原始读数'],
    ['v15/out/' + RUN_ID + '/T15-03/resume_equivalence.json', '连续运行 vs 恢复的等价性'],
    ['v15/out/' + RUN_ID + '/T15-03/sampler_contract.json', '16+16 来源配额与计划覆盖率'],
    ['v15/out/' + RUN_ID + '/T15-03/lr_trace.json', '逐 update LR'],
    ['v15/out/' + RUN_ID + '/T15-03/gate_GO.json', 'GO gate 逐条结论'],
    // T15-04
    ['v15/out/' + RUN_ID + '/T15-04/dataset_v15.jsonl', 'V15 重编码 + L1 重标的去重数据集'],
    ['v15/out/' + RUN_ID + '/T15-04/dataset_manifest.json', '数据集清单与最低规模达标情况'],
    ['v15/out/' + RUN_ID + '/T15-04/dedup_audit.json', '去重前后跨分区重复的独立读数'],
    ['v15/out/' + RUN_ID + '/T15-04/input_identity_tests.json', '输入身份四项测试'],
    ['v15/out/' + RUN_ID + '/T15-04/label_conflicts.jsonl', '同输入不同 L1 目标的冲突实例'],
    ['v15/out/' + RUN_ID + '/T15-04/gate_GD.json', 'GD gate 逐条结论'],
    // T15-05
    ['v15/out/' + RUN_ID + '/T15-05/forward_parity_rerun_v15schema.json', 'V15 schema 权重的 TS/Python 前向一致性'],
    ['v15/out/' + RUN_ID + '/T15-05/forward_parity_c2_s42_final.json', 'C2-42 final 的前向一致性'],
    ['v15/out/' + RUN_ID + '/T15-05/permutation_update.json', '候选重排下的梯度/一次更新一致性'],
    ['v15/out/' + RUN_ID + '/T15-05/tie_break.json', '受控精确并列的 tie-break 读数'],
    ['v15/out/' + RUN_ID + '/T15-05/tiny_fit_v15_task_composition.json', '128 状态诊断集与 V14 参考集的构成对比'],
    ['v15/out/' + RUN_ID + '/T15-05/gate_GP.json', 'GP gate 逐条结论（未通过）'],
    // T15-06
    ['v15/out/' + RUN_ID + '/T15-06/c2_summary.json', 'C2 三 seed 的台账复算读数'],
    ['v15/out/' + RUN_ID + '/T15-06/frozen_c2.json', '冻结的 C2 模型身份'],
    ['v15/out/' + RUN_ID + '/T15-06/baseline_comparison.md', 'C2 三 seed 中文比较与解释边界'],
    ['v15/out/' + RUN_ID + '/T15-06/gate_GC.json', 'GC gate 逐条结论'],
    ['v15/out/' + RUN_ID + '/T15-09/selection_decision.json', 'T15-09C 选择判定（按协议 §7.1 从 260 行真实面板计算）'],
    ['v15/out/' + RUN_ID + '/T15-09/dev_panel_verification.json', '12 模型面板的权重/schema/runtime 身份核验'],
    ['v15/out/' + RUN_ID + '/T15-05/gate_GP_final.json', 'GP gate（含可比性 128 状态回归后的判定）'],
    ['v15/out/' + RUN_ID + '/T15-05/comparable/comparable_dataset_report.json', '可比性诊断集的构造与候选集一致性核对'],
    ['v15/out/' + RUN_ID + '/T15-05/comparable/tiny_cmp_ts_reeval.json', '可比性回归 final 的 TS 重评（128/128）'],
    // T15-09
    ['v15/out/' + RUN_ID + '/T15-09/eval_selftest.json', '评测自测与故障注入'],
    ['v15/out/' + RUN_ID + '/T15-09/calibration.json', '真实 H0 对局成本校准与 248 场外推'],
    ['v15/out/' + RUN_ID + '/T15-09/historical_recompute.json', 'V14b 六份原 games 重算（34/36、26/36）'],
    ['v15/out/' + RUN_ID + '/T15-09/arena_manifest.json', '冻结的对局清单、缓存键与恢复规则'],
    ['v15/out/' + RUN_ID + '/T15-09/gate_GE.json', 'GE gate 逐条结论'],
    // 其它 gate
    ['v15/out/' + RUN_ID + '/T15-08/gate_GI.json', 'GI gate（未通过）'],
    ['v15/out/' + RUN_ID + '/T15-10/gate_GT.json', 'GT gate（未启动）'],
    ['v15/out/' + RUN_ID + '/task_status.json', '各任务与 gate 的真实状态汇总'],
    ['v15/out/' + RUN_ID + '/final_report.md', '最终中文报告'],
];

// 模型权重单独列，便于第三方定位每个模型的真实输入语义
const MODELS: Array<[string, string]> = [];
for (const seed of [42, 1337, 2026]) {
    MODELS.push([`v15/out/${RUN_ID}/T15-06/c2_s${seed}/c2_s${seed}_final.json`, `C2-${seed} final@3000（schema=v15，开发面板已评估）`]);
    MODELS.push([`v15/out/${RUN_ID}/T15-06/c2_s${seed}/c2_s${seed}_best.json`, `C2-${seed} best（按干净 val 选出）`]);
    for (const [arm, lr] of [['D0', '额外训练控制组'], ['D1', '旧池+H0 新访问数据'], ['D2', '旧池+学生访问数据']] as const) {
        const l = arm.toLowerCase();
        MODELS.push([
            `v15/out/${RUN_ID}/T15-08/${l}_s${seed}/${l}_s${seed}_final.json`,
            `${arm}-${seed} final@1500（${lr}；权重已核验，开发面板未执行）`,
        ]);
    }
}

// 源码与工具
const TOOLS: Array<[string, string]> = [
    ['v15/tools/identity_v15.mjs', '身份/环境/源码包采集'],
    ['v15/tools/capture_git_identity.ps1', 'PowerShell 侧 git/环境采集（Node 无法 spawn）'],
    ['v15/tools/freeze_protocol_v15.mjs', '协议与 root 清单冻结'],
    ['v15/tools/labeler_l1_v15.ts', '独立逐状态标签器 L1'],
    ['v15/tools/replay_contract_v15.ts', '恢复合同 + GL 探针'],
    ['v15/tools/combat_projection_v15.ts', '反击投影与 schema 分派验证'],
    ['v15/tools/gate_v15_gr.ts', 'GR gate 派生'],
    ['v15/tools/gate_v15_rest.ts', 'GO/GD/GC/GI/GT gate 派生'],
    ['v15/tools/dataset_v15.ts', 'V15 数据集构建与输入身份'],
    ['v15/tools/dataset_clean_split_v15.py', '干净 split 实体化'],
    ['v15/tools/train_summarize_c2_v15.py', 'C2 台账复算与汇总'],
    ['v15/tools/eval_v15_gate_ge.ts', 'GE gate 派生'],
    ['v15/tools/package_v15_tasks.ts', '任务状态聚合'],
    ['v15/tools/package_v15_manifest.ts', '本清单生成工具'],
    ['python/tests/test_v15_train_lifecycle.py', '训练生命周期 10 项回归'],
    ['src/game/rules.ts', '反击投影修复（owner B）'],
    ['src/game/abilities.ts', 'projectExpOutcome 与经验常量（owner B）'],
    ['src/game/ai/spatial_tensor_encoder.ts', 'V15 schema 与语义变体分派（owner B）'],
    ['src/game/ai/spatial_conv_net.ts', '预测器 schema 身份与形状校验（owner B）'],
    ['src/game/ai/shared_spatial_policy.ts', 'shared policy schema 分派与空集拒绝（owner B）'],
    ['python/spatial_resnet_model.py', '导出 schema 声明（owner B/C）'],
    ['python/train_spatial_resnet.py', '训练生命周期与按 update 调度（owner C）'],
];

// ------------------------------------------------------------------ claim ledger
interface Claim {
    id: string;
    claim: string;
    status: 'PROVEN' | 'PARTIAL' | 'NOT_EXECUTED' | 'FAILED';
    evidenceKind: 'MEASURED' | 'CODE_CONFIRMED' | 'HISTORICAL' | 'HYPOTHESIS';
    scope: string;
    inputs: string[];
    rawReadings: Record<string, unknown>;
}

const c2 = fs.existsSync(path.join(RUN_DIR, 'T15-06/c2_summary.json'))
    ? JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'T15-06/c2_summary.json'), 'utf8'))
    : null;
const dg = fs.existsSync(path.join(RUN_DIR, 'T15-08/d_group_summary.json'))
    ? JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'T15-08/d_group_summary.json'), 'utf8'))
    : null;
const panel = fs.existsSync(path.join(RUN_DIR, 'T15-09/dev_panel_summary.json'))
    ? JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'T15-09/dev_panel_summary.json'), 'utf8'))
    : null;
const panelModels: string[] = panel?.reports ? Object.keys(panel.reports) : [];
const panelTotals = (key: string) => panel?.reports?.[key]?.totals ?? null;
const panelPoint = (key: string) => panel?.reports?.[key]?.panel?.completePoint ?? null;

const claims: Claim[] = [
    {
        id: 'C-01',
        claim: '反击预测漏掉攻击者升级的缺陷已修复，并在声明的用例范围内与真实引擎逐位一致。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: '18 个受控战斗案例（含 0/69/70/90/100 经验边界、levelCap、击杀、3 格外投石车、致盲、counter_storm）。'
            + '不含「不同兵种 × 全部状态组合」的穷举。',
        inputs: ['T15-02/combat_projection_results.json', 'T15-02/golden_inputs.jsonl', 'T15-02/golden_outputs.jsonl'],
        rawReadings: { cases: 18, passed: 18, auditCaseExp90_predicted: 22, auditCaseExp90_engine: 22, oldPrediction: 25 },
    },
    {
        id: 'C-02',
        claim: 'schema 是语义身份而不是维度别名；v14 与 v15 形状相同但被显式区分，未知 schema fail-fast。',
        status: 'PROVEN',
        evidenceKind: 'CODE_CONFIRMED',
        scope: '加载、编码与 shared policy 三处；实测未知 schema 被拒绝，历史 v13 权重按 v13 语义解释。',
        inputs: ['T15-02/schema_contract.json', 'T15-02/schema_compatibility.json', 'T15-02/gate_GR.json'],
        rawReadings: { supportedSchemas: 4, unknownSchemaRejected: true, c2ModelsLoadAsV15: 3 },
    },
    {
        id: 'C-03',
        claim: 'L1 标签查询不改变行为轨迹；同键可复现、跨键只记多样性。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: '6 个 root（2/3/4 人局）各 120 步的行为轨迹逐动作比对；32 个窗口的固定键三次复现。',
        inputs: ['T15-01/query_isolation.json', 'T15-01/labeler_reproducibility.json', 'T15-01/gate_GL.json'],
        rawReadings: { isolationRoots: 6, allIdentical: true, fixedKeySameLabel: true, fixedKeySameSeed: true },
    },
    {
        id: 'C-04',
        claim: '至少 128 个精确窗口的状态恢复校验全部通过，所有正式标签在允许集内且查询不污染状态。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: '来自 48 个归档 root 的 192 个 VERIFIED_REPLAY 窗口 + 4 个联盟/pending/特殊动作夹具。',
        inputs: ['T15-01/replay_contract.json', 'T15-01/labeler_contract.json'],
        rawReadings: { verifiedWindows: 192, labelsInAllowedSet: '196/196', statePollutedQueries: 0 },
    },
    {
        id: 'C-05',
        claim: '训练到达总更新上限后正常退出，不再产生空 epoch 或伪零 epoch；预算可从 ledger 精确复算。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: 'C2 三 seed 的真实训练 + 10 项针对性回归。',
        inputs: ['T15-06/c2_summary.json', 'T15-03/trainer_lifecycle_results.json', 'T15-03/gate_GO.json'],
        rawReadings: c2 ? {
            seeds: c2.seeds.map((s: any) => ({
                seed: s.seed, stopReason: s.stopReason, updates: s.recomputedUpdatesFromLedger,
                exposures: s.recomputedExposuresFromLedger, zeroConsumptionEpochs: s.zeroConsumptionEpochs,
            })),
        } : {},
    },
    {
        id: 'C-06',
        claim: '基础数据已按新 schema/L1 重建，正式池 root 家族交集与干净 val 的输入身份交集均为 0。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: '复用 9,547 条 V14 原始状态快照；不是新生成的独立数据。',
        inputs: ['T15-04/dataset_manifest.json', 'T15-04/dedup_audit.json', 'T15-04/gate_GD.json'],
        rawReadings: {
            sourceRows: 9547, uniquePolicyInputKeys: 9103, trainRows: 6140, cleanValRows: 1545,
            rootFamilyIntersection: 0, labelConflictKeys: 9,
            preDedupIntersections: { trainVal: 55, trainTest: 109, valTest: 51 },
        },
    },
    {
        id: 'C-07',
        claim: '新 schema 的 128 状态 train-only 回归达到可拟合性门槛（≥127/128 且 CE<0.05）。',
        status: 'FAILED',
        evidenceKind: 'MEASURED',
        scope: '一次 16,000 更新的 train-only 运行，128 个训练状态（全部进入优化）。'
            + '注意：该诊断集与 V14 参考集任务构成不同，因此不能直接与 V14 的 128/128 比较。',
        inputs: ['T15-05/gate_GP.json', 'T15-05/tiny_fit_v15_task_composition.json'],
        rawReadings: { updates: 16000, optimizedSamples: 128, trainHit: '117/128', trainCE: 0.1716, threshold: '127/128, CE<0.05' },
    },
    {
        id: 'C-08',
        claim: '纠错实验的受控因素已被真正控制住（V14b 的 D 组混淆已消除）。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: '9 次训练（3 seed × D0/D1/D2）。核验内容：更新/曝光可复算、每步来源配额、初始权重字节 SHA、'
            + '共享旧池前 16 位的逐 update sampleId、schema 声明、LR 端点。**不含**对局结果。',
        inputs: ['T15-08/d_group_summary.json', 'T15-08/matched_groups.json', 'T15-08/plan_contract_report.json'],
        rawReadings: dg ? {
            runs: dg.runs.length,
            problems: dg.problems.length,
            updateExposure: [...new Set(dg.runs.map((r: any) => `${r.recomputedUpdates}/${r.recomputedExposures}`))],
            initMatchesOwnC2Final: dg.runs.filter((r: any) => r.initMatchesC2Final).length,
            sharedOldPoolPlanLevel: dg.verification?.sharedOldPoolPlanLevel,
            sourceExposureTotals: Object.fromEntries(dg.runs.map((r: any) => [`${r.arm}_s${r.seed}`, r.sourceExposureTotals])),
        } : {},
    },
    {
        id: 'C-09',
        claim: '补充新访问数据（D1）或学生访问分布纠错（D2）比只重复旧池（D0）带来对局改善。',
        status: 'FAILED',
        evidenceKind: 'MEASURED',
        scope: '冻结开发面板 8 个 root block、每模型 20 个候选座位配对；'
            + 'D1−D0 与 D2−D1 的三 seed 平均全计划差值点估计均为 −0.0833，'
            + '且三个 seed 的点估计**没有一个是正的**。范围仅限本轮规模与分层。',
        inputs: ['T15-09/dev_panel_summary.json', 'T15-09/selection_decision.json', 'T15-08/d_group_summary.json'],
        rawReadings: {
            d1_minus_d0: { perSeed: [0.0, 0.0, -0.25], meanPoint: -0.0833, meanLow: -0.0972, positiveSeeds: '0/3' },
            d2_minus_d1: { perSeed: [0.0, 0.0, -0.25], meanPoint: -0.0833, meanLow: -0.0833, positiveSeeds: '0/3' },
            d0_minus_c2: { perSeed: [0.0, 0.0, 0.25], meanPoint: 0.0833, meanLow: 0.0833, positiveSeeds: '1/3' },
            offlineBestValMean: { D0: 0.3487, D1: 0.3620, D2: 0.3611 },
            note: '离线 val 上 D1/D2 高于 D0，但**对局上不成立** —— 这说明离线验证集准确率在本轮不能代理对局表现。',
        },
    },
    {
        id: 'C-10',
        claim: 'C2 三 seed 相对 H0 的开发对局面板结果。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: '冻结开发面板 8 个 root block × 候选座位；每模型 20 个候选座位配对，全部完整、0 错误、0 截断。'
            + '区间在每图 4 个 block 下退化为点，只用于筛选与描述。',
        inputs: ['T15-09/dev_panel_summary.json', 'T15-09/dev_panel_verification.json'],
        rawReadings: panelModels.filter((m) => m.startsWith('c2:')).reduce((acc: Record<string, unknown>, m) => {
            const t = panelTotals(m);
            acc[m] = { completePairs: t?.completePairs, pairs: t?.pairs, wdl: t?.candidateWDL, point: panelPoint(m) };
            return acc;
        }, {}),
    },
    {
        id: 'C-11',
        claim: 'C2 相对 C1（历史三 seed）更强或更弱。',
        status: 'NOT_EXECUTED',
        evidenceKind: 'HYPOTHESIS',
        scope: '不可比：C1 用污染 val、旧 schema、含目标动作的旧去重 key；C2 用干净 val、V15 schema、L1。'
            + 'C1→C2 同时改变多项，不能归因于任何单独一项。',
        inputs: ['T15-06/baseline_comparison.md'],
        rawReadings: {
            c1BestVal: [0.38, 0.3831, 0.3806], c2BestVal: c2 ? c2.seeds.map((s: any) => s.bestValAcc) : [],
            comparable: false,
        },
    },
    {
        id: 'C-12',
        claim: '模型强于当前生产默认策略 H0，可以替换。',
        status: 'FAILED',
        evidenceKind: 'MEASURED',
        scope: '12 个模型（3 C2 + 9 D）在冻结开发面板上相对 H0 的全计划差值点估计**全部 ≤ 0**'
            + '（最好为 −0.1250）。按协议 §7.1 不满足进入独立确认集的条件，确认集未被消耗。',
        inputs: ['T15-09/dev_panel_summary.json', 'T15-09/selection_decision.json'],
        rawReadings: {
            relativeToH0: panelModels.reduce((acc: Record<string, unknown>, m) => {
                acc[m] = panelPoint(m); return acc;
            }, {}),
            bestPoint: Math.max(...panelModels.map((m) => panelPoint(m) ?? -Infinity)),
            decision: 'NO_PROMOTION',
            confirmationSetConsumed: false,
            productionDefault: 'H0（未替换）',
        },
    },
    {
        id: 'C-13',
        claim: '新链路在「与 V14 同任务构成、同超参」的 128 状态诊断上达到可拟合性门槛。',
        status: 'PROVEN',
        evidenceKind: 'MEASURED',
        scope: '从 T14-02 原始状态归档反查 V14 stageB 的同一批 128 个 stateHash（128/128 命中），'
            + '候选集与 V14 归档逐元素一致（128/128），V15 语义重编码 + L1 重标，'
            + '用 V14 的 batch=16 / constant LR / weight decay=0 / 16,000 更新训练。',
        inputs: ['T15-05/comparable/comparable_dataset_report.json', 'T15-05/comparable/tiny_cmp_metrics.json',
            'T15-05/comparable/tiny_cmp_ts_reeval.json', 'T15-05/gate_GP_final.json'],
        rawReadings: {
            pythonTrainHit: '128/128', trainCE: 0.0000019, tsReevalHit: '128/128', tsErrors: 0,
            candidateSetMatchesV14: '128/128', l1LabelMatchesV14StoredTarget: '112/128',
            naturalDistributionTask: '117/128、CE=0.1716（batch=32、与 V14 参考集只有 3 个状态重合，不可比）',
            conclusion: '此前 117/128 不是可拟合性退步的证据；那是更难的自然分布任务。',
        },
    },
    {
        id: 'C-14',
        claim: '「仍有合法动作时 end_turn」是已证实的错误决策。',
        status: 'NOT_EXECUTED',
        evidenceKind: 'HYPOTHESIS',
        scope: '第 114 步的真实合法集里没有招募动作，原报告解释与真实动作集不符；'
            + 'end_turn 占 1.2% 不证明欠采样。反事实工具已实现并跑通小样本，但完整 32 窗口运行未在本会话完成。',
        inputs: ['T15-00/v14b_errata.md'],
        rawReadings: { endTurnShare: 0.012, counterfactualToolImplemented: true, fullRunCompleted: false },
    },
];

// ------------------------------------------------------------------ 输出
const manifest = {
    schema: 'v15_package_manifest_1',
    task: 'T15-11',
    owner: 'A',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    repoRoot: REPO,
    hashAlgorithm: 'sha256（对原始字节）',
    note: '所有 sha256 均由本工具在生成时对磁盘真实字节计算；缺失文件 present=false 且 sha256=null，不伪造。',
    evidenceFiles: EVIDENCE.map(([p, role]) => entry(p, role)),
    models: MODELS.map(([p, role]) => entry(p, role)),
    sourceAndTools: TOOLS.map(([p, role]) => entry(p, role)),
};

const ledger = {
    schema: 'v15_claim_ledger_1',
    task: 'T15-11',
    owner: 'A',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    statusVocabulary: {
        PROVEN: '在声明的 scope 内有原始输入/输出与统计程序支撑。',
        PARTIAL: '部分成立，scope 内有未覆盖部分。',
        FAILED: '已按预登记门槛检验且未通过。',
        NOT_EXECUTED: '尚未执行，因此没有正结论也没有负结论。',
    },
    evidenceVocabulary: {
        MEASURED: '本轮实测读数。',
        CODE_CONFIRMED: '由代码路径确认，未做穷举实验。',
        HISTORICAL: '来自历史工件（保留引用与其 SHA）。',
        HYPOTHESIS: '未验证的推测。',
    },
    overallDecision: {
        relativeToC2: 'D0 相对 C2 三 seed 平均 +0.0833（下界 +0.0833，但只有 1/3 seed 点估计为正，不满足「≥2/3」）；'
            + 'D1−D0 与 D2−D1 均为 −0.0833（0/3 seed 为正）。',
        relativeToH0: '12 个模型（3 C2 + 9 D）的全计划差值点估计全部 ≤ 0，最好为 −0.1250。',
        promotion: 'NO_PROMOTION',
        eligibleForConfirmation: [],
        experimentCompleteness: 'PARTIAL（BP 仅 B5 未通过；T15-07 完整反事实与 T15-10 未完成）',
        confirmationSetConsumed: false,
        productionDefault: 'H0（本轮不执行模型发布或替换）',
        deploymentQualification: 'NOT_MEASURED（缺用户侧产品约束）',
    },
    claims,
};

for (const [name, payload] of [['package_manifest.json', manifest], ['claim_ledger.json', ledger]] as const) {
    const abs = path.join(RUN_DIR, name);
    if (fs.existsSync(abs)) throw new Error(`拒绝覆盖已存在的产物：${abs}`);
    fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

const missingEvidence = manifest.evidenceFiles.filter((e) => !e.present);
const missingModels = manifest.models.filter((e) => !e.present);
const missingTools = manifest.sourceAndTools.filter((e) => !e.present);

console.log(`[T15-11] evidence ${manifest.evidenceFiles.length - missingEvidence.length}/${manifest.evidenceFiles.length}`);
console.log(`[T15-11] models   ${manifest.models.length - missingModels.length}/${manifest.models.length}`);
console.log(`[T15-11] tools    ${manifest.sourceAndTools.length - missingTools.length}/${manifest.sourceAndTools.length}`);
for (const m of missingEvidence) console.log(`  MISSING evidence ${m.path}`);
for (const m of missingModels) console.log(`  MISSING model    ${m.path}`);
for (const m of missingTools) console.log(`  MISSING tool     ${m.path}`);
console.log(`[T15-11] claims: ${claims.map((c) => `${c.id}=${c.status}`).join(' ')}`);
console.log(`[T15-11] wrote claim_ledger.json 与 package_manifest.json`);
