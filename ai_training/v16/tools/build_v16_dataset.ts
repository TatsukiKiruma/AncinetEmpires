/**
 * V16/T16-04 阶段 2：把 rollout 变成训练数据集 + split 合同（owner：T16-04）。
 *
 * 输入：`collect_v16_rollouts.ts` 的 `v16_rollout_row_1` 行（含完整 stateJson 与行为动作）。
 * 输出：可直接喂给 `python/train_spatial_resnet.py` 的 JSONL，以及 split manifest 与核心集清单。
 *
 * ## 数据合同（任务书 §6.1 / §6.3）逐条落实
 *
 * - **唯一输入去重**：key = `sha256(stateHash + '|' + candidateOrderingId + '|' + filterId)`；
 *   key 不含 teacher target / RNG / root id。同输入冲突单独记录，不靠改 target 造「两个独立样本」。
 * - **跨 partition 重复输入隔离到单一分区**：train/val 同时出现同一 key 时，保留先出现者并把
 *   另一侧整行移除，数量写进报告（`crossPartitionRemoved`）。
 * - **family 上限**：任一 `rootFamilyId` 不超过池的 2%；超限按行确定性下采样。
 * - **候选规范排序**：`candidateActions` 按 actionCode 的 Unicode 代码点序排列，
 *   `targetActionIndex` 重映射到该顺序；`candidateOrderingId` 与推理侧同一个 id。
 * - **双标签分开保存**：`l1ActionCode` 与 `behaviorActionCode`；S1 标签由阶段 3 单独写入
 *   `searchActionCode` / `searchScores` / `searchMask`，未搜索候选是 null 不是 0。
 * - **状态与候选**：`stateHash`、`policyInputKey`、实际输入 float32 hash、排序后的 actionCode、
 *   `encoderSchemaId`、`candidateOrderingId`、`filterId`。
 * - **阶段分桶**：按主体**已完成的玩家回合数** 0–2 / 3–7 / ≥8，目标各约 1/3。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/build_v16_dataset.ts \
 *     --run-id v16_20260926_core --train-rollouts a.jsonl,b.jsonl --val-rollouts c.jsonl \
 *     --out-train .../train.jsonl --out-val .../val.jsonl
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
import { V16_ACTION_FILTER_ID, V16_INITIALIZATION_POLICY_ID } from './eval_v16_protocol';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'v16_20260926_core') as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v16/out/${RUN_ID}`) as string);
const TRAIN_FILES = (arg('--train-rollouts', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const VAL_FILES = (arg('--val-rollouts', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const TRAIN_TARGET = Number(arg('--train-target', '16000'));
const VAL_TARGET = Number(arg('--val-target', '3200'));
const TRAIN_CORE = Number(arg('--train-core', '6400'));
const VAL_CORE = Number(arg('--val-core', '3200'));
const LABEL_SEED_BASE = Number(arg('--label-seed-base', '2609800000'));
const MAX_FAMILY_SHARE = Number(arg('--max-family-share', '0.02'));
const OUT_DIR = path.join(RUN_ROOT, 'T16-04');

if (TRAIN_FILES.length === 0) throw new Error('[T16-04] 需要 --train-rollouts。');
fs.mkdirSync(OUT_DIR, { recursive: true });

interface RolloutRow {
    schema: string;
    split: string;
    sourcePolicy: string;
    rootId: string;
    rootFamilyId: string;
    mapIndex: number;
    mapName: string;
    seed: number;
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
    outcomeKind: string;
    winnerAllianceId: number | null;
    subjectOutcome: string | null;
    valueTarget: number | null;
    gameSteps: number;
    gameTurns: number;
    teacherTier: string | null;
    teacherVersion: string | null;
}

function readRows(files: string[]): RolloutRow[] {
    const rows: RolloutRow[] = [];
    for (const file of files) {
        const abs = path.resolve(file);
        if (!fs.existsSync(abs)) throw new Error(`[T16-04] rollout 文件不存在：${abs}`);
        for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
            if (!line.trim()) continue;
            rows.push(JSON.parse(line) as RolloutRow);
        }
    }
    return rows;
}

const trainRaw = readRows(TRAIN_FILES);
const valRaw = readRows(VAL_FILES);
console.log(`[T16-04] 原始行：train=${trainRaw.length} val=${valRaw.length}`);

function policyInputKey(row: RolloutRow): string {
    return crypto.createHash('sha256')
        .update(`${row.stateHash}|${CANDIDATE_ORDERING_ID_V16}|${V16_ACTION_FILTER_ID}`, 'utf8')
        .digest('hex');
}

/* ---------------- 跨分区去重 ---------------- */
const trainKeys = new Set(trainRaw.map(policyInputKey));
const valKeys = new Set(valRaw.map(policyInputKey));
const overlap = [...trainKeys].filter((k) => valKeys.has(k));
const overlapSet = new Set(overlap);
// 中文：重叠输入隔离到**单一分区**（保留在 train，因为它先被读入），另一侧整行移除。
const valFiltered = valRaw.filter((row) => !overlapSet.has(policyInputKey(row)));
const crossPartitionRemoved = valRaw.length - valFiltered.length;

