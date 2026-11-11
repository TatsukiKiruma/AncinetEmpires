/**
 * V15/T15-02：反击结算投影、schema 分派与历史兼容的正式验收工具（owner B）。
 *
 * 交付物（写入 `v15/out/<runId>/T15-02/`）：
 *   - combat_projection_results.json   逐案例的引擎真值 / 预测值 / 三种 schema 编码值
 *   - schema_contract.json             schema → 通道数/语义维/语义变体的显式分派表
 *   - schema_compatibility.json        旧权重按声明 schema 加载的接受/拒绝结果
 *   - golden_inputs.jsonl / golden_outputs.json            可复核的 golden 输入与输出
 *   - cost_record.json                 相同状态集上的编码/推理耗时与 clone 次数
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/combat_projection_v15.ts \
 *     --run-id v15_YYYYMMDD_<用途>
 *
 * 原则：
 *   1. 所有「真实反击」读数都来自真实 GameEngine.step，不由本工具重算；
 *   2. 预测值只调用公共 rules 接口，不在工具里复制战斗公式；
 *   3. 每个案例都检查预测前后原状态字节不变（无污染）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeState, rulesOf, type StateSpec } from '../../v14/tools/rule_fixtures';
import { GameEngine } from '../../src/game/engine';
import {
    estimateCounterDamage,
    estimateCounterDamageWithoutExpProjection,
    calculateDamage,
} from '../../src/game/rules';
import {
    encodeCandidateActionSpatial,
    ENCODER_SCHEMA_ID_V13,
    ENCODER_SCHEMA_ID_V14,
    ENCODER_SCHEMA_ID_V15,
    ENCODER_SCHEMA_CHANNELS,
    ENCODER_SCHEMA_SEMANTIC_DIM,
    ENCODER_SCHEMA_SEMANTICS_VARIANT,
    SUPPORTED_ENCODER_SCHEMA_IDS,
    actionSemanticsVariantForSchema,
    type ActionSemanticsVariant,
} from '../../src/game/ai/spatial_tensor_encoder';
import { loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import type { Action, GameState } from '../../src/game/types';

// ------------------------------------------------------------------ CLI
function argValue(name: string): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const RUN_ID = argValue('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) {
    console.error('usage: ... v15/tools/combat_projection_v15.ts --run-id <runId>');
    process.exit(2);
}
const OUT_DIR = path.resolve('v15', 'out', RUN_ID, 'T15-02');
fs.mkdirSync(OUT_DIR, { recursive: true });

function writeJson(name: string, payload: unknown): void {
    const target = path.join(OUT_DIR, name);
    if (fs.existsSync(target)) throw new Error(`拒绝覆盖已存在的产物：${target}`);
    fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeJsonl(name: string, rows: unknown[]): void {
    const target = path.join(OUT_DIR, name);
    if (fs.existsSync(target)) throw new Error(`拒绝覆盖已存在的产物：${target}`);
    fs.writeFileSync(target, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

// 为了让 TS 转译环境不报缺失依赖，统一使用 ESM 形式导入 crypto。
import { createHash } from 'node:crypto';
const sha256Hex = (text: string): string => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

// ------------------------------------------------------------------ 案例定义

interface CombatCase {
    id: string;
    group: string;
    note: string;
    spec: StateSpec;
    /** 攻击者经验（用于跨升级阈值案例）。 */
    attackerExp?: number;
    attackerHp?: number;
    targetHp?: number;
    /** 期望的引擎反击伤害；null 表示本案例不预设期望值，只记录读数。 */
    expectCounter: number | null;
    /** 期望每一种 schema 的语义槽 15 读数（×100 后）；未给出则只记录。 */
    expectEncoded?: Partial<Record<string, number | null>>;
}

function twoSoldiers(distance: number, extra: Partial<StateSpec> = {}): StateSpec {
    return {
        players: [0, 1],
        units: [
            { id: 'attacker', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0 },
            { id: 'target', ownerId: 1, unitClass: 'soldier', x: 2 + distance, y: 2, level: 0 },
        ],
        ...extra,
    };
}

