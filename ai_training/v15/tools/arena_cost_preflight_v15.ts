/**
 * V15/T15-09A：成本预检（owner A）——在**冻结的成本校准 roots** 上跑极少量真实 H0 对局。
 *
 * 协议 §5.1：先用与训练/开发/确认不相交的成本校准 roots（每图 2 个）检查自然完成与耗时。
 * 本工具只做这件事：
 *
 * 1. 对 `T15-00/root_manifests/cost_preflight_roots.json` 的每个 root 跑一场
 *    **全 H0 镜像**（caps 取协议冻结值：原子动作 12,000 / 墙钟 300,000 ms）；
 * 2. 记录真实墙钟、原子动作数、回合/阶段数、结局分类、每座位视角、动作摘要；
 * 3. 用实测单场时间外推 248 场的串行总墙钟，并与协议 §5.1 的「约 20.7 小时」对照。
 *
 * 外推口徑（两栏并列，**不假装候选臂与 H0 同价**）：
 * - `mirrorOnlyLowerBound`：候选臂按镜像同价（模型推理开销记 0）→ 总墙钟下界；
 * - `historicalRatio`：候选臂 = 实测镜像时间 × (历史 V14b 候选/H0 时间比)，比值从
 *   六份原 games 的 wallMs 直接算出，逐地图给；
 * - `wallCapCeiling`：248 × 300 s 的协议上限（协议 §5.1 的 20.7 小时口径）。
 *
 * **不改协议数值**：本工具只报告，caps 是否需要修订由协议 owner 决定。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/arena_cost_preflight_v15.ts \
 *     --out v15/out/<runId>/T15-09/calibration.json --max-roots 4
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { isNatural, type OutcomeKind } from '../../v13/tools/eval_v3_core';
import { parseGamesJsonl } from '../../v14/tools/eval_v14_aggregate';
import { UNPACK_DIR, SD_PLAN_FILE, playOne, type GameRecord, type IdentityContextV15 } from '../../v14/tools/eval_v14_match';
import { loadFrozenEvalConfigV15, modelSlotsV15, plannedGamesV15, type RootBlockV15 } from './eval_v15_core';
import { sourceDigestsV15 } from './eval_v15_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_ROOT = path.resolve(arg('--run-root', 'v15/out/v15_20260925_core') as string);
const OUT_PATH = path.resolve(arg('--out', path.join(RUN_ROOT, 'T15-09', 'calibration.json')) as string);
const RAW_PATH = path.resolve(arg('--raw', path.join(RUN_ROOT, 'T15-09', 'calibration_runs.jsonl')) as string);
const MAX_ROOTS = Number(arg('--max-roots', '4'));
const V14B = path.resolve('v14/out/v14_20260925_t14b/T14-06/matches');

const cfg = loadFrozenEvalConfigV15(RUN_ROOT);
const blocks: RootBlockV15[] = cfg.costPreflight.slice(0, MAX_ROOTS);
if (blocks.length === 0) throw new Error('[T15-09A] 成本预检清单为空。');
const REUSE_RAW_EARLY = arg('--reuse-raw', null);
for (const p of [OUT_PATH]) {
    if (fs.existsSync(p)) throw new Error(`[T15-09A] 已存在同名产物，拒绝覆盖：${p}`);
}
// 中文：--reuse-raw 时原始记录是**输入**，不能改写；只有真正跑了对局才写新的原始 JSONL。
if (REUSE_RAW_EARLY === null && fs.existsSync(RAW_PATH)) {
    throw new Error(`[T15-09A] 已存在同名产物，拒绝覆盖：${RAW_PATH}`);
}

/* ---------- 1) 历史候选/H0 时间比（逐地图） ---------- */
interface RatioReading { mapName: string; mirrorMeanMs: number; candidateMeanMs: number; ratio: number; mirrorRuns: number; candidateRuns: number }
function historicalCandidateOverMirrorRatio(mapName: string): RatioReading | null {
    const file = mapName.includes('Duel') ? 'duel2p_c1s42.games.jsonl' : 'frozen3p_c1s42.games.jsonl';
    const abs = path.join(V14B, file);
    if (!fs.existsSync(abs)) return null;
    const rows = parseGamesJsonl(fs.readFileSync(abs, 'utf8')) as Array<Record<string, unknown>>;
    const mirrorBySeed = new Map<number, number>();
    const candidate: number[] = [];
    for (const r of rows) {
        const seed = Number(r.seed);
        const wall = Number(r.wallMs);
        if (!Number.isFinite(wall)) continue;
        if (r.arm === 'MIRROR') {
            // 中文：镜像按座位展开成多行，同一份计算只算一次（取该 seed 的第一条）。
            if (!mirrorBySeed.has(seed)) mirrorBySeed.set(seed, wall);
        } else if (r.arm === 'CANDIDATE') {
            candidate.push(wall);
        }
    }
    const mirrors = [...mirrorBySeed.values()];
    if (mirrors.length === 0 || candidate.length === 0) return null;
    const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
    return {
        mapName,
        mirrorMeanMs: mean(mirrors),
        candidateMeanMs: mean(candidate),
        ratio: mean(candidate) / mean(mirrors),
        mirrorRuns: mirrors.length,
        candidateRuns: candidate.length,
    };
}
const ratioByMap: Record<string, RatioReading | null> = {};
for (const map of cfg.panel.maps) ratioByMap[map] = historicalCandidateOverMirrorRatio(map);

