/**
 * V17/T17-01 阶段 2：把 V17 新物理对局 rollout 变成可训练数据集 + 采集报告（owner：T17-01）。
 *
 * 本文件是 `v16/tools/build_v16_dataset.ts` 的 V17 副本。**保留**原有编码/标签/候选规范排序
 * 通路，只改 T17-01 规格要求的部分：
 *
 * 1. **编码后按真实网络输入身份去重**：`actualInputKey = policyInputKeyHexV17(spatial, global, candidates)`
 *    （`v17-netinput-v1`，与独立 Python 审核实现一致）。V16 的错误在于前置去重用
 *    `stateHash+orderingId+filterId` 且编码后不再按真身份去重。V17 在编码后去重，
 *    重复行写进 `duplicates.jsonl` 并给出保留者指针，**不静默丢弃**。
 * 2. **跨区检查**：new_val 与 new_train / legacy train 的实际输入交集不为 0 时，**拒绝**这些
 *    val 行并单独写成 `cross_split_overlap.jsonl` / `legacy_train_overlap.jsonl`，不静默保留。
 * 3. **冲突保留**：同输入不同 `l1ActionCode` 或不同 `valueTarget` 一律计数并写
 *    `conflicts.jsonl`，不挑“更好训”的标签当唯一答案。
 * 4. **旧字段改名**：V16 的 `policyInputKey` 公式值只保留在 `v16SavedPolicyInputKey`；
 *    `policyInputKey` 与 `actualInputKey` 都是 `v17-netinput-v1` 身份（任务书 §3.1：
 *    保存的 policyInputKey 必须就是最终验收使用的身份）。
 * 5. **family**：`trueFamilyId = rootFamilyId = ${mapName}#${initPolicyId}#${rootSeed}`，
 *    不含 split/source/seat；并按 ≤`--max-family-share` 做配额重平衡（先证明可行，不可行
 *    就不裁剪并如实报告）。
 *
 * 三种运行模式：
 *   A. 只编码（可并行分片）：`--encode-out X.jsonl --encode-inputs a.jsonl,b.jsonl`
 *   B. 编码 + 构建（单进程）：`--only train --train-rollouts ...`
 *   C. 只用已编码分片构建（纯 I/O 合并）：`--only both --encoded-train X1,X2 --encoded-val Y1`
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    ENCODER_SCHEMA_ID_V15,
    GLOBAL_FEATURE_DIM_V2,
} from '../../src/game/ai/spatial_tensor_encoder';
import { encodeAction } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import { CANDIDATE_ORDERING_ID_V16, compareActionCodeCanonicalV16 } from '../../src/game/ai/action_ordering';
import { queryL1Label, L1_LABELER_VERSION } from '../../v15/tools/labeler_l1_v15';
import {
    V16_ACTION_FILTER_ID,
    V16_INITIALIZATION_POLICY_ID,
    V16_RNG_CONTRACT_ID,
} from '../../v16/tools/eval_v16_protocol';
import {
    V17_INPUT_IDENTITY_ID,
    V17_ENCODER_SCHEMA_ID,
    V17_ACTION_SEMANTIC_DIM,
    policyInputKeyHexV17,
} from './v17_input_identity';
import { V17_SEED_FORMULA, V17_TRAIN_ROOT_BASE_SEED, V17_VAL_ROOT_BASE_SEED } from './v17_data_protocol';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'v17_20260926_r2') as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v17/out/${RUN_ID}`) as string);
const DATA_DIR = path.resolve(arg('--out-dir', path.join(RUN_ROOT, 'data')) as string);
const ONLY = arg('--only', 'both') as 'train' | 'val' | 'both';
const TRAIN_FILES = (arg('--train-rollouts', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const VAL_FILES = (arg('--val-rollouts', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const LABEL_SEED_BASE = Number(arg('--label-seed-base', '2610800000'));
const MAX_FAMILY_SHARE = Number(arg('--max-family-share', '0.02'));
const LEGACY_TRAIN_INDEX = arg('--legacy-train-index', 'v17/review/train_input_index.jsonl') as string;
const LEGACY_TRAIN_DEDUP = arg('--legacy-train-dedup', 'v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl');
const LIMIT = arg('--limit', null) === null ? null : Number(arg('--limit', null));
const TRAIN_KEYS_FILE = arg('--train-keys-file', null) as string | null;
/**
 * family 平衡产物的开关。
 *
 * 中文（T17-01 修正）：`单family≤2%` 是**配比目标**，不是把每个 family 都截断到最小 family
 * 的许可证。数学上 `max_f kept_f <= 0.02 * Σ kept_f` 且 kept_f ≤ max 强制 kept_f 全相等，
 * 于是最大可行总量 = F × min_f c_f；若某个 family 很小，硬套这条会把整个数据集砍掉一个数量级。
 * 因此：**主数据集 = 全部唯一输入（不截断）**，family 占比分布照实报告；
 * 与此同时另写一份平衡变体 `*.family_capped.jsonl` 供需要严格配比的实验使用。
 */
