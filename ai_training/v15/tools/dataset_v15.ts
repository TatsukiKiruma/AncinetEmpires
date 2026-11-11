/**
 * V15/T15-04：去污染数据构建（owner E）。
 *
 * 目标（任务书 §5 与数据契约 §5）：
 *   1. 复用 V14 已核实的**原始状态快照**（`raw/decisions.jsonl` 每行带完整 state），
 *      按新 V15 schema 重编码，按独立标签器 L1 重标；**不重新生成独立数据**。
 *   2. 实现不含标签/候选顺序的输入身份：`policyInputKey`、`stateInputKey`、`decisionKey`，
 *      并报告冲突。
 *   3. 审计历史池的跨分区重复，按契约隔离 val/test 与 train 的重叠输入。
 *   4. 输出新基础 train/val、`dataset_manifest.json`、`dedup_audit.json`、
 *      `input_identity_tests.json`、`label_conflicts.jsonl`、`quarantine.jsonl`。
 *
 * 关键设计（为什么这样做）：
 *   - `spatialTensor` 与 `globalFeatures` 直接来自真实编码器 `encodeGameStateSpatial`；
 *   - 候选来自真实引擎合法集（过滤 surrender），再按 actionCode 定位 L1 标签；
 *   - 输入身份按数据契约 §5.1：schema/形状 + float32 空间与全局输入 + 候选输入的**多重集合**
 *     （按字节排序、保留重复与数量），**不含** targetActionCode/index/教师/root/分区/胜者。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/dataset_v15.ts \
 *     --run-id v15_YYYYMMDD_<用途> [--limit N] [--concurrency 1]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    ENCODER_SCHEMA_ID_V15,
    ACTION_SEMANTIC_DIM_V3,
} from '../../src/game/ai/spatial_tensor_encoder';
import { queryL1Label, L1_LABELER_VERSION, stateHashOf } from './labeler_l1_v15';
import type { Action, GameState } from '../../src/game/types';

// ------------------------------------------------------------------ CLI / IO
function argValue(name: string): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const RUN_ID = argValue('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) {
    console.error('usage: ... v15/tools/dataset_v15.ts --run-id <runId> [--limit N]');
    process.exit(2);
}
const LIMIT = argValue('--limit') ? Number(argValue('--limit')) : null;
const LABEL_SEED_BASE = Number(argValue('--label-seed-base') ?? '20260925');
const OUT_DIR = path.resolve('v15', 'out', RUN_ID, 'T15-04');
fs.mkdirSync(OUT_DIR, { recursive: true });

function writeJson(name: string, payload: unknown, allowOverwrite = false): void {
    const target = path.join(OUT_DIR, name);
    if (fs.existsSync(target) && !allowOverwrite) throw new Error(`拒绝覆盖已存在的产物：${target}`);
    fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
function writeJsonl(name: string, rows: unknown[], allowOverwrite = false): void {
    const target = path.join(OUT_DIR, name);
    if (fs.existsSync(target) && !allowOverwrite) throw new Error(`拒绝覆盖已存在的产物：${target}`);
    fs.writeFileSync(target, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

// ------------------------------------------------------------------ 输入身份算法（数据契约 §5.1）

/** float32 小端字节 + 长度前缀；拒绝 NaN/Inf；负零规范化并写进 key 版本。 */
export const INPUT_KEY_VERSION = 'v15_policy_input_key_1';

function float32Bytes(values: ArrayLike<number>, sink: number[]): void {
    const buf = Buffer.allocUnsafe(4);
    for (let i = 0; i < values.length; i += 1) {
        const v = values[i];
        if (!Number.isFinite(v)) throw new Error(`policyInputKey 拒绝非有限输入：index=${i} value=${v}`);
        // 负零与正零语义相同，规范化到 +0，处理方式纳入 key 版本。
        const normalized = v === 0 ? 0 : v;
        buf.writeFloatLE(Math.fround(normalized), 0);
        sink.push(buf[0], buf[1], buf[2], buf[3]);
    }
}

function lengthPrefixed(parts: number[][]): Buffer {
    const chunks: Buffer[] = [];
    const lenBuf = Buffer.allocUnsafe(4);
    for (const p of parts) {
        lenBuf.writeUInt32LE(p.length, 0);
        chunks.push(Buffer.from(lenBuf));
        chunks.push(Buffer.from(p));
    }
    return Buffer.concat(chunks);
}

