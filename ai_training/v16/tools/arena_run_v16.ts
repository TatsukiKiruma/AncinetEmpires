/**
 * V16/T16-01：五图对局执行器（owner：T16-01）。
 *
 * 结构沿用 V15/T15-09B 的 `arena_run_v15.ts`（逐行 gameId、身份匹配恢复、错误不伪造、
 * 身份不一致拒绝续写），但面板、模式与统计口径换成 V16 的五图三面板。
 *
 * 用法（示例，全部真实可复制）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/arena_run_v16.ts \
 *     --run-id v16_20260926_core --panel dev --model <c2_final.json> --model-key c2:42 \
 *     --arms candidate --blocks dev:m0:s0,dev:m0:s1
 *
 * 只跑镜像（H0 对 H0，每 (地图,seed) 一次，再按座位展开）：
 *   ... --panel dev --arms mirror --blocks dev:m0:s0
 *
 * 只做计划不跑：加 `--dry-run`。
 *
 * 关键纪律：
 * - 学生 caps 冻结在 `V16_DEFAULT_CAPS`；`--max-steps/--wall-ms` 只能收紧，放宽要显式传且
 *   会在 progress 里记录，协议 §3 要求 caps 变了必须重跑当前冠军与对照。
 * - caps 进缓存身份（`buildCacheIdentityV15` 的 `maxStepsAtomicActions/maxPlies/wallTimeoutMs`），
 *   所以改 caps 会自动换键，不会误复用旧结果。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { SUPPORTED_ENCODER_SCHEMA_IDS } from '../../src/game/ai/spatial_tensor_encoder';
import { isError } from '../../v13/tools/eval_v3_core';
import {
    UNPACK_DIR,
    SD_PLAN_FILE,
    playOne,
    recomputeOutcomeForViewedSeat,
    type CandidatePolicyV16,
    type GameRecord,
    type IdentityContextV15,
} from '../../v14/tools/eval_v14_match';
import { S1_TIERS, S1_TEACHER_VERSION, searchS1Action } from './teacher_s1_v16';
import { cacheReuseDiffV15, type RunModeV15 } from '../../v14/tools/eval_v14_protocol';
import {
    V16_DEFAULT_CAPS,
    V16_INITIALIZATION_POLICY_ID,
    V16_PANELS,
    V16_RUN_ID_DEFAULT,
    V16_CAPS_ID,
    blocksForPanelV16,
    type V16Block,
} from './eval_v16_protocol';
import { sourceDigestsV16 } from './eval_v16_identity';
import { checkpointSha256V15, modelIdV15 } from '../../v15/tools/eval_v15_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(name);

const RUN_ID = arg('--run-id', V16_RUN_ID_DEFAULT) as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v16/out/${RUN_ID}`) as string);
const PANEL = arg('--panel', 'dev') as string;
const BLOCKS_ARG = arg('--blocks', null);
const SHARD = arg('--shard', null);
const MODEL_PATH = arg('--model', null);
const MODEL_KEY = arg('--model-key', null);
const POLICY = arg('--policy', 'auto') as 'auto' | 'model' | 's1';
const TEACHER_TIER = arg('--teacher-tier', 'S1a') as string;
const ARMS = arg('--arms', 'candidate') as 'candidate' | 'mirror' | 'both';
const RESUME = arg('--resume', 'true') !== 'false';
const RETRY_ERRORS = arg('--retry-errors', 'true') !== 'false';
const DRY_RUN = flag('--dry-run');

const spec = V16_PANELS[PANEL];
if (!spec) throw new Error(`[T16-01] 未知 --panel '${PANEL}'；可用：${Object.keys(V16_PANELS).join(', ')}。`);

/* ---------------- block 选择 ---------------- */
const allBlocks = blocksForPanelV16(PANEL);
let blocks: V16Block[];
if (BLOCKS_ARG !== null) {
    const wanted = BLOCKS_ARG.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const byId = new Map(allBlocks.map((b) => [b.blockId, b]));
    blocks = wanted.map((id) => {
        const b = byId.get(id);
        if (!b) throw new Error(`[T16-01] panel=${PANEL} 里没有 block ${id}；可用：${allBlocks.map((x) => x.blockId).join(', ')}`);
        return b;
    });
} else if (SHARD !== null) {
    const [iRaw, nRaw] = SHARD.split('/');
    const i = Number(iRaw);
    const n = Number(nRaw);
    if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 0 || i >= n) {
        throw new Error(`[T16-01] --shard 需要 i/n 形式且 0<=i<n，实际 '${SHARD}'。`);
    }
    blocks = allBlocks.filter((_, idx) => idx % n === i);
} else {
    blocks = allBlocks;
}
if (blocks.length === 0) throw new Error('[T16-01] 没有选中任何 block。');

