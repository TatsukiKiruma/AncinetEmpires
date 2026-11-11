/**
 * V15/T15-08-E：D1/D2 新池编码 + L1 重标 + 输入身份（owner E）。
 *
 * 输入：`collect_dagger_arms_v15.ts` 产出的每 root 一个 JSONL 原轨迹。
 * 输出：与 `v15/tools/dataset_v15.ts` **同字段结构**的候选数据集（每行含 V15 编码、
 *       L1 主标签、逐状态 `teacherRngKey`）与一份轻量 key 索引（供过滤/匹配/复算）。
 *
 * 为什么另写一份而不是 import dataset_v15.ts：
 *   `dataset_v15.ts` 是带回放旧池副作用的顶层脚本（import 会立刻解析 290MB 归档并尝试
 *   写 T15-04 产物），不能作为库使用。因此这里**逐行复制**它的输入身份算法（见下方
 *   `float32Bytes` / `candidateBytes` / `stateInputKey` / `policyInputKey` / `decisionKey`），
 *   并用 `--selftest-old-pool` 在旧池真实行上**复算比对**，证明与 `policyInputKey` 位级一致。
 *
 * 关键纪律：
 *   - 采集阶段从不查询 L1；本工具对每个**保留状态**重新独立查询 L1（`replicateId=0`），
 *     每次查询新建实例与逐状态 RNG（T15-01 合同），因此查询不可能推进任何行为流。
 *   - `teacherRngKey` 必须是真实键 `l1:<keyHash>`，**禁止** null。
 *   - 候选来自真实引擎合法集（过滤 surrender），标签按 actionCode 定位。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/dataset_dagger_encode_v15.ts \
 *     --run-id v15_20260925_core --arm D1 [--max-roots N] [--selftest-rows 200] [--overwrite]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, getRuleConfig } from '../../src/game/rule_config';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    ENCODER_SCHEMA_ID_V15,
    ACTION_SEMANTIC_DIM_V3,
} from '../../src/game/ai/spatial_tensor_encoder';
import { queryL1Label, L1_LABELER_VERSION, L1_RNG_CONTRACT_ID, stateHashOf } from './labeler_l1_v15';
import type { Action, GameState } from '../../src/game/types';

// ------------------------------------------------------------------ CLI
function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
    return process.argv.includes(name);
}
const RUN_ID = arg('--run-id');
const ARM = (arg('--arm') ?? '').toUpperCase();
if (!RUN_ID) throw new Error('缺少 --run-id');
if (ARM !== 'D1' && ARM !== 'D2') throw new Error('--arm 必须是 D1 或 D2');
const ARM_TAG = ARM.toLowerCase();
const LABEL_SEED_BASE = Number(arg('--label-seed-base', '20260925'));
const MAX_ROOTS = arg('--max-roots') ? Number(arg('--max-roots')) : null;
const SELFTEST_ROWS = Number(arg('--selftest-rows', '200'));
const OVERWRITE = flag('--overwrite');
const TASK_DIR = path.resolve('v15', 'out', RUN_ID, 'T15-08');
const COLLECT_DIR = path.resolve(arg('--collect-dir', path.join(TASK_DIR, `collect_${ARM}`)) as string);
const OUT_CANDIDATES = path.resolve(arg('--out-candidates', path.join(TASK_DIR, `dataset_${ARM_TAG}_new_candidates.jsonl`)) as string);
const OUT_KEYS = path.resolve(arg('--out-keys', path.join(TASK_DIR, `dataset_${ARM_TAG}_new_candidates.keys.jsonl`)) as string);
const OUT_REPORT = path.resolve(arg('--out-report', path.join(TASK_DIR, `dataset_${ARM_TAG}_encode_report.json`)) as string);
const OLD_POOL = path.resolve(arg('--old-pool', path.join('v15', 'out', RUN_ID, 'T15-04', 'dataset_v15.jsonl')) as string);

for (const p of [OUT_CANDIDATES, OUT_KEYS, OUT_REPORT]) {
    if (fs.existsSync(p) && !OVERWRITE) throw new Error(`拒绝覆盖已存在的产物：${p}（要重算请显式加 --overwrite）`);
}

const sha256File = (abs: string): string => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
// V15/T15-08-C 缺陷修复（owner C 接手 E 侧编码时发现；一行、无语义变化）：
// 原文件在 stateInputKey/policyInputKey/decisionKey 里裸调 `createHash(...)`（第 106/122/124/131 行），
// 但只 `import * as crypto`，因此本工具**任何一次运行都会在 selftestAgainstOldPool 处抛
// `ReferenceError: createHash is not defined`**，从未产出过 dataset_*_new_candidates.jsonl。
// 最小复现：node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/dataset_dagger_encode_v15.ts --run-id v15_20260925_core --arm D1
// 修复：补一个与 `crypto.createHash` 同函数的本地别名，不改任何键算法或字节序。
const createHash = crypto.createHash;

// ------------------------------------------------------------------ 输入身份（与 dataset_v15.ts 逐行一致）
export const INPUT_KEY_VERSION = 'v15_policy_input_key_1';

function float32Bytes(values: ArrayLike<number>, sink: number[]): void {
    const buf = Buffer.allocUnsafe(4);
    for (let i = 0; i < values.length; i += 1) {
        const v = values[i];
        if (!Number.isFinite(v)) throw new Error(`policyInputKey 拒绝非有限输入：index=${i} value=${v}`);
        const normalized = v === 0 ? 0 : v; // 负零规范化为 +0
        buf.writeFloatLE(Math.fround(normalized), 0);
        sink.push(buf[0], buf[1], buf[2], buf[3]);
    }
}

export interface CandidateInputIdentity {
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

export function stateInputKey(schemaId: string, spatialTensor: ArrayLike<number>, globalFeatures: ArrayLike<number>): string {
    const spatial: number[] = [];
    const globals: number[] = [];
    float32Bytes(spatialTensor, spatial);
    float32Bytes(globalFeatures, globals);
    const shape = Buffer.from(`${schemaId}|${spatialTensor.length}|${globalFeatures.length}|${ACTION_SEMANTIC_DIM_V3}`, 'utf8');
    return createHash('sha256')
        .update(Buffer.concat([shape, Buffer.from([0]), Buffer.from(spatial), Buffer.from([0]), Buffer.from(globals)]))
        .digest('hex');
}

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
    const candHashes = candidates.map((c) => createHash('sha256').update(candidateBytes(c)).digest('hex')).sort();
    const candPart = Buffer.from(candHashes.join(','), 'utf8');
    return createHash('sha256')
        .update(Buffer.concat([shape, Buffer.from([0]), Buffer.from(spatial), Buffer.from([0]), Buffer.from(globals), Buffer.from([0]), candPart]))
        .digest('hex');
}

export function decisionKey(stateInput: string, actionCodeByCandidate: string[]): string {
    const sorted = [...actionCodeByCandidate].sort();
    return createHash('sha256').update(Buffer.from(`${stateInput}|${sorted.join(',')}`, 'utf8')).digest('hex');
}

// ------------------------------------------------------------------ 指纹（与 collect_v14_roots.ts 同口径）
function stableStringify(value: unknown): string {
    const canonical = (v: any): any => {
        if (Array.isArray(v)) return v.map(canonical);
        if (v && typeof v === 'object') {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(v).sort()) out[key] = canonical(v[key]);
            return out;
        }
        return v;
    };
    return JSON.stringify(canonical(value));
}
function rulesFingerprint(state: GameState): string {
    const rules = getRuleConfig(state) as unknown as Record<string, unknown>;
    return crypto.createHash('sha256').update(stableStringify({ rules, map: { width: state.map.width, height: state.map.height } })).digest('hex');
}
function mapFingerprint(state: GameState): string {
    const tiles = state.map.tiles.map((row) => row.map((t) => `${t.terrainId}:${t.ownerId ?? '-'}`).join(','));
    return crypto.createHash('sha256').update(tiles.join('|')).digest('hex');
}
function mapLayoutFingerprint(state: GameState): string {
    const tiles = state.map.tiles.map((row) => row.map((t) => String(t.terrainId)).join(','));
    return crypto.createHash('sha256').update(tiles.join('|')).digest('hex');
}

// ------------------------------------------------------------------ 旧池 key 复算自检
interface SelfTestResult {
    checked: boolean;
    oldPoolPath: string | null;
    oldPoolSha256: string | null;
    rowsSampled: number;
    keysMatched: number;
    keysMismatched: number;
    mismatches: unknown[];
    inputKeyVersion: string;
}

function selftestAgainstOldPool(): SelfTestResult {
    const result: SelfTestResult = {
        checked: false, oldPoolPath: null, oldPoolSha256: null,
        rowsSampled: 0, keysMatched: 0, keysMismatched: 0, mismatches: [],
        inputKeyVersion: INPUT_KEY_VERSION,
    };
    if (SELFTEST_ROWS <= 0) return result;
    if (!fs.existsSync(OLD_POOL)) {
        (result as any).skipped = `旧池不存在：${OLD_POOL}`;
        return result;
    }
    result.checked = true;
    result.oldPoolPath = OLD_POOL;
    result.oldPoolSha256 = sha256File(OLD_POOL);

    // 均匀抽样：先数行数，再按步长取行，避免把自检变成全量解析。
    const total = (() => {
        let n = 0;
        const buf = fs.readFileSync(OLD_POOL, 'utf8');
        for (let i = 0; i < buf.length; i += 1) if (buf.charCodeAt(i) === 10) n += 1;
        return n;
    })();
    const stride = Math.max(1, Math.floor(total / SELFTEST_ROWS));
    const text = fs.readFileSync(OLD_POOL, 'utf8');
    let idx = -1;
    let checked = 0;
    for (const line of text.split('\n')) {
        if (!line) continue;
        idx += 1;
        if (idx % stride !== 0) continue;
        checked += 1;
        const row = JSON.parse(line) as any;
        const cands: CandidateInputIdentity[] = (row.candidateActions ?? []).map((c: any) => ({
            actorCoord: c.actorCoord,
            landingCoord: c.landingCoord,
            targetCoord: c.targetCoord,
            // 旧池的候选语义数组字段名可能是 `semantics`（新）或 `semantics_padded`（旧坏产物）；
            // 两者内容都是网络真正消费的 53 维语义。
            semantics: c.semantics ?? c.semantics_padded ?? [],
        }));
        const stateKey = stateInputKey(ENCODER_SCHEMA_ID_V15, row.spatialTensor, row.globalFeatures);
        const pKey = policyInputKey(ENCODER_SCHEMA_ID_V15, row.spatialTensor, row.globalFeatures, cands);
        const dKey = decisionKey(stateKey, row.candidateActionCodes ?? []);
        result.rowsSampled += 1;
        const ok = pKey === row.policyInputKey && stateKey === row.stateInputKey && dKey === row.decisionKey;
        if (ok) result.keysMatched += 1;
        else {
            result.keysMismatched += 1;
            if (result.mismatches.length < 10) {
                result.mismatches.push({
                    sampleId: row.sampleId,
                    storedPolicyInputKey: row.policyInputKey, recomputedPolicyInputKey: pKey,
                    storedStateInputKey: row.stateInputKey, recomputedStateInputKey: stateKey,
                    storedDecisionKey: row.decisionKey, recomputedDecisionKey: dKey,
                });
            }
        }
        if (result.rowsSampled >= SELFTEST_ROWS) break;
    }
    return result;
}

// ------------------------------------------------------------------ 读取原轨迹
interface CollectedRoot {
    root: any;
    decisions: any[];
    summary: any;
    filePath: string;
    fileSha256: string;
}

function readCollectedRoots(): CollectedRoot[] {
    if (!fs.existsSync(COLLECT_DIR)) {
        throw new Error(`采集目录不存在：${COLLECT_DIR}（D2 需要 C2-42 final 冻结后先跑 collect_dagger_arms_v15.ts --arm D2）`);
    }
    const files = fs.readdirSync(COLLECT_DIR).filter((f) => f.endsWith('.jsonl')).sort();
    const out: CollectedRoot[] = [];
    for (const f of files) {
        const abs = path.join(COLLECT_DIR, f);
        const text = fs.readFileSync(abs, 'utf8');
        let root: any = null; let summary: any = null; const decisions: any[] = [];
        for (const line of text.split('\n')) {
            if (!line) continue;
            const o = JSON.parse(line);
            if (o.kind === 'root') root = o;
            else if (o.kind === 'subject_decision') decisions.push(o);
            else if (o.kind === 'root_summary') summary = o;
        }
        if (!root || !summary) throw new Error(`原轨迹缺少 root/root_summary 行：${abs}`);
        out.push({ root, decisions, summary, filePath: abs, fileSha256: sha256File(abs) });
    }
    return out;
}

// ------------------------------------------------------------------ 主构建
const t0 = Date.now();
const selftest = selftestAgainstOldPool();
let collected = readCollectedRoots();
collected.sort((a, b) => a.root.blockIndex - b.root.blockIndex);
if (MAX_ROOTS !== null) collected = collected.slice(0, MAX_ROOTS);
// 自检占用内存后主动释放旧池文本
console.log(`[encode] 旧池 key 复算自检：rows=${selftest.rowsSampled} matched=${selftest.keysMatched} mismatched=${selftest.keysMismatched}`);

const candidateStream = fs.createWriteStream(OUT_CANDIDATES, { flags: 'w' });
const keyStream = fs.createWriteStream(OUT_KEYS, { flags: 'w' });
const writeLine = (stream: fs.WriteStream, obj: unknown): Promise<void> => new Promise((resolve, reject) => {
    stream.write(`${JSON.stringify(obj)}\n`, (err) => (err ? reject(err) : resolve()));
});

const counts = {
    roots: collected.length,
    decisionsRead: 0,
    rowsBuilt: 0,
    quarantinedEmptyAllowed: 0,
    quarantinedLabelOutsideAllowed: 0,
    quarantinedStateHashMismatch: 0,
    quarantinedTargetNotInCandidates: 0,
    quarantinedEngineError: 0,
    labelDiagnostics: {} as Record<string, number>,
    byRoot: [] as any[],
};
const quarantine: unknown[] = [];
const labelSeedBaseNote = 'labelSeedBase 来自 T15-01 labeler_contract.json';
/** 候选数据集内的行号（0 基），写进行与 key 索引，供后续按 key 精确取回整行。 */
let candidateRowIndex = -1;