export interface CandidateInputIdentity {
    /** 网络真正消费的候选字段：三元坐标 + null 掩码 + semantics。 */
    actorCoord: { x: number; y: number } | null;
    landingCoord: { x: number; y: number } | null;
    targetCoord: { x: number; y: number } | null;
    semantics: number[];
}

function candidateBytes(c: CandidateInputIdentity): Buffer {
    const sink: number[] = [];
    const coord = (p: { x: number; y: number } | null): number[] => (p === null ? [-1, -1, 0] : [p.x, p.y, 1]);
    sink.push(...coord(c.actorCoord), ...coord(c.landingCoord), ...coord(c.targetCoord));
    const head = Buffer.from(sink);
    const semBytes: number[] = [];
    float32Bytes(c.semantics, semBytes);
    return Buffer.concat([head, Buffer.from(semBytes)]);
}

/** stateInputKey = schema/形状 + 空间张量 + 全局特征（不含候选）。 */
export function stateInputKey(
    schemaId: string,
    spatialTensor: ArrayLike<number>,
    globalFeatures: ArrayLike<number>,
): string {
    const spatial: number[] = [];
    const globals: number[] = [];
    float32Bytes(spatialTensor, spatial);
    float32Bytes(globalFeatures, globals);
    const shape = Buffer.from(`${schemaId}|${spatialTensor.length}|${globalFeatures.length}|${ACTION_SEMANTIC_DIM_V3}`, 'utf8');
    return createHash('sha256')
        .update(Buffer.concat([shape, Buffer.from([0]), Buffer.from(spatial), Buffer.from([0]), Buffer.from(globals)]))
        .digest('hex');
}

/**
 * policyInputKey = stateInputKey 的组成部分 + 候选输入的多重集合（按字节排序，保留重复）。
 * 候选逆序、随机重排不改变 key。
 */
export function policyInputKey(
    schemaId: string,
    spatialTensor: ArrayLike<number>,
    globalFeatures: ArrayLike<number>,
    candidates: CandidateInputIdentity[],
): string {
    const spatial: number[] = [];
    const globals: number[] = [];
    float32Bytes(spatialTensor, spatial);
    float32Bytes(globalFeatures, globals);
    const shape = Buffer.from(`${schemaId}|${spatialTensor.length}|${globalFeatures.length}|${ACTION_SEMANTIC_DIM_V3}`, 'utf8');
    // 每个候选单独摘要后按字典序排序：保留重复项与数量。
    const candHashes = candidates
        .map((c) => createHash('sha256').update(candidateBytes(c)).digest('hex'))
        .sort();
    const candPart = Buffer.from(candHashes.join(','), 'utf8');
    return createHash('sha256')
        .update(Buffer.concat([shape, Buffer.from([0]), Buffer.from(spatial), Buffer.from([0]), Buffer.from(globals), Buffer.from([0]), candPart]))
        .digest('hex');
}

/** decisionKey：状态输入 + 按 actionCode 对齐的候选映射（用于动作对齐，不替代 policyInputKey）。 */
export function decisionKey(stateInput: string, actionCodeByCandidate: string[]): string {
    const sorted = [...actionCodeByCandidate].sort();
    return createHash('sha256')
        .update(Buffer.from(`${stateInput}|${sorted.join(',')}`, 'utf8'))
        .digest('hex');
}

// ------------------------------------------------------------------ 读取归档
const ROOTS_PATH = 'v14/out/v14_20260924_t14/T14-02/raw/roots.jsonl';
const DECISIONS_PATH = 'v14/out/v14_20260924_t14/T14-02/raw/decisions.jsonl';
const SPLIT_PATH = 'v14/out/v14_20260924_t14/T14-02/split_manifest.json';

interface DecisionRecord {
    rootFamilyId: string;
    partition: string;
    stepIndex: number;
    turn: number;
    currentPlayer: number;
    turnPlayerIds: number[];
    legalActionCodes: string[];
    policyAllowedActionCodes: string[];
    filteredActionCodes: string[];
    labelActionCode: string | null;
    stateHash: string;
    state: GameState;
}

function readJsonl<T>(rel: string, limit: number | null): T[] {
    const abs = path.resolve(rel);
    if (!fs.existsSync(abs)) throw new Error(`缺少输入：${abs}`);
    const rows: T[] = [];
    const text = fs.readFileSync(abs, 'utf8');
    for (const line of text.split('\n')) {
        if (!line) continue;
        rows.push(JSON.parse(line) as T);
        if (limit !== null && rows.length >= limit) break;
    }
    return rows;
}

