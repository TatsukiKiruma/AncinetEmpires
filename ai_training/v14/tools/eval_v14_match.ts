/**
 * V14/T14-05 + T14-06：开发对战执行器（唯一真实对局来源）。
 *
 * 与 v13 的差异（对应 T14-05 要求的修复）：
 * 1. 镜像缓存键包含所有影响结果的配置：scenarioId、seed、maxSteps、maxPlies、
 *    wallTimeoutMs、mirrorPolicyVersion、rulesHash。v13 的键只有 scenarioId#seed#maxSteps，
 *    换 wall 超时或对手版本会错误复用同一镜像。
 * 2. 动作轨迹摘要使用正式 `encodeAction`（覆盖全部 14 种动作类型），不再手工拼 6 个字段。
 * 3. encoderSchema / checkpointSha256 / actualPolicyId 来自真实加载身份；
 *    静默回退被禁止：回退计数与来源都会写进记录。
 * 4. 赢家按联盟视角判定；`winner=-1` 是规则平局，`null` 是未结束。
 * 5. 候选臂只替换指定座位；其他座位为固定版本启发式。镜像 = 全启发式，同种子同座位流。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/eval_v14_match.ts \
 *     --scenario "SDPLAN:sd-normal:(2) Duel.aem" --seeds 1,2,3,4 --candidate-seat 0 \
 *     --candidate <checkpoint.json> --max-steps 20000 --wall-ms 60000 \
 *     --out v14/out/<runId>/T14-06/matches/<name>.games.jsonl
 *
 * V15/T15-09A 追加（**全部为可选新开关，默认关闭 ⇒ 历史行字节语义不变**）：
 * - `--emit-identity true`：每行追加缓存身份（初始状态/地图/引擎/策略/随机流摘要、
 *   caps、runMode、modelId、cacheIdentity.key、gameId）。默认 false 时不写这些字段。
 * - `--mirror-view-recompute true`：写镜像行时按被测座位联盟从 winner 重算 outcomeKind，
 *   原始声明值另存 `mirrorDeclaredOutcomeKind`。默认 false = 历史行为（镜像行恒为自己
 *   视角的分类，聚合器负责重算）。
 * - `--refuse-overwrite true`：输出文件已存在时报错退出，绝不覆盖历史结果。
 * - `--run-mode/--panel-id/--block-id/--root-seed/--episode-index`：身份字段来源。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSdTrainingPlanConfig } from '../../tools/sd_training_state_generator';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, getRuleConfig } from '../../src/game/rule_config';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import {
    ENCODER_SCHEMA_ID_V13,
    ENCODER_SCHEMA_ID_V14,
    SUPPORTED_ENCODER_SCHEMA_IDS,
} from '../../src/game/ai/spatial_tensor_encoder';
import { classifyOutcome, type OutcomeKind } from '../../v13/tools/eval_v3_core';
import {
    buildCacheIdentityV15,
    buildMirrorId,
    MIRROR_POLICY_VERSION_V14,
    HEURISTIC_SCHEMA_ID,
    ACTION_FILTER_ID_V15,
    RNG_CONTRACT_ID_V15,
    type CacheIdentityV15,
    type RunModeV15,
} from './eval_v14_protocol';
import {
    initialStateHashOfV15,
    mapArtifactsV15,
    mapLayoutHashOfV15,
    modelIdV15,
    sourceDigestsV15,
    type SourceDigestsV15,
} from '../../v15/tools/eval_v15_identity';
import { canonicalStateJson as canonicalStateJsonOf } from '../../v15/tools/labeler_l1_v15';
import type { Action, GameState } from '../../src/game/types';

export const UNPACK_DIR = 'APK/_analysis/unpack';
export const SD_PLAN_FILE = 'training_configs/sd_training_plan_20260705.json';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export function sha256(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256File(file: string): string {
    return sha256(fs.readFileSync(file));
}

export function stableStringify(value: unknown): string {
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

/** 规则指纹：与数据集侧同一口径（规则 + 地图尺寸）。 */
export function rulesHashOf(state: GameState): string {
    const rules = getRuleConfig(state) as unknown as Record<string, unknown>;
    return sha256(stableStringify({ rules, map: { width: state.map.width, height: state.map.height } }));
}

function mulberry(a: number): () => number {
    return function next() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 与 v13 相同：每座位独立确定性随机流（同种子同座位 → 同一条流）。 */
export function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}

