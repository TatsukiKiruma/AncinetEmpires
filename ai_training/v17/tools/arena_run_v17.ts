/**
 * V17/T17-04：五图对局执行器（v17 版）。
 *
 * 结构沿用 `v16/tools/arena_run_v16.ts`（逐行 gameId、身份匹配恢复、错误不伪造、
 * 身份不一致拒绝续写），新增两条**教师臂**：
 *
 *   --policy b100r   B100-R：逐局持久随机流的 BattleSearchAI 教师
 *   --policy b100q   B100-Q：每个状态确定性重新播种的 BattleSearchAI 教师
 *
 * 面板（DEV20 / RECHECK40 / CONFIRM20）沿用 V16 协议常量：DEV20 保持旧 seed，
 * 用于纵向进度；CONFIRM20 在冻结模型前不得运行。
 *
 * 用法（真实可复制）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/arena_run_v17.ts `
 *     --run-id v17_20260926_r2 --panel dev --arms candidate --policy b100q `
 *     --out v17/out/v17_20260926_r2/teacher/arena/b100q.dev.games.jsonl
 *
 * 只跑模型臂：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/arena_run_v17.ts `
 *     --panel dev --model v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json --model-key P1:s2026
 *
 * 关键纪律：
 * - caps 冻结为 12,000 原子动作 / 900 秒（`V16_DEFAULT_CAPS`）；只能收紧，放宽须显式传。
 * - 教师臂不做网络前向；教师返回的动作必须落在引擎原生合法集（已过滤 surrender）内，
 *   否则**不静默回退 H0**，直接按 ERROR 记账并终止该局。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
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
import { cacheReuseDiffV15, type RunModeV15 } from '../../v14/tools/eval_v14_protocol';
import {
    V16_DEFAULT_CAPS,
    V16_INITIALIZATION_POLICY_ID,
    V16_PANELS,
    V16_CAPS_ID,
    blocksForPanelV16,
    type V16Block,
} from '../../v16/tools/eval_v16_protocol';
import { sourceDigestsV16 } from '../../v16/tools/eval_v16_identity';
import { checkpointSha256V15, modelIdV15 } from '../../v15/tools/eval_v15_identity';

export const V17_RUN_ID_DEFAULT = 'v17_20260926_r2';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(name);

const RUN_ID = arg('--run-id', V17_RUN_ID_DEFAULT) as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v17/out/${RUN_ID}`) as string);
const PANEL = arg('--panel', 'dev') as string;
const BLOCKS_ARG = arg('--blocks', null);
const SHARD = arg('--shard', null);
const MODEL_PATH = arg('--model', null);
const MODEL_KEY = arg('--model-key', null);
const POLICY = arg('--policy', 'auto') as 'auto' | 'model' | 'h0' | 'b100r' | 'b100q';
const ARMS = arg('--arms', 'candidate') as 'candidate' | 'mirror' | 'both';
const RESUME = arg('--resume', 'true') !== 'false';
const RETRY_ERRORS = arg('--retry-errors', 'true') !== 'false';
const DRY_RUN = flag('--dry-run');

const spec = V16_PANELS[PANEL];
if (!spec) throw new Error(`[T17-04] 未知 --panel '${PANEL}'；可用：${Object.keys(V16_PANELS).join(', ')}。`);
if (PANEL === 'confirm' && arg('--allow-confirm', 'false') !== 'true') {
    throw new Error('[T17-04] CONFIRM20 只有在模型冻结后才允许运行；确认后显式传 --allow-confirm true。');
}

/* ---------------- block 选择 ---------------- */
const allBlocks = blocksForPanelV16(PANEL);
let blocks: V16Block[];
if (BLOCKS_ARG !== null) {
    const wanted = BLOCKS_ARG.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const byId = new Map(allBlocks.map((b) => [b.blockId, b]));
    blocks = wanted.map((id) => {
        const b = byId.get(id);
        if (!b) throw new Error(`[T17-04] panel=${PANEL} 里没有 block ${id}。`);
        return b;
    });
} else if (SHARD !== null) {
    const [iRaw, nRaw] = SHARD.split('/');
    const i = Number(iRaw);
    const n = Number(nRaw);
    if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 0 || i >= n) {
        throw new Error(`[T17-04] --shard 需要 i/n 形式且 0<=i<n，实际 '${SHARD}'。`);
    }
    blocks = allBlocks.filter((_, idx) => idx % n === i);
} else {
    blocks = allBlocks;
}
if (blocks.length === 0) throw new Error('[T17-04] 没有选中任何 block。');