/* ---------------- caps ---------------- */
const maxSteps = Number(arg('--max-steps', String(V16_DEFAULT_CAPS.maxStepsAtomicActions)));
const wallMs = Number(arg('--wall-ms', String(V16_DEFAULT_CAPS.wallTimeoutMs)));
const maxPlies = arg('--max-plies', null) === null || arg('--max-plies', null) === 'null'
    ? V16_DEFAULT_CAPS.maxPlies
    : Number(arg('--max-plies', null));
if (maxSteps !== V16_DEFAULT_CAPS.maxStepsAtomicActions || wallMs !== V16_DEFAULT_CAPS.wallTimeoutMs) {
    console.warn(
        `[T16-01] ⚠ caps 与冻结默认不同：steps=${maxSteps} wallMs=${wallMs} `
        + `（默认 ${V16_DEFAULT_CAPS.maxStepsAtomicActions}/${V16_DEFAULT_CAPS.wallTimeoutMs}，capsId=${V16_CAPS_ID}）。`
        + '协议的正式成绩必须用冻结 caps。',
    );
}

/* ---------------- 模型身份 ---------------- */
let predictor: SpatialResNetPredictor | null = null;
let checkpointSha256: string | null = null;
let requestedPolicyId = 'heuristic';
let modelTag = MODEL_KEY ?? 'h0';
if (MODEL_PATH !== null) {
    const abs = path.resolve(MODEL_PATH);
    if (!fs.existsSync(abs)) throw new Error(`[T16-01] 权重不存在：${abs}`);
    const json = fs.readFileSync(abs, 'utf8');
    const declared = (JSON.parse(json) as { encoderSchemaId?: string }).encoderSchemaId ?? null;
    const expected = declared === null
        ? null
        : (SUPPORTED_ENCODER_SCHEMA_IDS as readonly string[]).includes(declared)
            ? declared
            : (() => { throw new Error(`[T16-01] 未知 encoderSchemaId '${declared}'。`); })();
    predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected }));
    checkpointSha256 = checkpointSha256V15(abs);
    requestedPolicyId = path.basename(abs).replace(/\.json$/, '');
    modelTag = MODEL_KEY ?? requestedPolicyId;
    console.log(
        `[T16-01] 权重 ${path.basename(abs)} schema=${predictor.encoderSchemaId} `
        + `variant=${predictor.semanticsVariant} sha256=${checkpointSha256.slice(0, 12)}… modelTag=${modelTag}`,
    );
}
const candidateModelId = modelIdV15(requestedPolicyId, modelTag, checkpointSha256);