const WRITE_CAPPED = arg('--write-capped', 'true') !== 'false';
const ENCODE_OUT = arg('--encode-out', null) as string | null;
const ENCODE_INPUTS = (arg('--encode-inputs', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const ENCODED_TRAIN = (arg('--encoded-train', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const ENCODED_VAL = (arg('--encoded-val', '') as string).split(',').map((s) => s.trim()).filter(Boolean);

const TRAIN_DIR = path.join(DATA_DIR, 'new_train');
const VAL_DIR = path.join(DATA_DIR, 'new_val');
fs.mkdirSync(TRAIN_DIR, { recursive: true });
fs.mkdirSync(VAL_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* 流式行读取 / 写入                                                    */
/* ------------------------------------------------------------------ */
async function* readLines(file: string): AsyncGenerator<string> {
    const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 22 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
        if (line.trim()) yield line;
    }
}

class JsonlWriter {
    private stream: fs.WriteStream;

    public bytes = 0;

    public rows = 0;

    constructor(public readonly file: string) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        this.stream = fs.createWriteStream(file, { flags: 'w' });
    }

    async write(line: string): Promise<void> {
        this.bytes += Buffer.byteLength(line) + 1;
        this.rows += 1;
        if (!this.stream.write(`${line}\n`)) {
            await new Promise<void>((resolve) => this.stream.once('drain', resolve));
        }
    }

    async close(): Promise<void> {
        await new Promise<void>((resolve) => this.stream.end(resolve));
    }
}

async function collectKeys(file: string, regex: RegExp): Promise<Set<string>> {
    const keys = new Set<string>();
    const abs = path.resolve(file);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return keys;
    for await (const line of readLines(abs)) {
        const m = regex.exec(line);
        if (m) keys.add(m[1]);
    }
    return keys;
}

/* ------------------------------------------------------------------ */
/* 单行编码                                                            */
/* ------------------------------------------------------------------ */
interface RawRow {
    schema: string;
    split: string;
    sourcePolicy: string;
    behaviorPolicyId?: string;
    behaviorCheckpointSha256?: string | null;
    rootId: string;
    rootFamilyId: string;
    trueFamilyId?: string;
    mapIndex: number;
    mapName: string;
    scenarioId: string;
    rootIndex?: number;
    seed: number;
    subjectSeat?: number;
    subjectPlayerId: number;
    subjectAllianceId: number | null;
    stepIndex: number;
    turn: number;
    completedPlayerTurns: number;
    phaseBucket: string;
    behaviorActionCode: string;
    stateJson: string;
    stateHash: string;
    gameId: string;
    gameOutcomeKind: string;
    naturalTerminal: boolean;
    winnerAllianceId: number | null;
    subjectOutcome: string | null;
    valueTarget: number | null;
    gameSteps: number;
    gameTurns: number;
    gameWallMs: number;
    engineError: string | null;
}

interface EncodedRow {
    line: string;
    actualInputKey: string;
    sampleId: string;
    trueFamilyId: string;
    phaseBucket: string;
    mapName: string;
    subjectPlayerId: number;
    sourcePolicy: string;
    l1ActionCode: string | null;
    valueTarget: number | null;
    subjectOutcome: string | null;
    naturalTerminal: boolean;
}

/** V16 的 inputHash 公式（张量 + actionCode 列表）；只作对照，不是身份。 */
function legacyV16InputHash(spatial: number[], global: number[], actionCodes: string[]): string {
    return crypto.createHash('sha256')
        .update(Buffer.from(new Float32Array(spatial).buffer))
        .update(Buffer.from(new Float32Array(global).buffer))
        .update(actionCodes.join('\n'), 'utf8')
        .digest('hex');
}

function encodeRolloutRow(row: RawRow): EncodedRow {
    const state = JSON.parse(row.stateJson) as GameState;
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const legal: Action[] = engine.isTerminal()
        ? []
        : engine.getLegalActions(row.subjectPlayerId).filter((a) => a.type !== 'surrender');
    if (legal.length === 0) throw new Error(`EMPTY_LEGAL_SET:${row.gameId}`);

    const decorated = legal.map((action) => ({ action, code: encodeAction(action) }));
    decorated.sort((a, b) => compareActionCodeCanonicalV16(a.code, b.code));
    const targetIndex = decorated.findIndex((d) => d.code === row.behaviorActionCode);
    if (targetIndex < 0) throw new Error(`BEHAVIOR_NOT_LEGAL:${row.gameId}:${row.behaviorActionCode}`);

    const spatial = encodeGameStateSpatial(state, row.subjectPlayerId, 'v2', { channels: 26 });
    const candidates = decorated.map((d) => {
        const features = encodeCandidateActionSpatial(state, row.subjectPlayerId, d.action, 'v2', 'v15_current');
        const semantics = Array.from(features.semantics);
        if (semantics.length !== V17_ACTION_SEMANTIC_DIM) {
            throw new Error(`SEMANTIC_DIM:${row.gameId}:${semantics.length}`);
        }
        return {
            action: d.action,
            actionCode: d.code,
            actorCoord: features.actorCoord ?? null,
            landingCoord: features.landingCoord ?? null,
            targetCoord: features.targetCoord ?? null,
            semantics,
        };
    });
    if (spatial.spatialTensor.length !== 26 * 20 * 20) {
        throw new Error(`SPATIAL_DIM:${row.gameId}:${spatial.spatialTensor.length}`);
    }
    if (spatial.globalFeatures.length !== GLOBAL_FEATURE_DIM_V2) {
        throw new Error(`GLOBAL_DIM:${row.gameId}:${spatial.globalFeatures.length}`);
    }

    const label = queryL1Label(state, {
        labelSeedBase: LABEL_SEED_BASE,
        actingPlayerId: row.subjectPlayerId,
        filterSurrender: true,
    });
    const l1Index = label.actionCode === null ? null : decorated.findIndex((d) => d.code === label.actionCode);

    const spatialArray = Array.from(spatial.spatialTensor);
    const globalArray = Array.from(spatial.globalFeatures);
    // (3a) 编码后计算真实网络输入身份。
    const actualInputKey = policyInputKeyHexV17(spatialArray, globalArray, candidates);
    const v16Saved = legacyV16InputHash(spatialArray, globalArray, decorated.map((d) => d.code));

    const trueFamilyId = row.trueFamilyId ?? row.rootFamilyId;
    const sampleId = `${row.rootId}|seat${row.subjectPlayerId}|step${row.stepIndex}`;
    const natural = row.naturalTerminal === true && row.valueTarget !== null;

    const line = JSON.stringify({
        schema: 'v17_dataset_row_1',
        sampleId,
        environmentId: `v17:${V16_INITIALIZATION_POLICY_ID}`,
        initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
        encoderSchemaId: ENCODER_SCHEMA_ID_V15,
        candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
        filterId: V16_ACTION_FILTER_ID,
        rngContractId: V16_RNG_CONTRACT_ID,
        inputIdentityId: V17_INPUT_IDENTITY_ID,
        rootFamilyId: trueFamilyId,
        trueFamilyId,
        split: row.split,
        rootId: row.rootId,
        episodeId: row.rootId,
        sourcePolicy: row.sourcePolicy,
        behaviorPolicyId: row.behaviorPolicyId ?? null,
        behaviorCheckpointSha256: row.behaviorCheckpointSha256 ?? null,
        subjectPlayerId: row.subjectPlayerId,
        subjectAllianceId: row.subjectAllianceId,
        rootAllianceId: row.subjectAllianceId,
        phaseBucket: row.phaseBucket,
        completedPlayerTurns: row.completedPlayerTurns,
        mapName: row.mapName,
        mapIndex: row.mapIndex,
        rootIndex: row.rootIndex ?? null,
        seed: row.seed,
        teacherVersion: null,
        teacherTier: null,
        teacherSeed: null,
        teacherBudget: null,
        teacherTraceHash: null,
        reachedBoundary: null,
        labelConfidence: 'L1_ISOLATED',
        stateHash: row.stateHash,
        policyInputKey: actualInputKey,
        actualInputKey,
        v16SavedPolicyInputKey: v16Saved,
        v16SavedPolicyInputKeyNote:
            'V16 公式（float32 张量 + actionCode 列表）的重算值，仅供与 V16 产物对照；'
            + '它不是身份，不参与去重/隔离判定。身份只有 policyInputKey === actualInputKey。',
        actualInputFloat32Hash: crypto.createHash('sha256')
            .update(Buffer.from(new Float32Array(spatialArray).buffer))
            .update(Buffer.from(new Float32Array(globalArray).buffer))
            .digest('hex'),
        turn: row.turn,
        step: row.stepIndex,
        playerId: row.subjectPlayerId,
        spatialTensor: spatialArray,
        globalFeatures: globalArray,
        candidateActions: candidates,
        orderedActionCodes: decorated.map((d) => d.code),
        targetActionIndex: targetIndex,
        targetActionCode: row.behaviorActionCode,
        behaviorActionCode: row.behaviorActionCode,
        l1ActionCode: label.actionCode,
        l1ActionIndex: l1Index === null || l1Index < 0 ? null : l1Index,
        l1LabelerVersion: L1_LABELER_VERSION,
        l1Scores: label.scores,
        acceptableActionCodes: label.actionCode === null ? [] : [label.actionCode],
        acceptableEvidence: 'L1_ISOLATED_QUERY_ONLY（尚未做引擎后继状态等价证明）',
        policyLossMask: true,
        valueLossMask: natural,
        valueTarget: natural ? row.valueTarget : null,
        subjectOutcome: row.subjectOutcome,
        gameOutcomeKind: row.gameOutcomeKind,
        winnerAllianceId: row.winnerAllianceId,
        outcomeSource: natural ? `natural-terminal:${row.gameOutcomeKind}` : null,
        gameSteps: row.gameSteps,
        gameTurns: row.gameTurns,
        gameWallMs: row.gameWallMs,
        searchActionCode: null,
        evaluatedActionCodes: null,
        searchScores: null,
        searchScoreScale: null,
        searchMask: null,
        coreSetMember: false,
    });

    return {
        line,
        actualInputKey,
        sampleId,
        trueFamilyId,
        phaseBucket: row.phaseBucket,
        mapName: row.mapName,
        subjectPlayerId: row.subjectPlayerId,
        sourcePolicy: row.sourcePolicy,
        l1ActionCode: label.actionCode,
        valueTarget: natural ? row.valueTarget : null,
        subjectOutcome: row.subjectOutcome,
        naturalTerminal: natural,
    };
}

/* ------------------------------------------------------------------ */
/* 模式 A：只编码（可并行分片）                                          */
/* ------------------------------------------------------------------ */
if (ENCODE_OUT !== null) {
    if (ENCODE_INPUTS.length === 0) throw new Error('[T17-01] --encode-out 需要 --encode-inputs。');
    const outPath = path.resolve(ENCODE_OUT);
    const writer = new JsonlWriter(outPath);
    const rejWriter = new JsonlWriter(outPath.replace(/\.jsonl$/, '.rejected.jsonl'));
    let total = 0;
    let rejected = 0;
    const startedAt = Date.now();
    for (const file of ENCODE_INPUTS) {
        const abs = path.resolve(file);
        if (!fs.existsSync(abs)) throw new Error(`[T17-01] rollout 文件不存在：${abs}`);
        for await (const line of readLines(abs)) {
            if (LIMIT !== null && total >= LIMIT) break;
            total += 1;
            let row: RawRow;
            try {
                row = JSON.parse(line) as RawRow;
            } catch (error) {
                rejected += 1;
                await rejWriter.write(JSON.stringify({ kind: 'JSON_PARSE', reason: String(error), file: abs }));
                continue;
            }
            try {
                const encoded = encodeRolloutRow(row);
                await writer.write(encoded.line);
            } catch (error) {
                rejected += 1;
                await rejWriter.write(JSON.stringify({
                    kind: 'ENCODE_REJECT', sampleId: row.gameId, mapName: row.mapName,
                    seed: row.seed, subjectPlayerId: row.subjectPlayerId,
                    reason: String(error instanceof Error ? error.message : error),
                }));
            }
            if (total % 1000 === 0) {
                console.log(`[T17-01] encode ${path.basename(outPath)}: ${total} 行 `
                    + `(${writer.rows} ok / ${rejected} reject) ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
            }
        }
    }
    await writer.close();
    await rejWriter.close();
    fs.writeFileSync(outPath.replace(/\.jsonl$/, '.encode_summary.json'), `${JSON.stringify({
        schema: 'v17_encode_shard_summary_1',
        runId: RUN_ID,
        inputFiles: ENCODE_INPUTS,
        encodedRows: writer.rows,
        rejectedRows: rejected,
        rawRows: total,
        outputBytes: writer.bytes,
        wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
        labelSeedBase: LABEL_SEED_BASE,
        identityId: V17_INPUT_IDENTITY_ID,
    }, null, 2)}\n`, 'utf8');
    console.log(`[T17-01] 编码分片完成：${writer.rows}/${total} → ${outPath}`);
    process.exit(0);
}

/* ------------------------------------------------------------------ */
/* 一个 split 的构建（编码 + 编码后去重 + 冲突台账）                     */
/* ------------------------------------------------------------------ */
interface KeyObservation {
    sampleId: string;
    l1ActionCode: string | null;
    valueTarget: number | null;
    sourcePolicy: string;
    trueFamilyId: string;
    mapName: string;
    phaseBucket: string;
}

interface SplitResult {
    split: string;
    rawRows: number;
    encodedRows: number;
    uniqueInputsBeforeFamilyCap: number;
    uniqueInputs: number;
    rows: number;
    duplicateRows: number;
    duplicateRowsWithSameLabels: number;
    rejectedRows: number;
    conflictL1Keys: number;
    conflictValueKeys: number;
    conflictRows: number;
    crossSplitDropped: number;
    legacyOverlapDropped: number;
    families: number;
    maxFamilyRows: number;
    maxFamilyShare: number;
    familyShareP50: number;
    familyShareP90: number;
    topFamilies: Array<{ family: string; rows: number; share: number }>;
    maxFamilyShareTarget: number;
    familyCapFeasible: boolean;
    familyCapQuota: number;
    familyCapNote: string | null;
    cappedVariant: {
        path: string;
        rows: number;
        maxFamilyRows: number;
        maxFamilyShare: number;
        droppedRows: number;
        quota: number;
    } | null;
    byMap: Record<string, number>;
    bySeat: Record<string, number>;
    byPhase: Record<string, number>;
    byOutcome: Record<string, number>;
    byValueTarget: Record<string, number>;
    bySource: Record<string, number>;
    naturalWin: number;
    naturalLoss: number;
    naturalDraw: number;
    nonNatural: number;
    naturalTerminalFamilies: number;
    naturalWinFamilies: number;
    naturalLossFamilies: number;
    familyTicketCounts: Array<[string, number]>;
    datasetPath: string;
    datasetBytes: number;
    wallSeconds: number;
}

function bump(record: Record<string, number>, key: string): void {
    record[key] = (record[key] ?? 0) + 1;
}

async function buildSplit(
    split: 'train' | 'val',
    files: string[],
    outDir: string,
    datasetName: string,
    rejectKeys: Map<string, 'cross-split-new-train' | 'legacy-v16-train'>,
    preEncoded: boolean,
): Promise<SplitResult> {
    const dataset = new JsonlWriter(path.join(outDir, datasetName));
    const duplicates = new JsonlWriter(path.join(outDir, 'duplicates.jsonl'));
    const conflicts = new JsonlWriter(path.join(outDir, 'conflicts.jsonl'));
    const rejected = new JsonlWriter(path.join(outDir, 'rejected.jsonl'));
    const crossOverlap = new JsonlWriter(path.join(outDir, 'cross_split_overlap.jsonl'));
    const legacyOverlap = new JsonlWriter(path.join(outDir, 'legacy_train_overlap.jsonl'));

    const seen = new Map<string, KeyObservation>();
    const obsByKey = new Map<string, KeyObservation[]>();
    const familyCounts: Record<string, number> = {};
    let rawRows = 0;
    let encodedRows = 0;
    let duplicateRows = 0;
    let duplicateRowsWithSameLabels = 0;
    let rejectedRows = 0;
    let crossSplitDropped = 0;
    let legacyOverlapDropped = 0;
    let conflictRows = 0;
    const conflictKeys = new Set<string>();

    const startedAt = Date.now();
    outer:
    for (const file of files) {
        const abs = path.resolve(file);
        if (!fs.existsSync(abs)) throw new Error(`[T17-01] 输入文件不存在：${abs}`);
        for await (const line of readLines(abs)) {
            if (LIMIT !== null && rawRows >= LIMIT) break outer;
            rawRows += 1;
            let encoded: EncodedRow;
            if (preEncoded) {
                try {
                    const parsed = JSON.parse(line) as Record<string, unknown>;
                    encoded = {
                        line,
                        actualInputKey: parsed.actualInputKey as string,
                        sampleId: parsed.sampleId as string,
                        trueFamilyId: parsed.trueFamilyId as string,
                        phaseBucket: parsed.phaseBucket as string,
                        mapName: parsed.mapName as string,
                        subjectPlayerId: parsed.subjectPlayerId as number,
                        sourcePolicy: parsed.sourcePolicy as string,
                        l1ActionCode: (parsed.l1ActionCode ?? null) as string | null,
                        valueTarget: (parsed.valueTarget ?? null) as number | null,
                        subjectOutcome: (parsed.subjectOutcome ?? null) as string | null,
                        naturalTerminal: parsed.valueLossMask === true,
                    };
                    if (typeof encoded.actualInputKey !== 'string' || encoded.actualInputKey.length !== 64) {
                        throw new Error('MISSING_ACTUAL_INPUT_KEY');
                    }
                } catch (error) {
                    rejectedRows += 1;
                    await rejected.write(JSON.stringify({
                        kind: 'ENCODED_PARSE_REJECT', file: abs,
                        reason: String(error instanceof Error ? error.message : error),
                    }));
                    continue;
                }
                encodedRows += 1;
            } else {
                let row: RawRow;
                try {
                    row = JSON.parse(line) as RawRow;
                } catch (error) {
                    rejectedRows += 1;
                    await rejected.write(JSON.stringify({ kind: 'JSON_PARSE', reason: String(error), file: abs }));
                    continue;
                }
                try {
                    encoded = encodeRolloutRow(row);
                } catch (error) {
                    rejectedRows += 1;
                    await rejected.write(JSON.stringify({
                        kind: 'ENCODE_REJECT', sampleId: row.gameId, mapName: row.mapName, seed: row.seed,
                        subjectPlayerId: row.subjectPlayerId,
                        reason: String(error instanceof Error ? error.message : error),
                    }));
                    continue;
                }
                encodedRows += 1;
            }
            const key = encoded.actualInputKey;
            const observation: KeyObservation = {
                sampleId: encoded.sampleId, l1ActionCode: encoded.l1ActionCode,
                valueTarget: encoded.valueTarget, sourcePolicy: encoded.sourcePolicy,
                trueFamilyId: encoded.trueFamilyId, mapName: encoded.mapName,
                phaseBucket: encoded.phaseBucket,
            };

            const rejectKind = rejectKeys.get(key);
            if (rejectKind !== undefined) {
                if (rejectKind === 'cross-split-new-train') {
                    crossSplitDropped += 1;
                    await crossOverlap.write(JSON.stringify({
                        split, actualInputKey: key, sampleId: encoded.sampleId,
                        trueFamilyId: encoded.trueFamilyId, sourcePolicy: encoded.sourcePolicy,
                        reason: '该输入已在 new_train 数据集中保留；按“跨区交集必须为 0”拒绝进入 new_val。',
                    }));
                } else {
                    legacyOverlapDropped += 1;
                    await legacyOverlap.write(JSON.stringify({
                        split, actualInputKey: key, sampleId: encoded.sampleId,
                        trueFamilyId: encoded.trueFamilyId, sourcePolicy: encoded.sourcePolicy,
                        reason: '该输入与 V16 legacy train 已用输入相同；拒绝进入新 val。',
                    }));
                }
                continue;
            }

            const prev = seen.get(key);
            if (prev !== undefined) {
                duplicateRows += 1;
                const sameL1 = prev.l1ActionCode === encoded.l1ActionCode;
                const sameValue = prev.valueTarget === encoded.valueTarget;
                if (sameL1 && sameValue) duplicateRowsWithSameLabels += 1;
                await duplicates.write(JSON.stringify({
                    split, actualInputKey: key, sampleId: encoded.sampleId,
                    duplicateOfKeptSampleId: prev.sampleId,
                    keptL1ActionCode: prev.l1ActionCode, keptValueTarget: prev.valueTarget,
                    l1ActionCode: encoded.l1ActionCode, valueTarget: encoded.valueTarget,
                    sameL1, sameValue,
                    sourcePolicy: encoded.sourcePolicy, trueFamilyId: encoded.trueFamilyId,
                    phaseBucket: encoded.phaseBucket, mapName: encoded.mapName,
                }));
                const list = obsByKey.get(key) ?? [];
                if (list.length < 12) list.push(observation);
                obsByKey.set(key, list);
                if (!sameL1 || !sameValue) {
                    conflictRows += 1;
                    conflictKeys.add(key);
                }
                continue;
            }
            seen.set(key, observation);
            obsByKey.set(key, [observation]);
            familyCounts[encoded.trueFamilyId] = (familyCounts[encoded.trueFamilyId] ?? 0) + 1;
            await dataset.write(encoded.line);
            if (seen.size % 2000 === 0) {
                console.log(`[T17-01] ${split}: 已处理 ${encodedRows} 行 / 唯一 ${seen.size}，`
                    + `${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
            }
        }
    }

    // ---- 冲突台账：同输入不同 L1 或不同 value -------------------------------
    let conflictL1Keys = 0;
    let conflictValueKeys = 0;
    for (const key of [...conflictKeys].sort()) {
        const obs = obsByKey.get(key) ?? [];
        const l1s = [...new Set(obs.map((o) => o.l1ActionCode))].sort();
        const vals = [...new Set(obs.map((o) => String(o.valueTarget)))].sort();
        const kinds: string[] = [];
        if (l1s.length > 1) { kinds.push('L1_ACTION'); conflictL1Keys += 1; }
        if (vals.length > 1) { kinds.push('VALUE_TARGET'); conflictValueKeys += 1; }
        await conflicts.write(JSON.stringify({
            split, actualInputKey: key, kinds,
            keptSampleId: seen.get(key)?.sampleId ?? null,
            observations: obs,
            distinctL1ActionCodes: l1s,
            distinctValueTargets: vals,
            note: '同输入不同标签是“随机策略下的回报分布 / 等价或噪声动作”的证据。本文件保留全部观测；'
                + '不选更容易训练的标签作为唯一真值，也不把冲突当作数据错误删除。',
        }));
    }

    await dataset.close();
    await duplicates.close();
    await conflicts.close();
    await rejected.close();
    await crossOverlap.close();
    await legacyOverlap.close();

    const datasetPath = path.join(outDir, datasetName);
    console.log(`[T17-01] ${split}: raw=${rawRows} unique(去重后)=${seen.size} dup=${duplicateRows} `
        + `conflictKeys=${conflictKeys.size} rejected=${rejectedRows} `
        + `crossDrop=${crossSplitDropped} legacyDrop=${legacyOverlapDropped} `
        + `${((Date.now() - startedAt) / 1000).toFixed(0)}s`);

    return {
        split,
        rawRows,
        encodedRows,
        uniqueInputsBeforeFamilyCap: seen.size,
        uniqueInputs: seen.size,
        rows: seen.size,
        duplicateRows,
        duplicateRowsWithSameLabels,
        rejectedRows,
        conflictL1Keys,
        conflictValueKeys,
        conflictRows,
        crossSplitDropped,
        legacyOverlapDropped,
        families: Object.keys(familyCounts).length,
        maxFamilyRows: 0,
        maxFamilyShare: 0,
        familyShareP50: 0,
        familyShareP90: 0,
        topFamilies: [],
        maxFamilyShareTarget: MAX_FAMILY_SHARE,
        familyCapFeasible: true,
        familyCapQuota: 0,
        familyCapNote: null,
        cappedVariant: null,
        byMap: {},
        bySeat: {},
        byPhase: {},
        byOutcome: {},
        byValueTarget: {},
        bySource: {},
        naturalWin: 0,
        naturalLoss: 0,
        naturalDraw: 0,
        nonNatural: 0,
        naturalTerminalFamilies: 0,
        naturalWinFamilies: 0,
        naturalLossFamilies: 0,
        familyTicketCounts: [],
        datasetPath: datasetPath.replace(/\\/g, '/'),
        datasetBytes: fs.statSync(datasetPath).size,
        wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    };
}

/* ------------------------------------------------------------------ */
/* family 配额：先判可行性，再按 (seat,phase) 分层裁剪                   */
/* ------------------------------------------------------------------ */
const FAMILY_RE = /"trueFamilyId":"([^"]*)"/;
const PHASE_RE = /"phaseBucket":"([^"]*)"/;
const SEAT_RE = /"subjectPlayerId":(\d+)/;
const SAMPLE_ID_RE = /"sampleId":"([^"]*)"/;