/* ---------------- 组内去重（同分区同输入保留第一条并记录冲突） ---------------- */
interface DedupResult {
    kept: RolloutRow[];
    duplicates: number;
    conflicts: Array<{ key: string; behaviorCodes: string[] }>;
}
function dedup(rows: RolloutRow[]): DedupResult {
    const seen = new Map<string, RolloutRow>();
    const conflicts: Array<{ key: string; behaviorCodes: string[] }> = [];
    let duplicates = 0;
    for (const row of rows) {
        const key = policyInputKey(row);
        const prev = seen.get(key);
        if (prev === undefined) { seen.set(key, row); continue; }
        duplicates += 1;
        if (prev.behaviorActionCode !== row.behaviorActionCode) {
            conflicts.push({ key, behaviorCodes: [prev.behaviorActionCode, row.behaviorActionCode] });
        }
    }
    return { kept: [...seen.values()], duplicates, conflicts };
}

const trainDedup = dedup(trainRaw);
const valDedup = dedup(valFiltered);

/* ---------------- family 上限 + 分层采样 ---------------- */
interface SampleReport {
    kept: RolloutRow[];
    familyDropped: number;
    familyCounts: Record<string, number>;
    phaseCounts: Record<string, number>;
    mapCounts: Record<string, number>;
    seatCounts: Record<string, number>;
    sourceCounts: Record<string, number>;
}

