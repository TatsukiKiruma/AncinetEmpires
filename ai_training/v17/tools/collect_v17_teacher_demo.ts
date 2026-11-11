/**
 * V17/T17-05b：**on-policy 教师示范**采集（B1e 实验的数据来源）。
 *
 * 为什么要新写一个采集器（而不是复用 `collect_v17_rollouts.ts`）：
 * 那个工具的 `--source student` 只接受**网络权重**，而 B100 是搜索教师、没有网络权重。
 * 它按 `playOne` 的 `policyOverride` 钩子接进来（与 `arena_run_v17.ts` 完全同一条路径），
 * 其余（抽样、分桶、value 目标、行 schema）与 `collect_v17_rollouts.ts` **逐字段保持一致**，
 * 这样 `build_v17_dataset.ts --encode-inputs` 可以原样消费。
 *
 * 与 B1 的根本区别（这是本轮最重要的方法论修正）：
 * B1 的做法是"拿学生/H0 访问到的状态去问教师"，教师对这些**它自己永远不会走到的状态**
 * 给出的动作与它真实打法不是一回事（实测标签一致率只有 47.6%，教师在这些状态上 37% 选 wait）。
 * 本工具只采集**教师自己轨迹上的决策状态**，因此标签在构造上就是 on-policy 的。
 *
 * 用法（真实可复制）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/collect_v17_teacher_demo.ts `
 *     --run-id v17_20260926_r2 --split train --variant B100-Q --root-start 10 --root-count 3 `
 *     --map-index 0 --max-rows-per-root 400 --tag demo
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import type { GameState } from '../../src/game/types';
import {
    UNPACK_DIR,
    SD_PLAN_FILE,
    playOne,
    type CandidatePolicyV16,
    type GameRecord,
} from '../../v14/tools/eval_v14_match';
import {
    V16_ACTION_FILTER_ID,
    V16_DEFAULT_CAPS,
    V16_INITIALIZATION_POLICY_ID,
    V16_MAPS,
    V16_RNG_CONTRACT_ID,
    scenarioIdOfMapV16,
} from '../../v16/tools/eval_v16_protocol';
import { trueFamilyIdV17, V17_SEED_FORMULA, V17_TRAIN_ROOT_BASE_SEED, V17_VAL_ROOT_BASE_SEED } from './v17_data_protocol';
import { createB100Policy, B100_TEACHER_VERSION, type B100Variant } from '../teachers/b100_policy';
import { b100InputKeyProvider } from '../teachers/b100_input_key';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_ID = arg('--run-id', 'v17_20260926_r2') as string;
const SPLIT = arg('--split', 'train') as 'train' | 'val';
const VARIANT = arg('--variant', 'B100-Q') as B100Variant;
const ROOT_START = Number(arg('--root-start', '10'));
const ROOT_COUNT = Number(arg('--root-count', '3'));
const MAP_FILTER = arg('--map-index', null);
const SHARD = arg('--shard', null);
const MAX_ROWS_PER_ROOT = Number(arg('--max-rows-per-root', '400'));
const TAG = arg('--tag', 'demo') as string;
const SEATS = (arg('--seats', '0,1') as string).split(',').map((s) => Number(s.trim())).filter((n) => n === 0 || n === 1);

if (VARIANT !== 'B100-Q' && VARIANT !== 'B100-R') throw new Error(`[T17-05b] 未知 --variant '${VARIANT}'。`);
if (ROOT_COUNT < 1) throw new Error('[T17-05b] --root-count 必须 >= 1。');
for (let r = ROOT_START; r < ROOT_START + ROOT_COUNT; r += 1) {
    if (r < 0 || r > 99) throw new Error(`[T17-05b] rootIndex 必须落在 0..99，实际 ${r}。`);
}

// 中文：B1 用的 root 是 0..9；示范采集故意用未使用的 10..，避免与既有 family 撞车。
if (SPLIT === 'train' && ROOT_START < 10) {
    throw new Error('[T17-05b] train 拆分下 --root-start 必须 >= 10（0..9 已被 T17-01 的采集占用）。');
}
// V18/T18-01 修复：V17 这里引用了不存在的常量 `V17_TRAIN_VAL_BASE_SEED`，
// 导致 `--split val` 时 BASE_SEED 为 undefined、seed 变成 NaN、buildMirrorId 直接抛错，
// 即 V17 的教师示范**只能在 train 命名空间采集**。改为协议里真实存在的 val 常量，
// 不改变任何已有数据与 train 路径的语义（train 分支仍用 V17_TRAIN_ROOT_BASE_SEED）。
const BASE_SEED = SPLIT === 'train' ? V17_TRAIN_ROOT_BASE_SEED : V17_VAL_ROOT_BASE_SEED;
const SOURCE_POLICY = VARIANT === 'B100-Q' ? 'B100-Q' : 'B100-R';

interface RootJob {
    rootId: string; split: string; sourcePolicy: string;
    mapIndex: number; mapName: string; scenarioId: string;
    rootIndex: number; seed: number; subjectSeat: number;
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
        for (const seat of SEATS) {
            jobs.push({
                rootId: `${SPLIT}:${SOURCE_POLICY}:m${m}:r${r}:seat${seat}`,
                split: SPLIT, sourcePolicy: SOURCE_POLICY,
                mapIndex: m, mapName, scenarioId, rootIndex: r, seed,
                subjectSeat: seat, rootFamilyId,
            });
        }
    }
}
let selected = jobs;
if (SHARD !== null) {
    const [iRaw, nRaw] = SHARD.split('/');
    const i = Number(iRaw);
    const n = Number(nRaw);
    if (!Number.isInteger(i) || !Number.isInteger(n) || i < 0 || i >= n) {
        throw new Error(`[T17-05b] --shard 需要 i/n 且 0<=i<n，实际 '${SHARD}'。`);
    }
    selected = jobs.filter((_, index) => index % n === i);
}

const OUT_DIR = path.resolve('v17/out', RUN_ID, 'data', SPLIT === 'train' ? 'demo_train/rollouts' : 'demo_val/rollouts');
fs.mkdirSync(OUT_DIR, { recursive: true });
const variantTag = VARIANT === 'B100-Q' ? 'b100q' : 'b100r';
const outPath = path.join(OUT_DIR, `${SPLIT}_${variantTag}${TAG ? `.${TAG}` : ''}${SHARD ? `.shard${SHARD.replace('/', 'of')}` : ''}.jsonl`);
const out = fs.createWriteStream(outPath, { flags: 'w' });

const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

interface Captured {
    stepIndex: number; playerId: number; allianceId: number;
    stateJson: string; behaviorActionCode: string; turn: number;
    completedPlayerTurns: number; phaseBucket: string;
}

function phaseBucketOf(completedTurns: number): string {
    return completedTurns <= 2 ? '0-2' : completedTurns <= 7 ? '3-7' : '8+';
}
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
let teacherDecisions = 0;
let nonTeacherDecisions = 0;
const rootSummaries: Array<Record<string, unknown>> = [];
const startedAt = Date.now();

for (const job of selected) {
    const buckets: Record<string, Captured[]> = { '0-2': [], '3-7': [], '8+': [] };
    let completedTurns = 0;
    let lastPlayer: number | null = null;
    const quota = Math.max(1, Math.floor(MAX_ROWS_PER_ROOT / 3));

    // 中文：教师实例逐局一个（R 版需要持久随机流；Q 版每查询重新播种但实例复用无副作用）。
    const handle = createB100Policy({
        variant: VARIANT,
        rootSeed: job.seed,
        seat: job.subjectSeat,
        ...(VARIANT === 'B100-Q' ? { inputKeyProvider: b100InputKeyProvider() } : {}),
    });
    const policy: CandidatePolicyV16 = handle.policy;

    const record: GameRecord = await playOne({
        runId: `${RUN_ID}_teacher_demo`,
        scenarioId: job.scenarioId,
        seed: job.seed,
        candidateSeat: job.subjectSeat,
        viewedSeatHint: job.subjectSeat,
        maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        maxPlies: V16_DEFAULT_CAPS.maxPlies,
        wallTimeoutMs: V16_DEFAULT_CAPS.wallTimeoutMs,
        predictor: null,
        checkpointSha256: null,
        requestedPolicyId: `teacher:${SOURCE_POLICY}`,
        envFactory,
        emitIdentity: false,
        captureStateOnStep: true,
        policyOverride: policy,
        onStep: (trace) => {
            if (trace.stateBeforeJson === null) return;
            if (trace.playerId === job.subjectSeat) {
                teacherDecisions += 1;
                lastPlayer = job.subjectSeat;
                pushBucket(buckets[phaseBucketOf(completedTurns)], {
                    stepIndex: trace.stepIndex,
                    playerId: trace.playerId,
                    allianceId: trace.allianceId,
                    stateJson: trace.stateBeforeJson,
                    behaviorActionCode: trace.actionCode,
                    turn: trace.turnAfter,
                    completedPlayerTurns: completedTurns,
                    phaseBucket: phaseBucketOf(completedTurns),
                }, quota);
            } else {
                nonTeacherDecisions += 1;
                if (lastPlayer === job.subjectSeat) {
                    completedTurns += 1;
                    lastPlayer = trace.playerId;
                } else {
                    lastPlayer = trace.playerId;
                }
            }
        },
    });

    const natural = record.outcomeKind === 'NATURAL_WIN' || record.outcomeKind === 'NATURAL_LOSS' || record.outcomeKind === 'NATURAL_DRAW';
    const winnerAllianceId = record.winnerAllianceId;
    const draw = winnerAllianceId === null || winnerAllianceId === -1 || record.outcomeKind === 'NATURAL_DRAW';

    const picked: Captured[] = [];
    for (const key of ['0-2', '3-7', '8+']) picked.push(...trimBucket(buckets[key], quota));
    picked.sort((a, b) => a.stepIndex - b.stepIndex);
    const subjectAllianceId = picked.length > 0 ? picked[picked.length - 1].allianceId : null;
    const subjectOutcome = !natural ? null : (draw ? 'draw' : (winnerAllianceId === subjectAllianceId ? 'win' : 'loss'));
    const valueTarget = !natural ? null : (draw ? 0.0 : (subjectOutcome === 'win' ? 1.0 : -1.0));

    for (const item of picked) {
        const state = JSON.parse(item.stateJson) as GameState;
        const stateHash = crypto.createHash('sha256').update(Buffer.from(canonicalStateJson(state), 'utf8')).digest('hex');
        out.write(`${JSON.stringify({
            schema: 'v17_rollout_row_1',
            runId: RUN_ID,
            split: SPLIT,
            sourcePolicy: job.sourcePolicy,
            behaviorPolicyId: `teacher:${SOURCE_POLICY}:${B100_TEACHER_VERSION}`,
            behaviorCheckpointSha256: null,
            teacherVersion: B100_TEACHER_VERSION,
            onPolicyDemonstration: true,
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
            subjectSeat: job.subjectSeat,
            subjectPlayerId: job.subjectSeat,
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

    rootSummaries.push({
        rootId: job.rootId, mapName: job.mapName, rootIndex: job.rootIndex, seed: job.seed,
        rootFamilyId: job.rootFamilyId, subjectSeat: job.subjectSeat,
        gameOutcomeKind: record.outcomeKind, naturalTerminal: natural, winnerAllianceId,
        subjectOutcome, valueTarget, steps: record.steps, turns: record.turns, wallMs: record.wallMs,
        teacherDecisions, rowsWritten: picked.length,
        teacherInternalExceptions: handle.exceptions,
        bucketCounts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    });
    console.log(
        `[T17-05b] ${job.rootId} ${record.outcomeKind} ${subjectOutcome ?? 'na'} `
        + `rows=${picked.length}/${teacherDecisions} steps=${record.steps} ${(record.wallMs / 1000).toFixed(1)}s `
        + `exceptions=${handle.exceptions}`,
    );
}

await new Promise<void>((resolve) => out.end(resolve));
const summary = {
    schema: 'v17_teacher_demo_summary_1',
    runId: RUN_ID,
    split: SPLIT,
    variant: VARIANT,
    teacherVersion: B100_TEACHER_VERSION,
    seedFormula: V17_SEED_FORMULA,
    baseSeed: BASE_SEED,
    rootStart: ROOT_START,
    rootCount: ROOT_COUNT,
    mapFilter: MAP_FILTER === null ? null : Number(MAP_FILTER),
    seats: SEATS,
    shard: SHARD,
    tag: TAG,
    outPath: outPath.replace(/\\/g, '/'),
    rootJobs: rootSummaries.length,
    rowsWritten,
    teacherDecisions,
    nonTeacherDecisions,
    teacherExceptionsTotal: rootSummaries.reduce((acc, r) => acc + Number(r.teacherInternalExceptions ?? 0), 0),
    caps: V16_DEFAULT_CAPS,
    discipline: [
        '只采集教师在**自己轨迹**上的决策状态 ⇒ 标签在构造上就是 on-policy 的。',
        '行 schema 与 collect_v17_rollouts.ts 一致，可直接被 build_v17_dataset.ts 编码。',
        'value 目标仍取真实自然终局；截断不赋 0。',
    ],
    rootSummaries,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
};
fs.writeFileSync(outPath.replace(/\.jsonl$/, '.summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`[T17-05b] 完成 ${rootSummaries.length} 个 root job，${rowsWritten} 行 → ${outPath}`);