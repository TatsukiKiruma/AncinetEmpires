/**
 * V17/T17-03：**B100-R / B100-Q 策略适配器**（RNG 合同 + 决策台账）。
 *
 * 合同来源：`v17/V17_B100_TEACHER_ADDENDUM.md` §B1/§B3/§B4。
 *
 * 两个变体（**互相不可替代**，见细则 C1）：
 *
 * - `B100-R`：**逐局持久**教师实例。RNG 是注入式可序列化 mulberry 流，逐局只播种一次，
 *   跨决策连续推进。每次决策记录 `rngBeforeHex` / `rngAfterHex`（mulberry 内部 uint32 状态，
 *   `0x` + 8 位十六进制）与 `rngCalls`（本次决策内 `rng()` 被调用次数）。从 `rngBeforeHex`
 *   新建实例（`rngInitialState`）后重放同一状态，必须得到相同动作与相同 `rngAfterHex`。
 *
 * - `B100-Q`：**每个状态全新实例**。种子由
 *   `uint32(BE-first-4-bytes of SHA256('B100-Q' + teacherVersion + ':' + queryKey + ':' + querySeed))`
 *   派生，默认 `querySeed = 0`。不含任何跨决策记忆；三次完全相同的查询必须一致。
 *   `querySeed=1,2` 只用于测随机扰动敏感性，**不要求**结果相同。
 *
 * 输入身份（`queryKey`）：
 *   1. `inputKeyProvider(state, playerId, allowed)` 给出**网络输入 key**（T17-01 的
 *      `policyInputKeyHexV17`）时用 `queryKeyKind:'policy-input-key'`；
 *   2. 否则回退到已文档化的 `'state:' + sha256(canonicalStateJson(JSON round-trip of state)
 *      + '|' + allowed actionCodes 默认字典序升序，'\n' 连接)`，`queryKeyKind:'state-fallback'`。
 *      回退**不冒充**网络身份，报告必须如实标注。
 *
 * 纪律：
 * - 直接把引擎原生 `allowed` 数组交给 `getAction(engine, playerId, allowed)`，**不放大也不缩小**
 *   学生的合法集；教师内部 topK / pending 筛选原样保留。
 * - 返回值不在 `allowed` 内时记 `chosenInAllowed:false` 并抛错，**绝不**回退 H0 或伪造标签。
 */

import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import {
  B100_SOURCE_HEAD,
  B100_SOURCE_SHA256,
  BattleSearchAI,
  b100ExceptionTotal,
  createB100Instrumentation,
  b100InstrumentationDelta,
  mulberryStateful,
  rngStateHex,
  type B100Instrumentation,
  type StatefulRng,
} from './battle_search_b100';

/* ==========================================================================
 * 冻结配置
 * ========================================================================== */

export type B100Variant = 'B100-R' | 'B100-Q';

/**
 * 解析后的 v11 配置。
 *
 * 中文：前 8 项是**真正的构造器参数**（v11 快照
 * `docs/training/battle_ai/models/battle_search_v11.json`），必须显式传入；
 * 后 7 项是源码里**硬编码、不是构造器选项**的规则，只能随代码一起冻结，
 * 覆盖请求会被拒绝而不是被静默忽略。
 */
export interface B100ResolvedConfig {
  topK: number; oppDepth: number; friendlyRolloutSteps: number;
  takeoverThreshold: number; vetoMargin: number; dangerLine: number;
  searchStartTurn: number; allowSurrender: boolean;
  earlyAttackTakeoverGate: number; pendingFirst: boolean; twoStage: boolean;
  tacticalCandidates: boolean; attackSafetyCheck: boolean; favorableTradeAllowed: boolean;
  phaseBonusProfile: string;
}

/** teacherVersion：`b100-v11-` + 源文件 SHA256 前 8 位。 */
export const B100_TEACHER_VERSION = 'b100-v11-34bf5829';

export const B100_V11_CONFIG: B100ResolvedConfig = {
  topK: 6,
  oppDepth: 3,
  friendlyRolloutSteps: 1,
  takeoverThreshold: 350,
  vetoMargin: 300,
  dangerLine: -800,
  searchStartTurn: 1,
  allowSurrender: false,
  earlyAttackTakeoverGate: 1500,
  pendingFirst: true,
  twoStage: true,
  tacticalCandidates: true,
  attackSafetyCheck: true,
  favorableTradeAllowed: true,
  phaseBonusProfile: 'b100-v11-source-phaseBonus-verbatim',
};