export interface GameRecord {
    runId: string;
    scenarioId: string;
    seed: number;
    mapName: string;
    playerCount: number;
    maxSteps: number;
    maxPlies: number | null;
    wallTimeoutMs: number;
    mirrorPolicyVersion: string;
    rulesHash: string;
    mirrorId: string;
    arm: 'CANDIDATE' | 'MIRROR';
    candidateSeat: number | null;
    viewedSeat: number | null;
    requestedPolicyId: string;
    actualPolicyId: string;
    fallbackUsed: boolean;
    fallbackReason: string | null;
    checkpointSha256: string | null;
    encoderSchema: string;
    outcomeKind: OutcomeKind;
    winnerAllianceId: number | null;
    candidateAllianceId: number | null;
    steps: number;
    turns: number;
    plies: number;
    engineTransitions: number;
    candidateDecisions: number;
    filteredSurrenderBySeat: Record<string, number>;
    latencyMs: { p50: number | null; p95: number | null; p99: number | null; max: number | null; mean: number | null };
    actionDigest: string;
    trajectoryDigest: string;
    error: string | null;
    wallMs: number;
    earlyEliminationAux: boolean;
    /* ---- V15/T15-09A 可选身份字段：仅当 --emit-identity/identityExtras 打开时写入 ---- */
    /** 对局 ID（protocol.json#gameIds.format）。 */
    gameId?: string;
    /** 运行模式：dev | preflight | confirm。 */
    runMode?: RunModeV15;
    panelId?: string;
    blockId?: string;
    rootSeed?: number;
    episodeIndex?: number;
    rootFamilyId?: string;
    /** 初始状态摘要（与 T15-01 的 stateHashOf 同一规范化口径）。 */
    initialStateHash?: string;
    /** 地图资源原始字节摘要。 */
    mapHash?: string;
    /** 规范化布局摘要（尺寸 + 地块）。 */
    mapLayoutHash?: string;
    /** 引擎/规则源码清单摘要。 */
    engineSourceDigest?: string;
    /** 策略实现源码清单摘要。 */
    policySourceDigest?: string;
    /** 随机流合同 id。 */
    rngContract?: string;
    /** 动作过滤合同 id。 */
    actionFilterVersion?: string;
    /** 权重标签（人读），唯一性由 checkpointSha256 保证。 */
    modelTag?: string;
    /** 缓存身份整体（字段表 + key + gameId），便于逐行复核。 */
    cacheIdentity?: CacheIdentityV15;
    /**
     * 该局座位 → 联盟表（来自终局状态的真实规则配置）。
     *
     * 中文：镜像实体只跑一次却要按多个座位展开视角，展开时必须用**这一局**的真实联盟表，
     * 不能用「座位号等于联盟号」的假设。仅 emitIdentity=true 时写入。
     */
    seatAlliances?: Record<string, number>;
    /**
     * 镜像行「声明值」：本行 outcomeKind 的重算前原始分类。
     *
     * 中文：历史镜像行只按镜像自己的视角分类（视角联盟为 null），于是被测座位 1/2 获胜
     * 也会写成 NATURAL_LOSS。开启 `--mirror-view-recompute` 后 `outcomeKind` 变成按被测
     * 座位联盟从 winner 重算的值，原始声明值保留在本字段，聚合器据此给出对照读数。
     */
    mirrorDeclaredOutcomeKind?: OutcomeKind;
}

/** V16/T16-01：单步 trace 记录（只在 `onStep` 提供时产生；默认完全不影响历史行为）。 */
export interface StepTraceV16 {
    stepIndex: number;
    /** 行动玩家座位。 */
    playerId: number;
    /** 该局真实联盟号（来自状态，不假设座位==联盟）。 */
    allianceId: number;
    /** 本步是否由候选策略决定。 */
    byCandidate: boolean;
    /** 动作前的状态摘要（与 T15-01 的 canonicalStateJson 同一口径）。 */
    stateHashBefore: string;
    /** 动作前完整状态 JSON；`captureStateOnStep=false` 时为 null。 */
    stateBeforeJson: string | null;
    /** 策略允许集合内的全部 actionCode（引擎顺序，供对照）。 */
    legalActionCodes: string[];
    /** 候选臂决定时：规范顺序下的 actionCode 与 logits（未由候选决定时为 null）。 */
    orderedActionCodes: string[] | null;
    actionLogits: number[] | null;
    candidateOrderingId: string | null;
    /** 本步实际执行的 actionCode。 */
    actionCode: string;
    /** 动作后状态。 */
    turnAfter: number;
    terminalAfter: boolean;
    winnerAfter: number | null;
}
export type StepHookV16 = (trace: StepTraceV16) => void;

/**
 * V16/T16-03：候选臂的可注入策略。
 *
 * 中文：正式对局的候选臂原本只有两条路（`predictor` 或 `predictor===null` 时的 H0 启发式）。
 * S1/S2 搜索教师需要走**同一套**对局、身份、RNG 与记录机制，否则教师成绩与模型成绩不可比。
 * 该注入点在候选座位被调用，返回的动作必须属于 `allowed`；不在其中会按「回退」显式记录
 * （`fallbackUsed=true`），绝不静默放行。
 */
export interface CandidatePolicyContextV16 {
    state: GameState;
    playerId: number;
    /** 策略允许集合（已过滤 surrender）。 */
    allowed: readonly Action[];
    /** 候选座位。 */
    seat: number;
    /** 本局 root seed。 */
    seed: number;
}
export type CandidatePolicyV16 = (context: CandidatePolicyContextV16) => Action;