/* ---------------- V16/T16-03：S1 教师臂 ---------------- */
const useS1 = POLICY === 's1';
if (useS1 && ARMS === 'mirror') {
    throw new Error('[T16-01] policy=s1 时 --arms 不能只有 mirror（镜像臂永远是 H0）。');
}
if (useS1 && MODEL_PATH !== null) {
    throw new Error('[T16-01] policy=s1 与 --model 互斥：教师臂不做网络前向（S2 才接价值头）。');
}
const s1Tier = useS1 ? S1_TIERS[TEACHER_TIER] : null;
if (useS1 && !s1Tier) {
    throw new Error(`[T16-01] 未知 --teacher-tier '${TEACHER_TIER}'；可用：${Object.keys(S1_TIERS).join(', ')}。`);
}
const s1Stats: Array<Record<string, unknown>> = [];
const s1Policy: CandidatePolicyV16 | undefined = useS1 && s1Tier
    ? (context) => {
        const decision = searchS1Action({
            state: context.state,
            playerId: context.playerId,
            s1: {
                tier: s1Tier,
                // 中文：教师必须确定性 —— rng 固定为常量函数，不随对局推进。
                rng: () => 0.5,
                wallMsPerDecision: Number(arg('--teacher-wall-ms', '30000')),
            },
        });
        s1Stats.push({
            playerId: context.playerId,
            actionCode: decision.actionCode,
            reason: decision.reason,
            engineTransitions: decision.engineTransitions,
            elapsedMs: decision.elapsedMs,
            wallCapHit: decision.wallCapHit,
            labelTrustworthy: decision.labelTrustworthy,
            boundaryReachedRatio: decision.boundaryReachedRatio,
            truncationStop: decision.truncationStop,
            candidatesSearched: decision.candidates.filter((c) => c.value !== null).length,
            candidatesTotal: decision.candidates.length,
            tierId: decision.tierId,
        });
        return decision.action;
    }
    : undefined;
const effectiveModelTag = useS1 ? `${TEACHER_TIER}-teacher` : modelTag;
const effectiveModelId = useS1
    ? `search-s1:${TEACHER_TIER}:${S1_TEACHER_VERSION}`
    : candidateModelId;

/* ---------------- 输出与恢复 ---------------- */
const outDir = path.join(RUN_ROOT, 'arena', PANEL);
const outPath = path.resolve(
    arg('--out', path.join(outDir, `${(useS1 ? `s1-${TEACHER_TIER}` : (MODEL_KEY ?? (MODEL_PATH ? modelTag : 'h0'))).replace(/[:\\/]/g, '_')}${SHARD ? `.shard${SHARD.replace('/', 'of')}` : ''}.games.jsonl`)) as string,
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const errorPath = outPath.replace(/\.games\.jsonl$/, '.errors.jsonl');
const progressPath = outPath.replace(/\.games\.jsonl$/, '.progress.json');

/** 已完成项：gameId → 身份字段（必须一致字段的取值表）。 */
const completed = new Map<string, Record<string, string | number | null>>();
const existingRows: GameRecord[] = [];
if (fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const row = JSON.parse(trimmed) as GameRecord;
        existingRows.push(row);
        const id = row.gameId ?? row.cacheIdentity?.gameId;
        if (!id || !row.cacheIdentity) continue;
        const finished = isError(row.outcomeKind) ? (RETRY_ERRORS ? false : true) : true;
        if (finished) completed.set(id, row.cacheIdentity.fields ?? {});
    }
    if (!RESUME) {
        throw new Error(`[T16-01] 输出文件已存在且 --resume=false：拒绝覆盖（${outPath}）。`);
    }
}

/* ---------------- 身份与计划 ---------------- */
const sourceDigests = sourceDigestsV16(process.cwd());
const runMode: RunModeV15 = PANEL === 'confirm' ? 'confirm' : PANEL === 'preflight' ? 'preflight' : 'dev';

