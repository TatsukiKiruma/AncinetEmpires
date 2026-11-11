/**
 * V17/T17-01 阶段 1：**新物理对局** rollout 采集（owner：T17-01）。
 *
 * 本文件是 `v16/tools/collect_v16_rollouts.ts` 的 V17 副本，只改 T17-01 规格要求的部分：
 *
 * 1. **seed**：train 命名空间 `2610010000`、val 命名空间 `2610020000`，
 *    公式 `base + 1000*mapIndex + 10*rootIndex`（rootIndex 0..99）。
 *    **删除了 V16 的 `+ (SOURCE==='h0' ? 0 : 1)` 源相关偏移** —— 物理 root seed 不得依赖
 *    行为源，否则同一 family 会被劈成两个 seed。
 * 2. **真实 family**：`rootFamilyId = trueFamilyId = ${mapName}#${initializationPolicyId}#${rootSeed}`。
 *    不含 split / source / seat。同一物理 root 的 H0 与学生对局共享 family；
 *    同一局的两个座位视角共享 family。
 * 3. **H0-vs-H0 只跑一局**：单局同时抽出两个座位视角（不再按座位各跑一局镜像）。
 * 4. 学生（行为源）走 `playOne` 的 candidateSeat 通路，`sourcePolicy='P1:s2026'` 只标行为源，
 *    不影响 seed / family。
 *
 * 输出（每行一个主体决策，**未去重**，含完整 stateJson，供阶段 2 重新编码）：
 *   `v17/out/<runId>/data/<split>/rollouts/<split>_<source>[.shardIofN].jsonl`
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/collect_v17_rollouts.ts --run-id v17_20260926_r2 --split val --source h0 --root-start 0 --root-count 4
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/collect_v17_rollouts.ts --run-id v17_20260926_r2 --split train --source student --candidate v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json --shard 0/8
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { playOne, type GameRecord } from '../../v14/tools/eval_v14_match';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import {
    V16_DEFAULT_CAPS,
    V16_MAPS,
    V16_INITIALIZATION_POLICY_ID,
    V16_ACTION_FILTER_ID,
    V16_RNG_CONTRACT_ID,
    V16_UNPACK_DIR,
    V16_SD_PLAN_FILE,
    scenarioIdOfMapV16,
} from '../../v16/tools/eval_v16_protocol';
import {
    V17_TRAIN_ROOT_BASE_SEED,
    V17_VAL_ROOT_BASE_SEED,
    V17_SEED_FORMULA,
    V17_STUDENT_SOURCE_POLICY,
    V17_H0_SOURCE_POLICY,
    trueFamilyIdV17,
} from './v17_data_protocol';
import type { GameState } from '../../src/game/types';

export {
    V17_TRAIN_ROOT_BASE_SEED,
    V17_VAL_ROOT_BASE_SEED,
    V17_SEED_FORMULA,
    V17_STUDENT_SOURCE_POLICY,
    V17_H0_SOURCE_POLICY,
    trueFamilyIdV17,
};

const NATURAL_KINDS = new Set(['NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW']);

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'v17_20260926_r2') as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v17/out/${RUN_ID}`) as string);
const SPLIT = arg('--split', 'train') as 'train' | 'val';
const SOURCE = arg('--source', 'h0') as 'h0' | 'student';
const ROOT_START = Number(arg('--root-start', '0'));
const ROOT_COUNT = Number(arg('--root-count', SPLIT === 'train' ? '10' : '4'));
const MAP_FILTER = arg('--map-index', null);
const SHARD = arg('--shard', null);
const MAX_ROWS_PER_ROOT = Number(arg('--max-rows-per-root', '200'));
const CANDIDATE = arg('--candidate', null);
const EXPECT_SCHEMA = arg('--expect-schema', 'spatial26_global20_actionSemantics53_v15') as string;
const OUT_DIR = path.resolve(arg(
    '--out-dir',
    path.join(RUN_ROOT, 'data', SPLIT === 'train' ? 'new_train' : 'new_val', 'rollouts'),
) as string);

if (SOURCE === 'student' && CANDIDATE === null) {
    throw new Error('[T17-01] --source student 必须提供 --candidate。');
}
for (let r = ROOT_START; r < ROOT_START + ROOT_COUNT; r += 1) {
    if (r < 0 || r > 99) throw new Error(`[T17-01] rootIndex 必须落在 0..99（否则撞 namespace），实际 ${r}。`);
}

const BASE_SEED = SPLIT === 'train' ? V17_TRAIN_ROOT_BASE_SEED : V17_VAL_ROOT_BASE_SEED;

/** 真实 family 见 `v17_data_protocol.ts#trueFamilyIdV17`（map + 初始化版本 + 基础 root seed）。 */