for (const cr of collected) {
    const { root } = cr;
    const initialState: GameState = root.initialState;
    const mapHash = mapFingerprint(initialState);
    const mapLayoutHash = mapLayoutFingerprint(initialState);
    const rulesHash = rulesFingerprint(initialState);
    const behaviorPolicyBySeat = root.behaviorPolicyBySeat;
    let rootBuilt = 0;

    for (const d of cr.decisions) {
        counts.decisionsRead += 1;
        const state: GameState = d.state;
        const actingPlayerId: number = d.actingPlayerId;
        const subjectPlayerId: number = d.subjectPlayerId;
        const recomputed = stateHashOf(state);
        if (recomputed !== d.stateHash) {
            counts.quarantinedStateHashMismatch += 1;
            quarantine.push({ kind: 'STATE_HASH_MISMATCH', blockId: root.blockId, seq: d.seq, archived: d.stateHash, recomputed });
            continue;
        }

        let engine: GameEngine;
        let engineLegal: Action[];
        try {
            engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
            engineLegal = engine.isTerminal() ? [] : engine.getLegalActions(actingPlayerId);
        } catch (err) {
            counts.quarantinedEngineError += 1;
            quarantine.push({ kind: 'ENGINE_ERROR', blockId: root.blockId, seq: d.seq, error: err instanceof Error ? err.message : String(err) });
            continue;
        }
        const engineLegalActionCodes = engineLegal.map(encodeAction);
        const allowedActions = engineLegal.filter((a) => a.type !== 'surrender');
        const policyAllowedActionCodes = allowedActions.map(encodeAction);
        if (policyAllowedActionCodes.length === 0) {
            counts.quarantinedEmptyAllowed += 1;
            quarantine.push({ kind: 'EMPTY_POLICY_ALLOWED_SET', blockId: root.blockId, seq: d.seq });
            continue;
        }

        // L1 主标签：独立实例 + 逐状态 RNG（replicateId=0）。
        const label = queryL1Label(state, {
            labelSeedBase: LABEL_SEED_BASE,
            actingPlayerId,
            subjectPlayerId,
            replicateId: 0,
        });
        for (const dg of label.diagnostics) counts.labelDiagnostics[dg] = (counts.labelDiagnostics[dg] ?? 0) + 1;
        const targetActionCode = label.actionCode;
        if (targetActionCode === null || !policyAllowedActionCodes.includes(targetActionCode)) {
            counts.quarantinedLabelOutsideAllowed += 1;
            quarantine.push({
                kind: 'LABEL_OUTSIDE_ALLOWED_SET', blockId: root.blockId, seq: d.seq,
                labelActionCode: targetActionCode, allowedCount: policyAllowedActionCodes.length,
            });
            continue;
        }
        const teacherRngKey = `l1:${label.keyHash}`;
        if (!teacherRngKey || teacherRngKey === 'l1:null') throw new Error('teacherRngKey 生成失败');

        // 编码（V15 schema）。
        const encoded = encodeGameStateSpatial(state, actingPlayerId, 'v2', { channels: 26 });
        const candidateActions = allowedActions.map((a) => {
            const f = encodeCandidateActionSpatial(state, actingPlayerId, a, 'v2', 'v15_current');
            return {
                actionCode: encodeAction(a),
                actorCoord: f.actorCoord,
                landingCoord: f.landingCoord,
                targetCoord: f.targetCoord,
                // 训练器按 `c.get("semantics", [])` 推断语义维度（会自行派生 semantics_padded）。
                semantics: Array.from(f.semantics),
            };
        });
        const candidateActionCodes = candidateActions.map((c) => c.actionCode);
        const targetActionIndex = candidateActionCodes.indexOf(targetActionCode);
        if (targetActionIndex < 0) {
            counts.quarantinedTargetNotInCandidates += 1;
            quarantine.push({ kind: 'TARGET_NOT_IN_CANDIDATES', blockId: root.blockId, seq: d.seq, targetActionCode });
            continue;
        }

        const spatialArr = Array.from(encoded.spatialTensor);
        const globalArr = Array.from(encoded.globalFeatures);
        const sKey = stateInputKey(ENCODER_SCHEMA_ID_V15, spatialArr, globalArr);
        const pKey = policyInputKey(
            ENCODER_SCHEMA_ID_V15, spatialArr, globalArr,
            candidateActions.map((c) => ({
                actorCoord: c.actorCoord, landingCoord: c.landingCoord, targetCoord: c.targetCoord, semantics: c.semantics,
            })),
        );
        const dKey = decisionKey(sKey, candidateActionCodes);
        const sourceStateKey = `${root.rootFamilyId}#${d.stepIndex}`;
        const sampleId = `v15_${crypto.createHash('sha256').update(`${sourceStateKey}#${pKey}`).digest('hex').slice(0, 24)}`;

        const row = {
            schemaVersion: 'v15_spatial_dataset_1',
            sampleId,
            datasetBuilderId: 'v15/tools/dataset_dagger_encode_v15.ts@v15_20260925_core',
            runId: RUN_ID,
            rootFamilyId: root.rootFamilyId,
            parentRootId: root.rootFamilyId,
            lineageId: root.rootFamilyId,
            sourceStateKey,
            sourceArchiveId: `v15_dagger:collect_${ARM}/${path.basename(cr.filePath)}`,
            sourceSha256: cr.fileSha256,
            sourceRowIndex: d.seq,
            rawActionStep: d.stepIndex,
            scenarioId: root.scenarioId,
            mapName: root.mapName,
            mapHash,
            rulesHash,
            playerCount: root.playerCount,
            partition: 'train',
            partitionSource: 'T15-08 新池（协议 §2.2：D1/D2 训练池不得含冻结 val/test 输入）',
            subjectPlayerId,
            subjectAllianceId: getAllianceId(state, subjectPlayerId),
            rootAllianceId: getAllianceId(state, subjectPlayerId),
            actingPlayerId,
            turnPlayerIds: d.turnPlayerIds,
            stateHash: recomputed,
            archivedStateHash: d.stateHash,
            stateFidelity: 'EXACT_SNAPSHOT',
            behaviorPolicyBySeat: JSON.stringify(behaviorPolicyBySeat),
            labelTeacherId: 'L1',
            labelerVersion: L1_LABELER_VERSION,
            teacherRngKey,
            replicateId: 0,
            encoderSchemaId: ENCODER_SCHEMA_ID_V15,
            candidateSchemaId: 'v15_candidates_all_policy_allowed_1',
            orderingId: 'v15_engine_order_then_actor_code_1',
            policyActionFilterId: root.policyActionFilterId,
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
            // --- T15-08 扩展字段（训练器不读取；用于分层匹配、复算与审计）---
            daggerArm: ARM,
            daggerBlockId: root.blockId,
            daggerPairId: `pair:${root.blockId}`,
            daggerSubjectSeat: root.subjectSeat,
            behaviorActionCode: d.behaviorActionCode,
            behaviorSource: d.behaviorSource,
            behaviorRngContractId: root.behaviorRngContractId,
            behaviorCheckpointSha256: root.behaviorCheckpointSha256,
            turnAtState: d.turn,
            playerTransitions: d.playerTransitions,
            subjectTurnsCompleted: d.subjectTurnsCompleted,
            fullRounds: d.fullRounds,
            prefixLength: d.prefixLength,
            mapLayoutHash,
            teacherBudget: 'single_action_score_all_candidates',
            teacherStopReason: 'SCORED_ALL_POLICY_ALLOWED_CANDIDATES',
            labelSeedBase: LABEL_SEED_BASE,
            labelRngContractId: L1_RNG_CONTRACT_ID,
            candidateCount: candidateActionCodes.length,
        };

        await writeLine(candidateStream, row);
        candidateRowIndex += 1;
        await writeLine(keyStream, {
            candidateRowIndex,
            sampleId,
            rootFamilyId: root.rootFamilyId,
            daggerBlockId: root.blockId,
            daggerPairId: `pair:${root.blockId}`,
            daggerSubjectSeat: root.subjectSeat,
            mapName: root.mapName,
            playerCount: root.playerCount,
            subjectTurnsCompleted: d.subjectTurnsCompleted,
            fullRounds: d.fullRounds,
            rawActionStep: d.stepIndex,
            stateHash: recomputed,
            stateInputKey: sKey,
            policyInputKey: pKey,
            decisionKey: dKey,
            targetActionCode,
            behaviorActionCode: d.behaviorActionCode,
            candidateCount: candidateActionCodes.length,
            teacherRngKey,
            sourceRowIndex: d.seq,
            sourceArchiveId: row.sourceArchiveId,
        });
        counts.rowsBuilt += 1;
        rootBuilt += 1;
    }

    counts.byRoot.push({
        blockId: root.blockId, rootFamilyId: root.rootFamilyId, mapName: root.mapName,
        playerCount: root.playerCount, subjectSeat: root.subjectSeat,
        atomicSteps: cr.summary.atomicSteps, stopReason: cr.summary.stopReason,
        wallMs: cr.summary.wallMs, subjectDecisions: cr.summary.subjectDecisions,
        rowsBuilt: rootBuilt, isNaturalTerminal: cr.summary.isNaturalTerminal,
        winnerRaw: cr.summary.winnerRaw,
    });
    const el = (Date.now() - t0) / 1000;
    console.log(`[encode] ${root.blockId} rows=${rootBuilt}/${cr.decisions.length} ${el.toFixed(0)}s`);
}

