/**
 * V18/T18-01：L1 标签器的**单次评分合同**版本。
 *
 * ## 为什么要新版本
 *
 * `v15/tools/labeler_l1_v15.ts`（`L1_heuristic_isolated_v15_1`）在同一个 `HeuristicAI` 实例上依次调用：
 *
 * ```text
 * labeler.scoreCandidateActions(...)  → 记录 scores，消耗随机数
 * labeler.getAction(...)              → 内部重新 scoreAction，再消耗随机数，产生标签
 * ```
 *
 * `HeuristicAI` 的各动作评分含随机扰动（`this.rng() * 20/25/30` 等），因此
 * **记录的分数**与**被选中的动作**来自两次不同的评分。
 * 独立重放（`v17/review/v17_l1_rng_probe_20260927.json`）证明这是真实存在的不一致来源：
 * 100 次查询中 4 次出现「分数 argmax ≠ 记录标签」，恢复首次评分前 RNG 后 100/100 一致。
 *
 * 本模块把合同改成：**同一次评分同时产出 scores 和 chosenActionCode**。
 *
 * ## 语义边界（不要越界解读）
 *
 * - 旧版本 `L1_heuristic_isolated_v15_1` 的语义**保持不变**，旧数据不重写；
 *   本版本用新版本号，因此键、种子与标签都可能与旧版不同——这不是 bug，是版本化。
 * - `scores` 仍然是**带随机扰动的启发式分数**，不是胜率、不是真实 Q、不是最优动作真值。
 * - 平局规则显式定义为「分数降序，同分按 actionCode 码点升序」，与数据集的
 *   `candidateOrderingId = actionCode-codepoint-asc-v1` 一致；同时统计
 *   「按候选原顺序取首个最大」（`HeuristicAI.pickBest` 的实际语义）是否给出不同答案，
 *   用于量化平局规则带来的偏差，而不是把差异藏起来。
 */
import type { Action, GameState } from '../../src/game/types';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import {
    canonicalStateJson,
    l1KeyHash,
    L1_RNG_CONTRACT_ID,
    mulberry32,
    seedFromKeyHash,
    stateHashOf,
    type L1KeyParts,
} from '../../v15/tools/labeler_l1_v15';

/** V18 新标签器版本号。任何改变标签语义的修改都必须再升版本。 */
export const L1_LABELER_VERSION_V18 = 'L1_heuristic_singlepass_v18_1';
/** 评分/选择合同身份：一次评分、一次选择。 */
export const L1_V18_SELECTION_CONTRACT = 'single-pass-scores-then-select-tiebreak-actioncode-v1';
/** 随机扰动合同：候选按给定顺序逐个评分，每个候选每次调用 `this.rng()` 各消耗 1 个 draw。 */
export const L1_V18_JITTER_CONTRACT = 'per-candidate-uniform-jitter-in-scoreAction-v1';
/** 紧急动作阈值，与 `HeuristicAI.getAction` 保持一致（不在本模块内改动）。 */
export const L1_V18_URGENT_THRESHOLD = 50000;

export interface L1V18ScoredCandidate {
    actionCode: string;
    actionIndex: number;
    score: number;
    actionType: string;
    /** 该候选评分过程中消耗的 `rng()` 次数（诊断用：证明扰动真的发生）。 */
    rngDraws: number;
}

export interface L1V18Selection {
    chosenActionCode: string;
    chosenActionIndex: number;
    /** 触发紧急动作短路的候选（score >= 50000）的 actionCode；没有则为 null。 */
    urgentActionCode: string | null;
    /** 用候选原顺序 + 严格大于（`pickBest` 语义）选出的动作码，用于量化平局规则差异。 */
    orderBasedActionCode: string;
    /** 两种平局规则是否给出不同动作。 */
    tieBreakMatters: boolean;
    /** 命中的阈值分支，便于后续分层。 */
    branch: 'URGENT' | 'NON_SURRENDER_BEST' | 'FALLBACK_FIRST_ACTION' | 'EMPTY_SET';
}

export interface L1V18QueryResult {
    labelerVersion: string;
    rngContractId: string;
    selectionContractId: string;
    jitterContractId: string;
    actingPlayerId: number;
    subjectAllianceId: number;
    /** 输入身份：查询前后状态摘要必须一致。 */
    stateHashBefore: string;
    stateHashAfter: string;
    stateUnchanged: boolean;
    stateCanonicalHash: string;
    key: L1KeyParts;
    keyHash: string;
    seed: number;
    /** 本次查询消耗的 rng draw 总数（= 各候选 draw 之和）。 */
    rngDrawsTotal: number;
    engineLegalActionCodes: string[];
    policyAllowedActionCodes: string[];
    /** 按 actionCode 升序排列的评分；`actionIndex` 即该规范顺序下的下标。 */
    scores: L1V18ScoredCandidate[];
    selection: L1V18Selection;
    emptyActionSet: boolean;
    diagnostics: string[];
}

export interface L1V18QueryOptions {
    labelSeedBase: number;
    replicateId?: number;
    actingPlayerId: number;
    subjectPlayerId?: number;
    filterSurrender?: boolean;
}