/* ---------- 2) 真实 H0 对局 ---------- */
const sourceDigests = sourceDigestsV15(process.cwd());
const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

interface RunReading {
    blockId: string;
    mapName: string;
    scenarioId: string;
    rootSeed: number;
    episodeIndex: number;
    rootFamilyId: string;
    wallMs: number;
    steps: number;
    turns: number;
    plies: number;
    outcomeKind: OutcomeKind;
    natural: boolean;
    winnerAllianceId: number | null;
    perSeatOutcome: Array<{ seat: number; allianceId: number | null; viewedOutcome: OutcomeKind; natural: boolean }>;
    actionDigest: string;
    trajectoryDigest: string;
    filteredSurrenderBySeat: Record<string, number>;
    gameId: string | null;
    cacheIdentityKey: string | null;
    identityFieldsPresent: string[];
    maxSteps: number;
    maxPlies: number | null;
    wallTimeoutMs: number;
}
const runs: RunReading[] = [];
const rawRows: GameRecord[] = [];

/** 把一行真实记录展开成读数（含每座位视角）。`--reuse-raw` 时用于免重跑复算。 */
function readingFromRecord(block: RootBlockV15, record: GameRecord): RunReading {
    const perSeat = block.candidateSeats.map((seat) => {
        const allianceId = record.seatAlliances?.[String(seat)] ?? block.seatAlliances[String(seat)] ?? seat;
        let viewed: OutcomeKind = record.outcomeKind;
        if (record.winnerAllianceId !== null && record.winnerAllianceId !== -1) {
            viewed = record.winnerAllianceId === allianceId ? 'NATURAL_WIN' : 'NATURAL_LOSS';
        } else if (record.winnerAllianceId === -1) {
            viewed = 'NATURAL_DRAW';
        }
        return { seat, allianceId, viewedOutcome: viewed, natural: isNatural(viewed) };
    });
    return {
        blockId: block.blockId,
        mapName: block.mapName,
        scenarioId: block.scenarioId,
        rootSeed: block.rootSeed,
        episodeIndex: block.episodeIndex,
        rootFamilyId: block.rootFamilyId,
        wallMs: record.wallMs,
        steps: record.steps,
        turns: record.turns,
        plies: record.plies,
        outcomeKind: record.outcomeKind,
        natural: isNatural(record.outcomeKind),
        winnerAllianceId: record.winnerAllianceId,
        perSeatOutcome: perSeat,
        actionDigest: record.actionDigest,
        trajectoryDigest: record.trajectoryDigest,
        filteredSurrenderBySeat: record.filteredSurrenderBySeat,
        gameId: record.gameId ?? null,
        cacheIdentityKey: record.cacheIdentity?.key ?? null,
        identityFieldsPresent: Object.keys(record.cacheIdentity?.fields ?? {}).sort(),
        maxSteps: cfg.caps.maxStepsAtomicActions,
        maxPlies: cfg.caps.maxPlies,
        wallTimeoutMs: cfg.caps.wallTimeoutMs,
    };
}

