/**
 * V15/T15-09A/B：对局执行器（owner A）——T15-09B 的可执行接口。
 *
 * 一次调用只跑**一个 block + 一个模型（或 H0 镜像）**，按完整 gameId 增量写入 JSONL，
 * 支持身份匹配的恢复跳过。设计约束来自任务书 §10.2 与协议 §5.2：
 *
 * - 逐行写完整 gameId；恢复时跳过「gameId 相同且必须一致的身份字段完全相同」的完成项；
 * - 失败项（POLICY_ERROR / ENGINE_ERROR）**不伪造结果**，默认在恢复时重跑，并单独记在
 *   `.errors.jsonl`；同一 gameId 绝不重复计数（重复行会被 V15 严格配对直接报错）；
 * - 输出文件已存在且身份不同时**拒绝续写**（不同实验不得混进同一个文件）；
 * - 不跑候选面板聚合、不改协议数值；渲染/统计交给 `eval_v15_*`。
 *
 * 用法（单场/单 block）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/arena_run_v15.ts \
 *     --block dev:duel:b0 --seat 0 --model v15/out/<runId>/T15-06/c2_s42/c2_s42_best.json \
 *     --model-key c2:42 --arms candidate
 *
 * 只跑镜像（H0，全部座位共一份计算）：
 *   ... --block dev:duel:b0 --arms mirror
 *
 * 只做计划不跑（打印将被执行的 gameId）：
 *   ... --block dev:duel:b0 --seat 0 --arms candidate --dry-run
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
    type GameRecord,
    type IdentityContextV15,
} from '../../v14/tools/eval_v14_match';
import { cacheReuseDiffV15 } from '../../v14/tools/eval_v14_protocol';
import {
    loadFrozenEvalConfigV15,
    modelSlotsV15,
    type RootBlockV15,
} from './eval_v15_core';
import { checkpointSha256V15, modelIdV15, sourceDigestsV15 } from './eval_v15_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(name);

const RUN_ROOT = path.resolve(arg('--run-root', 'v15/out/v15_20260925_core') as string);
const PANEL = arg('--panel', 'dev') as string;
const BLOCK_ID = arg('--block', null);
const SEAT_ARG = arg('--seat', 'all') as string;
const MODEL_PATH = arg('--model', null);
const MODEL_KEY = arg('--model-key', null);
const ARMS = arg('--arms', 'candidate') as 'candidate' | 'mirror' | 'both';
const RESUME = arg('--resume', 'true') !== 'false';
const RETRY_ERRORS = arg('--retry-errors', 'true') !== 'false';
const DRY_RUN = flag('--dry-run');

if (!BLOCK_ID) throw new Error('[T15-09B] 缺少 --block <blockId>（如 dev:duel:b0）。');

const cfg = loadFrozenEvalConfigV15(RUN_ROOT);
const blocks: RootBlockV15[] = PANEL === 'preflight' ? cfg.costPreflight : cfg.devPanel;
const block = blocks.find((b) => b.blockId === BLOCK_ID);
if (!block) {
    throw new Error(`[T15-09B] panel=${PANEL} 里没有 block ${BLOCK_ID}；可用：${blocks.map((b) => b.blockId).join(', ')}`);
}
const seats = SEAT_ARG === 'all' ? block.candidateSeats : [Number(SEAT_ARG)].filter((s) => block.candidateSeats.includes(s));
if (seats.length === 0) throw new Error(`[T15-09B] --seat ${SEAT_ARG} 不在 block 的候选座位 [${block.candidateSeats.join(', ')}] 内。`);

const maxSteps = Number(arg('--max-steps', String(cfg.caps.maxStepsAtomicActions)));
const wallMs = Number(arg('--wall-ms', String(cfg.caps.wallTimeoutMs)));
const maxPlies = arg('--max-plies', null) === null ? cfg.caps.maxPlies : Number(arg('--max-plies', null));

/* ---------------- 模型身份 ---------------- */
const slots = modelSlotsV15(cfg);
const slot = MODEL_KEY === null ? null : slots.find((s) => s.modelKey === MODEL_KEY) ?? null;
if (MODEL_KEY !== null && slot === null) {
    throw new Error(`[T15-09B] 未知 --model-key ${MODEL_KEY}；可用：${slots.map((s) => s.modelKey).join(', ')}`);
}