/* ---------------- caps ---------------- */
const maxSteps = Number(arg('--max-steps', String(V16_DEFAULT_CAPS.maxStepsAtomicActions)));
const wallMs = Number(arg('--wall-ms', String(V16_DEFAULT_CAPS.wallTimeoutMs)));
const maxPlies = arg('--max-plies', null) === null || arg('--max-plies', null) === 'null'
    ? V16_DEFAULT_CAPS.maxPlies
    : Number(arg('--max-plies', null));
if (maxSteps !== V16_DEFAULT_CAPS.maxStepsAtomicActions || wallMs !== V16_DEFAULT_CAPS.wallTimeoutMs) {
    console.warn(`[T17-04] ⚠ caps 与冻结默认不同：steps=${maxSteps} wallMs=${wallMs}（capsId=${V16_CAPS_ID}）。`);
}

/* ---------------- 模型身份 ---------------- */
let predictor: SpatialResNetPredictor | null = null;
let checkpointSha256: string | null = null;
let requestedPolicyId = 'heuristic';
let modelTag = MODEL_KEY ?? 'h0';
const useTeacher = POLICY === 'b100r' || POLICY === 'b100q';
if (MODEL_PATH !== null) {
    if (useTeacher) throw new Error('[T17-04] --model 与教师臂互斥（教师臂不做网络前向）。');
    const abs = path.resolve(MODEL_PATH);
    if (!fs.existsSync(abs)) throw new Error(`[T17-04] 权重不存在：${abs}`);
    const json = fs.readFileSync(abs, 'utf8');
    const declared = (JSON.parse(json) as { encoderSchemaId?: string }).encoderSchemaId ?? null;
    const expected = declared === null
        ? null
        : (SUPPORTED_ENCODER_SCHEMA_IDS as readonly string[]).includes(declared)
            ? declared
            : (() => { throw new Error(`[T17-04] 未知 encoderSchemaId '${declared}'。`); })();
    predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected }));
    checkpointSha256 = checkpointSha256V15(abs);
    requestedPolicyId = path.basename(abs).replace(/\.json$/, '');
    modelTag = MODEL_KEY ?? requestedPolicyId;
    console.log(
        `[T17-04] 权重 ${path.basename(abs)} schema=${predictor.encoderSchemaId} `
        + `variant=${predictor.semanticsVariant} sha256=${checkpointSha256.slice(0, 12)}… modelTag=${modelTag}`,
    );
}
const candidateModelId = modelIdV15(requestedPolicyId, modelTag, checkpointSha256);

/* ---------------- B100 教师臂 ---------------- */
let b100Handles: Array<{ gameId: string; decisions: unknown[]; exceptions: number }> = [];
let b100PolicyFactory: ((ctx: { seed: number; seat: number }) => CandidatePolicyV16) | null = null;
let b100VersionTag = '';
if (useTeacher) {
    const { createB100Policy, B100_TEACHER_VERSION } = await import('../teachers/b100_policy');
    const { b100InputKeyProvider } = await import('../teachers/b100_input_key');
    b100VersionTag = B100_TEACHER_VERSION;
    const variant = POLICY === 'b100r' ? 'B100-R' : 'B100-Q';
    // 中文：B100-Q 的 queryKey 按细则 B3 必须是**网络输入身份**（float32 张量 + 全候选语义），
    // 而不是「看起来像 key 的字符串」。这里注入统一口径的 provider；编码失败时它会返回 null，
    // 教师侧退回已文档化的 state-fallback 并在台账里如实标注 keyKind。
    const inputKeyProvider = POLICY === 'b100q' ? b100InputKeyProvider() : undefined;
    b100PolicyFactory = (ctx) => {
        const handle = createB100Policy({
            variant: variant as 'B100-R' | 'B100-Q',
            rootSeed: ctx.seed,
            seat: ctx.seat,
            ...(inputKeyProvider ? { inputKeyProvider } : {}),
        });
        b100Handles.push({ gameId: `seed=${ctx.seed}|seat=${ctx.seat}`, decisions: handle.decisions, exceptions: handle.exceptions });
        return handle.policy;
    };
    console.log(`[T17-04] B100 教师臂 variant=${variant} version=${B100_TEACHER_VERSION} inputKeyProvider=${inputKeyProvider ? 'on' : 'off'}`);
}