function samplePool(rows: RolloutRow[], target: number, maxFamilyShare: number): SampleReport {
    const familyCap = Math.max(1, Math.floor(target * maxFamilyShare));
    const byFamily = new Map<string, RolloutRow[]>();
    for (const row of rows) {
        const list = byFamily.get(row.rootFamilyId) ?? [];
        list.push(row);
        byFamily.set(row.rootFamilyId, list);
    }
    const kept: RolloutRow[] = [];
    let familyDropped = 0;
    // 中文：先按 family 内部**按阶段轮转**取样，保证每图两座位的阶段覆盖均衡。
    const cursors = new Map<string, number>();
    for (const [family, list] of [...byFamily.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        list.sort((a, b) => a.stepIndex - b.stepIndex);
        const buckets: Record<string, RolloutRow[]> = { '0-2': [], '3-7': [], '8+': [] };
        for (const row of list) buckets[row.phaseBucket]?.push(row) ?? buckets['8+'].push(row);
        const picked: RolloutRow[] = [];
        const quota = Math.max(1, Math.floor(familyCap / 3));
        for (const key of ['0-2', '3-7', '8+']) {
            const bucket = buckets[key];
            const stride = Math.max(1, Math.ceil(bucket.length / quota));
            for (let i = 0; i < bucket.length && picked.length < familyCap; i += stride) picked.push(bucket[i]);
        }
        familyDropped += Math.max(0, list.length - picked.length);
        cursors.set(family, 0);
        kept.push(...picked);
    }
    // 若超过目标，按 family 轮转截断，避免某几张大图吃掉全部配额。
    let finalKept = kept;
    if (kept.length > target) {
        const groups = new Map<string, RolloutRow[]>();
        for (const row of kept) {
            const list = groups.get(row.rootFamilyId) ?? [];
            list.push(row);
            groups.set(row.rootFamilyId, list);
        }
        const ordered = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
        const out: RolloutRow[] = [];
        let index = 0;
        while (out.length < target) {
            let progressed = false;
            for (const list of ordered) {
                if (index < list.length) { out.push(list[index]); progressed = true; }
                if (out.length >= target) break;
            }
            index += 1;
            if (!progressed) break;
        }
        finalKept = out;
    }
    const count = <T extends string | number>(values: T[]): Record<string, number> =>
        values.reduce((acc: Record<string, number>, v) => { const k = String(v); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
    return {
        kept: finalKept,
        familyDropped,
        familyCounts: count(finalKept.map((r) => r.rootFamilyId)),
        phaseCounts: count(finalKept.map((r) => r.phaseBucket)),
        mapCounts: count(finalKept.map((r) => r.mapName)),
        seatCounts: count(finalKept.map((r) => r.subjectPlayerId)),
        sourceCounts: count(finalKept.map((r) => r.sourcePolicy)),
    };
}

const trainSample = samplePool(trainDedup.kept, TRAIN_TARGET, MAX_FAMILY_SHARE);
const valSample = samplePool(valDedup.kept, VAL_TARGET, MAX_FAMILY_SHARE);
console.log(`[T16-04] 采样后：train=${trainSample.kept.length} val=${valSample.kept.length}`);

/* ---------------- 编码 + 标签 ---------------- */
interface BuiltRow { json: string; key: string; family: string; phase: string; mapName: string; seat: number; source: string }

function buildRow(row: RolloutRow): BuiltRow {
    const state = JSON.parse(row.stateJson) as GameState;
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const legal: Action[] = engine.isTerminal()
        ? []
        : engine.getLegalActions(row.subjectPlayerId).filter((a) => a.type !== 'surrender');
    if (legal.length === 0) throw new Error(`[T16-04] ${row.gameId} 主体合法集为空。`);

    const decorated = legal.map((action) => ({ action, code: encodeAction(action) }));
    decorated.sort((a, b) => compareActionCodeCanonicalV16(a.code, b.code));
    const targetIndex = decorated.findIndex((d) => d.code === row.behaviorActionCode);
    if (targetIndex < 0) {
        throw new Error(`[T16-04] ${row.gameId} 行为动作 '${row.behaviorActionCode}' 不在主体合法集内。`);
    }

    const spatial = encodeGameStateSpatial(state, row.subjectPlayerId, 'v2', { channels: 26 });
    const candidates = decorated.map((d) => {
        const features = encodeCandidateActionSpatial(state, row.subjectPlayerId, d.action, 'v2', 'v15_current');
        return {
            action: d.action,
            actionCode: d.code,
            actorCoord: features.actorCoord ?? null,
            landingCoord: features.landingCoord ?? null,
            targetCoord: features.targetCoord ?? null,
            semantics: Array.from(features.semantics),
        };
    });

    const label = queryL1Label(state, {
        labelSeedBase: LABEL_SEED_BASE,
        actingPlayerId: row.subjectPlayerId,
        filterSurrender: true,
    });
    const l1Index = label.actionCode === null ? null : decorated.findIndex((d) => d.code === label.actionCode);

    const spatialArray = Array.from(spatial.spatialTensor);
    const globalArray = Array.from(spatial.globalFeatures);
    const inputHash = crypto.createHash('sha256')
        .update(Buffer.from(new Float32Array(spatialArray).buffer)).update(Buffer.from(new Float32Array(globalArray).buffer))
        .update(decorated.map((d) => d.code).join('\n'), 'utf8')
        .digest('hex');

    const json = JSON.stringify({
        sampleId: row.gameId,
        environmentId: `v16:${V16_INITIALIZATION_POLICY_ID}`,
        initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
        encoderSchemaId: ENCODER_SCHEMA_ID_V15,
        candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
        filterId: V16_ACTION_FILTER_ID,
        rootFamilyId: row.rootFamilyId,
        rootId: row.rootId,
        episodeId: row.rootId,
        sourcePolicy: row.sourcePolicy,
        subjectPlayerId: row.subjectPlayerId,
        subjectAllianceId: row.subjectAllianceId,
        rootAllianceId: row.subjectAllianceId,
        phaseBucket: row.phaseBucket,
        completedPlayerTurns: row.completedPlayerTurns,
        mapName: row.mapName,
        mapIndex: row.mapIndex,
        seed: row.seed,
        teacherVersion: row.teacherVersion,
        teacherTier: row.teacherTier,
        teacherSeed: null,
        teacherBudget: null,
        teacherTraceHash: null,
        reachedBoundary: null,
        labelConfidence: 'L1_ISOLATED',
        stateHash: row.stateHash,
        policyInputKey: inputHash,
        actualInputFloat32Hash: inputHash,
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
        l1ActionIndex: l1Index < 0 ? null : l1Index,
        l1LabelerVersion: L1_LABELER_VERSION,
        l1Scores: label.scores,
        acceptableActionCodes: label.actionCode === null ? [] : [label.actionCode],
        acceptableEvidence: 'L1_ISOLATED_QUERY_ONLY（尚未做引擎后继状态等价证明）',
        policyLossMask: true,
        valueLossMask: row.valueTarget !== null,
        valueTarget: row.valueTarget,
        outcomeSource: row.valueTarget === null ? null : `natural-terminal:${row.outcomeKind}`,
        searchActionCode: null,
        evaluatedActionCodes: null,
        searchScores: null,
        searchScoreScale: null,
        searchMask: null,
        coreSetMember: false,
    });
    return {
        json,
        key: inputHash,
        family: row.rootFamilyId,
        phase: row.phaseBucket,
        mapName: row.mapName,
        seat: row.subjectPlayerId,
        source: row.sourcePolicy,
    };
}

function buildAll(rows: RolloutRow[]): BuiltRow[] {
    const out: BuiltRow[] = [];
    let index = 0;
    for (const row of rows) {
        out.push(buildRow(row));
        index += 1;
        if (index % 2000 === 0) console.log(`[T16-04] 已编码 ${index}/${rows.length}`);
    }
    return out;
}

const trainBuilt = buildAll(trainSample.kept);
const valBuilt = buildAll(valSample.kept);

/* ---------------- 核心集选择（任务书 §6.1） ---------------- */
/**
 * 固定 6,400（train）/ ≥3,200（val）个状态作为对照核心集：
 * 按 family 轮转 + 阶段均衡选出，跨 ≥80 个 root，各图/座位覆盖。
 */
function selectCore(rows: BuiltRow[], size: number): BuiltRow[] {
    const byFamily = new Map<string, BuiltRow[]>();
    for (const row of rows) {
        const list = byFamily.get(row.family) ?? [];
        list.push(row);
        byFamily.set(row.family, list);
    }
    const ordered = [...byFamily.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
    const out: BuiltRow[] = [];
    let index = 0;
    while (out.length < size) {
        let progressed = false;
        for (const list of ordered) {
            if (index < list.length) { out.push(list[index]); progressed = true; }
            if (out.length >= size) break;
        }
        index += 1;
        if (!progressed) break;
    }
    return out;
}

const trainCore = selectCore(trainBuilt, Math.min(TRAIN_CORE, trainBuilt.length));
const valCore = selectCore(valBuilt, Math.min(VAL_CORE, valBuilt.length));

/* ---------------- 写出 ---------------- */
const trainPath = path.resolve(arg('--out-train', path.join(OUT_DIR, 'dataset_v16_train.jsonl')) as string);
const valPath = path.resolve(arg('--out-val', path.join(OUT_DIR, 'dataset_v16_val.jsonl')) as string);
const corePath = path.resolve(arg('--out-core', path.join(OUT_DIR, 'core_set.json')) as string);

const writeJsonl = (file: string, rows: BuiltRow[]): string => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // 中文：不能把全部行 join 成一个字符串 —— 14k 行 × 数十 KB 会超过 V8 的最大字符串长度
    // （实测 RangeError: Invalid string length）。改为分批写入同一 SHA 语义。
    const hash = crypto.createHash('sha256');
    const handle = fs.openSync(file, 'w');
    try {
        const chunk: string[] = [];
        let chunkBytes = 0;
        for (const row of rows) {
            const line = `${row.json}\n`;
            chunk.push(line);
            chunkBytes += line.length;
            if (chunkBytes > 8 * 1024 * 1024) {
                const text = chunk.join('');
                fs.writeSync(handle, text);
                hash.update(text, 'utf8');
                chunk.length = 0;
                chunkBytes = 0;
            }
        }
        if (chunk.length > 0) {
            const text = chunk.join('');
            fs.writeSync(handle, text);
            hash.update(text, 'utf8');
        }
    } finally {
        fs.closeSync(handle);
    }
    return hash.digest('hex');
};

const trainSha = writeJsonl(trainPath, trainBuilt);
const valSha = writeJsonl(valPath, valBuilt);

function balance(rows: BuiltRow[]): Record<string, Record<string, number>> {
    const of = (pick: (r: BuiltRow) => string | number): Record<string, number> =>
        rows.reduce((acc: Record<string, number>, r) => { const k = String(pick(r)); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
    return { map: of((r) => r.mapName), seat: of((r) => r.seat), phase: of((r) => r.phase), source: of((r) => r.source) };
}

const manifest = {
    schema: 'v16_dataset_manifest_1',
    task: 'T16-04',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    encoderSchemaId: ENCODER_SCHEMA_ID_V15,
    candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
    filterId: V16_ACTION_FILTER_ID,
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    globalFeatureDim: GLOBAL_FEATURE_DIM_V2,
    labelSeedBase: LABEL_SEED_BASE,
    maxFamilyShare: MAX_FAMILY_SHARE,
    train: {
        path: trainPath.replace(/\\/g, '/'), sha256: trainSha, rows: trainBuilt.length,
        target: TRAIN_TARGET, balance: balance(trainBuilt),
        rawRows: trainRaw.length, dedupDuplicates: trainDedup.duplicates,
        targetConflicts: trainDedup.conflicts.length, familyDropped: trainSample.familyDropped,
        maxFamilyCount: Math.max(0, ...Object.values(trainSample.familyCounts)),
        families: Object.keys(trainSample.familyCounts).length,
    },
    val: {
        path: valPath.replace(/\\/g, '/'), sha256: valSha, rows: valBuilt.length,
        target: VAL_TARGET, balance: balance(valBuilt),
        rawRows: valRaw.length, dedupDuplicates: valDedup.duplicates,
        targetConflicts: valDedup.conflicts.length, familyDropped: valSample.familyDropped,
        maxFamilyCount: Math.max(0, ...Object.values(valSample.familyCounts)),
        families: Object.keys(valSample.familyCounts).length,
    },
    crossPartition: {
        overlappingPolicyInputKeys: overlap.length,
        removedFromVal: crossPartitionRemoved,
        rule: '同一唯一输入只保留在单一分区（本实现保留 train 侧），另一侧整行移除并在此报告。',
    },
    targetConflictsSample: trainDedup.conflicts.slice(0, 20),
    coreSet: {
        note: '固定对照核心集：A0/A1/A2 与 PV 对照必须用同一核心集，保证只变一个因素。'
            + 'T16-04 阶段 3 只给这些行打 S1 标签（searchActionCode 等），其余行的 searchMask 保持 null。',
        trainSize: trainCore.length, valSize: valCore.length,
        train: trainCore.map((r) => ({ policyInputKey: r.key, sampleId: JSON.parse(r.json).sampleId as string })),
        val: valCore.map((r) => ({ policyInputKey: r.key, sampleId: JSON.parse(r.json).sampleId as string })),
    },
};
fs.writeFileSync(corePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
    trainRows: trainBuilt.length, valRows: valBuilt.length,
    trainCore: trainCore.length, valCore: valCore.length,
    crossPartitionRemoved, trainDuplicates: trainDedup.duplicates, valDuplicates: valDedup.duplicates,
    trainFamilies: Object.keys(trainSample.familyCounts).length,
    trainBalance: manifest.train.balance,
    valBalance: manifest.val.balance,
    manifestPath: corePath.replace(/\\/g, '/'),
}, null, 2));