/** 只有这 8 项可以经 `config` 覆盖（它们是真正的构造器参数）。 */
export const B100_CONSTRUCTOR_FIELDS: readonly (keyof B100ResolvedConfig)[] = [
  'topK', 'oppDepth', 'friendlyRolloutSteps', 'takeoverThreshold',
  'vetoMargin', 'dangerLine', 'searchStartTurn', 'allowSurrender',
];

/** 源码硬编码规则：不能覆盖，只能冻结（覆盖请求抛错）。 */
export const B100_FROZEN_SOURCE_FIELDS: readonly (keyof B100ResolvedConfig)[] = [
  'earlyAttackTakeoverGate', 'pendingFirst', 'twoStage', 'tacticalCandidates',
  'attackSafetyCheck', 'favorableTradeAllowed', 'phaseBonusProfile',
];

export function resolveB100Config(overrides?: Partial<B100ResolvedConfig>): B100ResolvedConfig {
  const resolved: B100ResolvedConfig = { ...B100_V11_CONFIG };
  if (!overrides) return resolved;
  for (const key of Object.keys(overrides) as (keyof B100ResolvedConfig)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (B100_FROZEN_SOURCE_FIELDS.includes(key)) {
      if (value !== B100_V11_CONFIG[key]) {
        throw new Error(
          `[B100] '${String(key)}' 是源码硬编码规则（不是构造器选项），冻结值为 `
          + `${JSON.stringify(B100_V11_CONFIG[key])}；请求覆盖为 ${JSON.stringify(value)} 被拒绝。`
          + '要改它必须改教师代码并换 teacherVersion。',
        );
      }
      continue;
    }
    if (!B100_CONSTRUCTOR_FIELDS.includes(key)) {
      throw new Error(`[B100] 未知配置字段 '${String(key)}'。`);
    }
    (resolved as unknown as Record<string, unknown>)[key as string] = value;
  }
  return resolved;
}

/* ==========================================================================
 * RNG 派生合同（字节序必须与报告/配置 JSON 一致）
 * ========================================================================== */

/**
 * B100-R 逐局初始 seed：
 *   `uint32(BE-first-4-bytes of SHA256(utf8("B100-R" + teacherVersion + ":" + rootSeed + ":" + seat)))`
 *
 * 中文：字符串按**字面拼接**（先 `'B100-R'`，紧接 teacherVersion，再 `:rootSeed:seat`），
 * 编码 utf8，取 digest 的**前 4 字节按大端**读成 uint32。与 H0 的 seatstream 完全独立。
 */
export function deriveRngSeedR(teacherVersion: string, rootSeed: number, seat: number): number {
  const material = `B100-R${teacherVersion}:${rootSeed}:${seat}`;
  return createHash('sha256').update(material, 'utf8').digest().readUInt32BE(0);
}

/**
 * B100-Q 每查询 seed：
 *   `uint32(BE-first-4-bytes of SHA256(utf8("B100-Q" + teacherVersion + ":" + queryKey + ":" + querySeed)))`
 *
 * 中文：与 R 同一字节序口径；不掺入 split / 标签 / 查询先后次序。
 */
export function deriveRngSeedQ(teacherVersion: string, queryKey: string, querySeed: number): number {
  const material = `B100-Q${teacherVersion}:${queryKey}:${querySeed}`;
  return createHash('sha256').update(material, 'utf8').digest().readUInt32BE(0);
}

/** 文档化的状态回退 key（**不是**网络输入身份）。 */
export function b100StateFallbackKey(state: unknown, allowed: readonly Action[]): string {
  const roundTripped = JSON.parse(JSON.stringify(state));
  const codes = allowed.map((a) => encodeAction(a)).sort();
  return `state:${createHash('sha256')
    .update(`${canonicalStateJson(roundTripped)}|${codes.join('\n')}`, 'utf8')
    .digest('hex')}`;
}

/* ==========================================================================
 * 决策台账
 * ========================================================================== */

export interface B100DecisionRecord {
  decisionIndex: number; turn: number; playerId: number; allowedCount: number;
  chosenActionCode: string; chosenInAllowed: boolean;
  rngBeforeHex: string | null; rngAfterHex: string | null; rngCalls: number | null;
  queryKeyKind: 'policy-input-key' | 'state-fallback';
  queryKey: string; querySeed: number | null;
  internalExceptions: number; cloneCount: number; stepCount: number;
  fired: { urgent: boolean; forcedWin: boolean; takeover: boolean; veto: boolean; follow: boolean };
  elapsedMs: number;
}