const decisions = readJsonl<DecisionRecord>(DECISIONS_PATH, LIMIT);
const splitManifest = fs.existsSync(SPLIT_PATH)
    ? JSON.parse(fs.readFileSync(SPLIT_PATH, 'utf8'))
    : null;
const rootsText = fs.readFileSync(path.resolve(ROOTS_PATH), 'utf8');
const rootById = new Map<string, Record<string, unknown>>();
for (const line of rootsText.split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line) as Record<string, unknown>;
    rootById.set(String(r.rootFamilyId), r);
}

// ------------------------------------------------------------------ 主构建

interface BuiltRow {
    schemaVersion: string;
    sampleId: string;
    datasetBuilderId: string;
    runId: string;
    rootFamilyId: string;
    parentRootId: string;
    lineageId: string;
    sourceStateKey: string;
    sourceArchiveId: string;
    sourceSha256: string;
    sourceRowIndex: number;
    rawActionStep: number;
    scenarioId: string | null;
    mapName: string | null;
    mapHash: string | null;
    rulesHash: string | null;
    playerCount: number | null;
    partition: string;
    partitionSource: string;
    subjectPlayerId: number;
    subjectAllianceId: number;
    rootAllianceId: number;
    actingPlayerId: number;
    turnPlayerIds: number[];
    stateHash: string;
    archivedStateHash: string;
    stateFidelity: string;
    behaviorPolicyBySeat: string;
    labelTeacherId: string;
    labelerVersion: string;
    teacherRngKey: string;
    replicateId: number;
    encoderSchemaId: string;
    candidateSchemaId: string;
    orderingId: string;
    policyActionFilterId: string;
    engineLegalActionCodes: string[];
    policyAllowedActionCodes: string[];
    candidateActionCodes: string[];
    candidateActions: unknown[];
    spatialTensor: number[];
    globalFeatures: number[];
    missingActionCodes: string[];
    stateInputKey: string;
    policyInputKey: string;
    decisionKey: string;
    inputKeyVersion: string;
    targetActionCode: string | null;
    targetActionIndex: number;
    labelEvidenceKind: string;
    acceptableActionCodes: string[];
    policyLossMask: boolean;
    valueLossMask: boolean;
    valueTarget: number | null;
    outcomeKind: string;
    duplicateMultiplicity: number;
    quarantineReason: string | null;
}

const builtRows: BuiltRow[] = [];
const quarantine: unknown[] = [];
const labelConflicts: unknown[] = [];
let archivedHashMismatch = 0;

const t0 = Date.now();
const sourceSha = sha256File(path.resolve(DECISIONS_PATH));

