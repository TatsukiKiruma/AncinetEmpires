/**
 * V15/T15-01：独立逐状态标签器 L1（owner D）。
 *
 * 设计目标（对应任务书 §2 与数据契约 §3）：
 *
 * 1. **标签查询不改变行为轨迹**：L1 不读写行为流。行为策略继续持有它自己的
 *    `HeuristicAI` 实例与 RNG；L1 每次查询都从「稳定键」重新构造一个**全新的**
 *    `HeuristicAI` 实例，因此查询次数、查询顺序、查询发生在哪一步都不会影响它后面的输出。
 *    V14b 的缺陷正是「用同一个实例做实际动作又做教师重标」，第二次查询推进了 RNG。
 *
 * 2. **稳定的逐状态键**：`hash(labelerVersion, labelSeedBase, stateHash, actingPlayerId, replicateId)`。
 *    不纳入行号、访问次数、数据分区或候选数组下标。同一完整状态、同一键，
 *    在任何进程/任何顺序下重建都得到同一个 RNG 与同一个标签。
 *
 * 3. **玩家 ID 与联盟 ID 分开**：`getAction` 只接受 `actingPlayerId`；
 *    联盟视角用 `getAllianceId(state, subjectPlayerId)` 单独计算，绝不把联盟 ID 传进玩家参数。
 *
 * 4. **重放忠实**：只接受 `EXACT_SNAPSHOT` / `VERIFIED_REPLAY` 的输入；
 *    缺证据时返回诊断状态，**禁止**用 AI「走到相同步数」冒充历史状态。
 */
import type { Action, GameState } from '../../src/game/types';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { createHash } from 'node:crypto';

/** L1 的版本身份。任何改变标签语义的修改都必须升版本，因为数据契约把版本写进键。 */
export const L1_LABELER_VERSION = 'L1_heuristic_isolated_v15_1';
/** 键派生用的 PRNG 合同身份。 */
export const L1_RNG_CONTRACT_ID = 'mulberry32_splitmix_32bit_v1';

/** 稳定键的组成部分；顺序固定，序列化方式写进版本合同。 */
export interface L1KeyParts {
    labelerVersion: string;
    labelSeedBase: number;
    stateHash: string;
    actingPlayerId: number;
    replicateId: number;
}

/** 把键的各部分按固定顺序、固定分隔符规范化，再取 64 位摘要。 */
export function l1KeyString(parts: L1KeyParts): string {
    return [
        parts.labelerVersion,
        String(parts.labelSeedBase >>> 0),
        parts.stateHash,
        String(parts.actingPlayerId),
        String(parts.replicateId),
    ].join('|');
}

export function l1KeyHash(parts: L1KeyParts): string {
    return createHash('sha256').update(Buffer.from(l1KeyString(parts), 'utf8')).digest('hex');
}

/**
 * 32 位 splitmix 风格的最终混合，再交给 mulberry32。
 *
 * 为什么不用 `hashCode` 之类的 32 位累加：状态摘要已经很长，
 * 需要把 64 位摘要折进 32 位种子而不产生明显的低位偏置。
 */
export function seedFromKeyHash(keyHash: string): number {
    // 取摘要前 8 个十六进制字符（32 位），再与中段混合，保证摘要任一段变化都影响种子。
    const a = parseInt(keyHash.slice(0, 8), 16) >>> 0;
    const b = parseInt(keyHash.slice(8, 16), 16) >>> 0;
    let h = (a ^ Math.imul(b, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32：与 v13 `streamFor` 的底层生成器一致，便于跨版本对照。 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function rngForLabelKey(parts: L1KeyParts): { rng: () => number; seed: number; keyHash: string } {
    const keyHash = l1KeyHash(parts);
    const seed = seedFromKeyHash(keyHash);
    return { rng: mulberry32(seed), seed, keyHash };
}

/** 状态摘要：JSON 规范序列化后取 SHA-256。与 V14 归档的 stateHash 口径无关（见 replay 合同）。 */
export function stateHashOf(state: GameState): string {
    return createHash('sha256').update(Buffer.from(canonicalStateJson(state), 'utf8')).digest('hex');
}

/**
 * 规范序列化：键按字典序排列，保证同一逻辑状态得到同一摘要。
 * 不使用 `JSON.stringify` 的插入顺序（对象构造路径不同会产生不同字节）。
 */
export function canonicalStateJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map((v) => canonicalStateJson(v)).join(',')}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStateJson(obj[k])}`).join(',')}}`;
}

export interface L1QueryResult {
    /** 标签动作码；无法给出合法标签时为 null（不伪造 end_turn）。 */
    actionCode: string | null;
    action: Action | null;
    /** 所有候选的评分，按 actionCode 对齐（候选顺序无关的可复核读数）。 */
    scores: Array<{ actionCode: string; score: number }>;
    key: L1KeyParts;
    keyHash: string;
    seed: number;
    labelerVersion: string;
    rngContractId: string;
    actingPlayerId: number;
    /** 联盟视角，单独记录，绝不作为 playerId 使用。 */
    subjectAllianceId: number;
    engineLegalActionCodes: string[];
    policyAllowedActionCodes: string[];
    /** 查询前/后的状态摘要必须一致；不一致即报告污染。 */
    stateHashBefore: string;
    stateHashAfter: string;
    stateUnchanged: boolean;
    /** 空合法集时的诊断标记。 */
    emptyActionSet: boolean;
    diagnostics: string[];
}