interface RootJob {
    rootId: string;
    split: string;
    sourcePolicy: string;
    mapIndex: number;
    mapName: string;
    scenarioId: string;
    rootIndex: number;
    seed: number;
    subjectSeat: number | null;
    rootFamilyId: string;
}

const jobs: RootJob[] = [];
for (let m = 0; m < V16_MAPS.length; m += 1) {
    if (MAP_FILTER !== null && Number(MAP_FILTER) !== m) continue;
    const mapName = V16_MAPS[m];
    const scenarioId = scenarioIdOfMapV16(mapName);
    for (let r = ROOT_START; r < ROOT_START + ROOT_COUNT; r += 1) {
        const seed = BASE_SEED + 1000 * m + 10 * r;
        const rootFamilyId = trueFamilyIdV17(mapName, seed);
        if (SOURCE === 'h0') {
            jobs.push({
                rootId: `${SPLIT}:h0:m${m}:r${r}`, split: SPLIT, sourcePolicy: V17_H0_SOURCE_POLICY,
                mapIndex: m, mapName, scenarioId, rootIndex: r, seed, subjectSeat: null, rootFamilyId,
            });
        } else {
            for (const seat of [0, 1]) {
                jobs.push({
                    rootId: `${SPLIT}:${V17_STUDENT_SOURCE_POLICY}:m${m}:r${r}:seat${seat}`,
                    split: SPLIT, sourcePolicy: V17_STUDENT_SOURCE_POLICY,
                    mapIndex: m, mapName, scenarioId, rootIndex: r, seed, subjectSeat: seat, rootFamilyId,
                });
            }
        }
    }
}

let selected = jobs;
if (SHARD !== null) {
    const [iRaw, nRaw] = SHARD.split('/');
    const i = Number(iRaw);
    const n = Number(nRaw);
    if (!Number.isInteger(i) || !Number.isInteger(n) || i < 0 || i >= n) {
        throw new Error(`[T17-01] --shard 需要 i/n 且 0<=i<n，实际 '${SHARD}'。`);
    }
    selected = jobs.filter((_, index) => index % n === i);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const sourceTag = SOURCE === 'h0' ? 'h0' : 'student_P1s2026';
const TAG = arg('--tag', '') as string;
const outPath = path.join(OUT_DIR, `${SPLIT}_${sourceTag}${TAG ? `.${TAG}` : ''}${SHARD ? `.shard${SHARD.replace('/', 'of')}` : ''}.jsonl`);
const out = fs.createWriteStream(outPath, { flags: 'w' });

const envFactory = await createDefaultEnvFactory(V16_UNPACK_DIR, V16_SD_PLAN_FILE);

let predictor: SpatialResNetPredictor | null = null;
let checkpointSha256: string | null = null;
let behaviorPolicyId: string | null = null;
if (SOURCE === 'student') {
    const abs = path.resolve(CANDIDATE as string);
    const json = fs.readFileSync(abs, 'utf8');
    const weights = loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: EXPECT_SCHEMA });
    predictor = new SpatialResNetPredictor(weights);
    checkpointSha256 = crypto.createHash('sha256').update(json, 'utf8').digest('hex');
    behaviorPolicyId = `spatial_candidate:${path.basename(abs)}`;
    console.log(`[T17-01] student=${behaviorPolicyId} schema=${predictor.encoderSchemaId} sha256=${checkpointSha256}`);
}

interface Captured {
    stepIndex: number;
    playerId: number;
    allianceId: number;
    stateJson: string;
    behaviorActionCode: string;
    turn: number;
    completedPlayerTurns: number;
    phaseBucket: string;
}

function phaseBucketOf(completedTurns: number): string {
    return completedTurns <= 2 ? '0-2' : completedTurns <= 7 ? '3-7' : '8+';
}