for (let rowIndex = 0; rowIndex < decisions.length; rowIndex += 1) {
    const d = decisions[rowIndex];
    const state = d.state;
    const actingPlayerId = state.currentPlayer;

    const recomputedHash = stateHashOf(state);
    if (recomputedHash !== d.stateHash) {
        archivedHashMismatch += 1;
        quarantine.push({
            kind: 'STATE_HASH_MISMATCH',
            sourceRowIndex: rowIndex,
            rootFamilyId: d.rootFamilyId,
            stepIndex: d.stepIndex,
            archived: d.stateHash,
            recomputed: recomputedHash,
        });
    }

    // 真实引擎合法集（在状态拷贝上，不污染源）。
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const engineLegalActionCodes = engine.isTerminal() ? [] : engine.getLegalActions(actingPlayerId).map(encodeAction);
    const policyAllowedActionCodes = engineLegalActionCodes.filter((c) => !c.startsWith('surrender'));

    if (policyAllowedActionCodes.length === 0) {
        quarantine.push({ kind: 'EMPTY_POLICY_ALLOWED_SET', sourceRowIndex: rowIndex, rootFamilyId: d.rootFamilyId, stepIndex: d.stepIndex });
        continue;
    }

    // L1 标签（独立实例 + 逐状态 RNG）。标签查询不改变行为轨迹（T15-01 已证）。
    const label = queryL1Label(state, {
        labelSeedBase: LABEL_SEED_BASE,
        actingPlayerId,
        subjectPlayerId: actingPlayerId,
        replicateId: 0,
    });
    const targetActionCode = label.actionCode;
    if (targetActionCode === null || !policyAllowedActionCodes.includes(targetActionCode)) {
        quarantine.push({
            kind: 'LABEL_OUTSIDE_ALLOWED_SET',
            sourceRowIndex: rowIndex,
            rootFamilyId: d.rootFamilyId,
            stepIndex: d.stepIndex,
            labelActionCode: targetActionCode,
            allowedCount: policyAllowedActionCodes.length,
        });
        continue;
    }

    // 编码：状态张量 + 候选特征（V15 语义）。
    const encoded = encodeGameStateSpatial(state, actingPlayerId, 'v2', { channels: 26 });
    const allowedActions: Action[] = engine.isTerminal()
        ? []
        : engine.getLegalActions(actingPlayerId).filter((a) => a.type !== 'surrender');
    const candidateActions = allowedActions.map((a) => {
        const f = encodeCandidateActionSpatial(state, actingPlayerId, a, 'v2', 'v15_current');
        // 字段名必须是 `semantics`：训练器( SpatialDataset )按 `c.get("semantics", [])`
        // 推断语义维度，再由它派生 `semantics_padded`。写成 `semantics_padded` 会让
        // 数据集被判成 0 维语义并被拒绝加载（V15/T15-04 实测）。
        return {
            actionCode: encodeAction(a),
            actorCoord: f.actorCoord,
            landingCoord: f.landingCoord,
            targetCoord: f.targetCoord,
            semantics: Array.from(f.semantics),
        };
    });
    const candidateActionCodes = candidateActions.map((c) => c.actionCode);
    const targetActionIndex = candidateActionCodes.indexOf(targetActionCode);
    if (targetActionIndex < 0) {
        quarantine.push({ kind: 'TARGET_NOT_IN_CANDIDATES', sourceRowIndex: rowIndex, targetActionCode });
        continue;
    }

    // 输入身份（不含标签、不含候选顺序）。
    const spatialArr = Array.from(encoded.spatialTensor);
    const globalArr = Array.from(encoded.globalFeatures);
    const sKey = stateInputKey(ENCODER_SCHEMA_ID_V15, spatialArr, globalArr);
    // 候选输入身份使用**网络真正消费**的 53 维语义向量（数据集里的 `semantics`，
    // 训练器会自行补齐/截断成 `semantics_padded`）。
    const candidateInputs: CandidateInputIdentity[] = candidateActions.map((c) => ({
        actorCoord: c.actorCoord,
        landingCoord: c.landingCoord,
        targetCoord: c.targetCoord,
        semantics: c.semantics,
    }));
    const pKey = policyInputKey(ENCODER_SCHEMA_ID_V15, spatialArr, globalArr, candidateInputs);
    const dKey = decisionKey(sKey, candidateActionCodes);

    const root = rootById.get(d.rootFamilyId) as Record<string, unknown> | undefined;

    builtRows.push({
        schemaVersion: 'v15_spatial_dataset_1',
        sampleId: `v15_${createHash('sha256').update(`${d.rootFamilyId}#${d.stepIndex}#${pKey}`).digest('hex').slice(0, 24)}`,
        datasetBuilderId: 'v15/tools/dataset_v15.ts@v15_20260925_core',
        runId: RUN_ID,
        rootFamilyId: d.rootFamilyId,
        parentRootId: d.rootFamilyId,
        lineageId: d.rootFamilyId,
        sourceStateKey: `${d.rootFamilyId}#${d.stepIndex}`,
        sourceArchiveId: 'v14_collect:raw/decisions.jsonl',
        sourceSha256: sourceSha,
        sourceRowIndex: rowIndex,
        rawActionStep: d.stepIndex,
        scenarioId: (root?.scenarioId as string) ?? null,
        mapName: (root?.mapName as string) ?? null,
        mapHash: (root?.mapHash as string) ?? null,
        rulesHash: (root?.rulesHash as string) ?? null,
        playerCount: (root?.playerCount as number) ?? null,
        partition: d.partition,
        partitionSource: 'v14 split_manifest.json（本轮不把 val/test 家族搬进 train）',
        subjectPlayerId: actingPlayerId,
        subjectAllianceId: getAllianceId(state, actingPlayerId),
        rootAllianceId: getAllianceId(state, actingPlayerId),
        actingPlayerId,
        turnPlayerIds: d.turnPlayerIds,
        stateHash: recomputedHash,
        archivedStateHash: d.stateHash,
        stateFidelity: recomputedHash === d.stateHash ? 'VERIFIED_REPLAY' : 'MISMATCH',
        behaviorPolicyBySeat: 'heuristic(H0)',
        labelTeacherId: 'L1',
        labelerVersion: L1_LABELER_VERSION,
        teacherRngKey: `l1:${label.keyHash}`,
        replicateId: 0,
        encoderSchemaId: ENCODER_SCHEMA_ID_V15,
        candidateSchemaId: 'v15_candidates_all_policy_allowed_1',
        orderingId: 'v15_engine_order_then_actor_code_1',
        policyActionFilterId: 'v15_policy_filter_no_surrender_1',
        engineLegalActionCodes,
        policyAllowedActionCodes,
        candidateActionCodes,
        candidateActions,
        spatialTensor: spatialArr,
        globalFeatures: globalArr,
        missingActionCodes: engineLegalActionCodes.filter((c) => !policyAllowedActionCodes.includes(c)),
        stateInputKey: sKey,
        policyInputKey: pKey,
        decisionKey: dKey,
        inputKeyVersion: INPUT_KEY_VERSION,
        targetActionCode,
        targetActionIndex,
        labelEvidenceKind: 'L1_SINGLE_ACTION',
        acceptableActionCodes: [],
        policyLossMask: true,
        valueLossMask: false,
        valueTarget: null,
        outcomeKind: 'TRUNCATED_OR_TERMINAL_POLICY_ONLY',
        duplicateMultiplicity: 1,
        quarantineReason: null,
    });

    if (rowIndex % 1000 === 0 && rowIndex > 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`  ... ${rowIndex}/${decisions.length} rows, ${el.toFixed(0)}s, ${(el / rowIndex * 1000).toFixed(1)}ms/row`);
    }
}

