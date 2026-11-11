/**
 * V15/T15-02：GR gate 判定（owner B）。
 *
 * 只读已产出的 T15-02 原始读数，转成逐条验收结论；不重新计算规则语义。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/gate_v15_gr.ts --run-id <runId>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) { console.error('usage: ... v15/tools/gate_v15_gr.ts --run-id <runId>'); process.exit(2); }
const DIR = path.resolve('v15', 'out', RUN_ID, 'T15-02');
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
const load = (name: string) => {
    const abs = path.join(DIR, name);
    return fs.existsSync(abs)
        ? { path: `T15-02/${name}`, sha256: sha256File(abs), data: JSON.parse(fs.readFileSync(abs, 'utf8')) }
        : null;
};

const projection = load('combat_projection_results.json');
const contract = load('schema_contract.json');
const compat = load('schema_compatibility.json');
const cost = load('cost_record.json');

const groups = projection?.data?.groupSummary ?? [];
const byGroup = (name: string) => groups.find((g: any) => g.group === name) ?? { cases: 0, passed: 0, failed: 0 };

const checks = [
    {
        id: 'GR-1',
        requirement: '以真实引擎 attack 顺序为权威：主动伤害→状态→攻击者经验/升级→反击资格→反击伤害',
        actual: projection?.data?.engineAuthority ?? 'missing',
        pass: Boolean(projection?.data?.engineAuthority),
    },
    {
        id: 'GR-2',
        requirement: '升级边界正反例与真实引擎一致（经验 0 → 25/25；经验 90 → 22/22）',
        actual: `A_upgrade_projection ${byGroup('A_upgrade_projection').passed}/${byGroup('A_upgrade_projection').cases}`,
        pass: byGroup('A_upgrade_projection').cases > 0 && byGroup('A_upgrade_projection').failed === 0,
    },
    {
        id: 'GR-3',
        requirement: '反击资格正反例（射程、counter_storm、击杀无反击、致盲）与引擎一致',
        actual: `B ${byGroup('B_counter_eligibility').passed}/${byGroup('B_counter_eligibility').cases}, `
            + `C ${byGroup('C_status_effects').passed}/${byGroup('C_status_effects').cases}`,
        pass: byGroup('B_counter_eligibility').failed === 0 && byGroup('C_status_effects').failed === 0,
    },
    {
        id: 'GR-4',
        requirement: '三种 schema 在同一状态上的语义读数可区分（v13 原状态反算 / v14 缺升级投影 / v15 完整结算）',
        actual: `D_schema_semantics ${byGroup('D_schema_semantics').passed}/${byGroup('D_schema_semantics').cases}`,
        pass: byGroup('D_schema_semantics').failed === 0,
    },
    {
        id: 'GR-5',
        requirement: '预测调用不修改原状态（无状态污染）',
        actual: `${(projection?.data?.results ?? []).filter((r: any) => r.stateUnchangedAfterPrediction).length}/${projection?.data?.results?.length ?? 0} 用例状态摘要未变`,
        pass: (projection?.data?.results ?? []).length > 0
            && (projection?.data?.results ?? []).every((r: any) => r.stateUnchangedAfterPrediction),
    },
    {
        id: 'GR-6',
        requirement: 'schema 是语义身份而非维度别名；未知 schema fail-fast',
        actual: `supported=${(contract?.data?.supportedSchemas ?? []).length}, unknownRejected=${compat?.data?.unknownSchemaRejected}`,
        pass: (contract?.data?.supportedSchemas ?? []).length === 4 && compat?.data?.unknownSchemaRejected === true,
    },
    {
        id: 'GR-7',
        requirement: '历史 V13/V14 权重按各自 schema 加载并保留历史 golden（V13=50、V14=25、V15=22）',
        actual: JSON.stringify(compat?.data?.impact ?? {}).slice(0, 240),
        pass: compat?.data?.impact?.historicalV13CounterGolden === 50
            && compat?.data?.impact?.historicalV14UpgradeGolden === 25
            && compat?.data?.impact?.currentV15UpgradeGolden === 22,
    },
    {
        id: 'GR-8',
        requirement: '新实现未因每候选全引擎模拟显著变慢（编码不调用 engine.step）',
        actual: cost ? `v15=${cost.data.v15CurrentMsPerCall.toFixed(4)}ms/call v14=${cost.data.v14NoExpProjectionMsPerCall.toFixed(4)}ms/call` : 'missing',
        pass: Boolean(cost) && cost!.data.engineStepUsedInEncoding === false
            && cost!.data.v15CurrentMsPerCall < 1.0,
    },
];

const passed = checks.every((c) => c.pass) && Boolean(projection) && Boolean(contract) && Boolean(compat);
const gate = {
    schema: 'v15_gate_GR_1',
    task: 'T15-02',
    owner: 'B',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    gate: 'GR',
    contract: 'T15-02 规则及 schema 正反例通过，才能冻结新 schema 数据（任务书 §0.2）。',
    inputs: {
        combat_projection_results: projection ? { path: projection.path, sha256: projection.sha256 } : null,
        schema_contract: contract ? { path: contract.path, sha256: contract.sha256 } : null,
        schema_compatibility: compat ? { path: compat.path, sha256: compat.sha256 } : null,
        cost_record: cost ? { path: cost.path, sha256: cost.sha256 } : null,
    },
    combatCases: projection?.data?.cases ?? 0,
    combatPassed: projection?.data?.passed ?? 0,
    groupSummary: groups,
    checks,
    passed,
    boundaries: [
        'GR 只证明反击投影与 schema 分派在声明的用例范围内与引擎一致；不证明整体棋力。',
        '历史 V13/V14 语义只用于复核历史权重，不构成当前规则正确性的 oracle。',
        '已有 145 条规则断言通过不能代替本 gate 的新增升级断言。',
    ],
};

const out = path.join(DIR, 'gate_GR.json');
if (fs.existsSync(out)) throw new Error(`拒绝覆盖已存在的产物：${out}`);
fs.writeFileSync(out, `${JSON.stringify(gate, null, 2)}\n`, 'utf8');

const statusPath = path.join(DIR, 'task_status.json');
if (!fs.existsSync(statusPath)) {
    fs.writeFileSync(statusPath, `${JSON.stringify({
        taskId: 'T15-02',
        owner: 'B',
        status: passed ? 'DONE' : 'FAILED',
        reason: passed
            ? '反击升级投影与 schema 分派均与真实引擎一致；正反例、无污染与历史兼容都有原始读数。'
            : '存在未通过的 GR 条款，见 gate_GR.json。',
        acceptance: checks,
        evidence: [
            'T15-02/combat_projection_results.json', 'T15-02/schema_contract.json',
            'T15-02/schema_compatibility.json', 'T15-02/cost_record.json',
            'T15-02/golden_inputs.jsonl', 'T15-02/golden_outputs.jsonl', 'T15-02/gate_GR.json',
        ],
        commands: [
            `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/combat_projection_v15.ts --run-id ${RUN_ID}`,
            `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/gate_v15_gr.ts --run-id ${RUN_ID}`,
        ],
        remainingWork: [
            '完整战后 HP/等级/状态作为辅助验证（本轮只做了反击本身的读数与状态无污染检查）。',
            '候选构建仍不依赖标签的独立复核（由 T15-04 的输入身份测试覆盖）。',
        ],
        resumeCommand: `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/gate_v15_gr.ts --run-id ${RUN_ID}`,
    }, null, 2)}\n`, 'utf8');
}

console.log(`[T15-02] GR checks ${checks.filter((c) => c.pass).length}/${checks.length} combat=${gate.combatPassed}/${gate.combatCases}`);
for (const c of checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.id} ${c.requirement.slice(0, 55)} -> ${String(c.actual).slice(0, 100)}`);
console.log(`[T15-02] GR ${passed ? 'PASSED' : 'FAILED'}`);
if (!passed) process.exitCode = 1;