interface PlannedArm {
    gameId: string;
    arm: 'CANDIDATE' | 'MIRROR';
    block: V16Block;
    seat: number | null;
    viewedSeat: number | null;
}
function identityFor(block: V16Block, arm: 'CANDIDATE' | 'MIRROR'): IdentityContextV15 {
    return {
        runId: RUN_ID,
        runMode,
        panelId: PANEL,
        blockId: block.blockId,
        rootSeed: block.rootSeed,
        episodeIndex: block.episodeIndex,
        rootFamilyId: block.rootFamilyId,
        modelTag: arm === 'CANDIDATE' ? effectiveModelTag : 'mirror',
        sourceDigests,
    };
}
function gameIdOf(block: V16Block, arm: 'CANDIDATE' | 'MIRROR', seat: number | null, viewedSeat: number | null): string {
    const modelId = arm === 'CANDIDATE' ? effectiveModelId : 'heuristic:mirror:v1';
    return `${RUN_ID}|${PANEL}|${block.blockId}|${modelId}|${arm}|seat=${seat === null ? 'null' : seat}|view=${viewedSeat === null ? 'null' : viewedSeat}`;
}

const planned: PlannedArm[] = [];
for (const block of blocks) {
    if (ARMS === 'candidate' || ARMS === 'both') {
        for (const seat of block.candidateSeats) {
            planned.push({ gameId: gameIdOf(block, 'CANDIDATE', seat, seat), arm: 'CANDIDATE', block, seat, viewedSeat: seat });
        }
    }
    if (ARMS === 'mirror' || ARMS === 'both') {
        for (const seat of block.candidateSeats) {
            planned.push({ gameId: gameIdOf(block, 'MIRROR', null, seat), arm: 'MIRROR', block, seat: null, viewedSeat: seat });
        }
    }
}

if (DRY_RUN) {
    console.log(`[T16-01] dry-run panel=${PANEL} blocks=${blocks.length} arms=${ARMS} runMode=${runMode}`);
    for (const p of planned) console.log(`  ${completed.has(p.gameId) ? 'skip' : 'run '} ${p.gameId}`);
    console.log(`[T16-01] 输出将是 ${outPath}`);
    process.exit(0);
}

/* ---------------- 执行 ---------------- */
const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
const out = fs.createWriteStream(outPath, { flags: 'a' });
let skipped = 0;
let ranCandidates = 0;
let ranMirrors = 0;
let failed = 0;
const appended: GameRecord[] = [];
const blockSummaries: Array<Record<string, unknown>> = [];
const startedAt = Date.now();

function writeRow(row: GameRecord): void {
    out.write(`${JSON.stringify(row)}\n`);
    appended.push(row);
}

function getAllianceIdFromRecord(record: GameRecord, seat: number): number | null {
    const fromRecord = record.seatAlliances?.[String(seat)];
    if (fromRecord !== undefined) return fromRecord;
    const fromBlock = blocks.find((b) => b.blockId === record.blockId)?.seatAlliances[String(seat)];
    return fromBlock === undefined ? null : fromBlock;
}