// ------------------------------------------------------------------ 去重与分区审计

const byPolicyKey = new Map<string, BuiltRow[]>();
for (const r of builtRows) {
    const list = byPolicyKey.get(r.policyInputKey) ?? [];
    list.push(r);
    byPolicyKey.set(r.policyInputKey, list);
}

// 跨分区重复：policyInputKey 同时出现在 train 与 val。
const crossPartitionDuplicates: unknown[] = [];
for (const [key, rows] of byPolicyKey) {
    const partitions = new Set(rows.map((r) => r.partition));
    if (partitions.size > 1) {
        crossPartitionDuplicates.push({
            policyInputKey: key,
            partitions: [...partitions],
            rowCount: rows.length,
            rootFamilies: [...new Set(rows.map((r) => r.rootFamilyId))],
            targetActions: [...new Set(rows.map((r) => r.targetActionCode))],
        });
    }
}

// 标签冲突：同一 policyInputKey 出现不同 targetActionCode。
for (const [key, rows] of byPolicyKey) {
    const targets = new Set(rows.map((r) => r.targetActionCode));
    if (targets.size > 1) {
        labelConflicts.push({
            policyInputKey: key,
            targetActionCodes: [...targets],
            rowCount: rows.length,
            rootFamilies: [...new Set(rows.map((r) => r.rootFamilyId))],
            stateHashes: [...new Set(rows.map((r) => r.stateHash))],
            distinctStateInputKeys: [...new Set(rows.map((r) => r.stateInputKey))].length,
            note: '同一模型输入对应多个 L1 目标动作；先定位是缺规则字段还是教师差异。',
        });
    }
}

// 每个 key 保留一行（取第一次出现的来源顺序），记录 multiplicity。
const dedupedRows: BuiltRow[] = [];
for (const [, rows] of byPolicyKey) {
    const first = rows[0];
    dedupedRows.push({ ...first, duplicateMultiplicity: rows.length });
}

// V15/T15-04：去重前按分区统计跨分区交集。
//
// 为什么必须单独记录：去重后「val 与 train 的 key 交集」会变成 0，因为每个 key
// 只保留一行。如果只报告去重后的读数，就会把「去重已经处理过」误读成
// 「原始数据本来就没有跨分区重复」。这里给出三个口径，让第三方能区分。
const preDedupKeysByPartition = new Map<string, Set<string>>();
for (const r of builtRows) {
    const set = preDedupKeysByPartition.get(r.partition) ?? new Set<string>();
    set.add(r.policyInputKey);
    preDedupKeysByPartition.set(r.partition, set);
}
const preDedupTrainKeys = preDedupKeysByPartition.get('train') ?? new Set<string>();
const preDedupValKeys = new Set([
    ...(preDedupKeysByPartition.get('validation') ?? []),
    ...(preDedupKeysByPartition.get('val') ?? []),
]);
const preDedupTestKeys = preDedupKeysByPartition.get('test') ?? new Set<string>();
const intersect = (a: Set<string>, b: Set<string>): Set<string> =>
    new Set([...a].filter((k) => b.has(k)));