await new Promise<void>((resolve, reject) => candidateStream.end((e?: Error | null) => (e ? reject(e) : resolve())));
await new Promise<void>((resolve, reject) => keyStream.end((e?: Error | null) => (e ? reject(e) : resolve())));

const report = {
    schema: 'v15_dagger_encode_report_1',
    task: 'T15-08',
    owner: 'E',
    runId: RUN_ID,
    arm: ARM,
    generatedAt: new Date().toISOString(),
    collectDir: COLLECT_DIR,
    encoderSchemaId: ENCODER_SCHEMA_ID_V15,
    labelerVersion: L1_LABELER_VERSION,
    labelTeacherId: 'L1',
    labelRngContractId: L1_RNG_CONTRACT_ID,
    labelSeedBase: LABEL_SEED_BASE,
    labelSeedBaseNote,
    replicateId: 0,
    inputKeyVersion: INPUT_KEY_VERSION,
    teacherRngKeyNullCount: 0,
    outputs: {
        candidates: { path: OUT_CANDIDATES, sha256: sha256File(OUT_CANDIDATES) },
        keys: { path: OUT_KEYS, sha256: sha256File(OUT_KEYS) },
    },
    selfTest: selftest,
    counts,
    collectedRootFiles: collected.map((c) => ({ file: c.filePath, sha256: c.fileSha256, blockId: c.root.blockId })),
    quarantineRows: quarantine.length,
    note: '本文件是**候选池**（未过滤、未去重、未匹配）。过滤/去重/匹配见 dataset_dagger_filter_v15.py 与 match_pools_v15.py。',
};
fs.writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[encode] 输出 candidates=${OUT_CANDIDATES} rows=${counts.rowsBuilt} keys=${OUT_KEYS}`);
console.log(`[encode] 自检 matched=${selftest.keysMatched}/${selftest.rowsSampled} 旧池=${selftest.oldPoolSha256}`);
if (selftest.checked && selftest.keysMismatched > 0) process.exitCode = 1;