const cases: CombatCase[] = [
    // ---- A 组：升级投影（T15-02 的核心反例） ----
    {
        id: 'A01_exp0_no_upgrade',
        group: 'A_upgrade_projection',
        note: '经验 0 的 0 级士兵：攻击后升不到 1 级，predicted/engine 都应为 25。',
        spec: twoSoldiers(1),
        attackerExp: 0,
        expectCounter: 25,
        expectEncoded: { v14: 25, v15: 25 },
    },
    {
        id: 'A02_exp60_below_threshold',
        group: 'A_upgrade_projection',
        note: '经验 60：加 30 后为 90，仍低于 100 阈值，不升级，反击 25。',
        spec: twoSoldiers(1),
        attackerExp: 60,
        expectCounter: 25,
        expectEncoded: { v14: 25, v15: 25 },
    },
    {
        id: 'A03_exp69_just_below_threshold',
        group: 'A_upgrade_projection',
        note: '经验 69：加 30 后 99，刚好低于阈值，不升级。',
        spec: twoSoldiers(1),
        attackerExp: 69,
        expectCounter: 25,
        expectEncoded: { v14: 25, v15: 25 },
    },
    {
        id: 'A04_exp70_exact_threshold',
        group: 'A_upgrade_projection',
        note: '经验 70：加 30 后恰好 100，跨过阈值升到 1 级，防御 5→10，引擎反击 25→22。'
            + 'v13 历史语义在原状态上反算，得到 50（攻击者原状态防御 5，士兵攻击 55）。',
        spec: twoSoldiers(1),
        attackerExp: 70,
        expectCounter: 22,
        expectEncoded: { v13: 50, v14: 25, v15: 22 },
    },
    {
        id: 'A05_exp90_audit_case',
        group: 'A_upgrade_projection',
        note: 'V14b 审核反例：经验 90 加 30 到 120，升 1 级；旧预测 25 / 引擎 22。',
        spec: twoSoldiers(1),
        attackerExp: 90,
        expectCounter: 22,
        expectEncoded: { v13: 50, v14: 25, v15: 22 },
    },
    {
        id: 'A06_exp100_already_level1',
        group: 'A_upgrade_projection',
        note: '攻击前已经是 1 级、经验 100：加 30 到 130 跨过 2 级阈值(300)? 不到；'
            + '所以不再升级，反击按 1 级防御算。实际引擎读数须由 cases 运行结果确定。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'attacker', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 1 },
                { id: 'target', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0 },
            ],
        },
        attackerExp: 100,
        expectCounter: null,
        expectEncoded: { v13: 45, v14: 18, v15: 18 },
    },
    {
        id: 'A07_level_cap_reached',
        group: 'A_upgrade_projection',
        note: '攻击者已达 levelCap=3：再加经验也不会升级，反击不应被投影改变。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'attacker', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 3 },
                { id: 'target', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0 },
            ],
            rules: { levelCap: 3 } as never,
        },
        attackerExp: 600,
        expectCounter: null,
    },
    {
        id: 'A08_kill_no_counter',
        group: 'A_upgrade_projection',
        note: '一击击杀目标：目标死亡不反击，反击必须为 0（不能把升级/治疗算成反击）。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'attacker', ownerId: 0, unitClass: 'berserker', x: 2, y: 2, level: 0 },
                { id: 'target', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0, hp: 40 },
            ],
        },
        expectCounter: 0,
        expectEncoded: { v13: 0, v14: 0, v15: 0 },
    },

    // ---- B 组：射程与反击资格正反例 ----
    {
        id: 'B01_ranged_catapult_distance3',
        group: 'B_counter_eligibility',
        note: 'V13 复核反例：3 格外投石车攻击士兵，引擎反击 0；v13 历史语义应为 50。'
            + '士兵 pdef=5、投石车 atk=55、防御加成 0，因此历史原状态反算为 50。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'catapult', x: 1, y: 2, level: 0 },
                { id: 'd', ownerId: 1, unitClass: 'soldier', x: 4, y: 2, level: 0 },
            ],
        },
        expectCounter: 0,
        expectEncoded: { v14: 0, v15: 0 },
    },
    {
        id: 'B02_wolf_archer_range2_vs_melee',
        group: 'B_counter_eligibility',
        note: '2 格外狼射手攻击近战士兵：士兵 maxRange=1，够不到，反击 0。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0 },
                { id: 'd', ownerId: 1, unitClass: 'wolf_archer', x: 4, y: 2, level: 0 },
            ],
        },
        expectCounter: 0,
    },
    {
        id: 'B03_adjacent_melee_counters',
        group: 'B_counter_eligibility',
        note: '相邻近战：双方都能反击，反击 > 0。',
        spec: twoSoldiers(1),
        expectCounter: 25,
    },
    {
        id: 'B04_counter_storm_distance2',
        group: 'B_counter_eligibility',
        note: '狂战士带 counter_storm：距离 2 也能反击（classic 反击风暴）。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'dark_mage', x: 2, y: 2, level: 0 },
                { id: 'd', ownerId: 1, unitClass: 'berserker', x: 4, y: 2, level: 0 },
            ],
        },
        expectCounter: null,
    },

    // ---- C 组：状态附加与反击资格 ----
    {
        id: 'C01_blinder_blocks_normal_counter',
        group: 'C_status_effects',
        note: '狼射手带 blinder：攻击相邻士兵后附加致盲，士兵射程被归零，反击 0。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'wolf_archer', x: 2, y: 2, level: 0 },
                { id: 'd', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0 },
            ],
        },
        expectCounter: 0,
        expectEncoded: { v14: 0, v15: 0 },
    },
    {
        id: 'C02_existing_blinded_target',
        group: 'C_status_effects',
        note: '目标已处于致盲状态：射程为 0，反击 0。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0 },
                {
                    id: 'd', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0,
                    status: { type: 'blinded', remainingTurns: 2 } as never,
                },
            ],
        },
        expectCounter: 0,
    },
    {
        id: 'C03_existing_poisoned_target',
        group: 'C_status_effects',
        note: '目标已中毒：毒不改变射程，相邻反击仍应发生。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0 },
                {
                    id: 'd', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0,
                    status: { type: 'poisoned', remainingTicks: 2 } as never,
                },
            ],
        },
        expectCounter: 25,
    },
    {
        id: 'C04_poisoner_source',
        group: 'C_status_effects',
        note: '狼带 poisoner：附加中毒不阻止反击。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'wolf', x: 2, y: 2, level: 0 },
                { id: 'd', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0 },
            ],
        },
        expectCounter: null,
    },

    // ---- D 组：历史 V13/V14/新 V15 三条语义同时读数 ----
    {
        id: 'D01_upgrade_boundary_all_schemas',
        group: 'D_schema_semantics',
        note: '同一升级边界状态下三种 schema 的槽 15 读数必须分别为 50 / 25 / 22'
            + '（历史原状态反算 / V14 缺升级投影 / V15 完整结算）。',
        spec: twoSoldiers(1),
        attackerExp: 70,
        expectCounter: 22,
        expectEncoded: { v13: 50, v14: 25, v15: 22 },
    },
    {
        id: 'D02_reverse_attack_direction',
        group: 'D_schema_semantics',
        note: '由 1 级经验 70 的士兵攻击 0 级士兵：目标不升级，反击按目标自身 HP 缩放。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'attacker', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 1 },
                { id: 'target', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0 },
            ],
        },
        attackerExp: 100,
        expectCounter: null,
    },
];