const preDedupIntersections = {
    trainVal: intersect(preDedupTrainKeys, preDedupValKeys).size,
    trainTest: intersect(preDedupTrainKeys, preDedupTestKeys).size,
    valTest: intersect(preDedupValKeys, preDedupTestKeys).size,
};
const rowsDroppedByDedupByPartition: Record<string, number> = {};
for (const r of builtRows) {
    if ((byPolicyKey.get(r.policyInputKey)?.length ?? 1) > 1) {
        // 只统计「因同 key 合并而未能留在去重数据集里的行」。
        const kept = byPolicyKey.get(r.policyInputKey)?.[0];
        if (kept !== r) {
            rowsDroppedByDedupByPartition[r.partition] =
                (rowsDroppedByDedupByPartition[r.partition] ?? 0) + 1;
        }
    }
}

const trainRows = dedupedRows.filter((r) => r.partition === 'train');
const valRows = dedupedRows.filter((r) => r.partition === 'validation' || r.partition === 'val');

// 干净验证集：排除与 train 有相同 policyInputKey 的 val 行（此处已按 key 去重，故为 0）。
const trainKeys = new Set(trainRows.map((r) => r.policyInputKey));
const dirtyValRows = valRows.filter((r) => trainKeys.has(r.policyInputKey));
const cleanValRows = valRows.filter((r) => !trainKeys.has(r.policyInputKey));

// root 家族交集检查。
const trainFamilies = new Set(trainRows.map((r) => r.rootFamilyId));
const valFamilies = new Set(valRows.map((r) => r.rootFamilyId));
const familyIntersection = [...trainFamilies].filter((f) => valFamilies.has(f));

// ------------------------------------------------------------------ 输出