const effectiveModelTag = useTeacher ? `${POLICY}-teacher` : modelTag;
const effectiveModelId = useTeacher ? `search:${POLICY}:${b100VersionTag}` : candidateModelId;

/* ---------------- V17 源码摘要 ---------------- */
function digestFiles(files: readonly string[]): string {
    const h = createHash('sha256');
    for (const rel of files) {
        const abs = path.resolve(process.cwd(), rel);
        h.update(rel);
        h.update(fs.existsSync(abs) ? fs.readFileSync(abs) : Buffer.from('<missing>'));
    }
    return h.digest('hex');
}
const V17_TEACHER_FILES = [
    'v17/teachers/battle_search_b100.ts',
    'v17/teachers/b100_policy.ts',
    'v17/tools/v17_input_identity.ts',
    'v17/tools/arena_run_v17.ts',
] as const;
const teacherDigest = useTeacher ? digestFiles(V17_TEACHER_FILES) : null;

/* ---------------- 输出与恢复 ---------------- */
const defaultOut = path.join(
    RUN_ROOT,
    useTeacher ? 'teacher/arena' : 'arena/dev',
    `${useTeacher ? `${POLICY}` : (MODEL_KEY ?? (MODEL_PATH ? modelTag : 'h0'))}`.replace(/[:\\/]/g, '_')
    + `${SHARD ? `.shard${SHARD.replace('/', 'of')}` : ''}.games.jsonl`,
);
const outPath = path.resolve(arg('--out', defaultOut) as string);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const errorPath = outPath.replace(/\.games\.jsonl$/, '.errors.jsonl');
const progressPath = outPath.replace(/\.games\.jsonl$/, '.progress.json');

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
    if (!RESUME) throw new Error(`[T17-04] 输出文件已存在且 --resume=false：拒绝覆盖（${outPath}）。`);
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
    console.log(`[T17-04] dry-run panel=${PANEL} blocks=${blocks.length} arms=${ARMS} policy=${POLICY} runMode=${runMode}`);
    for (const p of planned) console.log(`  ${completed.has(p.gameId) ? 'skip' : 'run '} ${p.gameId}`);
    console.log(`[T17-04] 输出将是 ${outPath}`);
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

    if (ARMS === 'mirror' || ARMS === 'both') {
        const allSeatIds = block.candidateSeats.map((s) => gameIdOf(block, 'MIRROR', null, s));
        if (RESUME && allSeatIds.every((id) => completed.has(id))) {
            skipped += allSeatIds.length;
            console.log(`[T17-04] 跳过镜像 ${block.blockId}`);
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
            console.log(`[T17-04] 镜像 ${block.blockId} ${record.outcomeKind} steps=${record.steps} ${(record.wallMs / 1000).toFixed(1)}s`);
        }
    }

    if (ARMS === 'candidate' || ARMS === 'both') {
        for (const seat of block.candidateSeats) {
            const gameId = gameIdOf(block, 'CANDIDATE', seat, seat);
            if (RESUME && completed.has(gameId)) {
                skipped += 1;
                console.log(`[T17-04] 跳过已完成 ${gameId}`);
                continue;
            }
            const policyOverride = b100PolicyFactory ? b100PolicyFactory({ seed: block.rootSeed, seat }) : undefined;
            const record = await playOne({
                runId: RUN_ID, scenarioId: block.scenarioId, seed: block.rootSeed,
                candidateSeat: seat, viewedSeatHint: seat,
                maxSteps, maxPlies, wallTimeoutMs: wallMs,
                predictor, checkpointSha256, requestedPolicyId,
                envFactory, emitIdentity: true, mirrorViewRecompute: false,
                identityContext: identityFor(block, 'CANDIDATE'),
                policyOverride,
            });
            ranCandidates += 1;
            const previous = existingRows.find((r) => (r.gameId ?? r.cacheIdentity?.gameId) === gameId);
            if (previous?.cacheIdentity?.fields && record.cacheIdentity?.fields) {
                const diff = cacheReuseDiffV15(previous.cacheIdentity.fields, record.cacheIdentity.fields);
                if (diff.length > 0) {
                    throw new Error(`[T17-04] ${gameId} 与既有行身份不一致（${diff.join(', ')}），拒绝把不同实验写进同一文件。`);
                }
            }
            writeRow(record);
            rows.push(record);
            if (isError(record.outcomeKind)) {
                failed += 1;
                fs.appendFileSync(errorPath, `${JSON.stringify({ gameId, outcomeKind: record.outcomeKind, error: record.error, wallMs: record.wallMs })}\n`, 'utf8');
            }
            console.log(
                `[T17-04] 候选 ${block.blockId} seat=${seat} ${record.outcomeKind} steps=${record.steps} `
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
            gameId: r.gameId ?? null, arm: r.arm, viewedSeat: r.viewedSeat,
            outcomeKind: r.outcomeKind, winnerAllianceId: r.winnerAllianceId,
            candidateAllianceId: r.candidateAllianceId, steps: r.steps, turns: r.turns,
            plies: r.plies, wallMs: r.wallMs, error: r.error,
        })),
        wallMs: Date.now() - blockStarted,
    });
}