// ------------------------------------------------------------------ 执行

interface CaseReadout {
    id: string;
    group: string;
    note: string;
    attackerExp: number | null;
    engineCounter: number | null;
    engineInfo: string;
    engineAttackerHpLoss: number;
    engineTargetHpLoss: number;
    rulesEstimateCounterDamage: number | null;
    rulesEstimateWithoutExpProjection: number | null;
    rulesCalculateDamage: number | null;
    encodedCounterByVariant: Record<string, number>;
    stateUnchangedAfterPrediction: boolean;
    stateBeforeSha: string;
    stateAfterPredictionSha: string;
    expectations: { key: string; expected: number | null; actual: number | null; pass: boolean }[];
    pass: boolean;
    failReasons: string[];
}

const readouts: CaseReadout[] = [];
const goldenInputs: unknown[] = [];
const goldenOutputs: unknown[] = [];

function counterFromInfo(info: string): number | null {
    const m = /counterattacked for (\d+) dmg/.exec(info);
    // 没有 "counterattacked" 文案即没有发生反击；引擎只在确实反击时才追加这句，
    // 因此这里返回 0 而不是 null——null 会与「本工具读不到读数」混淆。
    return m ? Number(m[1]) : 0;
}

for (const c of cases) {
    const state = makeState(c.spec);
    const attacker = state.units.find((u) => u.id === 'attacker' || u.id === 'a');
    const target = state.units.find((u) => u.id === 'target' || u.id === 'd');
    const failReasons: string[] = [];
    if (!attacker || !target) {
        failReasons.push('夹具缺 attacker/target');
    }
    if (attacker && c.attackerExp !== undefined) attacker.exp = c.attackerExp;
    if (attacker && c.attackerHp !== undefined) attacker.hp = c.attackerHp;
    if (target && c.targetHp !== undefined) target.hp = c.targetHp;

    const attackerId = attacker?.id ?? 'attacker';
    const targetId = target?.id ?? 'target';
    const action: Action = { type: 'attack', attackerId, targetId };
    const actionCode = `attack:${attackerId}:${targetId}`;

    const beforeSha = sha256Hex(JSON.stringify(state));
    const estimate = estimateCounterDamage(state, attackerId, targetId);
    const estimateNoExp = estimateCounterDamageWithoutExpProjection(state, attackerId, targetId);
    const dmg = calculateDamage(state, attackerId, targetId);
    const afterPredictionSha = sha256Hex(JSON.stringify(state));
    const unchanged = beforeSha === afterPredictionSha;
    if (!unchanged) failReasons.push('预测调用修改了原状态（状态污染）');

    // 三种 schema 语义变体的候选编码读数（同一状态、同一候选、只换语义变体）。
    const encoded: Record<string, number> = {};
    for (const [label, variant] of [
        ['v13', 'v13_legacy'],
        ['v14', 'v14_no_exp_projection'],
        ['v15', 'v15_current'],
    ] as Array<[string, ActionSemanticsVariant]>) {
        const feat = encodeCandidateActionSpatial(state, 0, action, 'v2', variant);
        // 语义槽是 Float32Array：×100 后存在 ~1e-6 级表示误差（与 V14 审核同样的口径），
        // 因此读数保留 3 位小数后比较，而不是直接比浮点相等。
        encoded[label] = Number((Number(feat.semantics[15]) * 100).toFixed(3));
    }

    // 真实引擎读数。
    const engineBefore = JSON.parse(JSON.stringify(state)) as GameState;
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)));
    const result = engine.step(action);
    const engineCounter = counterFromInfo(result.info);
    const afterAttacker = result.state.units.find((u) => u.id === attackerId);
    const afterTarget = result.state.units.find((u) => u.id === targetId);
    const beforeAttacker = engineBefore.units.find((u) => u.id === attackerId);
    const beforeTarget = engineBefore.units.find((u) => u.id === targetId);
    const attackerHpLoss = beforeAttacker && afterAttacker ? beforeAttacker.hp - afterAttacker.hp : null;
    const targetHpLoss = beforeTarget && afterTarget ? beforeTarget.hp - afterTarget.hp : null;

    // 期望值核对。
    const expectations: CaseReadout['expectations'] = [];
    if (c.expectCounter !== null) {
        expectations.push({
            key: 'engineCounter',
            expected: c.expectCounter,
            actual: engineCounter,
            pass: engineCounter === c.expectCounter,
        });
        expectations.push({
            key: 'rulesEstimateCounterDamage',
            expected: c.expectCounter,
            actual: estimate,
            pass: estimate === c.expectCounter,
        });
    }
    for (const [label, expected] of Object.entries(c.expectEncoded ?? {})) {
        expectations.push({
            key: `encoded.${label}`,
            expected: expected as number,
            actual: encoded[label],
            pass: encoded[label] === expected,
        });
    }
    // 结构性断言：预测必须与引擎一致（这是 T15-02 的核心验收）。
    if (engineCounter !== null) {
        expectations.push({
            key: 'rulesEstimate==engineCounter',
            expected: engineCounter,
            actual: estimate,
            pass: estimate === engineCounter,
        });
    }
    // 反击伤害不可能超过攻击者最大 HP，也不可能为负。
    if (estimate < 0) failReasons.push('预测反击为负');
    for (const e of expectations) if (!e.pass) failReasons.push(`期望不符：${e.key} 期望 ${e.expected} 实际 ${e.actual}`);

    readouts.push({
        id: c.id,
        group: c.group,
        note: c.note,
        attackerExp: c.attackerExp ?? attacker?.exp ?? null,
        engineCounter,
        engineInfo: result.info,
        engineAttackerHpLoss: attackerHpLoss,
        engineTargetHpLoss: targetHpLoss,
        rulesEstimateCounterDamage: estimate,
        rulesEstimateWithoutExpProjection: estimateNoExp,
        rulesCalculateDamage: dmg,
        encodedCounterByVariant: encoded,
        stateUnchangedAfterPrediction: unchanged,
        stateBeforeSha: beforeSha,
        stateAfterPredictionSha: afterPredictionSha,
        expectations,
        pass: failReasons.length === 0,
        failReasons,
    });

    goldenInputs.push({
        caseId: c.id,
        actionCode,
        state,
        attackerExp: c.attackerExp ?? null,
        encoderSchemaVariants: Object.keys(encoded),
    });
    goldenOutputs.push({
        caseId: c.id,
        engineCounter,
        rulesEstimateCounterDamage: estimate,
        encodedCounterByVariant: encoded,
        engineInfo: result.info,
    });
}