export interface PlayOptions {
    runId: string;
    scenarioId: string;
    seed: number;
    candidateSeat: number | null;
    viewedSeatHint: number | null;
    maxSteps: number;
    maxPlies: number | null;
    wallTimeoutMs: number;
    predictor: SpatialResNetPredictor | null;
    checkpointSha256: string | null;
    requestedPolicyId: string;
    envFactory: any;
    /**
     * V15：是否给返回记录补缓存身份（默认 false ⇒ 历史行不变）。
     */
    emitIdentity?: boolean;
    /** V15：身份字段来源（仅 emitIdentity=true 时使用）。 */
    identityContext?: IdentityContextV15;
    /** V15：镜像行是否按被测座位重算 outcomeKind（默认 false ⇒ 历史行为）。 */
    mirrorViewRecompute?: boolean;
    /**
     * V16/T16-01：可选逐步 trace 钩子。**默认 undefined ⇒ 循环行为与历史逐字节一致**；
     * 提供时在 `engine.step` 之前回调，并在终局后补一次终局 trace。
     */
    onStep?: StepHookV16;
    /** V16：trace 里是否携带完整动作前状态 JSON（默认 false，只带 stateHashBefore）。 */
    captureStateOnStep?: boolean;
    /**
     * V16/T16-03：候选臂策略注入（搜索教师）。默认 undefined ⇒ 行为与历史完全一致。
     * 与 `predictor` 同时提供时本钩子优先（教师臂没有网络前向）。
     */
    policyOverride?: CandidatePolicyV16;
}

/** 身份计算所需的上下文：每次 CLI 运行算一次，逐局复用。 */
export interface IdentityContextV15 {
    runId: string;
    runMode: RunModeV15;
    panelId: string;
    blockId: string;
    rootSeed: number;
    episodeIndex: number;
    rootFamilyId: string;
    modelTag: string;
    sourceDigests: SourceDigestsV15;
}

