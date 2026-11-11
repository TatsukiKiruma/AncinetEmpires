/**
 * V19/T19-02：主体座位训练环境（subject-seat episode）。
 *
 * 这个模块是**训练专用包装层**，它继续调用同一个权威 TS 引擎与同一套冻结 H0，
 * 不重新实现一份游戏规则。它存在的唯一理由是把 V18 复核 §2.5 指出的缺陷从训练链上切断：
 *
 * 1. **自然终局与截断必须分开。**
 *    `GameEngine.step` 附带伤害/招募/死亡等 dense reward（死亡奖励还未按敌我区分）；
 *    `AncientEmpiresEnv.stepAction` 在 maxPlies 处按金币与军力**代理判胜负**。
 *    两者都不能当作 PPO 的赢棋奖励。本模块只认引擎 `winnerAllianceId`：
 *    - 自然终局：主体联盟 == winner ⇒ +1；!= winner ⇒ −1；规则平局（winner === -1）⇒ 0。
 *    - 未终局（步数/墙钟截断）⇒ `truncated = true`，**不给终局奖励**，也不写任何胜负标签。
 *    现有 `winner=null, reward=-1` 的截断探针在本模块里是一条负例回归。
 *
 * 2. **一条 transition = 主体的一次决策**，不是一次原子动作。
 *    主体连续移动/攻击仍属同一方，价值符号不翻转；中间轮到 H0 时把它的动作全部推进完，
 *    再记录下一条主体 transition。
 *
 * 3. **动作按语义码对齐**：候选一律经 `canonicalActionOrderV16` 规范排序，
 *    记录的 `orderedActionCodes` 就是策略实际打分的那一维，禁止混用旧数组下标。
 */