await new Promise<void>((resolve) => out.end(resolve));

const progress = {
    schema: 'v17_arena_progress_1',
    runId: RUN_ID,
    panelId: PANEL,
    panelLabel: spec.label,
    official: spec.official,
    runMode,
    modelKey: useTeacher ? POLICY : MODEL_KEY,
    policy: useTeacher ? `search-${POLICY}` : (MODEL_PATH === null ? 'heuristic' : 'model'),
    teacherId: useTeacher ? POLICY : null,
    teacherVersion: useTeacher ? b100VersionTag : null,
    teacherDigest,
    modelPath: MODEL_PATH === null ? null : path.resolve(MODEL_PATH).replace(/\\/g, '/'),
    modelId: effectiveModelId,
    checkpointSha256,
    encoderSchemaId: predictor?.encoderSchemaId ?? 'heuristic/teacher-na',
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
if (useTeacher && b100Handles.length > 0) {
    const ledgerPath = outPath.replace(/\.games\.jsonl$/, '.decisions.jsonl');
    const flat = b100Handles.flatMap((h, hi) => h.decisions.map((d) => ({ ...(d as object), gameIndex: hi })));
    fs.writeFileSync(ledgerPath, flat.map((r) => JSON.stringify(r)).join('\n') + (flat.length ? '\n' : ''), 'utf8');
    console.log(`[T17-04] B100 决策台账 ${flat.length} 条 → ${ledgerPath}`);
}
fs.writeFileSync(
    outPath.replace(/\.games\.jsonl$/, '.blocks.json'),
    `${JSON.stringify({ schema: 'v17_arena_blocks_1', runId: RUN_ID, panelId: PANEL, blocks: blockSummaries }, null, 2)}\n`,
    'utf8',
);
console.log(
    `[T17-04] 完成 panel=${PANEL} policy=${POLICY} 候选=${ranCandidates} 镜像=${ranMirrors} 跳过=${skipped} `
    + `失败=${failed} 新增行=${appended.length} 用时=${((Date.now() - startedAt) / 1000).toFixed(1)}s → ${outPath}`,
);