/**
 * V16/T16-04 阶段 1：五图行为源 rollout 采集（owner：T16-04）。
 *
 * 每个 root = (地图 m, seed, 行为源, 主体座位)。行为源两种：
 * - `h0`：H0 对 H0（`playOne` 镜像实体），同一局的两个座位都作为主体各记一份；
 * - `s1`：S1 教师坐在**主体座位**上对 H0，另一边轮换（每图两个座位都跑）。
 *
 * 输出每个主体的决策行（原始、不去重）：
 *   { rootFamilyId, subjectPlayerId, subjectAllianceId, stepIndex, stateJson, behaviorActionCode,
 *     outcomeKind, winnerAllianceId, subjectOutcome, subjectTurnCount, ... }
 *
 * 关键纪律：
 * - train root seed 从 `2609300000` 起、val 从 `2609400000` 起（协议 §2），**不碰**三套对局面板。
 * - 同一 seed 的换边、同局双方、派生窗口都写同一个 `rootFamilyId`，供阶段 2 做 family 级 split。
 * - 不采 CONFIRM20 的任何状态。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/collect_v16_rollouts.ts \
 *     --run-id v16_20260926_core --split train --source h0 --shard 0/8
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { UNPACK_DIR, SD_PLAN_FILE, playOne, type GameRecord } from '../../v14/tools/eval_v14_match';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import {
    V16_DEFAULT_CAPS,
    V16_MAPS,
    V16_TRAIN_ROOT_BASE_SEED,
    V16_TRAIN_VAL_BASE_SEED,
    scenarioIdOfMapV16,
} from './eval_v16_protocol';
import { S1_TIERS, S1_TEACHER_VERSION, searchS1Action } from './teacher_s1_v16';
import type { GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'v16_20260926_core') as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v16/out/${RUN_ID}`) as string);
const SPLIT = arg('--split', 'train') as 'train' | 'val';
const SOURCE = arg('--source', 'h0') as 'h0' | 's1';
const SEEDS_PER_MAP_SEAT = Number(arg('--seeds-per-map', SPLIT === 'train' ? '12' : '4'));
/** 只采集 [seedStart, seedStart+seedCount) 这一段 seed 序号，便于在已有分片之上增量扩 root。 */
const SEED_START = Number(arg('--seed-start', '0'));
const SEED_COUNT = arg('--seed-count', null) === null ? null : Number(arg('--seed-count', null));
const SEED_TAG = arg('--seed-tag', '') as string;
const TEACHER_TIER = arg('--teacher-tier', 'S1a') as string;
const SHARD = arg('--shard', null);
const MAX_ROWS_PER_ROOT = Number(arg('--max-rows-per-root', '200'));
const OUT_DIR = path.join(RUN_ROOT, 'T16-04', 'rollouts');

if (!S1_TIERS[TEACHER_TIER] && SOURCE === 's1') {
    throw new Error(`[T16-04] 未知 --teacher-tier '${TEACHER_TIER}'。`);
}

interface RootJob {
    rootId: string;
    mapIndex: number;
    mapName: string;
    scenarioId: string;
    seed: number;
    subjectSeat: number;
    rootFamilyId: string;
}