export interface L1QueryOptions {
    labelSeedBase: number;
    replicateId?: number;
    /** 主体玩家 = 当前行动玩家；调用方必须显式给出，不从 state 里猜。 */
    actingPlayerId: number;
    /** 结果视角用的主体玩家；缺省等于 actingPlayerId。 */
    subjectPlayerId?: number;
    /** 策略允许集：主实验统一过滤 surrender。 */
    filterSurrender?: boolean;
    labelerVersion?: string;
}

/**
 * 查询一次 L1 标签。
 *
 * 关键不变量：
 * - 传入的 `state` 不被修改（内部在深拷贝上构造引擎，`HeuristicAI` 也可能调用引擎）；
 * - 每次调用都新建 `HeuristicAI` 与 RNG，与任何行为实例无关；
 * - 候选顺序不进入键，标签按 actionCode 定位。
 */
export function queryL1Label(state: GameState, options: L1QueryOptions): L1QueryResult {
    const filterSurrender = options.filterSurrender ?? true;
    const replicateId = options.replicateId ?? 0;
    const labelerVersion = options.labelerVersion ?? L1_LABELER_VERSION;
    const subjectPlayerId = options.subjectPlayerId ?? options.actingPlayerId;
    const diagnostics: string[] = [];

    const stateHashBefore = stateHashOf(state);
    const key: L1KeyParts = {
        labelerVersion,
        labelSeedBase: options.labelSeedBase,
        stateHash: stateHashBefore,
        actingPlayerId: options.actingPlayerId,
        replicateId,
    };
    const { rng, seed, keyHash } = rngForLabelKey(key);

    // 深拷贝：标签查询必须在与行为实例完全分离的对象图上进行。
    const workingState = JSON.parse(JSON.stringify(state)) as GameState;
    const engine = new GameEngine(workingState);
    const engineLegalActionCodes = engine.isTerminal()
        ? []
        : engine.getLegalActions(options.actingPlayerId).map(encodeAction);
    const policyAllowedActionCodes = filterSurrender
        ? engineLegalActionCodes.filter((c) => !c.startsWith('surrender'))
        : [...engineLegalActionCodes];

    if (policyAllowedActionCodes.length === 0) {
        diagnostics.push('EMPTY_POLICY_ALLOWED_SET');
        return {
            actionCode: null,
            action: null,
            scores: [],
            key,
            keyHash,
            seed,
            labelerVersion,
            rngContractId: L1_RNG_CONTRACT_ID,
            actingPlayerId: options.actingPlayerId,
            subjectAllianceId: getAllianceId(state, subjectPlayerId),
            engineLegalActionCodes,
            policyAllowedActionCodes,
            stateHashBefore,
            stateHashAfter: stateHashOf(state),
            stateUnchanged: stateHashBefore === stateHashOf(state),
            emptyActionSet: true,
            diagnostics,
        };
    }

    // 独立实例 + 每状态独立 RNG。查询顺序因此不可能影响结果。
    const labeler = new HeuristicAI(rng);
    // 让 HeuristicAI 在**允许集**上评分与选择：主实验统一过滤 surrender。
    const allowedActions = (engine.isTerminal() ? [] : engine.getLegalActions(options.actingPlayerId))
        .filter((a) => !filterSurrender || a.type !== 'surrender');
    const scored = labeler.scoreCandidateActions(engine, options.actingPlayerId, allowedActions);
    const chosen = labeler.getAction(engine, options.actingPlayerId, allowedActions);

    const stateHashAfter = stateHashOf(state);
    if (stateHashAfter !== stateHashBefore) {
        diagnostics.push('STATE_POLLUTED_BY_QUERY');
    }
    if (policyAllowedActionCodes.length !== allowedActions.length) {
        diagnostics.push('ALLOWED_SET_ARITY_MISMATCH');
    }
    const chosenCode = encodeAction(chosen);
    if (chosenCode === 'surrender') {
        diagnostics.push('LABEL_IS_SURRENDER_DESPITE_FILTER');
    }
    if (!policyAllowedActionCodes.includes(chosenCode)) {
        diagnostics.push('LABEL_OUTSIDE_POLICY_ALLOWED_SET');
    }

    return {
        actionCode: chosenCode,
        action: chosen,
        // 评分按 actionCode 排序，保证「候选重排不改变读数」。
        scores: scored
            .map((s) => ({ actionCode: encodeAction(s.action), score: s.score }))
            .sort((a, b) => (a.actionCode < b.actionCode ? -1 : a.actionCode > b.actionCode ? 1 : 0)),
        key,
        keyHash,
        seed,
        labelerVersion,
        rngContractId: L1_RNG_CONTRACT_ID,
        actingPlayerId: options.actingPlayerId,
        subjectAllianceId: getAllianceId(state, subjectPlayerId),
        engineLegalActionCodes,
        policyAllowedActionCodes,
        stateHashBefore,
        stateHashAfter,
        stateUnchanged: stateHashAfter === stateHashBefore,
        emptyActionSet: false,
        diagnostics,
    };
}