/**
 * 稳定平局规则下的选择：分数降序，同分按 actionCode 码点升序。
 *
 * 这是本版本的**定义**，不是对 `HeuristicAI.pickBest` 的模仿；
 * 后者「严格大于 → 保留最早出现的项」会在同分时依赖候选顺序，
 * 因此我们额外统计两者是否分歧。
 */
export function selectStable(
    scored: ReadonlyArray<{ actionCode: string; score: number }>,
    urgentThreshold = L1_V18_URGENT_THRESHOLD
): { actionCode: string; urgentActionCode: string | null; branch: 'URGENT' | 'NON_SURRENDER_BEST' | 'FALLBACK_FIRST_ACTION' } {
    if (scored.length === 0) {
        return { actionCode: 'end_turn', urgentActionCode: null, branch: 'FALLBACK_FIRST_ACTION' };
    }
    const byStable = (a: { actionCode: string; score: number }, b: { actionCode: string; score: number }): number =>
        b.score - a.score || (a.actionCode < b.actionCode ? -1 : a.actionCode > b.actionCode ? 1 : 0);

    const urgent = scored.filter((item) => item.score >= urgentThreshold).slice().sort(byStable)[0] ?? null;
    if (urgent) {
        return { actionCode: urgent.actionCode, urgentActionCode: urgent.actionCode, branch: 'URGENT' };
    }
    const nonSurrender = scored.filter((item) => !item.actionCode.startsWith('surrender'));
    const pool = nonSurrender.length > 0 ? nonSurrender : scored;
    const best = pool.slice().sort(byStable)[0];
    return { actionCode: best.actionCode, urgentActionCode: null, branch: 'NON_SURRENDER_BEST' };
}

/**
 * 查询一次 V18 L1 标签：**一次评分**产出 scores，**同一次选择**产出 chosenActionCode。
 *
 * 不变量：
 * - 传入的 `state` 不被修改（在深拷贝上构造引擎）；
 * - 每次调用新建 `HeuristicAI` 与 RNG，查询顺序不可能影响结果；
 * - `engineLegalActionCodes` 与 `policyAllowedActionCodes` 的差集只由 surrender 过滤产生；
 * - `scores[i].actionIndex` 是规范（actionCode 升序）顺序下的下标，必须与 `dataset` 的
 *   `targetActionIndex` 口径一致。
 */