interface FamilyPlan { total: number; strata: Record<string, number> }

async function planFamilies(file: string): Promise<Map<string, FamilyPlan>> {
    const plan = new Map<string, FamilyPlan>();
    for await (const line of readLines(file)) {
        const family = FAMILY_RE.exec(line)?.[1] ?? 'unknown';
        const phase = PHASE_RE.exec(line)?.[1] ?? 'unknown';
        const seat = SEAT_RE.exec(line)?.[1] ?? 'unknown';
        const entry = plan.get(family) ?? { total: 0, strata: {} };
        entry.total += 1;
        const stratum = `${seat}|${phase}`;
        entry.strata[stratum] = (entry.strata[stratum] ?? 0) + 1;
        plan.set(family, entry);
    }
    return plan;
}

/**
 * 求「保留行数最多」的 family 配额，且满足 `quota / Σ min(c_f, quota) <= target`。
 *
 * 中文：`q/N(q)` 在 q 上**不单调**（`N(q)=Σ min(c_f,q)` 是阶梯函数），所以直接二分最大 q
 * 可能落到一个 N 更小的解。family 数最多几十个，直接把「各 family 行数」当候选 q 全枚举，
 * 在可行解里取 N 最大的那个，才是在不违反 ≤target 的前提下保留最多数据的答案。
 *
 * 若连 q=1 都不可行（family 数 < 1/target），则「单 family ≤ target」在本 split 上
 * **不可行**：不裁剪任何行，如实报告实际最大占比，而不是为了凑指标把数据砍掉。
 */