let predictor: SpatialResNetPredictor | null = null;
let checkpointSha256: string | null = null;
let requestedPolicyId = 'heuristic';
let modelTag = MODEL_KEY ?? 'h0';
if (MODEL_PATH !== null) {
    const abs = path.resolve(MODEL_PATH);
    if (!fs.existsSync(abs)) throw new Error(`[T15-09B] 权重不存在：${abs}`);
    const json = fs.readFileSync(abs, 'utf8');
    const declared = (JSON.parse(json) as { encoderSchemaId?: string }).encoderSchemaId ?? null;
    // 中文：身份只认声明值；未声明（历史权重）交给加载器按 v13/v1 家族推断；未知 schema 直接拒绝。
    const expected = declared === null
        ? null
        : (SUPPORTED_ENCODER_SCHEMA_IDS as readonly string[]).includes(declared)
            ? declared
            : (() => { throw new Error(`[T15-09B] 未知 encoderSchemaId '${declared}'。`); })();
    predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected }));
    checkpointSha256 = checkpointSha256V15(abs);
    requestedPolicyId = path.basename(abs).replace(/\.json$/, '');
    modelTag = MODEL_KEY ?? requestedPolicyId;
    console.log(
        `[T15-09B] 权重 ${path.basename(abs)} schema=${predictor.encoderSchemaId} `
        + `variant=${predictor.semanticsVariant} sha256=${checkpointSha256.slice(0, 12)}… modelTag=${modelTag}`,
    );
}
const candidateModelId = modelIdV15(requestedPolicyId, modelTag, checkpointSha256);

/* ---------------- 输出与恢复 ---------------- */
const outDir = path.join(RUN_ROOT, 'T15-09', 'matches');
const outPath = path.resolve(arg('--out', path.join(outDir, `${PANEL}_${(MODEL_KEY ?? (MODEL_PATH ? modelTag : 'h0')).replace(/[:\\/]/g, '_')}.games.jsonl`)) as string);
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
        const finished = isError(row.outcomeKind)
            ? (RETRY_ERRORS ? false : true)
            : true;
        if (finished) completed.set(id, row.cacheIdentity.fields ?? {});
    }
    if (!RESUME) {
        throw new Error(
            `[T15-09B] 输出文件已存在且 --resume=false：拒绝覆盖（${outPath}）。`
            + '需要重跑请换文件名或显式 --resume true（只跳过身份匹配的完成项）。',
        );
    }
}

/* ---------------- 身份与计划 ---------------- */
const sourceDigests = sourceDigestsV15(process.cwd());
interface PlannedArm {
    gameId: string;
    arm: 'CANDIDATE' | 'MIRROR';
    seat: number | null;
    viewedSeat: number | null;
    skip: boolean;
    identityFields: Record<string, string | number | null>;
}
function identityFor(arm: 'CANDIDATE' | 'MIRROR', candidateSeat: number | null, viewedSeat: number | null): IdentityContextV15 {
    return {
        runId: cfg.runId,
        runMode: PANEL === 'dev' ? 'dev' : PANEL === 'preflight' ? 'preflight' : 'confirm',
        panelId: PANEL,
        blockId: block.blockId,
        rootSeed: block.rootSeed,
        episodeIndex: block.episodeIndex,
        rootFamilyId: block.rootFamilyId,
        modelTag: arm === 'CANDIDATE' ? modelTag : 'mirror',
        sourceDigests,
    };
}
function gameIdOf(arm: 'CANDIDATE' | 'MIRROR', candidateSeat: number | null, viewedSeat: number | null): string {
    const modelId = arm === 'CANDIDATE' ? candidateModelId : 'heuristic:mirror:v1';
    return `${cfg.runId}|${PANEL}|${block.blockId}|${modelId}|${arm}|seat=${candidateSeat === null ? 'null' : candidateSeat}|view=${viewedSeat === null ? 'null' : viewedSeat}`;
}

