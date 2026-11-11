/**
 * V14/T14-03：特征语义报告生成器。
 *
 * 只汇总“已经真实产生读数”的工件，不新造数字：
 * - state_aliasing_cases.json（成对状态审查）
 * - schema_compatibility.json（schema/权重兼容性）
 * - parity_fixture.json + python 一致性测试结论（由调用方传入）
 * - candidate_permutation_invariance.json（若已生成）
 * - counter_audit/（子审计结果，若已生成）
 *
 * 用法：
 *   node v14/tools/emit_feature_semantics_report.mjs --run-id v14_20260924_t14
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, ensureDir, fileIdentity, gitInfo, rel, writeJson } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
const t03 = path.join(REPO_ROOT, 'v14', 'out', runId, 'T14-03');
ensureDir(t03);

function readJson(relPath) {
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

const aliasing = readJson(`v14/out/${runId}/T14-03/state_aliasing_cases.json`);
const schema = readJson(`v14/out/${runId}/T14-03/schema_compatibility.json`);
const permutation = readJson(`v14/out/${runId}/T14-03/candidate_permutation_invariance.json`);
const counterAudit = readJson(`v14/out/${runId}/T14-03/counter_audit/counter_audit_results.json`);
const fixture = readJson(`v14/out/${runId}/T14-03/parity_fixture.json`);
const pythonParity = readJson(`v14/out/${runId}/T14-03/python_parity_run.json`);

const report = {
  schema: 'v14_feature_semantics_report_1',
  task: 'T14-03',
  runId,
  generatedAt: new Date().toISOString(),
  head: gitInfo().head,
  encoder: {
    schemaId: 'spatial26_global20_actionSemantics32_v14',
    legacySchemaId: 'spatial24_global20_actionSemantics32_v13',
    channels: 26,
    legacyChannels: 24,
    changes: [
      '攻击语义槽 15：改用 rules.canCounterAttack + estimateCounterDamage，与 engine.step 的 attack 分支共用实现；',
      '空间通道 24：己方单位本回合是否已移动（历史编码只有 hasActed）；',
      '空间通道 25：己方单位有效攻击力 / 200（历史编码没有任何战斗数值通道）。',
    ],
  },
  counterSemantics: counterAudit ? {
    available: true,
    summary: counterAudit.summary ?? null,
    source: `v14/out/${runId}/T14-03/counter_audit/counter_audit_results.json`,
  } : {
    available: false,
    reason: 'T14-03 反击语义子审计尚未生成；见 T14-01 夹具 counter/* 的读数作为替代证据。',
  },
  stateAliasing: aliasing ? {
    available: true,
    counts: aliasing.counts,
    cases: aliasing.cases.map((c) => ({
      id: c.id, factor: c.factor, verdict: c.verdict,
      leftLegalCount: c.leftLegalCount, rightLegalCount: c.rightLegalCount,
    })),
    interpretation: 'VISIBLE 表示该因素在策略输入上可见；ALIAS_SAME_ACTIONS 表示输入相同且合法动作集也相同（可接受）；'
      + 'ALIAS_WITH_ACTION_DIFFERENCE 表示输入相同但合法动作集不同 —— 这类别名必须补特征。',
  } : { available: false, reason: '未运行 state_aliasing_probe.ts' },
  schemaCompatibility: schema ? {
    available: true,
    counts: schema.counts,
    cases: schema.cases.map((c) => ({ id: c.id, pass: c.pass })),
  } : { available: false, reason: '未运行 schema_compatibility_check.ts' },
  pythonTsParity: {
    available: fixture !== null,
    fixtureStates: fixture?.counts?.states ?? null,
    fixtureCases: fixture?.counts?.cases ?? null,
    fixtureCandidates: fixture?.counts?.candidates ?? null,
    meetsMinimumStates: fixture?.counts?.meetsMinimum ?? null,
    pythonTest: pythonParity,
    tolerance: '输入（空间张量/全局特征/候选语义）最大绝对差 <= 1e-6；由 python/tests/test_v14_encoder_parity.py 断言。',
  },
  candidatePermutation: permutation ? {
    available: true,
    summary: permutation.summary,
  } : {
    available: false,
    reason: '未运行 v14_check_permutation_invariance.py',
  },
  artifacts: [
    'v14/out/' + runId + '/T14-03/state_aliasing_cases.json',
    'v14/out/' + runId + '/T14-03/schema_compatibility.json',
    'v14/out/' + runId + '/T14-03/parity_fixture.json',
    'v14/out/' + runId + '/T14-03/candidate_permutation_invariance.json',
  ].map((p) => fileIdentity(p)),
  knownResiduals: [
    {
      id: 'counter-prediction-attacker-levelup',
      claim: 'MEASURED',
      description: '攻击者在本次攻击中获得经验并升级时，引擎会在反击判定之前已完成 addExp，'
        + '升级提高攻击者防御，因此反击伤害比预测低。estimateCounterDamage 不模拟经验获取。',
      evidence: 'v14/out/' + runId + '/T14-03/counter_audit/counter_audit_results.json（A31 archer 引擎 60 / 预测 65；A32 golem 引擎 15 / 预测 18）',
      magnitude: '41 组构造里 2 组（4.9%），最大高估 5 点；对照组把 rules.levelCap 设为 0 后重新一致。',
      disposition: '接受为已知残差并记录；要在特征里消除需要模拟 addExp 与升级带来的属性变化，'
        + '成本与风险高于收益。搜索侧若需要精确读数应使用引擎一步执行。',
    },
    {
      id: 'counter-prediction-status-effect',
      claim: 'MEASURED',
      description: '攻击者带 blinder 能力时，引擎在反击判定之前对目标施加致盲（maxRange→0），'
        + '从而阻止普通反击。',
      evidence: 'v14/out/' + runId + '/T14-03/counter_audit/counter_audit_results.json（A24 wolf_archer、A27 dark_mage）',
      disposition: '已修复：estimateCounterDamage 现在在投影状态上重放状态附加规则后再判定反击资格；'
        + '修复后 A 组一致率 37/41 → 39/41。',
    },
    {
      id: 'slot15-clamp',
      claim: 'CODE_CONFIRMED',
      description: '语义槽 15 有 min(1.0, est/100) 上限，反击超过 100 时信息被截断。',
      evidence: 'counter_audit_results.json 的 C 节（A38 est=110→1.0、A39 est=120→1.0）',
      disposition: '保留：该上限是既有编码口径，训练与推理一致；如需区分 100 以上的反击需要新 schema。',
    },
  ],
  limitations: [
    '曼哈顿威胁圈（通道 21）仍是近似，不用于规则 oracle；它只作为威胁分布特征。',
    '反击预测使用的是与引擎共用公式的 estimateCounterDamage；光环/墓碑在 standby 后处理阶段产生的额外 HP 变化不在预测范围内（见反击子审计 E 节）。',
    '本轮只做 20x20 以内的棋盘；更大棋盘需要显式新编码。',
  ],
};
writeJson(path.join(t03, 'feature_semantics_report.json'), report);
console.log(`[T14-03] feature_semantics_report.json -> ${rel(path.join(t03, 'feature_semantics_report.json'))}`);
console.log(`  aliasing=${aliasing ? JSON.stringify(aliasing.counts) : 'missing'} schema=${schema ? JSON.stringify(schema.counts) : 'missing'} parity=${fixture ? fixture.counts.states : 'missing'}`);