export function percentile(sorted: number[], q: number): number | null {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * 镜像行按座位视角重贴 `candidateAllianceId`。
 *
 * 镜像只运行一次（同一种子下每个座位的启发式随机流是固定的），但聚合器需要知道
 * “这一行报告的是哪个座位的视角”。种子与规则相同 ⇒ 各座位联盟不变，因此可以用
 * 同一份记录按座位重贴视角，而不是把同一局当成多个独立对局。
 */
function getAllianceIdFromMirror(mirror: GameRecord, seat: number): number | null {
    const alliances = mirrorSeatAlliances[mirror.mirrorId];
    if (!alliances) return null;
    const value = alliances[String(seat)];
    return value === undefined ? null : value;
}

/** mirrorId → { seat: allianceId }，由 playOne 在真实状态上填好。 */
const mirrorSeatAlliances: Record<string, Record<string, number>> = {};

/**
 * 跑一局（T15-09A：从私有函数改为导出，供 V15 arena runner 复用同一实现）。
 *
 * 中文：**只增加可选行为**。`emitIdentity`/`identityContext`/`mirrorViewRecompute` 未提供时，
 * 返回值与历史版本逐字段一致（不含任何 V15 身份字段）。
 */
export async function playOne(options: PlayOptions): Promise<GameRecord> {
    const {
        runId, scenarioId, seed, candidateSeat, maxSteps, maxPlies, wallTimeoutMs,
        predictor, checkpointSha256, requestedPolicyId, envFactory,
    } = options;
    const emitIdentity = options.emitIdentity === true;
    const identityContext = options.identityContext;
    if (emitIdentity && !identityContext) {
        throw new Error('[T15-09A] playOne: emitIdentity=true 时必须提供 identityContext（身份字段不得缺省）。');
    }
    const mapName = scenarioId.split(':').pop() as string;
    const episode = {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
        seed, maxPlies: maxPlies ?? 1200, maxSteps,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;

    const env = await envFactory.createEnv(episode);
    env.reset(seed);
    const engine = env.getEngine();
    const initialState = engine.getState();
    const rulesHash = rulesHashOf(initialState);
    const playerIds: number[] = initialState.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const seatAi = new Map<number, HeuristicAI>();
    for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));

    const mirrorId = buildMirrorId({
        scenarioId, seed, maxSteps, maxPlies: maxPlies ?? null,
        wallTimeoutMs, mirrorPolicyVersion: MIRROR_POLICY_VERSION_V14, rulesHash,
    });
    // 中文：身份摘要在**对局开始前**算好：初始状态 / 地图资源 / 布局 / 引擎与策略源码。
    const identityArtifacts = emitIdentity
        ? {
            initialStateHash: initialStateHashOfV15(initialState),
            mapLayoutHash: mapLayoutHashOfV15(initialState),
            map: mapArtifactsV15(UNPACK_DIR, scenarioId),
        }
        : null;
    // 中文：schema 身份只认预测器自己声明的 `encoderSchemaId`（T15-02 新增的只读字段），
    // 不再用通道数/语义维度猜测——V14 与 V15 的形状完全相同。
    const encoderSchemaId: string = predictor !== null ? predictor.encoderSchemaId : HEURISTIC_SCHEMA_ID;

    const actionCodes: string[] = [];
    const latencies: number[] = [];
    const filteredSurrenderBySeat: Record<string, number> = {};
    let steps = 0;
    let engineError: string | null = null;
    let policyError: string | null = null;
    let wallTimeout = false;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;
    let candidateDecisions = 0;
    const startedAt = Date.now();
    const isCandidateArm = candidateSeat !== null;

    while (!engine.isTerminal() && steps < maxSteps) {
        if (Date.now() - startedAt > wallTimeoutMs) { wallTimeout = true; break; }
        const state = engine.getState();
        const current = state.currentPlayer;
        // 策略允许集合：引擎合法集去掉 surrender。候选与镜像使用同一过滤，并分别计数。
        const legal = engine.getLegalActions(current);
        const allowed = legal.filter((a) => a.type !== 'surrender');
        const filtered = legal.length - allowed.length;
        if (filtered > 0) {
            filteredSurrenderBySeat[String(current)] = (filteredSurrenderBySeat[String(current)] ?? 0) + filtered;
        }

        let action: Action | null = null;
        let candidateTrace: { ordered: string[]; logits: number[]; orderingId: string } | null = null;
        if (isCandidateArm && current === candidateSeat) {
            if (allowed.length === 0) { policyError = 'no policy-allowed action'; break; }
            const at = Date.now();
            try {
                if (options.policyOverride !== undefined) {
                    // V16/T16-03：搜索教师臂。返回动作仍要过策略允许集合检查（下方统一校验）。
                    action = options.policyOverride({
                        state, playerId: current, allowed, seat: candidateSeat as number, seed,
                    });
                } else if (predictor === null) {
                    // 启发式候选（对照臂）：与镜像座位使用完全相同的调用约定
                    // （candidates=undefined，让启发式自己基于引擎合法集打分），
                    // 否则候选臂的启发式会看到被过滤后的候选集，镜像与候选就不再可比。
                    action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
                } else {
                    const result = predictSpatialAction(predictor, state, current, allowed);
                    action = result.action;
                    candidateTrace = {
                        ordered: result.orderedActionCodes,
                        logits: result.actionLogits,
                        orderingId: result.candidateOrderingId,
                    };
                    if (!allowed.some((a) => encodeAction(a) === encodeAction(action as Action))) {
                        fallbackUsed = true;
                        fallbackReason = 'model returned an action outside the policy-allowed set';
                        action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
                    }
                }
            } catch (error) {
                policyError = error instanceof Error ? error.message : String(error);
                break;
            }
            latencies.push(Date.now() - at);
            candidateDecisions += 1;
        } else {
            if (allowed.length === 0) { policyError = `no policy-allowed action for seat ${current}`; break; }
            try {
                // 与 v13 相同的调用约定：不传候选集，启发式自己用引擎合法集打分。
                action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
            } catch (error) {
                policyError = error instanceof Error ? error.message : String(error);
                break;
            }
        }
        if (!action) { policyError = 'policy returned no action'; break; }

        if (!allowed.some((a) => encodeAction(a) === encodeAction(action as Action))) {
            // 策略允许集合是统一过滤（当前只有 surrender）。启发式若选了被过滤项，
            // 必须显式记录而不是静默放行。
            policyError = `chosen action is not in the policy-allowed set: ${encodeAction(action)}`;
            break;
        }
        actionCodes.push(`P${current}:${encodeAction(action)}`);
        // V16/T16-01：可选 trace（默认不提供 onStep ⇒ 这里整段被跳过，历史行为不变）。
        if (options.onStep !== undefined) {
            const traceState = engine.getState();
            options.onStep({
                stepIndex: steps,
                playerId: current,
                allianceId: getAllianceId(traceState, current),
                byCandidate: isCandidateArm && current === candidateSeat,
                stateHashBefore: sha256(Buffer.from(canonicalStateJsonOf(state), 'utf8')),
                stateBeforeJson: options.captureStateOnStep === true ? JSON.stringify(state) : null,
                legalActionCodes: allowed.map((a) => encodeAction(a)),
                orderedActionCodes: candidateTrace?.ordered ?? null,
                actionLogits: candidateTrace?.logits ?? null,
                candidateOrderingId: candidateTrace?.orderingId ?? null,
                actionCode: encodeAction(action),
                turnAfter: 0,
                terminalAfter: false,
                winnerAfter: null,
            });
        }
        try {
            engine.step(action);
        } catch (error) {
            engineError = error instanceof Error ? error.message : String(error);
            break;
        }
        steps += 1;
        if (options.onStep !== undefined) {
            // 中文：终局/回合信息在 step 之后才可知；补一条轻量「步后」记录，
            // 使失败窗口重放时有完整的 (前状态, 动作, 后状态) 三元组。
            const after = engine.getState();
            options.onStep({
                stepIndex: steps - 1,
                playerId: current,
                allianceId: getAllianceId(after, current),
                byCandidate: isCandidateArm && current === candidateSeat,
                stateHashBefore: '',
                stateBeforeJson: null,
                legalActionCodes: [],
                orderedActionCodes: null,
                actionLogits: null,
                candidateOrderingId: null,
                actionCode: '',
                turnAfter: after.turn,
                terminalAfter: engine.isTerminal(),
                winnerAfter: after.winner,
            });
        }
    }

    const finalState = engine.getState();
    const winnerAllianceId = finalState.winner;
    const viewedSeat = candidateSeat ?? options.viewedSeatHint;
    const candidateAllianceId = viewedSeat === null ? null : getAllianceId(finalState, viewedSeat);
    const playerCount = Math.max(1, playerIds.length);
    const currentIndex = Math.max(0, playerIds.indexOf(finalState.currentPlayer));
    const plies = Math.max(0, finalState.turn - 1) * playerCount + currentIndex + 1;
    const outcomeKind = classifyOutcome({
        engineError, policyError, cancelled: false, wallTimeout,
        winner: finalState.winner,
        winnerAlliance: finalState.winner,
        candidateAlliance: candidateAllianceId,
        steps: steps < maxSteps ? steps : maxSteps,
        maxSteps,
        plies,
        maxPlies,
    });

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const earlyEliminationAux = viewedSeat !== null
        && finalState.winner === null
        && finalState.players.find((p) => p.id === viewedSeat)?.isAlive === false;
    // 记录该镜像下每个座位的真实联盟，供按座位重贴视角使用（不重新模拟）。
    mirrorSeatAlliances[mirrorId] = Object.fromEntries(
        playerIds.map((id) => [String(id), getAllianceId(finalState, id)]),
    );

    // V15/T15-09A：镜像行「声明值 vs 重算值」。
    // 中文：历史 `outcomeKind` 只按本行自己的视角分类；镜像行没有候选座位（视角联盟为
    // null），所以即便被测座位所属联盟获胜也写成 NATURAL_LOSS。开启重算后，写入
    // outcomeKind 的是按被测座位联盟从 winner 重算的值，原始声明值单独保留，便于聚合器/
    // 审核给出对照读数。默认（false）时两个字段都不变，历史行语义完整保留。
    const declaredOutcomeKind: OutcomeKind = outcomeKind;
    const outcomeForRow: OutcomeKind = options.mirrorViewRecompute === true
        ? recomputeOutcomeForViewedSeat(outcomeKind, winnerAllianceId, candidateAllianceId)
        : outcomeKind;

    const identityFields = identityArtifacts === null || !identityContext ? null : (() => {
        const isCandidate = isCandidateArm;
        const modelTag = isCandidate ? identityContext.modelTag : 'mirror';
        const checkpoint = isCandidate ? checkpointSha256 : null;
        return {
            modelId: isCandidate
                ? modelIdV15(requestedPolicyId, modelTag, checkpoint)
                : modelIdV15('heuristic', 'mirror', null),
            checkpoint,
            artifacts: identityArtifacts,
        };
    })();
    const cacheIdentity = identityFields === null || !identityContext ? null : buildCacheIdentityV15({
        runId,
        runMode: identityContext.runMode,
        panelId: identityContext.panelId,
        blockId: identityContext.blockId,
        scenarioId,
        rootSeed: identityContext.rootSeed,
        episodeIndex: identityContext.episodeIndex,
        rootFamilyId: identityContext.rootFamilyId,
        candidateSeat: isCandidateArm ? candidateSeat : null,
        viewedSeat,
        arm: isCandidateArm ? 'CANDIDATE' : 'MIRROR',
        modelId: identityFields?.modelId ?? null,
        checkpointSha256: identityFields?.checkpoint ?? null,
        encoderSchemaId: encoderSchemaId,
        rngContract: RNG_CONTRACT_ID_V15,
        actionFilter: ACTION_FILTER_ID_V15,
        initialStateHash: identityFields?.artifacts.initialStateHash as string,
        mapHash: identityFields?.artifacts.map.mapHash as string,
        mapLayoutHash: identityFields?.artifacts.mapLayoutHash as string,
        rulesHash,
        engineSourceDigest: identityContext.sourceDigests.engine.digest,
        policySourceDigest: identityContext.sourceDigests.policy.digest,
        maxStepsAtomicActions: maxSteps,
        maxPliesAtomicActions: maxPlies ?? null,
        wallTimeoutMs,
    });

    return {
        runId,
        scenarioId,
        seed,
        mapName,
        playerCount,
        maxSteps,
        maxPlies: maxPlies ?? null,
        wallTimeoutMs,
        mirrorPolicyVersion: MIRROR_POLICY_VERSION_V14,
        rulesHash,
        mirrorId,
        arm: isCandidateArm ? 'CANDIDATE' : 'MIRROR',
        candidateSeat: isCandidateArm ? candidateSeat : null,
        viewedSeat,
        requestedPolicyId,
        actualPolicyId: requestedPolicyId,
        fallbackUsed,
        fallbackReason,
        checkpointSha256: isCandidateArm ? checkpointSha256 : null,
        // 中文（T15-09A 修复）：V15 权重与 V14 的空间通道数同为 26，用通道数推断 schema
        // 会把 V15 权重记成 V14。这里改用预测器声明的真实身份；历史 V13/V14 权重的取值不变。
        encoderSchema: encoderSchemaId,
        outcomeKind: outcomeForRow,
        winnerAllianceId,
        candidateAllianceId,
        steps,
        turns: finalState.turn,
        plies,
        engineTransitions: steps,
        candidateDecisions,
        filteredSurrenderBySeat,
        latencyMs: {
            p50: percentile(sortedLatencies, 0.5),
            p95: percentile(sortedLatencies, 0.95),
            p99: percentile(sortedLatencies, 0.99),
            max: sortedLatencies.length ? sortedLatencies[sortedLatencies.length - 1] : null,
            mean: sortedLatencies.length
                ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
                : null,
        },
        actionDigest: sha256(actionCodes.join('\n')),
        trajectoryDigest: sha256(`${scenarioId}#${seed}#${candidateSeat ?? 'mirror'}#${actionCodes.join('|')}`),
        error: engineError ?? policyError,
        wallMs: Date.now() - startedAt,
        earlyEliminationAux,
        // 中文：以下字段只在 emitIdentity 时出现，默认不写 ⇒ 历史行字节不变。
        ...(cacheIdentity === null || !identityContext ? {} : {
            gameId: cacheIdentity.gameId,
            runMode: identityContext.runMode,
            panelId: identityContext.panelId,
            blockId: identityContext.blockId,
            rootSeed: identityContext.rootSeed,
            episodeIndex: identityContext.episodeIndex,
            rootFamilyId: identityContext.rootFamilyId,
            initialStateHash: cacheIdentity.fields.initialStateHash as string,
            mapHash: cacheIdentity.fields.mapHash as string,
            mapLayoutHash: cacheIdentity.fields.mapLayoutHash as string,
            engineSourceDigest: cacheIdentity.fields.engineSourceDigest as string,
            policySourceDigest: cacheIdentity.fields.policySourceDigest as string,
            rngContract: RNG_CONTRACT_ID_V15,
            actionFilterVersion: ACTION_FILTER_ID_V15,
            modelTag: isCandidateArm ? identityContext.modelTag : 'mirror',
            seatAlliances: Object.fromEntries(playerIds.map((id) => [String(id), getAllianceId(finalState, id)])),
            cacheIdentity,
        }),
        ...(options.mirrorViewRecompute === true ? { mirrorDeclaredOutcomeKind: declaredOutcomeKind } : {}),
    };
}