export interface CreateB100PolicyOptions {
  variant: B100Variant; rootSeed: number; seat: number; querySeed?: number;
  teacherVersion?: string;
  rngInitialState?: number;              // R only: explicit uint32 RNG state for recovery replay
  queryKeyOverride?: string;             // Q only: explicit query key
  inputKeyProvider?: (state: any, playerId: number, allowed: readonly any[]) => string | null;
  onDecision?: (record: B100DecisionRecord) => void;
  config?: Partial<B100ResolvedConfig>;
}

export interface B100PolicyHandle {
  policy: (context: { state: any; playerId: number; allowed: readonly any[]; seat: number; seed: number }) => any;
  variant: B100Variant; teacherVersion: string; config: B100ResolvedConfig;
  decisions: B100DecisionRecord[]; exceptions: number;
  rngStateHex(): string | null;          // R only
  resetRng(state: number): void;         // R only
}

/* ==========================================================================
 * 工厂
 * ========================================================================== */

interface CountingRng {
  fn: StatefulRng;
  calls: () => number;
  resetCalls: () => void;
}

function makeCountingRng(initialState: number): CountingRng {
  const base = mulberryStateful(initialState >>> 0);
  let calls = 0;
  const wrapper = (() => {
    calls += 1;
    return base();
  }) as StatefulRng;
  wrapper.getState = () => base.getState();
  wrapper.setState = (state: number) => { base.setState(state); };
  return { fn: wrapper, calls: () => calls, resetCalls: () => { calls = 0; } };
}

function buildTeacherOptions(config: B100ResolvedConfig): Record<string, unknown> {
  const options: Record<string, unknown> = { instrument: true };
  for (const field of B100_CONSTRUCTOR_FIELDS) options[field as string] = config[field];
  return options;
}