const REUSE_RAW = REUSE_RAW_EARLY;
if (REUSE_RAW !== null) {
    // 中文：免重跑复算路径——只读既有原始记录，重算外推与完成率。
    // 用途：修正/补充外推口径时不重复消耗真实对局时间，且保证读数来源可追溯。
    const abs = path.resolve(REUSE_RAW);
    if (!fs.existsSync(abs)) throw new Error(`[T15-09A] --reuse-raw 文件不存在：${abs}`);
    const rows = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as GameRecord);
    for (const record of rows) {
        const block = blocks.find((b) => b.scenarioId === record.scenarioId && b.rootSeed === record.seed);
        if (!block) throw new Error(`[T15-09A] --reuse-raw 的行无法对应到成本预检 block（scenario=${record.scenarioId} seed=${record.seed}）。`);
        rawRows.push(record);
        runs.push(readingFromRecord(block, record));
    }
    console.log(`[T15-09A] --reuse-raw：复用 ${rows.length} 行真实记录，不重跑对局`);
} else {
    console.log(`[T15-09A] 成本预检：${blocks.length} 个 root，caps=原子动作 ${cfg.caps.maxStepsAtomicActions} / 墙钟 ${cfg.caps.wallTimeoutMs} ms`);
    for (const block of blocks) {
        const identityContext: IdentityContextV15 = {
            runId: cfg.runId,
            runMode: 'preflight',
            panelId: 'preflight',
            blockId: block.blockId,
            rootSeed: block.rootSeed,
            episodeIndex: block.episodeIndex,
            rootFamilyId: block.rootFamilyId,
            modelTag: 'mirror',
            sourceDigests,
        };
        const started = Date.now();
        const record = await playOne({
            runId: cfg.runId,
            scenarioId: block.scenarioId,
            seed: block.rootSeed,
            candidateSeat: null,
            viewedSeatHint: null,
            maxSteps: cfg.caps.maxStepsAtomicActions,
            maxPlies: cfg.caps.maxPlies,
            wallTimeoutMs: cfg.caps.wallTimeoutMs,
            predictor: null,
            checkpointSha256: null,
            requestedPolicyId: 'heuristic',
            envFactory,
            emitIdentity: true,
            identityContext,
            mirrorViewRecompute: true,
        });
        rawRows.push(record);
        runs.push(readingFromRecord(block, record));
        console.log(
            `[T15-09A] ${block.blockId} ${block.mapName} seed=${block.rootSeed} -> ${record.outcomeKind} ` +
            `steps=${record.steps} turns=${record.turns} ${(record.wallMs / 1000).toFixed(1)}s（含环境构造 ${((Date.now() - started) / 1000).toFixed(1)}s）`,
        );
    }
}

/* ---------- 3) 外推 248 场 ---------- */
const slots = modelSlotsV15(cfg);
const planned = plannedGamesV15(cfg, slots);
const mirrorPlanned = planned.filter((g) => g.arm === 'MIRROR');
const candidatePlanned = planned.filter((g) => g.arm === 'CANDIDATE');

/** 每地图实测镜像时间：同图多个 root 取均值（无该图实测时为 null）。 */
const measuredByMap: Record<string, { meanMs: number; runs: number; steps: number; naturalRuns: number }> = {};
for (const map of cfg.panel.maps) {
    const list = runs.filter((r) => r.mapName === map);
    if (list.length === 0) continue;
    measuredByMap[map] = {
        meanMs: list.reduce((a, r) => a + r.wallMs, 0) / list.length,
        runs: list.length,
        steps: list.reduce((a, r) => a + r.steps, 0) / list.length,
        naturalRuns: list.filter((r) => r.natural).length,
    };
}

function extrapolate(useRatio: boolean): Record<string, unknown> {
    const perMap: Array<Record<string, unknown>> = [];
    let totalMs = 0;
    for (const map of cfg.panel.maps) {
        const measured = measuredByMap[map];
        const mirrors = mirrorPlanned.filter((g) => g.mapName === map).length;
        const candidates = candidatePlanned.filter((g) => g.mapName === map).length;
        if (!measured) {
            perMap.push({ map, mirrors, candidates, measuredMs: null, mirrorMs: null, candidateMs: null, subtotalMs: null, note: '无该地图实测' });
            continue;
        }
        const ratio = useRatio ? (ratioByMap[map]?.ratio ?? 1) : 1;
        const mirrorMs = measured.meanMs;
        const candidateMs = measured.meanMs * ratio;
        const subtotal = mirrors * mirrorMs + candidates * candidateMs;
        totalMs += subtotal;
        perMap.push({
            map,
            mirrors,
            candidates,
            measuredMirrorMeanMs: mirrorMs,
            candidateFactorFromHistory: ratio,
            candidateMeanMs: candidateMs,
            subtotalMs: subtotal,
            subtotalHours: subtotal / 3_600_000,
        });
    }
    return {
        perMap,
        totalMs,
        totalHours: totalMs / 3_600_000,
        model: useRatio
            ? '候选臂用时 = 实测 H0 镜像用时 × 历史候选/H0 时间比（逐地图）'
            : '候选臂用时 = 实测 H0 镜像用时（模型推理开销记 0，下界）',
    };
}

const lowerBound = extrapolate(false);
const withRatio = extrapolate(true);
const capCeilingHours = cfg.panel.totalMatches * (cfg.caps.wallTimeoutMs / 3_600_000);

const h0NaturalCompletion = {
    runs: runs.length,
    naturalRuns: runs.filter((r) => r.natural).length,
    naturalRate: runs.length ? runs.filter((r) => r.natural).length / runs.length : 0,
    perSeatViews: runs.reduce((a, r) => a + r.perSeatOutcome.length, 0),
    perSeatViewNatural: runs.reduce((a, r) => a + r.perSeatOutcome.filter((s) => s.natural).length, 0),
    byOutcome: runs.reduce((acc: Record<string, number>, r) => {
        acc[r.outcomeKind] = (acc[r.outcomeKind] ?? 0) + 1;
        return acc;
    }, {}),
};