const baseSeed = SPLIT === 'train' ? V16_TRAIN_ROOT_BASE_SEED : V16_TRAIN_VAL_BASE_SEED;
const jobs: RootJob[] = [];
for (let m = 0; m < V16_MAPS.length; m += 1) {
    const seedEnd = SEED_COUNT === null ? SEEDS_PER_MAP_SEAT : Math.min(SEEDS_PER_MAP_SEAT, SEED_START + SEED_COUNT);
    for (let s = SEED_START; s < seedEnd; s += 1) {
        const scenarioId = scenarioIdOfMapV16(V16_MAPS[m]);
        // 中文：步长必须让 (map, seed, source) 互不重叠：1000*m + 10*s + sourceOffset，
        // 且 s < 100（本工具最多每图每座位 12 个 seed）。用 100*m 会与 s=10 撞车。
        const seed = baseSeed + 1000 * m + 10 * s + (SOURCE === 'h0' ? 0 : 1);
        for (const seat of [0, 1]) {
            jobs.push({
                rootId: `${SPLIT}:${SOURCE}:m${m}:s${s}:seat${seat}`,
                mapIndex: m,
                mapName: V16_MAPS[m],
                scenarioId,
                seed,
                subjectSeat: seat,
                rootFamilyId: `${SPLIT}|${SOURCE}|${scenarioId}#${seed}#seat${seat}`,
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
        throw new Error(`[T16-04] --shard 需要 i/n 且 0<=i<n，实际 '${SHARD}'。`);
    }
    selected = jobs.filter((_, index) => index % n === i);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, `${SPLIT}_${SOURCE}${SEED_TAG ? `.${SEED_TAG}` : ''}${SHARD ? `.shard${SHARD.replace('/', 'of')}` : ''}.jsonl`);
const out = fs.createWriteStream(outPath, { flags: 'w' });

const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
const tier = S1_TIERS[TEACHER_TIER] ?? S1_TIERS.S1a;

function makeEpisode(scenarioId: string, seed: number) {
    const mapName = scenarioId.split(':').pop() as string;
    return {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
        seed, maxPlies: 1200, maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;
}

interface Captured {
    stepIndex: number;
    playerId: number;
    stateJson: string;
    behaviorActionCode: string;
    turn: number;
    completedPlayerTurns: number;
}

let rowsWritten = 0;
const rootSummaries: Array<Record<string, unknown>> = [];
const startedAt = Date.now();

for (const job of selected) {
    const captured: Captured[] = [];
    /** 主体已经完成的玩家回合数：主体每次交出击 +1。 */
    let completedTurns = 0;
    let lastSubjectPlayer: number | null = null;

    const record: GameRecord = await playOne({
        runId: `${RUN_ID}_collect`,
        scenarioId: job.scenarioId,
        seed: job.seed,
        candidateSeat: SOURCE === 's1' ? job.subjectSeat : null,
        viewedSeatHint: job.subjectSeat,
        maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        maxPlies: V16_DEFAULT_CAPS.maxPlies,
        wallTimeoutMs: V16_DEFAULT_CAPS.wallTimeoutMs,
        predictor: null, checkpointSha256: null, requestedPolicyId: 'heuristic',
        envFactory,
        emitIdentity: false,
        captureStateOnStep: true,
        policyOverride: SOURCE === 's1'
            ? (context) => searchS1Action({
                state: context.state,
                playerId: context.playerId,
                s1: { tier, rng: () => 0.5, wallMsPerDecision: 30000 },
            }).action
            : undefined,
        onStep: (trace) => {
            if (trace.stateBeforeJson === null) return;
            if (trace.playerId !== job.subjectSeat) {
                if (lastSubjectPlayer === job.subjectSeat) completedTurns += 1;
                lastSubjectPlayer = trace.playerId;
                return;
            }
            lastSubjectPlayer = trace.playerId;
            captured.push({
                stepIndex: trace.stepIndex,
                playerId: trace.playerId,
                stateJson: trace.stateBeforeJson,
                behaviorActionCode: trace.actionCode,
                turn: trace.turnAfter,
                completedPlayerTurns: completedTurns,
            });
        },
    });

    const subjectOutcome = record.outcomeKind === 'NATURAL_WIN' || record.outcomeKind === 'NATURAL_LOSS'
        ? (record.winnerAllianceId !== null && record.candidateAllianceId !== null
            && record.winnerAllianceId === record.candidateAllianceId ? 'win' : 'loss')
        : null;
    const natural = record.outcomeKind === 'NATURAL_WIN' || record.outcomeKind === 'NATURAL_LOSS' || record.outcomeKind === 'NATURAL_DRAW';
    const valueTarget = !natural
        ? null
        : (record.outcomeKind === 'NATURAL_DRAW' ? 0.0 : (subjectOutcome === 'win' ? 1.0 : -1.0));

    // 按主体已完成的玩家回合数分桶（任务书 §6.1：0–2 / 3–7 / ≥8）。
    const buckets: Record<string, Captured[]> = { '0-2': [], '3-7': [], '8+': [] };
    for (const item of captured) {
        const key = item.completedPlayerTurns <= 2 ? '0-2' : item.completedPlayerTurns <= 7 ? '3-7' : '8+';
        buckets[key].push(item);
    }
    const perBucket = Math.max(1, Math.floor(MAX_ROWS_PER_ROOT / 3));
    const picked: Captured[] = [];
    for (const key of ['0-2', '3-7', '8+']) {
        const list = buckets[key];
        const stride = Math.max(1, Math.ceil(list.length / perBucket));
        for (let i = 0; i < list.length && picked.length < MAX_ROWS_PER_ROOT; i += stride) picked.push(list[i]);
    }
    picked.sort((a, b) => a.stepIndex - b.stepIndex);

    for (const item of picked) {
        const state = JSON.parse(item.stateJson) as GameState;
        const stateHash = crypto.createHash('sha256')
            .update(Buffer.from(canonicalStateJson(state), 'utf8')).digest('hex');
        out.write(`${JSON.stringify({
            schema: 'v16_rollout_row_1',
            runId: RUN_ID,
            split: SPLIT,
            sourcePolicy: SOURCE,
            rootId: job.rootId,
            rootFamilyId: job.rootFamilyId,
            mapIndex: job.mapIndex,
            mapName: job.mapName,
            scenarioId: job.scenarioId,
            seed: job.seed,
            subjectPlayerId: job.subjectSeat,
            subjectAllianceId: record.seatAlliances?.[String(job.subjectSeat)] ?? null,
            stepIndex: item.stepIndex,
            turn: item.turn,
            completedPlayerTurns: item.completedPlayerTurns,
            phaseBucket: item.completedPlayerTurns <= 2 ? '0-2' : item.completedPlayerTurns <= 7 ? '3-7' : '8+',
            behaviorActionCode: item.behaviorActionCode,
            stateJson: item.stateJson,
            stateHash,
            gameId: `${job.rootId}|step${item.stepIndex}`,
            outcomeKind: record.outcomeKind,
            winnerAllianceId: record.winnerAllianceId,
            subjectOutcome,
            valueTarget,
            gameSteps: record.steps,
            gameTurns: record.turns,
            teacherTier: SOURCE === 's1' ? TEACHER_TIER : null,
            teacherVersion: SOURCE === 's1' ? S1_TEACHER_VERSION : null,
            collectionCaps: V16_DEFAULT_CAPS,
        })}\n`);
        rowsWritten += 1;
    }

    rootSummaries.push({
        rootId: job.rootId,
        mapName: job.mapName,
        seed: job.seed,
        subjectSeat: job.subjectSeat,
        outcomeKind: record.outcomeKind,
        subjectOutcome,
        valueTarget,
        steps: record.steps,
        turns: record.turns,
        subjectDecisions: captured.length,
        rowsWritten: picked.length,
        bucketCounts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    });
    console.log(
        `[T16-04] ${job.rootId} ${record.outcomeKind} subject=${subjectOutcome ?? 'na'} `
        + `steps=${record.steps} 决策=${captured.length} 行=${picked.length} ${(record.wallMs / 1000).toFixed(1)}s`,
    );
}

await new Promise<void>((resolve) => out.end(resolve));
const summary = {
    schema: 'v16_rollout_summary_1',
    runId: RUN_ID,
    split: SPLIT,
    sourcePolicy: SOURCE,
    teacherTier: SOURCE === 's1' ? TEACHER_TIER : null,
    teacherVersion: SOURCE === 's1' ? S1_TEACHER_VERSION : null,
    shard: SHARD,
    outPath: outPath.replace(/\\/g, '/'),
    roots: rootSummaries.length,
    rowsWritten,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    caps: V16_DEFAULT_CAPS,
    rootSummaries,
};
fs.writeFileSync(outPath.replace(/\.jsonl$/, '.summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`[T16-04] 完成 ${rootSummaries.length} 个 root，${rowsWritten} 行 → ${outPath}`);
void makeEpisode;