const failed = readouts.filter((r) => !r.pass);
const groupSummary = Array.from(new Set(readouts.map((r) => r.group))).map((g) => {
    const rows = readouts.filter((r) => r.group === g);
    return { group: g, cases: rows.length, passed: rows.filter((r) => r.pass).length, failed: rows.filter((r) => !r.pass).length };
});

// ------------------------------------------------------------------ schema 契约与兼容

const schemaContract = {
    schema: 'v15_schema_contract_1',
    task: 'T15-02',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    defaultSchemaId: ENCODER_SCHEMA_ID_V15,
    supportedSchemas: SUPPORTED_ENCODER_SCHEMA_IDS.map((id) => ({
        schemaId: id,
        spatialChannels: ENCODER_SCHEMA_CHANNELS[id],
        semanticDim: (ENCODER_SCHEMA_SEMANTIC_DIM as Record<string, number>)[id],
        semanticsVariant: ENCODER_SCHEMA_SEMANTICS_VARIANT[id],
    })),
    rules: [
        'schema 是权重解释输入语义的身份，不是维度别名；v14 与 v15 形状相同（26/53）而语义不同。',
        '状态与候选编码一律由权重声明的 encoderSchemaId 分派语义变体，shared policy 不再只按通道数判断。',
        '未知 schema 在加载与推理两处 fail-fast；未声明 schema 的权重只在 loadSpatialResNetFromJson 中按 v13 历史语义补齐。',
        '历史缺陷（原状态无条件反算反击）固定在 v13_legacy 变体里，不构成当前规则正确性的 oracle。',
    ],
    variantSemantics: {
        v1_legacy: '原状态无条件反算反击（与 v13 相同口径，用于 24/24 的历史 v1 权重）。',
        v13_legacy: 'estCounter = (defender.hp - estDmg > 0) ? calculateDamage(原状态, defender→attacker) : 0。',
        v14_no_exp_projection: '有引擎反击资格，但缺少攻击者 addExp 升级投影；升级边界下高估反击。',
        v15_current: '完整引擎结算顺序（伤害→状态→攻击者经验/升级→反击资格→反击伤害），与引擎逐位一致。',
    },
    unknownSchemaBehaviour: 'actionSemanticsVariantForSchema 抛错；SpatialResNetPredictor 构造函数抛错；不做维度猜测。',
};