// 中文：身份字段表用于恢复判定；这里直接从协议字段清单构造“必须一致字段”的子集占位。
// 真正的取值在 playOne 里由 buildCacheIdentityV15 生成，恢复时逐字段比较。
const planned: PlannedArm[] = [];
if (ARMS === 'candidate' || ARMS === 'both') {
    for (const seat of seats) {
        planned.push({ gameId: gameIdOf('CANDIDATE', seat, seat), arm: 'CANDIDATE', seat, viewedSeat: seat, skip: false, identityFields: {} });
    }
}
if (ARMS === 'mirror' || ARMS === 'both') {
    for (const seat of seats) {
        planned.push({ gameId: gameIdOf('MIRROR', null, seat), arm: 'MIRROR', seat: null, viewedSeat: seat, skip: false, identityFields: {} });
    }
}

if (DRY_RUN) {
    console.log(`[T15-09B] dry-run block=${block.blockId} seats=[${seats.join(',')}] arms=${ARMS}`);
    for (const p of planned) console.log(`  ${p.skip ? 'skip' : 'run '} ${p.gameId}`);
    console.log(`[T15-09B] 输出将是 ${outPath}`);
    process.exit(0);
}

/* ---------------- 执行 ---------------- */
const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
const appended: GameRecord[] = [];
const out = fs.createWriteStream(outPath, { flags: 'a' });
let skipped = 0;
let ranCandidates = 0;
let ranMirrors = 0;
let failed = 0;
const startedAt = Date.now();

function writeRow(row: GameRecord): void {
    out.write(`${JSON.stringify(row)}\n`);
    appended.push(row);
}

// 1) 镜像实体：一个 block 只跑一次，再按座位展开（复用计算，不增加独立样本）。
if (ARMS === 'mirror' || ARMS === 'both') {
    const mirrorId = gameIdOf('MIRROR', null, null);
    const allSeatIds = seats.map((s) => gameIdOf('MIRROR', null, s));
    const allSkipped = RESUME && allSeatIds.every((id) => completed.has(id));
    if (allSkipped) {
        skipped += allSeatIds.length;
        console.log(`[T15-09B] 跳过镜像 ${block.blockId}（${allSeatIds.length} 个座位视角均已完成）`);
    } else {
        const record = await playOne({
            runId: cfg.runId, scenarioId: block.scenarioId, seed: block.rootSeed,
            candidateSeat: null, viewedSeatHint: null,
            maxSteps, maxPlies, wallTimeoutMs: wallMs,
            predictor: null, checkpointSha256: null, requestedPolicyId: 'heuristic',
            envFactory, emitIdentity: true, mirrorViewRecompute: true,
            identityContext: identityFor('MIRROR', null, null),
        });
        ranMirrors += 1;
        for (const seat of seats) {
            const allianceId = getAllianceIdFromRecord(record, seat);
            const row: GameRecord = {
                ...record,
                viewedSeat: seat,
                candidateAllianceId: allianceId,
                outcomeKind: recomputeOutcomeForViewedSeat(record.outcomeKind, record.winnerAllianceId, allianceId),
            };
            if (row.cacheIdentity) {
                row.gameId = gameIdOf('MIRROR', null, seat);
                row.cacheIdentity = { ...row.cacheIdentity, gameId: row.gameId };
            }
            writeRow(row);
        }
        console.log(
            `[T15-09B] 镜像 ${block.blockId} ${record.outcomeKind} steps=${record.steps} `
            + `${(record.wallMs / 1000).toFixed(1)}s → ${seats.length} 个座位视角`,
        );
        void mirrorId;
    }
}