import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createHash } from 'node:crypto';
import { canonicalStateJson as canonicalStateJsonOf } from '../../v15/tools/labeler_l1_v15';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, getRuleConfig } from '../../src/game/rule_config';
import { canonicalActionOrderV16 } from '../../src/game/ai/action_ordering';
import {
    encodeCandidateActionsSpatialForSchema,
    encodeGameStateSpatial,
} from '../../src/game/ai/spatial_tensor_encoder';
import { SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { streamFor } from '../../v14/tools/eval_v14_match';
import type { Action, GameState } from '../../src/game/types';

/** 训练侧终局分类：自然终局与截断在类型上就分开，不能靠事后约定。 */
export type SubjectOutcomeKindV19 =
    | 'NATURAL_WIN'
    | 'NATURAL_LOSS'
    | 'NATURAL_DRAW'
    | 'TRUNCATED_STEP_LIMIT'
    | 'TRUNCATED_PLY_LIMIT'
    | 'TRUNCATED_WALL_TIMEOUT'
    | 'POLICY_ERROR'
    | 'ENGINE_ERROR';

export interface SubjectTransitionV19 {
    /** 主体第几次决策（从 0 开始，逐局唯一）。 */
    subjectDecisionIndex: number;
    /** 引擎原子步序号（含 H0 的动作），用于把 transition 对回真实对局位置。 */
    engineStepIndex: number;
    turn: number;
    /** 决策前的规范化状态摘要（与 dataset 侧同一口径的 sha256 输入由调用方给出）。 */
    stateHash: string;
    /** 决策前的 currentPlayer（必须等于 subjectSeat；用于核对“主体座位”没有被串位）。 */
    currentPlayer: number;
    /** 规范顺序下的候选 actionCode（与 logits/probs 一一对应）。 */
    orderedActionCodes: string[];
    /** 被选中动作在规范顺序里的下标。 */
    chosenIndex: number;
    chosenActionCode: string;
    /** 行为策略在该状态下的 log 概率（按规范顺序的 masked softmax）。 */
    behaviorLogProb: number;
    /** 该状态下的策略熵（自然对数，未按候选数归一化）。 */
    policyEntropy: number;
    /** critic 输出（尚未可靠时只作诊断，不伪造监督）。 */
    value: number;
    /** 本条 transition 的即时奖励：只可能来自自然终局，其余为 0。 */
    reward: number;
    /** 本条 transition 之后对局是否已自然终局。 */
    terminal: boolean;
    /** 本条 transition 之后是否被截断（与 terminal 互斥）。 */
    truncated: boolean;
    /** 该 transition 决策后真实 currentPlayer 的变化。 */
    currentPlayerAfter: number;
    /** 主体下一次决策前，H0 实际推进了多少个原子动作。 */
    opponentStepsBetween: number;
    /**
     * 本 transition 的终局回报是否其实是在**对手回应阶段**产生的。
     *
     * 中文：主体走完最后一步后轮到 H0，H0 的行动才触发引擎终局时，终局回报仍必须归到
     * 主体最后一次决策上（否则该局对策略没有任何梯度信号）。这里如实标注归属，
     * 不把对手阶段伪装成主体决策。
     */
    terminalCreditedToOpponentReply?: boolean;
    /**
     * 本 transition 的终局回报是在**记录上限之后**才产生的。
     *
     * 中文：超长局（实测单局 10,902 次主体决策）会被 `maxRecordedDecisions` 截断记录，
     * 但那一局可能有**真实胜负**。真实胜负是训练里最稀缺的信号，直接丢掉整局是浪费；
     * 这里把真实终局回报归到**最后一条被记录下来的** transition 上，并如实标注这一点，
     * 让训练侧可以自行决定是否使用（默认使用，并单独计数）。
     * 绝不因此给截断局写胜负标签——只有 `naturalTerminal` 为真时才会发生。
     */
    terminalCreditedAfterRecordCap?: boolean;
    encodeMs: number;
    inferMs: number;
}

export interface SubjectEpisodeOptionsV19 {
    runId: string;
    mapName: string;
    seed: number;
    /** 主体座位（playerId）。 */
    subjectSeat: number;
    maxSteps: number;
    /** 规则玩家回合序号上限（初始为 1），每次动作后检查；null 表示不限制。 */
    maxPlies: number | null;
    wallTimeoutMs: number;
    /** 主体策略；为 null 时主体也走 H0（用于基线/对照，不用于训练）。 */
    predictor: SpatialResNetPredictor | null;
    checkpointSha256: string | null;
    /** true ⇒ 按 actionProbs 采样（探索策略）；false ⇒ argmax（正式部署方式）。 */
    sample: boolean;
    /** 采样随机流种子；与对局 seed 分开，保证同局可复现。 */
    samplingSeed: number;
    envFactory: any;
    /** 是否记录逐 transition（训练需要；纯基线计时可关掉）。 */
    recordTransitions: boolean;
    /** 可选：把决策前状态张量与候选语义一起带出（导出训练张量用）。 */
    captureTensors?: boolean;
    /**
     * 最多记录多少条主体 transition（含张量）。
     *
     * 中文（2026-09-29 复核后已改变默认行为）：这**不再是**保护内存的主要手段。
     * 现在默认不限制（`Infinity`），内存由 `onChunk` 分块写出控制；只有调用方显式给出上限时
     * 才会截断记录，并如实标记 `recordCapped`。旧默认 2000 会丢掉长局后半程，已废弃。
     */
    maxRecordedDecisions?: number;
    /** 分块大小（主体决策条数）。仅在提供 `onChunk` 时生效。 */
    chunkSize?: number;
    /**
     * 分块回调：每积满一块就交给调用方落盘，随后本模块释放该块的引用。
     * 提供它时结果里的 `transitions`/`tensors` 不再累积（避免 2.3GB 级内存）。
     */
    onChunk?: (chunk: SubjectChunkV19) => Promise<void> | void;
    /** 对局 ID（写进块里，便于按块归属）。 */
    gameId?: string;
}

export interface SubjectTensorPayloadV19 {
    subjectDecisionIndex: number;
    spatialTensor: number[];
    globalFeatures: number[];
    channels: number;
    candidates: Array<{
        code: string;
        actorCoord: { x: number; y: number } | null;
        landingCoord: { x: number; y: number } | null;
        targetCoord: { x: number; y: number } | null;
        semantics: number[];
    }>;
}

export interface SubjectEpisodeResultV19 {
    schema: 'v19_subject_episode_1';
    runId: string;
    mapName: string;
    seed: number;
    subjectSeat: number;
    subjectAllianceId: number | null;
    winnerAllianceId: number | null;
    /** 训练侧终局分类（自然终局与截断分开）。 */
    outcomeKind: SubjectOutcomeKindV19;
    /** 是否自然终局（引擎给出了 winner，含规则平局 winner===-1）。 */
    naturalTerminal: boolean;
    /** 是否被截断（步数/ply/墙钟）。截断局没有胜负标签。 */
    truncated: boolean;
    /** 主体视角的终局回报：自然胜 +1 / 自然负 −1 / 自然和 0 / 未终局 null。 */
    terminalReturn: number | null;
    /** 终局是否由对手回应阶段触发（回报仍归到主体最后一次决策）。 */
    terminalCreditedToOpponentReply: boolean;
    /** 终局回报是否是在记录上限之后产生的（超长局；回报归到最后一條已记录 transition）。 */
    terminalCreditedAfterRecordCap: boolean;
    steps: number;
    turns: number;
    plies: number;
    subjectDecisions: number;
    /** 实际记录下来的 transition 条数（可能小于 subjectDecisions，见 maxRecordedDecisions）。 */
    recordedDecisions: number;
    /** 是否因为记录上限而丢弃了后续 transition（对局本身仍然走完）。 */
    recordCapped: boolean;
    opponentSteps: number;
    filteredSurrenderBySeat: Record<string, number>;
    error: string | null;
    wallMs: number;
    encodeMsTotal: number;
    inferMsTotal: number;
    encoderSchemaId: string | null;
    checkpointSha256: string | null;
    /** 动作序列（含双方），供第三方按同一引擎重放。 */
    actionCodes: string[];
    /**
     * 每个**己方回合边界**的状态快照指针（不是全量状态）。
     *
     * 中文（对应 2026-09-29 复核 B 节）：长局必须能重放到相同 actionDigest。
     * 只保存 `actionCodes` 虽然理论上可重放（seed + 模型 SHA + 采样种子都记录了），
     * 但一旦中间任一环节漂移就无法定位。这里在每个回合边界记一条轻量检查点：
     * 回合号、引擎步序、主体决策序号、以及**完整规范化状态哈希**
     * （用既有 canonicalStateJson + sha256，不用粗粒度的 stateHashOf 冒充输入哈希）。
     */
    turnSnapshots: SubjectTurnSnapshotV19[];
    /** 主体决策总数（真实值，不受记录上限影响）。 */
    transitions: SubjectTransitionV19[];
    tensors?: SubjectTensorPayloadV19[];
    /** 分块写出时的块数（未启用分块时为 0）。 */
    chunksWritten: number;
}

/** 回合边界检查点：用于把长局重放定位到具体回合。 */
export interface SubjectTurnSnapshotV19 {
    turn: number;
    engineStepIndex: number;
    subjectDecisionIndex: number;
    /** 完整规范化状态哈希（canonicalStateJson 的 sha256）。 */
    canonicalStateHash: string;
    /** 该回合开始时主体的合法动作数（诊断用）。 */
    legalActionCount: number;
}

/**
 * 流式块：把主体决策按固定条数分批交给调用方落盘，写完整块即释放内存。
 *
 * 中文（对应复核 B 节）：旧实现用 2000 条上限保护内存，代价是**丢掉长局后半程**——
 * wave2 有 8 局长局只保存了前 2000 步，却占了 PPO 样本的 56%。分块是存储方式，
 * 不是强行结束游戏：本局仍然完整走完，所有决策都会被写出，只是不再同时驻留内存。
 */
export interface SubjectChunkV19 {
    gameId: string;
    chunkIndex: number;
    firstDecisionIndex: number;
    transitions: SubjectTransitionV19[];
    tensors?: SubjectTensorPayloadV19[];
    /** 本局最后一块（只表示记录结束，不表示对局终止）。 */
    last: boolean;
}

/** 确定性采样流：与对局 seed 分离，保证「同一局 + 同一采样种子」逐位可复现。 */
function mulberry32(a: number): () => number {
    return function next() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 按概率向量采样；返回下标。概率向量必须已归一化（predict 输出即 masked softmax）。 */
export function sampleFromProbs(probs: readonly number[], rng: () => number): number {
    let total = 0;
    for (const p of probs) total += Number.isFinite(p) && p > 0 ? p : 0;
    if (total <= 0) {
        // 数值退化时退回均匀采样，并在调用方按 entropy 记录；不伪造 argmax。
        return Math.min(probs.length - 1, Math.floor(rng() * probs.length));
    }
    let r = rng() * total;
    for (let i = 0; i < probs.length; i += 1) {
        const p = Number.isFinite(probs[i]) && probs[i] > 0 ? probs[i] : 0;
        r -= p;
        if (r <= 0) return i;
    }
    return probs.length - 1;
}

/** 熵（自然对数）。0 概率项按 0·log0 = 0 处理，不引入 NaN。 */
export function entropyOfProbs(probs: readonly number[]): number {
    let h = 0;
    for (const p of probs) {
        if (Number.isFinite(p) && p > 0) h -= p * Math.log(p);
    }
    return h;
}

/** 状态摘要：与对局记录共用「稳定 JSON」口径的最小实现（只用于把 transition 对回状态）。 */
export function stateHashOf(state: GameState): string {
    const parts: string[] = [
        `t${state.turn}`,
        `p${state.currentPlayer}`,
        `w${state.winner === null ? 'null' : state.winner}`,
        `pending:${state.pendingUnitId ?? 'null'}`,
    ];
    const units = [...state.units]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(u => `${u.id}@${u.pos.x},${u.pos.y}:${u.unitClass}:${u.hp}/${u.maxHp}:L${u.level ?? 0}:`
            + `${u.hasMoved ? 'm' : '-'}${u.hasActed ? 'a' : '-'}:${u.status ? u.status.type : 'none'}`);
    const players = [...state.players]
        .sort((a, b) => a.id - b.id)
        .map(p => `${p.id}:g${p.gold}:${p.isAlive ? 'alive' : 'dead'}`);
    return [...parts, ...players, ...units].join('|');
}

/**
 * 跑一局「主体座位 vs 冻结 H0」。
 *
 * 关键纪律（与 V18 复核 §2.5 对应）：
 * - 只使用引擎 winner 判定自然胜负；截断局 `terminalReturn = null`。
 * - 不使用 `GameEngine.step` 返回的 dense reward，也不调用 `AncientEmpiresEnv.stepAction`。
 */
export async function playSubjectEpisode(
    options: SubjectEpisodeOptionsV19,
): Promise<SubjectEpisodeResultV19> {
    const {
        runId, mapName, seed, subjectSeat, maxSteps, maxPlies, wallTimeoutMs,
        predictor, checkpointSha256, sample, samplingSeed, envFactory,
    } = options;
    const record = options.recordTransitions !== false;
    const captureTensors = options.captureTensors === true;
    const maxRecordedDecisions = options.maxRecordedDecisions ?? Number.POSITIVE_INFINITY;
    const chunkSize = Math.max(1, options.chunkSize ?? 256);
    const onChunk = options.onChunk;
    const chunkGameId = options.gameId ?? `${runId}|${mapName}|seed=${seed}|seat=${subjectSeat}`;
    /** 启用分块时结果里不再累积 transition/张量，内存由块大小决定。 */
    const keepInMemory = onChunk === undefined;

    const scenarioId = `SDPLAN:sd-normal:${mapName}`;
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
    const rules = getRuleConfig(initialState);
    const playerIds: number[] = initialState.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    // 与公共环境保持相同的规则回合口径，循环、transition 和最终分类共用此处。
    const plyCount = (state: GameState): number => Math.max(0, state.turn - 1)
        * Math.max(1, playerIds.length) + Math.max(0, playerIds.indexOf(state.currentPlayer)) + 1;
    const reachedPlyLimit = (state: GameState): boolean => maxPlies != null && plyCount(state) >= maxPlies;
    const seatAi = new Map<number, HeuristicAI>();
    for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));
    const rng = mulberry32(samplingSeed);

    const transitions: SubjectTransitionV19[] = [];
    const tensors: SubjectTensorPayloadV19[] = [];
    /** 当前正在填充的块。 */
    let pendingTransitions: SubjectTransitionV19[] = [];
    let pendingTensors: SubjectTensorPayloadV19[] = [];
    /**
     * **滞后一块**：只有当下一块开始填充时才写出上一块。
     *
     * 中文（为什么必须滞后）：终局回报要归到主体的**最后一条** transition 上，而自然终局
     * 可能发生在对手回应阶段——也就是本局最后一条主体决策之后。如果最后一块已经写盘，
     * 这条回报就无处可放。滞后一块保证「最后一块始终在内存里」，同时内存上界仍然是两块。
     */
    let lagged: { transitions: SubjectTransitionV19[]; tensors: SubjectTensorPayloadV19[] } | null = null;
    let chunkIndex = 0;
    let chunksWritten = 0;
    /** 已记录的 transition 总数（跨块累计，用于判断是否被上限截断）。 */
    let recordedTotal = 0;
    const turnSnapshots: SubjectTurnSnapshotV19[] = [];
    let lastTurnSeen = -1;
    const emitChunk = async (
        bufTransitions: SubjectTransitionV19[],
        bufTensors: SubjectTensorPayloadV19[],
        last: boolean,
    ): Promise<void> => {
        if (onChunk === undefined) return;
        await onChunk({
            gameId: chunkGameId,
            chunkIndex,
            firstDecisionIndex: bufTransitions.length > 0
                ? bufTransitions[0].subjectDecisionIndex : subjectDecisions,
            transitions: bufTransitions,
            ...(captureTensors ? { tensors: bufTensors } : {}),
            last,
        });
        chunkIndex += 1;
        chunksWritten += 1;
    };
    const actionCodes: string[] = [];
    const filteredSurrenderBySeat: Record<string, number> = {};
    let steps = 0;
    let subjectDecisions = 0;
    let opponentSteps = 0;
    let opponentStepsSinceLastSubject = 0;
    let encodeMsTotal = 0;
    let inferMsTotal = 0;
    let engineError: string | null = null;
    let policyError: string | null = null;
    let wallTimeout = false;
    const startedAt = Date.now();

    while (!engine.isTerminal() && steps < maxSteps) {
        if (Date.now() - startedAt > wallTimeoutMs) { wallTimeout = true; break; }
        const state = engine.getState();
        const current = state.currentPlayer;
        const legal = engine.getLegalActions(current);
        const allowed = legal.filter((a: Action) => a.type !== 'surrender');
        const filtered = legal.length - allowed.length;
        if (filtered > 0) {
            filteredSurrenderBySeat[String(current)] = (filteredSurrenderBySeat[String(current)] ?? 0) + filtered;
        }
        if (allowed.length === 0) {
            policyError = `no policy-allowed action for seat ${current}`;
            break;
        }

        const isSubject = current === subjectSeat;

        // 回合边界检查点（复核 B 节要求「至少每个己方回合边界有快照」）。
        // 用完整规范化状态哈希，不用粗粒度的 stateHashOf 冒充输入哈希。
        if (isSubject && state.turn !== lastTurnSeen) {
            lastTurnSeen = state.turn;
            turnSnapshots.push({
                turn: state.turn,
                engineStepIndex: steps,
                subjectDecisionIndex: subjectDecisions,
                canonicalStateHash: createHash('sha256')
                    .update(canonicalStateJsonOf(state), 'utf8').digest('hex'),
                legalActionCount: allowed.length,
            });
        }

        let action: Action | null = null;
        let pendingTransition: Omit<SubjectTransitionV19, 'reward' | 'terminal' | 'truncated'
            | 'currentPlayerAfter' | 'opponentStepsBetween'> | null = null;
        let pendingTensor: SubjectTensorPayloadV19 | null = null;

        if (isSubject && predictor !== null) {
            const ordered = canonicalActionOrderV16(allowed);
            const t0 = performance.now();
            const encoded = encodeGameStateSpatial(state, current, predictor.isV2 ? 'v2' : 'v1', {
                channels: predictor.spatialChannels,
            });
            const candFeatures = encodeCandidateActionsSpatialForSchema(
                state, current, ordered.map((item) => item.action),
                predictor.isV2 ? 'v2' : 'v1', predictor.encoderSchemaId,
            );
            const t1 = performance.now();
            let pred;
            try {
                pred = predictor.predict(encoded, candFeatures);
            } catch (error) {
                policyError = error instanceof Error ? error.message : String(error);
                break;
            }
            const t2 = performance.now();
            encodeMsTotal += t1 - t0;
            inferMsTotal += t2 - t1;

            const probs = pred.actionProbs;
            const chosenIndex = sample ? sampleFromProbs(probs, rng) : pred.bestActionIndex;
            const chosenProb = Number.isFinite(probs[chosenIndex]) && probs[chosenIndex] > 0
                ? probs[chosenIndex]
                : Number.MIN_VALUE;
            action = ordered[chosenIndex].action;
            if (record && subjectDecisions < maxRecordedDecisions) {
                pendingTransition = {
                    subjectDecisionIndex: subjectDecisions,
                    engineStepIndex: steps,
                    turn: state.turn,
                    stateHash: stateHashOf(state),
                    currentPlayer: current,
                    orderedActionCodes: ordered.map(item => item.code),
                    chosenIndex,
                    chosenActionCode: ordered[chosenIndex].code,
                    behaviorLogProb: Math.log(chosenProb),
                    policyEntropy: entropyOfProbs(probs),
                    value: pred.value,
                    encodeMs: t1 - t0,
                    inferMs: t2 - t1,
                };
                if (captureTensors) {
                    pendingTensor = {
                        subjectDecisionIndex: subjectDecisions,
                        spatialTensor: Array.from(encoded.spatialTensor),
                        globalFeatures: Array.from(encoded.globalFeatures),
                        channels: encoded.channels ?? predictor.spatialChannels,
                        candidates: ordered.map((item, idx) => ({
                            code: item.code,
                            actorCoord: candFeatures[idx].actorCoord,
                            landingCoord: candFeatures[idx].landingCoord,
                            targetCoord: candFeatures[idx].targetCoord,
                            semantics: Array.from(candFeatures[idx].semantics),
                        })),
                    };
                }
            }
            subjectDecisions += 1;
        } else {
            // 主体以外的座位（含 predictor 为 null 时的主体）一律走冻结 H0，
            // 调用约定与正式 arena 完全一致：不传候选集，让 H0 自己用引擎合法集打分。
            try {
                action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
            } catch (error) {
                policyError = error instanceof Error ? error.message : String(error);
                break;
            }
            if (isSubject) subjectDecisions += 1;
            else { opponentSteps += 1; opponentStepsSinceLastSubject += 1; }
        }
        if (!action) { policyError = 'policy returned no action'; break; }

        if (!allowed.some((a: Action) => encodeAction(a) === encodeAction(action as Action))) {
            policyError = `chosen action is not in the policy-allowed set: ${encodeAction(action)}`;
            break;
        }
        actionCodes.push(`P${current}:${encodeAction(action)}`);
        try {
            engine.step(action);
        } catch (error) {
            engineError = error instanceof Error ? error.message : String(error);
            break;
        }
        steps += 1;

        if (pendingTransition !== null) {
            const after = engine.getState();
            const terminalNow = engine.isTerminal();
            const truncatedNow = !terminalNow && (steps >= maxSteps
                || reachedPlyLimit(after));
            let reward = 0;
            if (terminalNow) {
                reward = rewardForWinnerV19(after.winner, getAllianceId(after, subjectSeat));
            }
            const finished: SubjectTransitionV19 = {
                ...pendingTransition,
                reward,
                terminal: terminalNow,
                truncated: truncatedNow,
                currentPlayerAfter: after.currentPlayer,
                opponentStepsBetween: opponentStepsSinceLastSubject,
            };
            if (keepInMemory) transitions.push(finished);
            pendingTransitions.push(finished);
            recordedTotal += 1;
            if (pendingTensor !== null) {
                if (keepInMemory) tensors.push(pendingTensor);
                pendingTensors.push(pendingTensor);
            }
            opponentStepsSinceLastSubject = 0;
            if (pendingTransitions.length >= chunkSize) {
                // 先把上一块写出，再让当前块变成「滞后块」——最后一块永远留在内存里。
                if (lagged !== null) await emitChunk(lagged.transitions, lagged.tensors, false);
                lagged = { transitions: pendingTransitions, tensors: pendingTensors };
                pendingTransitions = [];
                pendingTensors = [];
            }
        }
        // 和公共环境一致，在动作结算后检查；自然终局仍由下方 winner 优先分类。
        if (reachedPlyLimit(engine.getState())) break;
    }

    const finalState = engine.getState();
    const winnerAllianceId = finalState.winner;
    const subjectAllianceId = getAllianceId(finalState, subjectSeat);
    const plies = plyCount(finalState);

    const naturalTerminal = engineError === null && policyError === null
        && !wallTimeout && finalState.winner !== null;
    let outcomeKind: SubjectOutcomeKindV19;
    if (engineError !== null) outcomeKind = 'ENGINE_ERROR';
    else if (policyError !== null) outcomeKind = 'POLICY_ERROR';
    else if (wallTimeout) outcomeKind = 'TRUNCATED_WALL_TIMEOUT';
    else if (finalState.winner !== null) {
        outcomeKind = finalState.winner === -1
            ? 'NATURAL_DRAW'
            : (finalState.winner === subjectAllianceId ? 'NATURAL_WIN' : 'NATURAL_LOSS');
    } else if (reachedPlyLimit(finalState)) {
        outcomeKind = 'TRUNCATED_PLY_LIMIT';
    } else {
        outcomeKind = 'TRUNCATED_STEP_LIMIT';
    }
    const truncated = outcomeKind.startsWith('TRUNCATED');
    const terminalReturn = naturalTerminal ? rewardForWinnerV19(winnerAllianceId, subjectAllianceId) : null;

    // 信用分配：自然终局可能发生在对手回应阶段（主体最后一次决策之后）。
    // 终局回报必须归到主体最后一次决策上，否则这一局对策略没有任何梯度信号；
    // 同时如实标注它是「对手回应阶段产生的终局」，不伪装成主体自己走出的终局。
    //
    // 中文：因为「滞后一块」的存在，最后一条 transition 一定还在内存里（pending 或 lagged），
    // 因此这里总能改到它；不存在「已经写盘、回报无处可放」的情况。
    let terminalCreditedToOpponentReply = false;
    let terminalCreditedAfterRecordCap = false;
    const lastRecorded = pendingTransitions.length > 0
        ? pendingTransitions[pendingTransitions.length - 1]
        : (lagged !== null && lagged.transitions.length > 0
            ? lagged.transitions[lagged.transitions.length - 1] : null);
    if (record && naturalTerminal && lastRecorded !== null) {
        if (!lastRecorded.terminal) {
            lastRecorded.reward = terminalReturn as number;
            lastRecorded.terminal = true;
            lastRecorded.truncated = false;
            if (subjectDecisions > recordedTotal) {
                // 记录被上限截断：真实终局发生在未被记录的区间之后。
                lastRecorded.terminalCreditedAfterRecordCap = true;
                terminalCreditedAfterRecordCap = true;
            } else {
                lastRecorded.terminalCreditedToOpponentReply = true;
                terminalCreditedToOpponentReply = true;
            }
        }
    }
    // 截断也可能发生在对手回应阶段，最后一次主体决策必须带出截断掩码。
    if (record && truncated && lastRecorded !== null) lastRecorded.truncated = true;

    // 训练合同自检：截断局绝不能带终局回报，自然终局局必须有终局回报。
    if (truncated && terminalReturn !== null) {
        throw new Error('[T19-02] 截断局产生了终局回报，违反奖励合同。');
    }
    if (naturalTerminal && terminalReturn === null) {
        throw new Error('[T19-02] 自然终局局缺少终局回报，违反奖励合同。');
    }
    if (record && recordedTotal > 0) {
        if (naturalTerminal && lastRecorded !== null && lastRecorded.reward !== terminalReturn) {
            throw new Error('[T19-02] 最后一条 transition 的奖励与终局回报不一致。');
        }
        if (truncated && lastRecorded !== null && lastRecorded.terminal) {
            throw new Error('[T19-02] 截断局出现了 terminal 标记。');
        }
    }

    // 收尾写出：先写滞后块，再把最后一块作为 last=true 写出。
    if (onChunk !== undefined) {
        if (lagged !== null) await emitChunk(lagged.transitions, lagged.tensors, false);
        await emitChunk(pendingTransitions, pendingTensors, true);
        lagged = null;
        pendingTransitions = [];
        pendingTensors = [];
    }

    return {
        schema: 'v19_subject_episode_1',
        runId,
        mapName,
        seed,
        subjectSeat,
        subjectAllianceId,
        winnerAllianceId,
        outcomeKind,
        naturalTerminal,
        truncated,
        terminalReturn,
        terminalCreditedToOpponentReply,
        terminalCreditedAfterRecordCap,
        steps,
        turns: finalState.turn,
        plies,
        subjectDecisions,
        recordedDecisions: recordedTotal,
        recordCapped: subjectDecisions > recordedTotal,
        opponentSteps,
        filteredSurrenderBySeat,
        error: engineError ?? policyError,
        wallMs: Date.now() - startedAt,
        encodeMsTotal,
        inferMsTotal,
        encoderSchemaId: predictor ? predictor.encoderSchemaId : null,
        checkpointSha256,
        actionCodes,
        turnSnapshots,
        chunksWritten,
        transitions: record && keepInMemory ? transitions : [],
        ...(captureTensors && keepInMemory ? { tensors } : {}),
        ...(rules ? {} : {}),
    };
}

/** 主体视角的终局回报：自然胜 +1 / 自然负 −1 / 规则平局 0。 */
export function rewardForWinnerV19(winnerAllianceId: number | null, subjectAllianceId: number | null): number {
    if (winnerAllianceId === null) return 0;
    if (winnerAllianceId === -1) return 0;
    if (subjectAllianceId === null) return 0;
    return winnerAllianceId === subjectAllianceId ? 1 : -1;
}