// 旧权重兼容：真实 shared policy 路径，而不是只调用编码器单函数。
const legacyCheckpointPath = 'src/game/ai/models/spatial_resnet_v2_checkpoint.json';
const compatRows: unknown[] = [];
if (fs.existsSync(legacyCheckpointPath)) {
    const legacyJson = fs.readFileSync(legacyCheckpointPath, 'utf8');
    const load = (expected: string | null) => {
        try {
            const w = loadSpatialResNetFromJson(legacyJson, { expectedEncoderSchemaId: expected });
            return { ok: true, schema: w.encoderSchemaId, channels: w.stem.inChannels };
        } catch (err) {
            return { ok: false, error: String((err as Error).message) };
        }
    };
    compatRows.push({
        checkpoint: legacyCheckpointPath,
        declaresSchema: JSON.parse(legacyJson).encoderSchemaId ?? null,
        note: '历史 v2 检查点自带 v13 schema；以下验证显式分派是否拒绝把它当成 v14/v15 解释。',
        loadWithNull: load(null),
        loadExpectingV13: load(ENCODER_SCHEMA_ID_V13),
        loadExpectingV14: load(ENCODER_SCHEMA_ID_V14),
        loadExpectingV15: load(ENCODER_SCHEMA_ID_V15),
    });
}