for (const block of blocks) {
    const blockStarted = Date.now();
    const rows: GameRecord[] = [];

    // 1) 镜像实体：一个 (地图,seed) 只跑一次 H0 对 H0，再按座位展开视角。
    if (ARMS === 'mirror' || ARMS === 'both') {
        const allSeatIds = block.candidateSeats.map((s) => gameIdOf(block, 'MIRROR', null, s));
        if (RESUME && allSeatIds.every((id) => completed.has(id))) {
            skipped += allSeatIds.length;
            console.log(`[T16-01] 跳过镜像 ${block.blockId}（${allSeatIds.length} 个座位视角已完成）`);
        } else {
            const record = await playOne({
                runId: RUN_ID, scenarioId: block.scenarioId, seed: block.rootSeed,
                candidateSeat: null, viewedSeatHint: null,
                maxSteps, maxPlies, wallTimeoutMs: wallMs,
                predictor: null, checkpointSha256: null, requestedPolicyId: 'heuristic',
                envFactory, emitIdentity: true, mirrorViewRecompute: true,
                identityContext: identityFor(block, 'MIRROR'),
            });
            ranMirrors += 1;
            for (const seat of block.candidateSeats) {
                const allianceId = getAllianceIdFromRecord(record, seat);
                const row: GameRecord = {
                    ...record,
                    viewedSeat: seat,
                    candidateAllianceId: allianceId,
                    outcomeKind: recomputeOutcomeForViewedSeat(record.outcomeKind, record.winnerAllianceId, allianceId),
                };
                if (row.cacheIdentity) {
                    row.gameId = gameIdOf(block, 'MIRROR', null, seat);
                    row.cacheIdentity = { ...row.cacheIdentity, gameId: row.gameId };
                }
                writeRow(row);
                rows.push(row);
            }
            console.log(
                `[T16-01] 镜像 ${block.blockId} ${record.outcomeKind} steps=${record.steps} `
                + `${(record.wallMs / 1000).toFixed(1)}s → ${block.candidateSeats.length} 个座位视角`,
            );
        }
    }

    // 2) 候选臂：每个座位一局，候选策略只作用在该座位。
    if (ARMS === 'candidate' || ARMS === 'both') {
        for (const seat of block.candidateSeats) {
            const gameId = gameIdOf(block, 'CANDIDATE', seat, seat);
            if (RESUME && completed.has(gameId)) {
                skipped += 1;
                console.log(`[T16-01] 跳过已完成 ${gameId}`);
                continue;
            }
            const record = await playOne({
                runId: RUN_ID, scenarioId: block.scenarioId, seed: block.rootSeed,
                candidateSeat: seat, viewedSeatHint: seat,
                maxSteps, maxPlies, wallTimeoutMs: wallMs,
                predictor, checkpointSha256, requestedPolicyId,
                envFactory, emitIdentity: true, mirrorViewRecompute: false,
                identityContext: identityFor(block, 'CANDIDATE'),
                policyOverride: s1Policy,
            });
            ranCandidates += 1;
            const previous = existingRows.find((r) => (r.gameId ?? r.cacheIdentity?.gameId) === gameId);
            if (previous?.cacheIdentity?.fields && record.cacheIdentity?.fields) {
                const diff = cacheReuseDiffV15(previous.cacheIdentity.fields, record.cacheIdentity.fields);
                if (diff.length > 0) {
                    throw new Error(`[T16-01] ${gameId} 与既有行身份不一致（${diff.join(', ')}），拒绝把不同实验写进同一文件。`);
                }
            }
            writeRow(record);
            rows.push(record);
            if (isError(record.outcomeKind)) {
                failed += 1;
                fs.appendFileSync(errorPath, `${JSON.stringify({ gameId, outcomeKind: record.outcomeKind, error: record.error, wallMs: record.wallMs })}\n`, 'utf8');
            }
            console.log(
                `[T16-01] 候选 ${block.blockId} seat=${seat} ${record.outcomeKind} steps=${record.steps} `
                + `turns=${record.turns} ${(record.wallMs / 1000).toFixed(1)}s p95=${record.latencyMs.p95 ?? 'null'}ms`,
            );
        }
    }

    blockSummaries.push({
        blockId: block.blockId,
        mapName: block.mapName,
        mapIndex: block.mapIndex,
        rootSeed: block.rootSeed,
        rows: rows.map((r) => ({
            gameId: r.gameId ?? null,
            arm: r.arm,
            viewedSeat: r.viewedSeat,
            outcomeKind: r.outcomeKind,
            winnerAllianceId: r.winnerAllianceId,
            candidateAllianceId: r.candidateAllianceId,
            steps: r.steps,
            turns: r.turns,
            plies: r.plies,
            wallMs: r.wallMs,
            error: r.error,
        })),
        wallMs: Date.now() - blockStarted,
    });
}

await new Promise<void>((resolve) => out.end(resolve));