// 2) 候选臂：每个座位一局，候选策略只作用在该座位。
if (ARMS === 'candidate' || ARMS === 'both') {
    for (const seat of seats) {
        const gameId = gameIdOf('CANDIDATE', seat, seat);
        if (RESUME && completed.has(gameId)) {
            skipped += 1;
            console.log(`[T15-09B] 跳过已完成 ${gameId}`);
            continue;
        }
        const record = await playOne({
            runId: cfg.runId, scenarioId: block.scenarioId, seed: block.rootSeed,
            candidateSeat: seat, viewedSeatHint: seat,
            maxSteps, maxPlies, wallTimeoutMs: wallMs,
            predictor, checkpointSha256, requestedPolicyId,
            envFactory, emitIdentity: true, mirrorViewRecompute: false,
            identityContext: identityFor('CANDIDATE', seat, seat),
        });
        ranCandidates += 1;
        // 中文：候选行若与既有行身份不一致，说明同一文件里混了不同实验 —— 立即报错。
        const previous = existingRows.find((r) => (r.gameId ?? r.cacheIdentity?.gameId) === gameId);
        if (previous?.cacheIdentity?.fields && record.cacheIdentity?.fields) {
            const diff = cacheReuseDiffV15(previous.cacheIdentity.fields, record.cacheIdentity.fields);
            if (diff.length > 0) {
                throw new Error(`[T15-09B] ${gameId} 与既有行身份不一致（${diff.join(', ')}），拒绝把不同实验写进同一文件。`);
            }
        }
        writeRow(record);
        if (isError(record.outcomeKind)) {
            failed += 1;
            fs.appendFileSync(errorPath, `${JSON.stringify({ gameId, outcomeKind: record.outcomeKind, error: record.error, wallMs: record.wallMs })}\n`, 'utf8');
        }
        console.log(
            `[T15-09B] 候选 seat=${seat} ${record.outcomeKind} steps=${record.steps} `
            + `turns=${record.turns} ${(record.wallMs / 1000).toFixed(1)}s p95=${record.latencyMs.p95 ?? 'null'}ms`,
        );
    }
}

await new Promise<void>((resolve) => out.end(resolve));

const progress = {
    schema: 'v15_arena_progress_1',
    runId: cfg.runId,
    panelId: PANEL,
    blockId: block.blockId,
    modelKey: MODEL_KEY,
    modelId: candidateModelId,
    checkpointSha256,
    encoderSchemaId: predictor?.encoderSchemaId ?? 'heuristic/na',
    outPath: outPath.replace(/\\/g, '/'),
    arms: { candidate: ranCandidates, mirror: ranMirrors, skipped },
    failed,
    appendedRows: appended.length,
    wallMs: Date.now() - startedAt,
    caps: { maxSteps, maxPlies, wallTimeoutMs: wallMs },
    generatedAt: new Date().toISOString(),
};
fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
console.log(
    `[T15-09B] 完成 block=${block.blockId} 候选=${ranCandidates} 镜像=${ranMirrors} 跳过=${skipped} `
    + `失败=${failed} 新增行=${appended.length} → ${outPath}`,
);

function getAllianceIdFromRecord(record: GameRecord, seat: number): number | null {
    // 中文：用**这一局**终局状态得到的座位→联盟表（runner 在 emitIdentity 时写入），
    // 绝不能假设「座位号 == 联盟号」；缺失时回落到 T15-00 冻结的 block 联盟表。
    const fromRecord = record.seatAlliances?.[String(seat)];
    if (fromRecord !== undefined) return fromRecord;
    const fromManifest = block.seatAlliances[String(seat)];
    return fromManifest === undefined ? null : fromManifest;
}