// 未知 schema 必须被拒绝。
let unknownSchemaRejected = false;
let unknownSchemaError: string | null = null;
try {
    actionSemanticsVariantForSchema('spatial99_global99_actionSemantics99_v99');
} catch (err) {
    unknownSchemaRejected = true;
    unknownSchemaError = String((err as Error).message);
}

const schemaCompatibility = {
    schema: 'v15_schema_compatibility_1',
    task: 'T15-02',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    legacyCheckpoints: compatRows,
    unknownSchemaRejected,
    unknownSchemaError,
    impact: {
        v13Weights: '继续按 v13_legacy 语义编码：3 格外投石车 estCounter=50（历史值），反击资格缺陷保留在历史分支。',
        v14Weights: '按 v14_no_exp_projection 语义编码：反击资格正确，但升级边界仍高估（25 vs 22）。',
        v15Weights: '按 v15_current 语义编码：与引擎逐位一致。',
        historicalV13CounterGolden: 50,
        historicalV14UpgradeGolden: 25,
        currentV15UpgradeGolden: 22,
        whichRunsAreAffected: 'V13/V14 已保存的历史评测缓存使用各自时代的语义；本轮不重写其结论，新数据一律用 V15。',
    },
};

// ------------------------------------------------------------------ 成本

const costState = makeState(twoSoldiers(1));
const attackAction: Action = { type: 'attack', attackerId: 'attacker', targetId: 'target' };
const COST_ITERS = 2000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < COST_ITERS; i += 1) {
    encodeCandidateActionSpatial(costState, 0, attackAction, 'v2', 'v15_current');
}
const t1 = process.hrtime.bigint();
for (let i = 0; i < COST_ITERS; i += 1) {
    encodeCandidateActionSpatial(costState, 0, attackAction, 'v2', 'v14_no_exp_projection');
}
const t2 = process.hrtime.bigint();
const costRecord = {
    schema: 'v15_combat_projection_cost_1',
    task: 'T15-02',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    iterations: COST_ITERS,
    v15CurrentMsPerCall: Number(t1 - t0) / 1e6 / COST_ITERS,
    v14NoExpProjectionMsPerCall: Number(t2 - t1) / 1e6 / COST_ITERS,
    note: 'V15 变体比 V14 多一次 JSON 深拷贝投影（estimateCounterDamage 内部）；'
        + '实测差值用于回答「新实现是否因每候选全引擎模拟显著变慢」。两种变体都不运行引擎 step。',
    engineStepUsedInEncoding: false,
};

// ------------------------------------------------------------------ 输出

const projection = {
    schema: 'v15_combat_projection_1',
    task: 'T15-02',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    scope: '反击结算投影（含攻击者升级）、反击资格正反例、状态无污染、三种 schema 语义读数',
    engineAuthority: 'src/game/engine.ts case api_attack 的结算顺序：伤害→状态→攻击者 addExp→反击资格→反击伤害',
    cases: readouts.length,
    passed: readouts.length - failed.length,
    failed: failed.length,
    groupSummary,
    encodableVariants: Object.keys(ENCODER_SCHEMA_SEMANTICS_VARIANT).length,
    results: readouts,
};

writeJson('combat_projection_results.json', projection);
writeJson('schema_contract.json', schemaContract);
writeJson('schema_compatibility.json', schemaCompatibility);
writeJson('cost_record.json', costRecord);
writeJsonl('golden_inputs.jsonl', goldenInputs);
writeJsonl('golden_outputs.jsonl', goldenOutputs);

console.log(`[T15-02] combat cases=${projection.cases} passed=${projection.passed} failed=${projection.failed}`);
for (const g of groupSummary) console.log(`  ${g.group}: ${g.passed}/${g.cases}`);
for (const r of failed) console.log(`  FAIL ${r.id}: ${r.failReasons.join(' | ')}`);
console.log(`[T15-02] unknown schema rejected=${unknownSchemaRejected}`);
console.log(`[T15-02] cost v15=${costRecord.v15CurrentMsPerCall.toFixed(4)}ms/call v14=${costRecord.v14NoExpProjectionMsPerCall.toFixed(4)}ms/call`);
if (failed.length > 0) process.exitCode = 1;
else console.log('[T15-02] combat_projection PASSED');