export function createB100Policy(options: CreateB100PolicyOptions): B100PolicyHandle {
  const variant = options.variant;
  if (variant !== 'B100-R' && variant !== 'B100-Q') {
    throw new Error(`[B100] 未知 variant '${String(variant)}'（只接受 'B100-R' | 'B100-Q'）。`);
  }
  const teacherVersion = options.teacherVersion ?? B100_TEACHER_VERSION;
  const config = resolveB100Config(options.config);
  const querySeed = options.querySeed ?? 0;

  const decisions: B100DecisionRecord[] = [];
  let exceptions = 0;
  let decisionIndex = 0;

  const teacherOptions = buildTeacherOptions(config);

  /* ---------------- R：逐局持久实例 ---------------- */
  let rCounter: CountingRng | null = null;
  let rTeacher: BattleSearchAI | null = null;
  if (variant === 'B100-R') {
    const initial = options.rngInitialState !== undefined
      ? (options.rngInitialState >>> 0)
      : deriveRngSeedR(teacherVersion, options.rootSeed, options.seat);
    rCounter = makeCountingRng(initial);
    rTeacher = new BattleSearchAI(rCounter.fn, teacherOptions);
  }

  const resolveQueryKey = (
    state: unknown,
    playerId: number,
    allowed: readonly Action[],
  ): { kind: 'policy-input-key' | 'state-fallback'; key: string } => {
    if (variant === 'B100-Q' && options.queryKeyOverride !== undefined) {
      return { kind: 'policy-input-key', key: options.queryKeyOverride };
    }
    if (options.inputKeyProvider) {
      try {
        const provided = options.inputKeyProvider(state, playerId, allowed);
        if (typeof provided === 'string' && provided.length > 0) {
          return { kind: 'policy-input-key', key: provided };
        }
        if (provided !== null && provided !== undefined) {
          throw new Error(`[B100] inputKeyProvider 返回了非字符串非 null 的值：${JSON.stringify(provided)}`);
        }
      } catch (error) {
        exceptions += 1;
        console.warn(`[B100] inputKeyProvider 抛错，回退 state-fallback：${(error as Error).message}`);
      }
    }
    return { kind: 'state-fallback', key: b100StateFallbackKey(state, allowed) };
  };

  const policy = (context: {
    state: any; playerId: number; allowed: readonly any[]; seat: number; seed: number;
  }): any => {
    const startedAt = Date.now();
    if (context.seat !== options.seat) {
      throw new Error(
        `[B100] 座位不一致：handle.seat=${options.seat}，context.seat=${context.seat}；`
        + '拒绝在同一实例上混用两个座位（会污染逐局随机流）。',
      );
    }
    const allowed = Array.from(context.allowed) as Action[];
    const state = context.state as GameState;
    const playerId = context.playerId;

    const { kind: queryKeyKind, key: queryKey } = resolveQueryKey(state, playerId, allowed);

    // 引擎重建：构造函数深拷贝，**不**执行 applyInitialTurnStart（已结算状态不得再发钱）。
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);

    const instBefore: B100Instrumentation = variant === 'B100-R'
      ? (rTeacher as BattleSearchAI).getInstrumentation()
      : createB100Instrumentation();
    let teacher: BattleSearchAI;
    let rng: CountingRng | null = null;
    if (variant === 'B100-R') {
      teacher = rTeacher as BattleSearchAI;
      rng = rCounter;
      rng?.resetCalls();
    } else {
      const seed = deriveRngSeedQ(teacherVersion, queryKey, querySeed);
      rng = makeCountingRng(seed);
      teacher = new BattleSearchAI(rng.fn, teacherOptions);
    }

    // R：记录决策前的 mulberry 内部状态（Q 的记录字段为 null，见合同）。
    const rngBefore = variant === 'B100-R' && rng ? rng.fn.getState() : null;

    let action: Action;
    let thrown: unknown = null;
    try {
      action = teacher.getAction(engine, playerId, allowed);
    } catch (error) {
      thrown = error;
      action = { type: 'end_turn' };
    }

    const rngAfter = variant === 'B100-R' && rng ? rng.fn.getState() : null;
    const instAfter = teacher.getInstrumentation();
    const instDelta = variant === 'B100-R'
      ? b100InstrumentationDelta(instBefore, instAfter)
      : instAfter;
    const decisionExceptions = b100ExceptionTotal(instDelta);
    exceptions += decisionExceptions;

    const chosenActionCode = encodeAction(action);
    const chosenInAllowed = thrown === null
      && allowed.some((a) => encodeAction(a) === chosenActionCode);
    const diag = teacher.getLastDecisionDiagnostics();

    const record: B100DecisionRecord = {
      decisionIndex,
      turn: typeof state.turn === 'number' ? state.turn : -1,
      playerId,
      allowedCount: allowed.length,
      chosenActionCode,
      chosenInAllowed,
      rngBeforeHex: variant === 'B100-R' && rngBefore !== null ? rngStateHex(rngBefore) : null,
      rngAfterHex: variant === 'B100-R' && rngAfter !== null ? rngStateHex(rngAfter) : null,
      rngCalls: variant === 'B100-R' && rng ? rng.calls() : null,
      queryKeyKind,
      queryKey,
      querySeed: variant === 'B100-Q' ? querySeed : null,
      internalExceptions: decisionExceptions,
      cloneCount: instDelta.cloneCount,
      stepCount: instDelta.stepCount,
      fired: {
        urgent: diag.fired.urgent,
        forcedWin: diag.fired.forcedWin,
        takeover: diag.fired.takeover,
        veto: diag.fired.veto,
        follow: diag.fired.follow,
      },
      elapsedMs: Date.now() - startedAt,
    };
    decisionIndex += 1;
    decisions.push(record);
    if (options.onDecision) options.onDecision(record);

    if (thrown !== null) {
      throw new Error(
        `[B100] ${variant} 决策抛错（decisionIndex=${record.decisionIndex}，`
        + `turn=${record.turn}，playerId=${playerId}）：${(thrown as Error)?.message ?? String(thrown)}`,
      );
    }
    if (!chosenInAllowed) {
      throw new Error(
        `[B100] ${variant} 返回的动作不在引擎原生合法集内：chosen='${chosenActionCode}'，`
        + `allowedCount=${allowed.length}。按合同记 chosenInAllowed=false 并抛错，不做 H0 回退。`,
      );
    }
    return action;
  };

  return {
    policy,
    variant,
    teacherVersion,
    config,
    decisions,
    get exceptions() { return exceptions; },
    rngStateHex(): string | null {
      if (variant !== 'B100-R' || !rCounter) return null;
      return rngStateHex(rCounter.fn.getState());
    },
    resetRng(state: number): void {
      if (variant !== 'B100-R' || !rCounter) {
        throw new Error('[B100] resetRng 只对 B100-R 有效。');
      }
      if (!Number.isInteger(state) || state < 0 || state > 0xffffffff) {
        throw new Error(`[B100] resetRng 需要 uint32，实际 ${String(state)}。`);
      }
      rCounter.fn.setState(state >>> 0);
    },
  };
}

/** 供报告引用的来源身份。 */
export const B100_SOURCE_IDENTITY = {
  sourceSha256: B100_SOURCE_SHA256,
  sourceHead: B100_SOURCE_HEAD,
  sourcePath: 'src/game/ai/battle_search_ai.ts',
  portedPath: 'v17/teachers/battle_search_b100.ts',
} as const;