function planQuota(plan: Map<string, FamilyPlan>, target: number): { quota: number; feasible: boolean; total: number } {
    const totals = [...plan.values()].map((p) => p.total);
    const total = totals.reduce((a, b) => a + b, 0);
    if (totals.length === 0) return { quota: 0, feasible: false, total: 0 };
    const n = (q: number): number => totals.reduce((a, c) => a + Math.min(c, q), 0);
    const candidates = [...new Set(totals)].sort((a, b) => a - b);
    let best = 0;
    let bestKept = 0;
    for (const q of candidates) {
        const kept = n(q);
        if (kept > 0 && q / kept <= target && kept > bestKept) {
            best = q;
            bestKept = kept;
        }
    }
    return { quota: best, feasible: best > 0, total };
}

async function applyFamilyPlan(srcFile: string, dstFile: string, plan: Map<string, FamilyPlan>, quota: number): Promise<number> {
    const keepByStratum = new Map<string, Map<string, number>>();
    for (const [family, p] of plan) {
        const keepTarget = Math.min(p.total, quota);
        if (keepTarget >= p.total) continue;
        const strata = Object.entries(p.strata);
        const exact = strata.map(([s, c]) => ({ s, c, v: (keepTarget * c) / p.total }));
        const map = new Map<string, number>();
        let assigned = 0;
        for (const e of exact) { const f = Math.floor(e.v); map.set(e.s, f); assigned += f; }
        const byRemainder = [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
        let i = 0;
        while (assigned < keepTarget && byRemainder.length > 0) {
            const e = byRemainder[i % byRemainder.length];
            const current = map.get(e.s) ?? 0;
            if (current < e.c) { map.set(e.s, current + 1); assigned += 1; }
            i += 1;
            if (i > byRemainder.length * 4) break;
        }
        keepByStratum.set(family, map);
    }

    const tmp = `${dstFile}.tmp`;
    const out = new JsonlWriter(tmp);
    const dropped = new JsonlWriter(dstFile.replace(/\.jsonl$/, '.family_cap_dropped.jsonl'));
    const counters = new Map<string, number>();
    let droppedRows = 0;
    for await (const line of readLines(srcFile)) {
        const family = FAMILY_RE.exec(line)?.[1] ?? 'unknown';
        const phase = PHASE_RE.exec(line)?.[1] ?? 'unknown';
        const seat = SEAT_RE.exec(line)?.[1] ?? 'unknown';
        const stratumPlan = keepByStratum.get(family);
        if (stratumPlan === undefined) { await out.write(line); continue; }
        const stratum = `${seat}|${phase}`;
        const keep = stratumPlan.get(stratum) ?? 0;
        const total = plan.get(family)?.strata[stratum] ?? 0;
        const index = counters.get(`${family}|${stratum}`) ?? 0;
        counters.set(`${family}|${stratum}`, index + 1);
        const take = total > 0 && keep > 0
            && Math.floor(((index + 1) * keep) / total) > Math.floor((index * keep) / total);
        if (take) { await out.write(line); continue; }
        droppedRows += 1;
        await dropped.write(JSON.stringify({
            sampleId: SAMPLE_ID_RE.exec(line)?.[1] ?? null,
            trueFamilyId: family, phaseBucket: phase, subjectPlayerId: Number(seat),
            reason: `family 配额：单 family 上限 ${quota} 行（按 (seat,phase) 分层），`
                + `保证单 family ≤ ${(MAX_FAMILY_SHARE * 100).toFixed(1)}% 行。被丢弃行仍保留在原始 rollout 中，可重新编码。`,
        }));
    }
    await out.close();
    await dropped.close();
    fs.rmSync(dstFile, { force: true });
    fs.renameSync(tmp, dstFile);
    console.log(`[T17-01] family 平衡变体：quota=${quota}/family，分层丢弃 ${droppedRows} 行 → `
        + `${path.basename(dstFile)}`);
    return droppedRows;
}

/* ------------------------------------------------------------------ */
/* 终局统计：以**最终落盘文件**为准重算报告数字                          */
/* ------------------------------------------------------------------ */
async function finalizeSplit(file: string, report: SplitResult, keysOutFile: string | null): Promise<Set<string>> {
    const keys = new Set<string>();
    const keysWriter = keysOutFile === null ? null : new JsonlWriter(keysOutFile);
    const familyCounts: Record<string, number> = {};
    const familyOutcomes = new Map<string, Set<string>>();
    const byMap: Record<string, number> = {};
    const bySeat: Record<string, number> = {};
    const byPhase: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    const byValueTarget: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let rows = 0;
    let naturalWin = 0;
    let naturalLoss = 0;
    let naturalDraw = 0;
    let nonNatural = 0;
    const startedAt = Date.now();
    for await (const line of readLines(file)) {
        const row = JSON.parse(line) as Record<string, unknown>;
        rows += 1;
        keys.add(row.actualInputKey as string);
        const family = row.trueFamilyId as string;
        familyCounts[family] = (familyCounts[family] ?? 0) + 1;
        const outcomeSet = familyOutcomes.get(family) ?? new Set<string>();
        if (row.valueLossMask === true) outcomeSet.add(String(row.subjectOutcome));
        familyOutcomes.set(family, outcomeSet);
        bump(byMap, String(row.mapName));
        bump(bySeat, String(row.subjectPlayerId));
        bump(byPhase, String(row.phaseBucket));
        bump(bySource, String(row.sourcePolicy));
        bump(byOutcome, String(row.subjectOutcome));
        bump(byValueTarget, String(row.valueTarget));
        if (row.valueLossMask !== true) nonNatural += 1;
        else if (row.subjectOutcome === 'win') naturalWin += 1;
        else if (row.subjectOutcome === 'loss') naturalLoss += 1;
        else naturalDraw += 1;
    }
    if (keysWriter !== null) {
        for (const k of [...keys].sort()) await keysWriter.write(k);
        await keysWriter.close();
    }
    report.rows = rows;
    report.uniqueInputs = keys.size;
    report.families = Object.keys(familyCounts).length;
    const sortedFamilyCounts = Object.values(familyCounts).sort((a, b) => a - b);
    const pct = (q: number): number => (sortedFamilyCounts.length === 0 || rows === 0
        ? 0
        : sortedFamilyCounts[Math.min(sortedFamilyCounts.length - 1, Math.floor(q * sortedFamilyCounts.length))] / rows);
    report.maxFamilyRows = rows === 0 ? 0 : sortedFamilyCounts[sortedFamilyCounts.length - 1];
    report.maxFamilyShare = rows === 0 ? 0 : report.maxFamilyRows / rows;
    report.familyShareP50 = pct(0.5);
    report.familyShareP90 = pct(0.9);
    report.topFamilies = Object.entries(familyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([family, count]) => ({ family, rows: count, share: rows === 0 ? 0 : count / rows }));
    report.byMap = byMap;
    report.bySeat = bySeat;
    report.byPhase = byPhase;
    report.byOutcome = byOutcome;
    report.byValueTarget = byValueTarget;
    report.bySource = bySource;
    report.naturalWin = naturalWin;
    report.naturalLoss = naturalLoss;
    report.naturalDraw = naturalDraw;
    report.nonNatural = nonNatural;
    let withTerminal = 0;
    let winFamilies = 0;
    let lossFamilies = 0;
    for (const [, outcomes] of familyOutcomes) {
        if (outcomes.size === 0) continue;
        withTerminal += 1;
        if (outcomes.has('win')) winFamilies += 1;
        if (outcomes.has('loss')) lossFamilies += 1;
    }
    report.naturalTerminalFamilies = withTerminal;
    report.naturalWinFamilies = winFamilies;
    report.naturalLossFamilies = lossFamilies;
    report.familyTicketCounts = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);
    report.datasetBytes = fs.statSync(file).size;
    report.wallSeconds = Number((report.wallSeconds + (Date.now() - startedAt) / 1000).toFixed(1));
    return keys;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
const legacyIndex = await collectKeys(LEGACY_TRAIN_INDEX, /"key":\s*"([0-9a-f]{64})"/);
const legacyDedup = await collectKeys(LEGACY_TRAIN_DEDUP, /"actualInputKey":"([0-9a-f]{64})"/);
const legacyUsed = new Set<string>([...legacyIndex, ...legacyDedup]);
console.log(`[T17-01] legacy train 已用输入：index=${legacyIndex.size} dedup=${legacyDedup.size} `
    + `union=${legacyUsed.size}`);

const results: SplitResult[] = [];
let trainKeySet = new Set<string>();
if (TRAIN_KEYS_FILE !== null && fs.existsSync(path.resolve(TRAIN_KEYS_FILE))) {
    for await (const line of readLines(path.resolve(TRAIN_KEYS_FILE))) {
        const t = line.trim();
        if (t) trainKeySet.add(t);
    }
    console.log(`[T17-01] 载入已有 new_train key：${trainKeySet.size}`);
}

async function finishSplit(result: SplitResult, keysOutFile: string | null): Promise<Set<string>> {
    // 主数据集：**不截断**，保留全部唯一输入。family 占比照实报告。
    const keys = await finalizeSplit(path.resolve(result.datasetPath), result, keysOutFile);

    // 次级产物：满足 ≤max-family-share 的平衡变体（另存，不覆盖主数据集）。
    const plan = await planFamilies(path.resolve(result.datasetPath));
    const { quota, feasible } = planQuota(plan, MAX_FAMILY_SHARE);
    result.familyCapQuota = quota;
    result.familyCapFeasible = feasible;
    const minFamily = Math.min(...[...plan.values()].map((p) => p.total));
    const familyCount = plan.size;
    if (!feasible) {
        result.familyCapNote = `本 split 只有 ${familyCount} 个物理 family，单 family 占比下界为 `
            + `1/${familyCount} = ${(100 / familyCount).toFixed(2)}% > 目标 ${(MAX_FAMILY_SHARE * 100).toFixed(1)}%，`
            + '严格配额不可行；主数据集不裁剪，实际占比照实报告。';
    } else {
        result.familyCapNote = `严格 ≤${(MAX_FAMILY_SHARE * 100).toFixed(1)}% 的可行解要求各 family 保留行数相等`
            + `（kept_f = M 对所有 f），因此最大可行总量 = F × min_f c_f = ${familyCount} × ${minFamily} = `
            + `${familyCount * minFamily} 行；主数据集**不**采用这个截断，只另存平衡变体。`;
    }
    if (WRITE_CAPPED && feasible) {
        const cappedPath = path.resolve(result.datasetPath).replace(/\.jsonl$/, '.family_capped.jsonl');
        fs.copyFileSync(path.resolve(result.datasetPath), cappedPath);
        const droppedRows = await applyFamilyPlan(path.resolve(result.datasetPath), cappedPath, plan, quota);
        const cappedStats = { path: cappedPath.replace(/\\/g, '/'), rows: 0, maxFamilyRows: quota, maxFamilyShare: 0, droppedRows, quota };
        let cappedRows = 0;
        const cappedFamilyCounts: Record<string, number> = {};
        for await (const line of readLines(cappedPath)) {
            cappedRows += 1;
            const fam = FAMILY_RE.exec(line)?.[1] ?? 'unknown';
            cappedFamilyCounts[fam] = (cappedFamilyCounts[fam] ?? 0) + 1;
        }
        cappedStats.rows = cappedRows;
        cappedStats.maxFamilyRows = cappedRows === 0 ? 0 : Math.max(...Object.values(cappedFamilyCounts));
        cappedStats.maxFamilyShare = cappedRows === 0 ? 0 : cappedStats.maxFamilyRows / cappedRows;
        result.cappedVariant = cappedStats;
    }
    return keys;
}

if (ONLY === 'train' || ONLY === 'both') {
    const trainInputs = ENCODED_TRAIN.length > 0 ? ENCODED_TRAIN : TRAIN_FILES;
    if (trainInputs.length === 0) throw new Error('[T17-01] 需要 --train-rollouts 或 --encoded-train。');
    const trainResult = await buildSplit(
        'train', trainInputs, TRAIN_DIR, 'dataset_v17_newtrain.jsonl', new Map(), ENCODED_TRAIN.length > 0,
    );
    trainKeySet = await finishSplit(trainResult, path.join(TRAIN_DIR, 'actual_input_keys.txt'));
    results.push(trainResult);
    console.log(`[T17-01] new_train 最终：rows=${trainResult.rows} unique=${trainResult.uniqueInputs} `
        + `families=${trainResult.families} maxFamilyShare=${(trainResult.maxFamilyShare * 100).toFixed(2)}% `
        + `p50=${(trainResult.familyShareP50 * 100).toFixed(2)}% p90=${(trainResult.familyShareP90 * 100).toFixed(2)}% `
        + `capped=${trainResult.cappedVariant === null ? 'n/a' : `${trainResult.cappedVariant.rows} rows @ ${(trainResult.cappedVariant.maxFamilyShare * 100).toFixed(2)}%`}`);
}

if (ONLY === 'val' || ONLY === 'both') {
    const valInputs = ENCODED_VAL.length > 0 ? ENCODED_VAL : VAL_FILES;
    if (valInputs.length === 0) throw new Error('[T17-01] 需要 --val-rollouts 或 --encoded-val。');
    const rejectKeys = new Map<string, 'cross-split-new-train' | 'legacy-v16-train'>();
    for (const k of trainKeySet) rejectKeys.set(k, 'cross-split-new-train');
    for (const k of legacyUsed) if (!rejectKeys.has(k)) rejectKeys.set(k, 'legacy-v16-train');
    console.log(`[T17-01] val 拒绝集：new_train=${trainKeySet.size} legacy=${legacyUsed.size} union=${rejectKeys.size}`);
    const valResult = await buildSplit(
        'val', valInputs, VAL_DIR, 'dataset_v17_newval.jsonl', rejectKeys, ENCODED_VAL.length > 0,
    );
    await finishSplit(valResult, null);
    results.push(valResult);
    console.log(`[T17-01] new_val 最终：rows=${valResult.rows} unique=${valResult.uniqueInputs} `
        + `families=${valResult.families} maxFamilyShare=${(valResult.maxFamilyShare * 100).toFixed(2)}% `
        + `capped=${valResult.cappedVariant === null ? 'n/a' : `${valResult.cappedVariant.rows} rows @ ${(valResult.cappedVariant.maxFamilyShare * 100).toFixed(2)}%`} `
        + `legacyOverlap=${valResult.legacyOverlapDropped} crossSplitOverlap=${valResult.crossSplitDropped}`);
}

/* ---------------- 报告 ---------------- */
const report = {
    schema: 'v17_new_collection_report_1',
    task: 'T17-01',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    identityId: V17_INPUT_IDENTITY_ID,
    encoderSchemaId: ENCODER_SCHEMA_ID_V15,
    encoderSchemaIdDeclared: V17_ENCODER_SCHEMA_ID,
    actionSemanticDim: V17_ACTION_SEMANTIC_DIM,
    globalFeatureDim: GLOBAL_FEATURE_DIM_V2,
    candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
    filterId: V16_ACTION_FILTER_ID,
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    rngContractId: V16_RNG_CONTRACT_ID,
    labelSeedBase: LABEL_SEED_BASE,
    maxFamilyShareTarget: MAX_FAMILY_SHARE,
    seedFormula: V17_SEED_FORMULA,
    seedNamespaces: { train: V17_TRAIN_ROOT_BASE_SEED, val: V17_VAL_ROOT_BASE_SEED },
    familyDefinition:
        'trueFamilyId = rootFamilyId = mapName#initializationPolicyId#rootSeed（不含 split/source/seat）',
    legacyTrainInputs: { indexKeys: legacyIndex.size, dedupKeys: legacyDedup.size, unionKeys: legacyUsed.size },
    newTrainKeyCount: trainKeySet.size,
    splits: Object.fromEntries(results.map((r) => [r.split, {
        ...r,
        familyCountList: r.familyTicketCounts.map(([f, c]) => `${f}=${c}`),
        familyTicketCounts: undefined,
    }])),
    notes: [
        'rawRows 来自 v17_rollout_row_1（未去重，含完整 stateJson）；uniqueInputs 是按 v17-netinput-v1 编码后去重的行数。',
        '唯一输入数、family 数、分布均由**最终落盘数据集**重扫统计，不从 raw 行数复制。',
        '跨区交集：new_val 与 new_train 相同实际输入的行被拒绝并单独存放（cross_split_overlap.jsonl），不静默保留。',
        'new_val 与 V16 legacy train 输入的相同项同样被拒绝（legacy_train_overlap.jsonl）。',
        '同输入不同 L1/不同 valueTarget 的观测保存在 conflicts.jsonl，不挑更容易训练的标签。',
        '旧公式值只在 v16SavedPolicyInputKey；policyInputKey === actualInputKey === v17-netinput-v1。',
        'family 占比：主数据集**不做** family 截断（保留全部唯一输入），maxFamilyShare / p50 / p90 / topFamilies 照实报告；'
            + '当严格 ≤目标 可行时另存 `*.family_capped.jsonl` 平衡变体（不覆盖主数据集）。',
        '数学事实：F 个 family 下 `max_f kept_f <= s * Σ kept_f` 强制 kept_f 全相等，'
            + '可行总量上界 = F × min_f c_f；若最小 family 很小，硬套会把数据集砍掉一个数量级，因此不作为主数据集。',
    ],
};
const reportPath = path.join(DATA_DIR, 'new_collection_report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[T17-01] 报告 → ${reportPath}`);
for (const r of results) {
    console.log(`[T17-01] ${r.split}: raw=${r.rawRows} rows=${r.rows} unique=${r.uniqueInputs} `
        + `families=${r.families} maxFamilyShare=${(r.maxFamilyShare * 100).toFixed(2)}% `
        + `dup=${r.duplicateRows} conflictL1=${r.conflictL1Keys} conflictVal=${r.conflictValueKeys} `
        + `crossDrop=${r.crossSplitDropped} legacyDrop=${r.legacyOverlapDropped} rejected=${r.rejectedRows}`);
}