/**
 * 有界内存的阶段分桶：超过 2×quota 就“隔一个丢一个”。
 *
 * 中文：V16 先把整局所有 stateJson 存进数组再抽样，单局可达数百 MB（12,000 步 × 30 KB）。
 * 这里改成流式抽样，得到的仍是确定性 stride 子集，内存上限 2×quota/桶。
 */
function pushBucket(bucket: Captured[], item: Captured, quota: number): void {
    bucket.push(item);
    if (bucket.length > quota * 2) {
        let write = 0;
        for (let read = 0; read < bucket.length; read += 2) bucket[write++] = bucket[read];
        bucket.length = write;
    }
}
function trimBucket(bucket: Captured[], quota: number): Captured[] {
    if (bucket.length <= quota) return bucket;
    const stride = Math.ceil(bucket.length / quota);
    return bucket.filter((_, i) => i % stride === 0);
}

let rowsWritten = 0;
const rootSummaries: Array<Record<string, unknown>> = [];
const startedAt = Date.now();

for (const job of selected) {
    const perSeat = new Map<number, Record<string, Captured[]>>();
    const completedTurns = new Map<number, number>();
    const lastPlayer = new Map<number, number | null>();
    const subjectSeats = job.subjectSeat === null ? [0, 1] : [job.subjectSeat];
    for (const seat of subjectSeats) {
        perSeat.set(seat, { '0-2': [], '3-7': [], '8+': [] });
        completedTurns.set(seat, 0);
        lastPlayer.set(seat, null);
    }
    const quota = Math.max(1, Math.floor(MAX_ROWS_PER_ROOT / 3));

    const record: GameRecord = await playOne({
        runId: `${RUN_ID}_collect`,
        scenarioId: job.scenarioId,
        seed: job.seed,
        candidateSeat: job.subjectSeat,
        viewedSeatHint: job.subjectSeat ?? 0,
        maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        maxPlies: V16_DEFAULT_CAPS.maxPlies,
        wallTimeoutMs: V16_DEFAULT_CAPS.wallTimeoutMs,
        predictor,
        checkpointSha256,
        requestedPolicyId: SOURCE === 'student' ? V17_STUDENT_SOURCE_POLICY : 'heuristic',
        envFactory,
        emitIdentity: false,
        captureStateOnStep: true,
        onStep: (trace) => {
            if (trace.stateBeforeJson === null) return;
            for (const seat of subjectSeats) {
                if (trace.playerId === seat) {
                    lastPlayer.set(seat, seat);
                    const done = completedTurns.get(seat) ?? 0;
                    pushBucket(perSeat.get(seat)![phaseBucketOf(done)], {
                        stepIndex: trace.stepIndex,
                        playerId: trace.playerId,
                        allianceId: trace.allianceId,
                        stateJson: trace.stateBeforeJson as string,
                        behaviorActionCode: trace.actionCode,
                        turn: trace.turnAfter,
                        completedPlayerTurns: done,
                        phaseBucket: phaseBucketOf(done),
                    }, quota);
                } else if (lastPlayer.get(seat) === seat) {
                    completedTurns.set(seat, (completedTurns.get(seat) ?? 0) + 1);
                    lastPlayer.set(seat, trace.playerId);
                } else {
                    lastPlayer.set(seat, trace.playerId);
                }
            }
        },
    });

    const natural = NATURAL_KINDS.has(record.outcomeKind) && record.error === null;
    const winnerAllianceId = record.winnerAllianceId;
    const draw = winnerAllianceId === null || winnerAllianceId === -1 || record.outcomeKind === 'NATURAL_DRAW';

    const seatReport: Array<Record<string, unknown>> = [];
    for (const seat of subjectSeats) {
        const buckets = perSeat.get(seat)!;
        const picked: Captured[] = [];
        for (const key of ['0-2', '3-7', '8+']) picked.push(...trimBucket(buckets[key], quota));
        picked.sort((a, b) => a.stepIndex - b.stepIndex);
        const subjectAllianceId = picked.length > 0 ? picked[picked.length - 1].allianceId : null;
        const subjectOutcome = !natural ? null : (draw ? 'draw' : (winnerAllianceId === subjectAllianceId ? 'win' : 'loss'));
        const valueTarget = !natural ? null : (draw ? 0.0 : (subjectOutcome === 'win' ? 1.0 : -1.0));

        for (const item of picked) {
            const state = JSON.parse(item.stateJson) as GameState;
            const stateHash = crypto.createHash('sha256')
                .update(Buffer.from(canonicalStateJson(state), 'utf8')).digest('hex');
            out.write(`${JSON.stringify({
                schema: 'v17_rollout_row_1',
                runId: RUN_ID,
                split: SPLIT,
                sourcePolicy: job.sourcePolicy,
                behaviorPolicyId: SOURCE === 'student' ? behaviorPolicyId : 'h0-heuristic',
                behaviorCheckpointSha256: SOURCE === 'student' ? checkpointSha256 : null,
                rootId: job.rootId,
                rootFamilyId: job.rootFamilyId,
                trueFamilyId: job.rootFamilyId,
                familyDefinition: 'mapName#initializationPolicyId#rootSeed（不含 split/source/seat）',
                mapIndex: job.mapIndex,
                mapName: job.mapName,
                scenarioId: job.scenarioId,
                rootIndex: job.rootIndex,
                seed: job.seed,
                seedFormula: V17_SEED_FORMULA,
                initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
                rngContractId: V16_RNG_CONTRACT_ID,
                actionFilterId: V16_ACTION_FILTER_ID,
                subjectSeat: seat,
                subjectPlayerId: seat,
                subjectAllianceId: item.allianceId,
                stepIndex: item.stepIndex,
                turn: item.turn,
                completedPlayerTurns: item.completedPlayerTurns,
                phaseBucket: item.phaseBucket,
                behaviorActionCode: item.behaviorActionCode,
                stateJson: item.stateJson,
                stateHash,
                gameId: `${job.rootId}|step${item.stepIndex}`,
                gameOutcomeKind: record.outcomeKind,
                naturalTerminal: natural,
                winnerAllianceId,
                subjectOutcome,
                valueTarget,
                gameSteps: record.steps,
                gameTurns: record.turns,
                gameWallMs: record.wallMs,
                engineError: record.error,
                fallbackUsed: record.fallbackUsed,
                collectionCaps: V16_DEFAULT_CAPS,
            })}\n`);
            rowsWritten += 1;
        }

        seatReport.push({
            subjectSeat: seat,
            subjectAllianceId,
            subjectOutcome,
            valueTarget,
            subjectDecisions: buckets['0-2'].length + buckets['3-7'].length + buckets['8+'].length,
            rowsWritten: picked.length,
            bucketCounts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
        });
    }

    rootSummaries.push({
        rootId: job.rootId,
        mapName: job.mapName,
        rootIndex: job.rootIndex,
        seed: job.seed,
        rootFamilyId: job.rootFamilyId,
        sourcePolicy: job.sourcePolicy,
        gameOutcomeKind: record.outcomeKind,
        naturalTerminal: natural,
        winnerAllianceId,
        steps: record.steps,
        turns: record.turns,
        wallMs: record.wallMs,
        seats: seatReport,
    });
    const summaryBits = seatReport.map((s) => `seat${s.subjectSeat}=${s.subjectOutcome ?? 'na'}(${s.rowsWritten})`).join(' ');
    console.log(
        `[T17-01] ${job.rootId} ${record.outcomeKind} ${summaryBits} `
        + `steps=${record.steps} ${(record.wallMs / 1000).toFixed(1)}s`,
    );
}

await new Promise<void>((resolve) => out.end(resolve));
const summary = {
    schema: 'v17_rollout_summary_1',
    task: 'T17-01',
    runId: RUN_ID,
    split: SPLIT,
    baseSeed: BASE_SEED,
    seedFormula: V17_SEED_FORMULA,
    sourcePolicy: SOURCE === 'h0' ? V17_H0_SOURCE_POLICY : V17_STUDENT_SOURCE_POLICY,
    behaviorPolicyId,
    behaviorCheckpointSha256: checkpointSha256,
    shard: SHARD,
    tag: TAG,
    rootStart: ROOT_START,
    rootCount: ROOT_COUNT,
    mapFilter: MAP_FILTER === null ? null : Number(MAP_FILTER),
    outPath: outPath.replace(/\\/g, '/'),
    rootJobs: rootSummaries.length,
    rowsWritten,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    caps: V16_DEFAULT_CAPS,
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    rootSummaries,
};
fs.writeFileSync(outPath.replace(/\.jsonl$/, '.summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`[T17-01] 完成 ${rootSummaries.length} 个 root job，${rowsWritten} 行 → ${outPath}`);