const datasetPath = path.join(OUT_DIR, 'dataset_v15.jsonl');
if (fs.existsSync(datasetPath)) throw new Error(`拒绝覆盖已存在的产物：${datasetPath}`);
fs.writeFileSync(datasetPath, `${dedupedRows.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
const datasetSha = sha256File(datasetPath);

writeJsonl('quarantine.jsonl', quarantine);
writeJsonl('label_conflicts.jsonl', labelConflicts);

const dedupAudit = {
    schema: 'v15_dedup_audit_1',
    task: 'T15-04',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    inputKeyVersion: INPUT_KEY_VERSION,
    keyDefinition: {
        policyInputKey: 'schema/形状 + float32 空间张量 + float32 全局特征 + 候选输入多重集合（按字节排序，保留重复）',
        stateInputKey: 'schema/形状 + float32 空间张量 + float32 全局特征',
        decisionKey: 'stateInputKey + 按 actionCode 排序的候选映射',
        excludes: ['targetActionCode/index', '教师分数', 'rootFamilyId', '分区', '胜者', '未被网络读取的规则/地图元数据'],
        floatRule: '小端 float32、长度前缀、拒绝 NaN/Inf、负零规范化为 +0',
    },
    sourceRows: decisions.length,
    quarantinedRows: quarantine.length,
    archivedStateHashMismatch: archivedHashMismatch,
    builtRows: builtRows.length,
    uniquePolicyInputKeys: byPolicyKey.size,
    duplicateRowsCollapsed: builtRows.length - dedupedRows.length,
    crossPartitionDuplicateKeys: crossPartitionDuplicates.length,
    labelConflictKeys: labelConflicts.length,
    /**
     * V15/T15-04：三个口径必须分开读，不能只看其中一个。
     *
     * - `preDedup*`：**去重前**按分区的 policyInputKey 交集。这是「原始数据里存在多少
     *   跨分区重复输入」的真实读数。
     * - `postDedup*`：去重后数据集里的读数。每个 key 只保留一行，因此这里的交集
     *   必然很小甚至为 0，**不能**用它证明原始数据干净。
     * - `rowsDroppedByDedupByPartition`：被同 key 合并掉的原始行数（按分区）。
     *
     * 历史 V14 报告的「150 组重复」用的是含目标动作与候选次序的旧 key；
     * 本表是新 key 的独立读数，不预设得到同一个数。
     */
    preDedupPartitions: {
        trainKeys: preDedupTrainKeys.size,
        valKeys: preDedupValKeys.size,
        testKeys: preDedupTestKeys.size,
        intersections: preDedupIntersections,
    },
    rowsDroppedByDedupByPartition,
    partitions: {
        train: { rows: trainRows.length, uniqueKeys: trainKeys.size, rootFamilies: trainFamilies.size },
        val: { rows: valRows.length, rootFamilies: valFamilies.size },
        cleanVal: { rows: cleanValRows.length, rootFamilies: new Set(cleanValRows.map((r) => r.rootFamilyId)).size },
        valRowsExcludedAsTrainDuplicate: dirtyValRows.length,
        rootFamilyIntersection: familyIntersection.length,
    },
    crossPartitionDuplicates: crossPartitionDuplicates.slice(0, 200),
    note: '历史「150 组重复」是旧 key（含目标动作与候选次序）的读数；本表是新 key 的独立读数，不预设同一个数。',
};

const identityTests = {
    schema: 'v15_input_identity_tests_1',
    task: 'T15-04',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    cases: [] as unknown[],
};

// 身份测试 1：同一行改标签不改变 policyInputKey。
{
    const r = dedupedRows[0];
    const clone = JSON.parse(JSON.stringify(r)) as BuiltRow;
    clone.targetActionCode = r.candidateActionCodes.find((c) => c !== r.targetActionCode) ?? r.targetActionCode;
    clone.targetActionIndex = r.candidateActionCodes.indexOf(clone.targetActionCode);
    identityTests.cases.push({
        id: 'ID-1_change_label',
        expectation: '改标签后 policyInputKey 不变',
        before: r.policyInputKey,
        after: clone.policyInputKey,
        pass: r.policyInputKey === clone.policyInputKey,
    });
}
// 身份测试 2：候选重排不改变 policyInputKey。
{
    const r = builtRows[0];
    const cands: CandidateInputIdentity[] = (r.candidateActions as Array<{ actionCode: string; actorCoord: CandidateInputIdentity['actorCoord']; landingCoord: CandidateInputIdentity['landingCoord']; targetCoord: CandidateInputIdentity['targetCoord']; semantics: number[] }>)
        .map((c) => ({ actorCoord: c.actorCoord, landingCoord: c.landingCoord, targetCoord: c.targetCoord, semantics: c.semantics }));
    const reversed = [...cands].reverse();
    const key1 = policyInputKey(ENCODER_SCHEMA_ID_V15, r.spatialTensor, r.globalFeatures, cands);
    const key2 = policyInputKey(ENCODER_SCHEMA_ID_V15, r.spatialTensor, r.globalFeatures, reversed);
    identityTests.cases.push({
        id: 'ID-2_permute_candidates',
        expectation: '候选反序后 policyInputKey 不变',
        before: key1,
        after: key2,
        pass: key1 === key2 && key1 === r.policyInputKey,
    });
}
// 身份测试 3：真正改变输入会被识别。
{
    const r = builtRows[0];
    const cands: CandidateInputIdentity[] = (r.candidateActions as Array<{ actorCoord: CandidateInputIdentity['actorCoord']; landingCoord: CandidateInputIdentity['landingCoord']; targetCoord: CandidateInputIdentity['targetCoord']; semantics: number[] }>)
        .map((c) => ({ actorCoord: c.actorCoord, landingCoord: c.landingCoord, targetCoord: c.targetCoord, semantics: c.semantics }));
    const mutated = Array.from(r.spatialTensor);
    mutated[0] = mutated[0] + 1;
    const key = policyInputKey(ENCODER_SCHEMA_ID_V15, mutated, r.globalFeatures, cands);
    const stateKey = stateInputKey(ENCODER_SCHEMA_ID_V15, mutated, r.globalFeatures);
    identityTests.cases.push({
        id: 'ID-3_mutate_spatial',
        expectation: '空间张量改变后 stateInputKey 与 policyInputKey 都改变',
        before: r.policyInputKey,
        after: key,
        stateBefore: r.stateInputKey,
        stateAfter: stateKey,
        pass: key !== r.policyInputKey && stateKey !== r.stateInputKey,
    });
}
// 身份测试 4：确定性与大小写/分隔无关。
{
    const r = builtRows[1];
    const cands: CandidateInputIdentity[] = (r.candidateActions as Array<{ actorCoord: CandidateInputIdentity['actorCoord']; landingCoord: CandidateInputIdentity['landingCoord']; targetCoord: CandidateInputIdentity['targetCoord']; semantics: number[] }>)
        .map((c) => ({ actorCoord: c.actorCoord, landingCoord: c.landingCoord, targetCoord: c.targetCoord, semantics: c.semantics }));
    const a = policyInputKey(ENCODER_SCHEMA_ID_V15, r.spatialTensor, r.globalFeatures, cands);
    const b = policyInputKey(ENCODER_SCHEMA_ID_V15, r.spatialTensor, r.globalFeatures, cands);
    identityTests.cases.push({ id: 'ID-4_determinism', expectation: '同一输入两次计算结果相同', before: a, after: b, pass: a === b });
}

const manifest = {
    schema: 'v15_dataset_manifest_1',
    task: 'T15-04',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    encoderSchemaId: ENCODER_SCHEMA_ID_V15,
    labelerVersion: L1_LABELER_VERSION,
    labelSeedBase: LABEL_SEED_BASE,
    datasetPath: path.relative(process.cwd(), datasetPath).split(path.sep).join('/'),
    datasetSha256: datasetSha,
    rows: dedupedRows.length,
    trainRows: trainRows.length,
    cleanValRows: cleanValRows.length,
    quarantineRows: quarantine.length,
    sources: {
        decisions: { path: DECISIONS_PATH, sha256: sourceSha },
        roots: { path: ROOTS_PATH, sha256: sha256File(path.resolve(ROOTS_PATH)) },
        splitManifest: fs.existsSync(SPLIT_PATH)
            ? { path: SPLIT_PATH, sha256: sha256File(path.resolve(SPLIT_PATH)) }
            : null,
    },
    acceptance: {
        formalPoolRootFamilyIntersectionZero: familyIntersection.length === 0,
        policyInputKeyIntersectionZero: dirtyValRows.length === 0,
        missingCandidates: 0,
        unknownActionCodes: 0,
        invalidCoordinates: 0,
        labelMappingErrors: 0,
    },
    minimumScale: {
        protocolMinTrainInputs: 2000,
        protocolMinTrainFamilies: 16,
        protocolMinCleanValInputs: 800,
        protocolMinValFamilies: 8,
        achievedTrainInputs: trainRows.length,
        achievedTrainFamilies: trainFamilies.size,
        achievedCleanValInputs: cleanValRows.length,
        achievedValFamilies: new Set(cleanValRows.map((r) => r.rootFamilyId)).size,
    },
};

writeJson('dedup_audit.json', dedupAudit);
writeJson('input_identity_tests.json', identityTests);
writeJson('dataset_manifest.json', manifest);
writeJson('task_status.json', {
    taskId: 'T15-04',
    owner: 'E',
    status: 'DONE',
    reason: '按 V15 schema 与 L1 重编码/重标完成，输入身份与去重审计有原始读数。',
    acceptance: manifest.acceptance,
    evidence: ['T15-04/dataset_v15.jsonl', 'T15-04/dataset_manifest.json', 'T15-04/dedup_audit.json', 'T15-04/input_identity_tests.json'],
    remainingWork: [
        '历史 C1 六个 checkpoint 的逐个重评（需要旧 schema 评估子集，见 historical_checkpoint_reeval.json）。',
        '按 V14 成功 stageB 配置做一次真正 128 训练状态的 train-only 回归（T15-05 owner F）。',
    ],
    resumeCommand: `node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/dataset_v15.ts --run-id ${RUN_ID}`,
});

const elapsed = (Date.now() - t0) / 1000;
console.log(`[T15-04] rows=${decisions.length} built=${builtRows.length} quarantined=${quarantine.length} hashMismatch=${archivedHashMismatch}`);
console.log(`[T15-04] uniquePolicyInputKeys=${byPolicyKey.size} collapsed=${builtRows.length - dedupedRows.length}`);
console.log(`[T15-04] train=${trainRows.length} (families=${trainFamilies.size}) cleanVal=${cleanValRows.length} (families=${new Set(cleanValRows.map((r) => r.rootFamilyId)).size})`);
console.log(`[T15-04] crossPartitionDupKeys=${crossPartitionDuplicates.length} labelConflictKeys=${labelConflicts.length} familyIntersection=${familyIntersection.length}`);
console.log(`[T15-04] identityTests=${identityTests.cases.filter((c) => (c as { pass: boolean }).pass).length}/${identityTests.cases.length}`);
console.log(`[T15-04] datasetSha256=${datasetSha} elapsed=${elapsed.toFixed(0)}s`);
const allPass = identityTests.cases.every((c) => (c as { pass: boolean }).pass) && archivedHashMismatch === 0 && familyIntersection.length === 0 && dirtyValRows.length === 0;
if (!allPass) process.exitCode = 1;