export function queryL1LabelV18(state: GameState, options: L1V18QueryOptions): L1V18QueryResult {
    const filterSurrender = options.filterSurrender ?? true;
    const replicateId = options.replicateId ?? 0;
    const subjectPlayerId = options.subjectPlayerId ?? options.actingPlayerId;
    const diagnostics: string[] = [];

    const stateHashBefore = stateHashOf(state);
    const key: L1KeyParts = {
        labelerVersion: L1_LABELER_VERSION_V18,
        labelSeedBase: options.labelSeedBase,
        stateHash: stateHashBefore,
        actingPlayerId: options.actingPlayerId,
        replicateId,
    };
    const keyHash = l1KeyHash(key);
    const seed = seedFromKeyHash(keyHash);

    // 计数型 RNG：包装 mulberry32，统计扰动消耗的 draw 数（不改随机流本身）。
    const baseRng = mulberry32(seed);
    let rngDrawsTotal = 0;
    const countingRng = (): number => {
        rngDrawsTotal += 1;
        return baseRng();
    };

    const workingState = JSON.parse(JSON.stringify(state)) as GameState;
    const engine = new GameEngine(workingState);
    const terminal = engine.isTerminal();
    const engineLegalActions = terminal ? [] : engine.getLegalActions(options.actingPlayerId);
    const engineLegalActionCodes = engineLegalActions.map(encodeAction);
    const allowedActions = engineLegalActions.filter((a) => !filterSurrender || a.type !== 'surrender');
    const policyAllowedActionCodes = allowedActions.map(encodeAction);

    if (allowedActions.length === 0) {
        diagnostics.push('EMPTY_POLICY_ALLOWED_SET');
        const stateHashAfter = stateHashOf(state);
        return {
            labelerVersion: L1_LABELER_VERSION_V18,
            rngContractId: L1_RNG_CONTRACT_ID,
            selectionContractId: L1_V18_SELECTION_CONTRACT,
            jitterContractId: L1_V18_JITTER_CONTRACT,
            actingPlayerId: options.actingPlayerId,
            subjectAllianceId: getAllianceId(state, subjectPlayerId),
            stateHashBefore,
            stateHashAfter,
            stateUnchanged: stateHashAfter === stateHashBefore,
            stateCanonicalHash: stateHashBefore,
            key,
            keyHash,
            seed,
            rngDrawsTotal: 0,
            engineLegalActionCodes,
            policyAllowedActionCodes,
            scores: [],
            selection: {
                chosenActionCode: 'end_turn',
                chosenActionIndex: -1,
                urgentActionCode: null,
                orderBasedActionCode: 'end_turn',
                tieBreakMatters: false,
                branch: 'EMPTY_SET',
            },
            emptyActionSet: true,
            diagnostics,
        };
    }

    // === 唯一一次评分 ===
    const labeler = new HeuristicAI(countingRng);
    const drawCounts = new Map<string, number>();
    const rawScored: Array<{ action: Action; score: number; draws: number }> = [];
    for (const action of allowedActions) {
        const before = rngDrawsTotal;
        const score = labeler.scoreCandidateAction(engine, options.actingPlayerId, action);
        const draws = rngDrawsTotal - before;
        rawScored.push({ action, score, draws });
        const code = encodeAction(action);
        drawCounts.set(code, (drawCounts.get(code) ?? 0) + draws);
    }

    // 规范顺序：actionCode 码点升序（= candidateOrderingId）。
    const canonical = rawScored
        .map((item) => ({
            actionCode: encodeAction(item.action),
            score: item.score,
            actionType: item.action.type,
            rngDraws: item.draws,
        }))
        .sort((a, b) => (a.actionCode < b.actionCode ? -1 : a.actionCode > b.actionCode ? 1 : 0))
        .map((item, index) => ({ ...item, actionIndex: index }));

    // === 同一次选择（基于上面的 scores，不再调用任何评分函数）===
    const stable = selectStable(canonical);

    // 对照：HeuristicAI.pickBest 的「严格大于 → 保留最早出现」语义（在候选原顺序上）。
    // 注意 urgent 分支也是 pickBest（取最高分），不是「第一个达到阈值的候选」。
    const orderScored = rawScored.map((item) => ({ actionCode: encodeAction(item.action), score: item.score }));
    const pickBestInOrder = (pool: Array<{ actionCode: string; score: number }>): string => {
        let best = pool[0];
        for (const item of pool) if (item.score > best.score) best = item;
        return best.actionCode;
    };
    const orderUrgentPool = orderScored.filter((item) => item.score >= L1_V18_URGENT_THRESHOLD);
    let orderBasedActionCode: string;
    if (orderUrgentPool.length > 0) {
        orderBasedActionCode = pickBestInOrder(orderUrgentPool);
    } else {
        const nonSurrender = orderScored.filter((item) => !item.actionCode.startsWith('surrender'));
        orderBasedActionCode = pickBestInOrder(nonSurrender.length > 0 ? nonSurrender : orderScored);
    }

    const chosen = canonical.find((item) => item.actionCode === stable.actionCode)!;

    // === 自检：记录分数的 argmax（稳定规则）必须就是所选动作 ===
    const argmax = canonical.slice().sort((a, b) => b.score - a.score || (a.actionCode < b.actionCode ? -1 : 1))[0];
    const urgentPool = canonical.filter((item) => item.score >= L1_V18_URGENT_THRESHOLD);
    const expectedByConstruction = stable.branch === 'URGENT'
        ? urgentPool.slice().sort((a, b) => b.score - a.score || (a.actionCode < b.actionCode ? -1 : 1))[0].actionCode
        : argmax.actionCode;
    if (expectedByConstruction !== stable.actionCode) {
        diagnostics.push('SELECTION_NOT_DERIVED_FROM_RECORDED_SCORES');
    }
    if (!policyAllowedActionCodes.includes(stable.actionCode)) {
        diagnostics.push('LABEL_OUTSIDE_POLICY_ALLOWED_SET');
    }
    if (stable.actionCode.startsWith('surrender')) {
        diagnostics.push('LABEL_IS_SURRENDER_DESPITE_FILTER');
    }
    if (stable.actionCode !== orderBasedActionCode) {
        diagnostics.push('TIE_BREAK_RULE_CHANGES_ACTION');
    }
    if (drawCounts.size !== canonical.length) {
        diagnostics.push('DUPLICATE_ACTION_CODE_IN_CANDIDATES');
    }

    const stateHashAfter = stateHashOf(state);
    if (stateHashAfter !== stateHashBefore) {
        diagnostics.push('STATE_POLLUTED_BY_QUERY');
    }

    return {
        labelerVersion: L1_LABELER_VERSION_V18,
        rngContractId: L1_RNG_CONTRACT_ID,
        selectionContractId: L1_V18_SELECTION_CONTRACT,
        jitterContractId: L1_V18_JITTER_CONTRACT,
        actingPlayerId: options.actingPlayerId,
        subjectAllianceId: getAllianceId(state, subjectPlayerId),
        stateHashBefore,
        stateHashAfter,
        stateUnchanged: stateHashAfter === stateHashBefore,
        stateCanonicalHash: canonicalStateJson(state) && stateHashBefore,
        key,
        keyHash,
        seed,
        rngDrawsTotal,
        engineLegalActionCodes,
        policyAllowedActionCodes,
        scores: canonical,
        selection: {
            chosenActionCode: stable.actionCode,
            chosenActionIndex: chosen.actionIndex,
            urgentActionCode: stable.urgentActionCode,
            orderBasedActionCode,
            tieBreakMatters: stable.actionCode !== orderBasedActionCode,
            branch: stable.branch,
        },
        emptyActionSet: false,
        diagnostics,
    };
}