/**
 * 按被测座位联盟从 winner 重算视角（与 v14 聚合器的 `viewOutcomeForSeat` 同语义）。
 *
 * 中文：错误与截断与视角无关，原样返回；规则平局不归属任何联盟；视角或 winner 缺失时
 * 无法重算，返回原值（不猜）。这里不 import 聚合器，避免 runner↔aggregator 循环依赖；
 * 两处实现由 `eval_v14.test.ts` 的一致性断言锁住。
 */
export function recomputeOutcomeForViewedSeat(
    raw: OutcomeKind,
    winnerAllianceId: number | null,
    viewedAllianceId: number | null,
): OutcomeKind {
    if (raw === 'POLICY_ERROR' || raw === 'ENGINE_ERROR') return raw;
    if (raw === 'STEP_LIMIT' || raw === 'PLY_LIMIT' || raw === 'WALL_TIMEOUT' || raw === 'CANCELLED') return raw;
    if (raw === 'NATURAL_DRAW') return 'NATURAL_DRAW';
    if (winnerAllianceId === null || viewedAllianceId === null) return raw;
    return winnerAllianceId === viewedAllianceId ? 'NATURAL_WIN' : 'NATURAL_LOSS';
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'v14_20260924_t14') as string;
    const scenarioId = arg('--scenario', 'SDPLAN:sd-normal:(2) Duel.aem') as string;
    const seeds = (arg('--seeds', '1') as string).split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    const seatsArg = arg('--candidate-seat', '0') as string;
    const candidateSeats = seatsArg === 'all'
        ? null
        : seatsArg.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    const candidatePath = arg('--candidate', null);
    const maxSteps = Number(arg('--max-steps', '20000'));
    const maxPlies = arg('--max-plies', null) === null ? null : Number(arg('--max-plies', null));
    const wallMs = Number(arg('--wall-ms', '60000'));
    const outPath = path.resolve(arg('--out', path.join('v14', 'out', runId, 'T14-06', 'matches', 'dev.games.jsonl')) as string);
    const mirrorOnly = arg('--mirror-only', 'false') === 'true';

    /* ---- V15/T15-09A 新开关（默认值 = 历史行为） ---- */
    const emitIdentity = arg('--emit-identity', 'false') === 'true';
    const mirrorViewRecompute = arg('--mirror-view-recompute', 'false') === 'true';
    const refuseOverwrite = arg('--refuse-overwrite', 'false') === 'true';
    const runMode = (arg('--run-mode', 'dev') as RunModeV15);
    const panelId = arg('--panel-id', runMode) as string;
    const blockId = arg('--block-id', `${panelId}:block`) as string;
    const rootSeedArg = arg('--root-seed', null);
    const episodeIndexArg = arg('--episode-index', null);
    const modelTag = arg('--model-tag', 'model') as string;

    const sdTrainingPlan = await loadSdTrainingPlanConfig(path.resolve(SD_PLAN_FILE));
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    let predictor: SpatialResNetPredictor | null = null;
    let checkpointSha256: string | null = null;
    let requestedPolicyId = 'heuristic';
    if (candidatePath) {
        const abs = path.resolve(candidatePath);
        if (!fs.existsSync(abs)) throw new Error(`候选检查点不存在: ${abs}`);
        const json = fs.readFileSync(abs, 'utf8');
        const parsed = JSON.parse(json);
        const declared = parsed.encoderSchemaId ?? null;
        // 中文（T15-09A 修复）：用检查点自己声明的 schema 加载，且**直接采用声明值**。
        // 历史代码只区分「V14 声明 / 其它一律 V13」，于是 V15 声明会被当成 V13 期望值，
        // 加载器随即报 mismatch（fail-fast，不会静默错载），但 v14 工具也就无法加载 V15 权重。
        // 未声明（历史检查点）时传 null，让加载器按 v13/v1 家族推断——与历史行为完全一致。
        const expected = declared !== null && (SUPPORTED_ENCODER_SCHEMA_IDS as readonly string[]).includes(declared)
            ? declared
            : declared === null
                ? null
                : (() => { throw new Error(`未知 encoderSchemaId '${declared}'，只接受 [${SUPPORTED_ENCODER_SCHEMA_IDS.join(', ')}]。`); })();
        const weights = loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected });
        predictor = new SpatialResNetPredictor(weights);
        checkpointSha256 = sha256File(abs);
        requestedPolicyId = `spatial_candidate:${path.basename(abs)}`;
        console.log(`[T14-05] candidate=${path.basename(abs)} schema=${predictor.encoderSchemaId} variant=${predictor.semanticsVariant} channels=${predictor.spatialChannels} sha256=${checkpointSha256.slice(0, 16)}…`);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (refuseOverwrite && fs.existsSync(outPath)) {
        throw new Error(`[T15-09A] 输出已存在且 --refuse-overwrite=true，拒绝覆盖历史结果：${outPath}`);
    }
    // V15：身份上下文按 seed 生成——rootSeed 默认取该 seed 本身，与 T15-00 的
    // rootSeed = namespaceBase + index 派生一致；episodeIndex 默认取 seed 在 --seeds 中的序号。
    const sourceDigests = emitIdentity ? sourceDigestsV15(process.cwd()) : null;
    const identityContextFor = (seed: number, seedIndex: number): IdentityContextV15 | undefined => {
        if (!emitIdentity || sourceDigests === null) return undefined;
        const rootSeed = rootSeedArg === null ? seed : Number(rootSeedArg);
        const episodeIndex = episodeIndexArg === null ? seedIndex : Number(episodeIndexArg);
        return {
            runId, runMode, panelId, blockId, rootSeed, episodeIndex,
            rootFamilyId: `${scenarioId}#${rootSeed}#${episodeIndex}`,
            modelTag, sourceDigests,
        };
    };
    const out = fs.createWriteStream(outPath, { flags: 'w' });
    const records: GameRecord[] = [];
    const startedAt = Date.now();

    // 1) 每个 (scenario, seed) 只运行一次镜像；聚合器按 (scenarioId, seed, viewedSeat) 配对，
    //    因此同一个镜像结果按每个被比较座位写一行（不再重复模拟，也不伪造独立对局）。
    const seatCount = Number(arg('--seat-count', '2'));
    const seatsToRun = candidateSeats ?? Array.from({ length: seatCount }, (_, i) => i);

    if (!mirrorOnly) {
        for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
            const seed = seeds[seedIndex];
            const identityContext = identityContextFor(seed, seedIndex);
            const mirror = await playOne({
                runId, scenarioId, seed, candidateSeat: null, viewedSeatHint: null,
                maxSteps, maxPlies, wallTimeoutMs: wallMs, predictor: null,
                checkpointSha256: null, requestedPolicyId: 'heuristic', envFactory,
                emitIdentity, identityContext, mirrorViewRecompute,
            });
            for (const seat of seatsToRun) {
                const viewed: GameRecord = {
                    ...mirror,
                    viewedSeat: seat,
                    candidateAllianceId: getAllianceIdFromMirror(mirror, seat),
                };
                // 中文：可选的重算发生在**按座位展开之后**，因为重算需要知道这一行报告谁的视角。
                if (mirrorViewRecompute) {
                    viewed.mirrorDeclaredOutcomeKind = mirror.outcomeKind;
                    viewed.outcomeKind = recomputeOutcomeForViewedSeat(
                        mirror.outcomeKind, mirror.winnerAllianceId, viewed.candidateAllianceId,
                    );
                }
                if (viewed.cacheIdentity) {
                    // 中文：镜像实体的 gameId 随视图座位变化（seat 固定为 null，view 变）；
                    // 计算本身只有一份，聚合时按 root 家族整块重采样。
                    viewed.cacheIdentity = { ...viewed.cacheIdentity };
                    viewed.gameId = `${runId}|${panelId}|${blockId}|heuristic:mirror:v1|MIRROR|seat=null|view=${seat}`;
                    viewed.cacheIdentity.gameId = viewed.gameId;
                }
                out.write(`${JSON.stringify(viewed)}\n`);
                records.push(viewed);
            }
            console.log(`[T14-05] MIRROR seed=${seed} ${mirror.outcomeKind} steps=${mirror.steps} turns=${mirror.turns} seats=${seatsToRun.join(',')} ${(mirror.wallMs / 1000).toFixed(1)}s`);
        }
    }

    // 2) 候选臂：替换一个座位，其他座位仍是同一条启发式随机流。
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
        const seed = seeds[seedIndex];
        const identityContext = identityContextFor(seed, seedIndex);
        for (const seat of seatsToRun) {
            const record = await playOne({
                runId, scenarioId, seed, candidateSeat: seat, viewedSeatHint: seat,
                maxSteps, maxPlies, wallTimeoutMs: wallMs, predictor,
                checkpointSha256, requestedPolicyId, envFactory,
                emitIdentity, identityContext, mirrorViewRecompute,
            });
            out.write(`${JSON.stringify(record)}\n`);
            records.push(record);
            console.log(`[T14-05] CANDIDATE seat=${seat} seed=${seed} ${record.outcomeKind} steps=${record.steps} turns=${record.turns} p95=${record.latencyMs.p95}ms ${(record.wallMs / 1000).toFixed(1)}s`);
        }
    }
    await new Promise<void>((resolve) => out.end(resolve));

    const summary = {
        schema: 'v14_match_run_1',
        task: 'T14-05',
        runId,
        generatedAt: new Date().toISOString(),
        scenarioId,
        seeds,
        candidateSeats: seatsToRun,
        maxSteps,
        maxPlies,
        wallTimeoutMs: wallMs,
        requestedPolicyId,
        checkpointPath: candidatePath,
        checkpointSha256,
        // 中文：改用预测器声明的真实 schema（V15 与 V14 通道数相同，通道数推断会记错）。
        encoderSchema: predictor ? predictor.encoderSchemaId : HEURISTIC_SCHEMA_ID,
        encoderSemanticsVariant: predictor ? predictor.semanticsVariant : null,
        emitIdentity,
        mirrorViewRecompute,
        cacheIdentity: records.find((r) => r.cacheIdentity)?.cacheIdentity ?? null,
        gamesJsonl: outPath.replace(/\\/g, '/'),
        gamesJsonlSha256: sha256File(outPath),
        arms: records.length,
        byOutcome: records.reduce((acc: Record<string, number>, r) => {
            acc[r.outcomeKind] = (acc[r.outcomeKind] ?? 0) + 1; return acc;
        }, {}),
        errors: records.filter((r) => r.error !== null).length,
        fallbacks: records.filter((r) => r.fallbackUsed).length,
        wallMsTotal: Date.now() - startedAt,
    };
    const summaryPath = outPath.replace(/\.games\.jsonl$/, '.run.json');
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`[T14-05] arms=${records.length} errors=${summary.errors} fallbacks=${summary.fallbacks} -> ${outPath}`);
    console.log(`[T14-05] byOutcome=${JSON.stringify(summary.byOutcome)}`);
}

/**
 * CLI 入口守卫（T15-09A）：被 import 时（例如 V15 arena runner 复用 `playOne`）只导出函数，
 * 不执行对局。直接以本文件为入口运行时（run-tool.mjs 会把 argv[1] 设为本文件绝对路径）
 * 行为与历史完全一致。
 */
const entryPath = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entryPath.endsWith('v14/tools/eval_v14_match.ts')) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exit(1);
    });
}