const progress = {
    schema: 'v16_arena_progress_1',
    runId: RUN_ID,
    panelId: PANEL,
    panelLabel: spec.label,
    official: spec.official,
    runMode,
    modelKey: useS1 ? `s1:${TEACHER_TIER}` : MODEL_KEY,
    policy: useS1 ? 'search-s1' : (MODEL_PATH === null ? 'heuristic' : 'model'),
    teacherTier: useS1 ? TEACHER_TIER : null,
    teacherVersion: useS1 ? S1_TEACHER_VERSION : null,
    modelPath: MODEL_PATH === null ? null : path.resolve(MODEL_PATH).replace(/\\/g, '/'),
    modelId: effectiveModelId,
    checkpointSha256,
    encoderSchemaId: predictor?.encoderSchemaId ?? 'heuristic/na',
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    sourceDigests: {
        engine: sourceDigests.engine.digest,
        policy: sourceDigests.policy.digest,
        h0: sourceDigests.h0.digest,
        runner: sourceDigests.runner.digest,
    },
    outPath: outPath.replace(/\\/g, '/'),
    blocks: blocks.map((b) => b.blockId),
    arms: { candidate: ranCandidates, mirror: ranMirrors, skipped },
    failed,
    appendedRows: appended.length,
    wallMs: Date.now() - startedAt,
    caps: { maxSteps, maxPlies, wallTimeoutMs: wallMs, capsId: V16_CAPS_ID },
    generatedAt: new Date().toISOString(),
};
fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
if (useS1 && s1Stats.length > 0) {
    const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);
    const pct = (arr: number[], q: number): number | null => (arr.length === 0 ? null : arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]);
    const boundarySorted = sorted(s1Stats.map((s) => s.boundaryReachedRatio as number));
    const latencySorted = sorted(s1Stats.map((s) => s.elapsedMs as number));
    const transitionSorted = sorted(s1Stats.map((s) => s.engineTransitions as number));
    const stalls = s1Stats.filter((s) => s.wallCapHit === true).length;
    fs.writeFileSync(
        outPath.replace(/\.games\.jsonl$/, '.s1stats.json'),
        `${JSON.stringify({
            schema: 'v16_s1_decision_stats_1',
            runId: RUN_ID,
            panelId: PANEL,
            tierId: TEACHER_TIER,
            teacherVersion: S1_TEACHER_VERSION,
            decisions: s1Stats.length,
            wallCapHits: stalls,
            labelTrustworthyRate: (s1Stats.length - stalls) / s1Stats.length,
            boundaryReachedRatioP05: pct(boundarySorted, 0.05),
            boundaryReachedRatioP50: pct(boundarySorted, 0.5),
            boundaryReachedRatioMin: boundarySorted.length ? boundarySorted[0] : null,
            elapsedMsP50: pct(latencySorted, 0.5),
            elapsedMsP95: pct(latencySorted, 0.95),
            elapsedMsMax: latencySorted.length ? latencySorted[latencySorted.length - 1] : null,
            engineTransitionsP50: pct(transitionSorted, 0.5),
            engineTransitionsP95: pct(transitionSorted, 0.95),
            decisionsDetail: s1Stats.slice(0, 200),
        }, null, 2)}\n`,
        'utf8',
    );
    console.log(
        `[T16-01] S1 决策 ${s1Stats.length} 次 wall命中=${stalls} `
        + `p50=${pct(latencySorted, 0.5)}ms p95=${pct(latencySorted, 0.95)}ms `
        + `边界比 p05=${pct(boundarySorted, 0.05)}`,
    );
}
fs.writeFileSync(
    outPath.replace(/\.games\.jsonl$/, '.blocks.json'),
    `${JSON.stringify({ schema: 'v16_arena_blocks_1', runId: RUN_ID, panelId: PANEL, blocks: blockSummaries }, null, 2)}\n`,
    'utf8',
);
console.log(
    `[T16-01] 完成 panel=${PANEL} 候选=${ranCandidates} 镜像=${ranMirrors} 跳过=${skipped} `
    + `失败=${failed} 新增行=${appended.length} 用时=${((Date.now() - startedAt) / 1000).toFixed(1)}s → ${outPath}`,
);