const protocolEstimate = {
    source: '协议 §5.1',
    serialWallClockCeilingHours: cfg.panel.serialWallClockCeilingHours,
    formula: '248 场 × 300 s = 20.7 h',
    capCeilingHours,
    capCeilingMatches: cfg.panel.totalMatches,
};

const calibration = {
    schema: 'v15_cost_calibration_1',
    task: 'T15-09A',
    owner: 'A',
    generatedAt: new Date().toISOString(),
    purpose: '用少量真实 H0 对局校准 248 场开发面板的串行墙钟；不执行 240 臂面板、不训练',
    caps: cfg.caps,
    costPreflightRoots: blocks.map((b) => ({
        blockId: b.blockId, mapName: b.mapName, rootSeed: b.rootSeed,
        episodeIndex: b.episodeIndex, rootFamilyId: b.rootFamilyId, candidateSeats: b.candidateSeats,
    })),
    independenceNote: '成本预检 roots 与训练/开发/确认 roots 不相交（T15-00/root_manifests 的 usedRootIntersection 已核）',
    sourceDigests: {
        format: sourceDigests.engine.format,
        engineSourceDigest: sourceDigests.engine.digest,
        policySourceDigest: sourceDigests.policy.digest,
    },
    runs,
    measuredByMap,
    h0NaturalCompletion,
    extrapolation: {
        planned: {
            candidateArms: candidatePlanned.length,
            mirrorEntities: mirrorPlanned.length,
            totalMatches: planned.length,
            byMap: cfg.panel.maps.map((map) => ({
                map,
                candidates: candidatePlanned.filter((g) => g.mapName === map).length,
                mirrors: mirrorPlanned.filter((g) => g.mapName === map).length,
            })),
        },
        historicalRatioBasis: ratioByMap,
        historicalRatioInterpretation: {
            note:
                '历史候选/H0 时间比 < 1 是**混合效应**，不能当作“模型推理更快”：'
                + '(a) 模型每次决策的推理开销使候选臂变慢；(b) 候选对局本身走得更短（提前结束/被压制）使墙钟变短，'
                + '在 V14b 里 (b) 占主导。因此该栏只作为“同一批旧数据的经验量级”，'
                + '真正的候选臂成本必须在 T15-09B 用真实 V15 权重实测。',
            modelInferenceOverheadMeasured: false,
            why: 'T15-09B 之前没有身份可解析的 V15 权重（C2 训练产物缺失），无法在预检阶段测推理开销',
        },
        mirrorOnlyLowerBound: lowerBound,
        withHistoricalRatio: withRatio,
        protocolEstimate,
        comparison: {
            lowerBoundHours: lowerBound.totalHours,
            withRatioHours: withRatio.totalHours,
            protocolEstimateHours: protocolEstimate.serialWallClockCeilingHours,
            lowerBoundVsProtocol: Number(lowerBound.totalHours) <= protocolEstimate.serialWallClockCeilingHours,
            withRatioVsProtocol: Number(withRatio.totalHours) <= protocolEstimate.serialWallClockCeilingHours,
            note:
                '每场 300 s 是 caps 上限而非实测均值：实测均值 × 计划场次给出实际预期墙钟，'
                + '20.7 h 是「每场都跑满 300 s」的最坏串行上界。两者口径不同，必须并列。',
        },
    },
    environmentNote:
        '本次预检与 C2 训练并发（8 torch 线程占用 CPU）；实测墙钟包含该负载，属于协议 §5.2 要求的'
        + '「协议相同但受墙钟负载影响时报告环境与截断限制」。单线程 Node 进程间无共享状态。',
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
if (REUSE_RAW === null) {
    fs.writeFileSync(RAW_PATH, `${rawRows.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
}
fs.writeFileSync(OUT_PATH, `${JSON.stringify(calibration, null, 2)}\n`, 'utf8');

console.log(
    `[T15-09A] 外推：下界 ${Number(lowerBound.totalHours).toFixed(2)} h；`
    + `按历史候选/H0 比 ${Number(withRatio.totalHours).toFixed(2)} h；协议上界 ${protocolEstimate.serialWallClockCeilingHours} h`,
);
console.log(`[T15-09A] H0 自然完成 ${h0NaturalCompletion.naturalRuns}/${h0NaturalCompletion.runs}（按座位 ${h0NaturalCompletion.perSeatViewNatural}/${h0NaturalCompletion.perSeatViews}）`);
console.log(`[T15-09A] -> ${OUT_PATH}`);
console.log(`[T15-09A] -> ${RAW_PATH}`);
