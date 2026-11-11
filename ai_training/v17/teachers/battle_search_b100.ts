/**
 * V17/T17-03：**B100 冻结迁入副本**（BattleSearchAI v11）。
 *
 * 来源（只读）：
 *   `C:\code\AncinetEmpires-100pct\src\game\ai\battle_search_ai.ts`
 *   SHA256 `34bf582941252a7b3c6d4f26a60a85a81a6ce4ae1c5c88c4ac96557bea9d6f5b`（807 行）
 *   外部 HEAD `e85bb013936eae90956c491658a4a7b0095ce27b`
 *
 * 本文件是**算法体的逐行搬运**，只做两件允许的改动：
 *   1. 相对 import 路径按当前工作区重写（`../x` → `../../src/game/x`，
 *      `../../../tools/v7_heuristic_bounded_search` → `../../tools/v7_heuristic_bounded_search`）；
 *   2. 加入 `B100Instrumentation` 观测（计数器 + clone/heuristic 计时）。
 *
 * 观测纪律（B100 接入细则 B3 / 评审 §4.3）：
 *   - 每个**吞掉异常**的 `catch` 都有一个独立计数器，原 catch 的返回/中断行为一字不改；
 *   - 计数与计时都不能影响返回值。`instrument:false` 时 `bump()`/`timed()` 全部跳过，
 *     只剩原始算法体本身的执行；`v17/tools/b100_instrumentation_ab.ts` 在真实状态上
 *     对「开/关观测」的最终 actionCode 做等价性验证；
 *   - 不在这里做任何参数默认值变更：v11 参数必须由调用方显式传入
 *     （见 `v17/teachers/b100_policy.ts#B100_V11_CONFIG`）。
 *
 * 与源文件的差异清单（除 import 与观测外应为空）：
 *   - `engine.clone()` 调用点 → `this.cloneEngine(engine)`（内部只多做一次计数+计时）；
 *   - `sim.step(x)` 调用点 → `this.stepEngine(sim, x)`（内部只多做一次计数，异常照原样抛出）；
 *   - `process.env.BATTLE_DEBUG` 诊断块原样保留；
 *   - 新增 `getLastDecisionDiagnostics()` / `getInstrumentation()` / `resetInstrumentation()`
 *     三个只读接口，以及 `mulberryStateful`（与 `mulberryDefault` 同流，额外暴露内部状态）。
 */

import type { Action, GameState } from '../../src/game/types';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { evaluatePositionHeuristic } from '../../tools/v7_heuristic_bounded_search';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../../src/game/rule_config';
import { calculateDamage, inRange } from '../../src/game/rules';
import { getEffectiveStats } from '../../src/game/abilities';
import { getReachablePositions } from '../../src/game/map';
import { UNIT_CONFIGS } from '../../src/game/constants';
import { getTileTerrainConfig } from '../../src/game/terrain_rules';

export type Rng = () => number;

/** 冻结来源身份（迁入副本的 teacherId 组成部分）。 */
export const B100_SOURCE_SHA256 = '34bf582941252a7b3c6d4f26a60a85a81a6ce4ae1c5c88c4ac96557bea9d6f5b';
export const B100_SOURCE_HEAD = 'e85bb013936eae90956c491658a4a7b0095ce27b';
export const B100_SOURCE_REL_PATH = 'src/game/ai/battle_search_ai.ts';

export interface BattleSearchOptions {
  /** 每个决策评估的候选数（按 heuristic 排序取 topK） */
  topK?: number;
  /** 对手集火探测深度（ greedy 最危险攻击连走几步，看穿围殴） */
  oppDepth?: number;
  /** 己方连动展开步数（move 后接 capture/attack 的价值必须展开才看得见） */
  friendlyRolloutSteps?: number;
  /** 接管阈值：候选叶子比 heuristic 首选高出多少才接管（默认 1200） */
  takeoverThreshold?: number;
  /** 避险阈值：heuristic 首选已很差时，备选好出多少才否决（默认 800） */
  vetoMargin?: number;
  /** 危险线：heuristic 首选叶子低于此线视为危险（默认 -1500） */
  dangerLine?: number;
  /** 第几回合开始启用搜索接管/否决；之前只跟 heuristic 首选+urgent（默认 1 即全程） */
  searchStartTurn?: number;
  /** 是否允许投降（默认永不投降） */
  allowSurrender?: boolean;
  /**
   * V17 新增（**非源参数**）：是否记录观测。
   *
   * 中文：false 时所有计数器/计时全部跳过，只有原算法体执行。
   * 该开关**不改变**任何默认参数值，只用于「有观测 / 无观测」的等价性验证。
   */
  instrument?: boolean;
}

/* ==========================================================================
 * 观测容器（纯计数器 + 计时；不参与任何比较与分支）
 * ========================================================================== */

/**
 * B100 内部观测。
 *
 * 中文：`catch*` 系列逐个对应源文件里**吞掉异常**的 catch 块；`getLegalActionsFailures`
 * 是所有 `getLegalActions` 失败的总和（便于一行读总数）。异常查询不能当作干净强标签，
 * 因此这些计数必须如实上报。
 */
export interface B100Instrumentation {
  /** isAttackSafe: sim.step(action) 失败 */
  catchIsAttackSafeStep: number;
  /** isAttackSafe: sim.getLegalActions(playerId) 失败 */
  catchIsAttackSafeLegal: number;
  /** isAttackSafe: calculateDamage 失败（continue） */
  catchIsAttackSafeDamage: number;
  /** cheapLeafOf: sim.step(action) 失败 */
  catchCheapLeafStep: number;
  /** evaluateCandidate: sim.step(action) 失败 */
  catchEvaluateStep: number;
  /** evaluateCandidate: sim.getLegalActions(playerId) 失败 */
  catchEvaluateLegal: number;
  /** evaluateCandidate: sim.step(follow) 失败 */
  catchEvaluateRolloutStep: number;
  /** probeOpponentFocusFire: probe.getLegalActions(oppId) 失败 */
  catchProbeLegal: number;
  /** probeOpponentFocusFire: probe.step(best) 失败 */
  catchProbeStep: number;
  /** repositionCrowdPenalty: getReachablePositions 失败 */
  catchRepositionReach: number;
  /** staticAttackScore: calculateDamage 失败（返回 -Infinity） */
  catchStaticAttackDamage: number;
  /** 所有 getLegalActions 失败次数之和（含 getAction 入口的一次） */
  getLegalActionsFailures: number;
  /** 未知异常（getAction 入口 getLegalActions 抛错） */
  catchGetActionLegal: number;
  /** engine.clone() 调用次数 */
  cloneCount: number;
  /** engine.step() 调用次数（含 clone 上的模拟步） */
  stepCount: number;
  /** heuristic.scoreCandidateActions / getAction 调用次数 */
  heuristicCalls: number;
  /** evaluatePositionHeuristic 调用次数 */
  evaluateCalls: number;
  /** clone 累计墙钟（ms）；instrument=false 时恒为 0 */
  cloneMs: number;
  /** heuristic 评分/决策累计墙钟（ms）；instrument=false 时恒为 0 */
  heuristicMs: number;
  /** evaluatePositionHeuristic 累计墙钟（ms）；instrument=false 时恒为 0 */
  evaluateMs: number;
}

export function createB100Instrumentation(): B100Instrumentation {
  return {
    catchIsAttackSafeStep: 0,
    catchIsAttackSafeLegal: 0,
    catchIsAttackSafeDamage: 0,
    catchCheapLeafStep: 0,
    catchEvaluateStep: 0,
    catchEvaluateLegal: 0,
    catchEvaluateRolloutStep: 0,
    catchProbeLegal: 0,
    catchProbeStep: 0,
    catchRepositionReach: 0,
    catchStaticAttackDamage: 0,
    getLegalActionsFailures: 0,
    catchGetActionLegal: 0,
    cloneCount: 0,
    stepCount: 0,
    heuristicCalls: 0,
    evaluateCalls: 0,
    cloneMs: 0,
    heuristicMs: 0,
    evaluateMs: 0,
  };
}

/** 所有「吞掉异常」计数器之和（不含 clone/step/heuristic 调用计数与计时）。 */
export const B100_CATCH_FIELDS: readonly (keyof B100Instrumentation)[] = [
  'catchIsAttackSafeStep',
  'catchIsAttackSafeLegal',
  'catchIsAttackSafeDamage',
  'catchCheapLeafStep',
  'catchEvaluateStep',
  'catchEvaluateLegal',
  'catchEvaluateRolloutStep',
  'catchProbeLegal',
  'catchProbeStep',
  'catchRepositionReach',
  'catchStaticAttackDamage',
  'getLegalActionsFailures',
  'catchGetActionLegal',
];

export function b100ExceptionTotal(inst: B100Instrumentation): number {
  let total = 0;
  for (const f of B100_CATCH_FIELDS) total += inst[f];
  return total;
}

export function b100InstrumentationDelta(
  before: B100Instrumentation,
  after: B100Instrumentation,
): B100Instrumentation {
  const out = createB100Instrumentation();
  for (const key of Object.keys(out) as (keyof B100Instrumentation)[]) {
    out[key] = (after[key] as number) - (before[key] as number);
  }
  return out;
}

/** 单次决策的可读诊断（B100 接入细则 B3 第 6 条）。 */
export interface B100DecisionDiagnostics {
  /** 本次决策最终返回的 actionCode。 */
  chosenActionCode: string;
  /** 决策走了哪条返回路径。 */
  path: string;
  /** 战术候选数（`buildTacticalCandidates` 输出长度）。 */
  candidateCount: number;
  /** 进入 B 阶段（连动展开 + 对手集火探测）的候选数。 */
  stageBCount: number;
  /** A 阶段便宜叶子值，与 `candidateActionCodes` 对位。 */
  cheapLeafValues: number[];
  /** 候选 actionCode（战术候选顺序）。 */
  candidateActionCodes: string[];
  /** B 阶段真实计算的叶子值；未进入 B 阶段的候选为 null。 */
  stageBLeafValues: Array<number | null>;
  /** heuristic 首选叶子（含 phaseBonus）。 */
  heuTopLeaf: number | null;
  /** 搜索得到的最优叶子（含 phaseBonus）。 */
  bestLeaf: number | null;
  /** bestLeaf - heuTopLeaf。 */
  margin: number | null;
  /** 本次生效的接管门槛（攻击且 T<=8 时为 1500，否则 takeoverThreshold）。 */
  takeoverGate: number | null;
  fired: {
    urgent: boolean;
    forcedWin: boolean;
    takeover: boolean;
    veto: boolean;
    follow: boolean;
    /** 攻击安全检查否决后落到「最优非攻击动作」的额外分支。 */
    attackSafetyFallback: boolean;
  };
}

function emptyDiagnostics(): B100DecisionDiagnostics {
  return {
    chosenActionCode: '',
    path: 'not-run',
    candidateCount: 0,
    stageBCount: 0,
    cheapLeafValues: [],
    candidateActionCodes: [],
    stageBLeafValues: [],
    heuTopLeaf: null,
    bestLeaf: null,
    margin: null,
    takeoverGate: null,
    fired: {
      urgent: false,
      forcedWin: false,
      takeover: false,
      veto: false,
      follow: false,
      attackSafetyFallback: false,
    },
  };
}

/** 源文件里的 mulberry 生成器（**逐字搬运**，闭包状态不可序列化；可序列化版本见 `mulberryStateful`）。 */
export function mulberryDefault(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 可序列化的 mulberry（**与 `mulberryDefault` 数值上逐位相同**）。
 *
 * 中文：B100-R 合同要求保存「决策前 / 决策后的 uint32 内部状态」，而源码的
 * `mulberryDefault` 把状态关在闭包里拿不出来。这里把同一段算术原样重写一遍并暴露
 * `getState()/setState()`；`v17/teachers/b100_rng_selftest.ts` 对多个种子逐值比对
 * 两条流，证明二者等价，而不是靠「看起来一样」。
 *
 * 注意：`a | 0` 与 `a >>> 0` 是同一个 32 位模式的不同解释，`getState()` 统一返回
 * 无符号视图（`0x` + 8 hex digits 即由它格式化）。
 */
export interface StatefulRng extends Rng {
  getState(): number;
  setState(state: number): void;
}

export function mulberryStateful(seed: number): StatefulRng {
  let a = seed >>> 0;
  const fn = (() => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as StatefulRng;
  fn.getState = () => a >>> 0;
  fn.setState = (state: number) => { a = state >>> 0; };
  return fn;
}

/** uint32 → `0x` + 8 位小写十六进制（R 合同的 rngBeforeHex / rngAfterHex 格式）。 */
export function rngStateHex(state: number): string {
  return `0x${(state >>> 0).toString(16).padStart(8, '0')}`;
}

/** `0x…` → uint32（非法输入抛错，不静默当 0）。 */
export function parseRngStateHex(hex: string): number {
  if (!/^0x[0-9a-f]{1,8}$/i.test(hex)) {
    throw new Error(`[B100] rngStateHex 格式非法（要求 0x + 1..8 位十六进制）：'${hex}'`);
  }
  return Number.parseInt(hex.slice(2), 16) >>> 0;
}

/**
 * BattleSearchAI（训练分支工作模型 v5，保底+否决+战术覆盖+局面导向）:
 * - 默认完全跟随 HeuristicAI 首选（保底不低于 heuristic，避免叶子噪声主导走位）；
 * - 候选集战术覆盖：heuTop 保底 + 全部 capture + 按分取 top 攻击 +
 *   指挥官招募 + heuristic 顺序填充（拥挤残局也不漏关键杀招/占领）；
 * - 每个候选真实模拟 1 步 + 己方连动展开（最多 friendlyRolloutSteps 步），
 *   再探测对手最危险回应（攻击/占领优先 + 对手 heuristic 最优回应兜底招募/运营），
 *   得到 maximin 叶子值；
 * - 局面导向修正（零额外模拟）：劣势不换子（攻击减分）、开局抢扩张
 *   （占领加分）、优势不拖延（wait/end_turn 减分）；
 * - 只有两种情况接管：① 发现比 heuristic 首选高出 takeoverThreshold 的大优解；
 *   ② heuristic 首选已低于 dangerLine 且备选好出 vetoMargin 以上（否决送子/被反打）。
 * - 终局胜负严格主导（±100000）。
 */
export interface BattleSearchStats {
  decisions: number;
  urgentHits: number;
  forcedWins: number;
  takeovers: number;
  vetos: number;
  follows: number;
}

export class BattleSearchAI {
  private heuristic: HeuristicAI;
  private rng: Rng;
  private topK: number;
  private oppDepth: number;
  private friendlyRolloutSteps: number;
  private takeoverThreshold: number;
  private vetoMargin: number;
  private dangerLine: number;
  private searchStartTurn: number;
  private allowSurrender: boolean;
  private stats: BattleSearchStats = { decisions: 0, urgentHits: 0, forcedWins: 0, takeovers: 0, vetos: 0, follows: 0 };
  /** V17：观测开关（false ⇒ 全部 bump/timed 跳过，行为与源文件一致）。 */
  private instOn: boolean;
  /** V17：观测容器。 */
  private inst: B100Instrumentation = createB100Instrumentation();
  /** V17：最近一次决策的诊断。 */
  private lastDiagnostics: B100DecisionDiagnostics = emptyDiagnostics();

  constructor(seedOrRng?: number | Rng, options?: BattleSearchOptions) {
    if (typeof seedOrRng === 'function') this.rng = seedOrRng;
    else this.rng = mulberryDefault(seedOrRng ?? 0xBEEF);
    // heuristic 内部有 rng 抖动（*20/*30），给它一个派生 rng 以保证可复现
    this.heuristic = new HeuristicAI(this.rng);
    this.topK = options?.topK ?? 6;
    this.oppDepth = options?.oppDepth ?? 3;
    this.friendlyRolloutSteps = options?.friendlyRolloutSteps ?? 2;
    this.takeoverThreshold = options?.takeoverThreshold ?? 350;
    this.vetoMargin = options?.vetoMargin ?? 300;
    this.dangerLine = options?.dangerLine ?? -800;
    this.searchStartTurn = options?.searchStartTurn ?? 1;
    this.allowSurrender = options?.allowSurrender ?? false;
    this.instOn = options?.instrument !== false;
  }

  /* ---------------- V17 观测原语（不参与分支决策） ---------------- */

  private bump(field: keyof B100Instrumentation, n = 1): void {
    if (!this.instOn) return;
    (this.inst[field] as number) += n;
  }

  private mark(field: 'cloneMs' | 'heuristicMs' | 'evaluateMs', t0: number): void {
    if (!this.instOn) return;
    this.inst[field] += Date.now() - t0;
  }

  private t0(): number {
    return this.instOn ? Date.now() : 0;
  }

  /** engine.clone() 的观测包装；除计数/计时外与直接调用完全等价。 */
  private cloneEngine(engine: GameEngine): GameEngine {
    this.bump('cloneCount');
    const t = this.t0();
    const clone = engine.clone();
    this.mark('cloneMs', t);
    return clone;
  }

  /** engine.step() 的观测包装；返回值照原样丢弃，异常照原样抛出。 */
  private stepEngine(engine: GameEngine, action: Action): void {
    this.bump('stepCount');
    engine.step(action);
  }

  private scoreWithHeuristic(
    engine: GameEngine,
    playerId: number,
    actions: readonly Action[],
  ): Array<{ action: Action; score: number }> {
    this.bump('heuristicCalls');
    const t = this.t0();
    const scored = this.heuristic.scoreCandidateActions(engine, playerId, actions);
    this.mark('heuristicMs', t);
    return scored;
  }

  private chooseWithHeuristic(engine: GameEngine, playerId: number, actions: readonly Action[]): Action {
    this.bump('heuristicCalls');
    const t = this.t0();
    const action = this.heuristic.getAction(engine, playerId, actions);
    this.mark('heuristicMs', t);
    return action;
  }

  private evaluateLeaf(state: GameState, playerId: number): number {
    this.bump('evaluateCalls');
    const t = this.t0();
    const value = evaluatePositionHeuristic(state, playerId);
    this.mark('evaluateMs', t);
    return value;
  }

  /** 最近一次决策的可读诊断（未跑过决策时返回占位记录）。 */
  public getLastDecisionDiagnostics(): B100DecisionDiagnostics {
    return {
      ...this.lastDiagnostics,
      cheapLeafValues: [...this.lastDiagnostics.cheapLeafValues],
      candidateActionCodes: [...this.lastDiagnostics.candidateActionCodes],
      stageBLeafValues: [...this.lastDiagnostics.stageBLeafValues],
      fired: { ...this.lastDiagnostics.fired },
    };
  }

  public getInstrumentation(): B100Instrumentation {
    return { ...this.inst };
  }

  public resetInstrumentation(): void {
    this.inst = createB100Instrumentation();
  }

  public getAction(engine: GameEngine, playerId: number, preparedActions?: readonly Action[]): Action {
    const diag = emptyDiagnostics();
    this.lastDiagnostics = diag;
    let legal: Action[];
    if (preparedActions !== undefined) {
      legal = preparedActions.slice();
    } else {
      try {
        legal = engine.getLegalActions(playerId).slice();
      } catch {
        this.bump('catchGetActionLegal');
        this.bump('getLegalActionsFailures');
        diag.path = 'get-legal-failed';
        return { type: 'end_turn' };
      }
    }
    if (legal.length === 0) {
      diag.path = 'empty-legal';
      return { type: 'end_turn' };
    }
    const nonSurrender = legal.filter(a => a.type !== 'surrender');
    let pool = this.allowSurrender ? legal : (nonSurrender.length > 0 ? nonSurrender : legal);

    if (pool.length === 1) {
      diag.path = 'single-pool';
      diag.candidateCount = 1;
      diag.candidateActionCodes = [this.actionCode(pool[0])];
      diag.chosenActionCode = this.actionCode(pool[0]);
      return pool[0];
    }

    // 待行动（pending）单位优先：刚招募的单位必须先行动才能解锁后续招募。
    // 否则出现“招一停”：pending 常驻整回合，招募链断裂（Peak P0 T1 单招 vs P1 三连招教训）。
    const pendingId = engine.getState().pendingUnitId;
    if (pendingId) {
      const pendingUnit = engine.getState().units.find(u => u.id === pendingId && u.ownerId === playerId);
      if (pendingUnit && !pendingUnit.hasActed && pendingUnit.hp > 0) {
        const pendingActions = pool.filter(a => this.getActionUnitId(a) === pendingId);
        if (pendingActions.length > 0) {
          pool = pendingActions;
          if (pool.length === 1) {
            diag.path = 'pending-single';
            diag.candidateCount = 1;
            diag.candidateActionCodes = [this.actionCode(pool[0])];
            diag.chosenActionCode = this.actionCode(pool[0]);
            return pool[0];
          }
        }
      }
    }

    this.stats.decisions += 1;
    const scored = this.scoreWithHeuristic(engine, playerId, pool);
    // 与 HeuristicAI 一致的 urgent 快捷（守城/救指挥官等 >=50000 直接走）
    let urgentBest: { action: Action; score: number } | null = null;
    for (const s of scored) {
      if (s.score >= 50000 && (!urgentBest || s.score > urgentBest.score)) urgentBest = s;
    }
    if (urgentBest) {
      this.stats.urgentHits += 1;
      diag.fired.urgent = true;
      diag.path = 'urgent';
      diag.chosenActionCode = this.actionCode(urgentBest.action);
      return urgentBest.action;
    }

    // 开局阶段：只跟 heuristic（开局定型方差大，搜索易带偏）；到回合后再接管/否决
    if (engine.getState().turn < this.searchStartTurn) {
      let best = scored[0];
      for (const s of scored) {
        if (s.score > best.score) best = s;
      }
      if (best.action.type === 'surrender' && pool.length > 1) {
        const non = scored.filter(s => s.action.type !== 'surrender');
        if (non.length > 0) {
          best = non[0];
          for (const s of non) {
            if (s.score > best.score) best = s;
          }
        }
      }
      this.stats.follows += 1;
      diag.fired.follow = true;
      diag.path = 'pre-search-follow';
      diag.chosenActionCode = this.actionCode(best.action);
      return best.action;
    }

    const ordered = [...scored].sort((a, b) => b.score - a.score);
    const candidates = this.buildTacticalCandidates(pool, ordered, engine.getState(), playerId);
    const heuTop = candidates[0];

    // 两阶段评估：A阶段便宜叶子（1步模拟直评）全覆盖找即时胜负并排序，
    // B阶段只对 heuTop + A阶段前3做连动展开+对手探测（贵）。
    const cheapLeaf = candidates.map(c => this.cheapLeafOf(engine, playerId, c.action));
    diag.candidateCount = candidates.length;
    diag.candidateActionCodes = candidates.map(c => this.actionCode(c.action));
    diag.cheapLeafValues = cheapLeaf.slice();
    diag.stageBLeafValues = candidates.map(() => null);
    // 必胜直取（A阶段即可发现即时终局）
    for (let i = 0; i < candidates.length; i++) {
      if (cheapLeaf[i] >= 100000) {
        this.stats.forcedWins += 1;
        diag.fired.forcedWin = true;
        diag.path = 'forced-win';
        diag.chosenActionCode = this.actionCode(candidates[i].action);
        return candidates[i].action;
      }
    }
    // B阶段集合：heuTop(0号) + cheap前3（去重）
    const orderByCheap = candidates.map((_, i) => i).sort((a, b) => cheapLeaf[b] - cheapLeaf[a]);
    const stageB = new Set<number>([0]);
    for (const i of orderByCheap) {
      if (stageB.size >= Math.min(4, candidates.length)) break;
      stageB.add(i);
    }
    diag.stageBCount = stageB.size;
    const leafByIndex = new Map<number, number>();
    const leafOf = (idx: number): number => {
      const cached = leafByIndex.get(idx);
      if (cached !== undefined) return cached;
      const v = stageB.has(idx) ? this.evaluateCandidate(engine, playerId, candidates[idx].action) : cheapLeaf[idx];
      leafByIndex.set(idx, v);
      if (this.instOn) diag.stageBLeafValues[idx] = stageB.has(idx) ? v : null;
      return v;
    };

    const heuTopLeaf = leafOf(0) + this.phaseBonus(engine.getState(), playerId, candidates[0].action);
    diag.heuTopLeaf = heuTopLeaf;

    let bestIdx = 0;
    let bestLeaf = heuTopLeaf;
    for (let i = 1; i < candidates.length; i++) {
      const leaf = leafOf(i) + this.phaseBonus(engine.getState(), playerId, candidates[i].action);
      if (leaf > bestLeaf) {
        bestLeaf = leaf;
        bestIdx = i;
      }
    }
    diag.bestLeaf = bestLeaf;
    diag.margin = bestLeaf - heuTopLeaf;

    // 临时诊断：BATTLE_DEBUG=1 时打印会战回合的决策明细
    if (process.env.BATTLE_DEBUG === '1') {
      const st = engine.getState();
      const detail = candidates.map((c, i) => {
        const flag = (stageB.has(i) ? 'B' : 'A') + (i === 0 ? '(heu)' : '') + (i === bestIdx ? '(best)' : '');
        return `${c.action.type}${flag}:${Math.round(leafOf(i))}`;
      }).join(' ');
      console.error(`[DBG] T${st.turn} P${playerId} heuTopLeaf=${Math.round(heuTopLeaf)} bestLeaf=${Math.round(bestLeaf)} margin=${Math.round(bestLeaf - heuTopLeaf)} | ${detail}`);
    }

    // ① 大优接管：最优叶子比 heuristic 首选高出 takeoverThreshold。
    // 扩张期（T≤8）攻击接管要过更高的门槛：防止为小人头放弃扩张、
    // 打完被围殴（对手 move-then-attack 报复是探测盲区）。
    const bestAction = candidates[bestIdx].action;
    const turn = engine.getState().turn;
    const gate = bestAction.type === 'attack' && turn <= 8 ? 1500 : this.takeoverThreshold;
    diag.takeoverGate = gate;
    let chosen: Action;
    if (bestLeaf >= heuTopLeaf + gate) {
      this.stats.takeovers += 1;
      diag.fired.takeover = true;
      chosen = bestAction;
    } else if (heuTopLeaf <= this.dangerLine && bestLeaf >= heuTopLeaf + this.vetoMargin) {
      // ② 否决避险：heuristic 首选已落入危险线，且备选明显更安全
      this.stats.vetos += 1;
      diag.fired.veto = true;
      chosen = candidates[bestIdx].action;
    } else {
      this.stats.follows += 1;
      diag.fired.follow = true;
      chosen = heuTop.action;
    }
    // ③ 攻击安全检查：非优势下，被现有火力围殴致死的攻击一律否决
    // （杀指挥官除外；能战后撤离的突击单位除外）
    const safe = this.isAttackSafe(engine, playerId, chosen);
    if (safe) {
      diag.path = diag.fired.takeover ? 'takeover'
        : diag.fired.veto ? 'veto'
          : 'follow';
      diag.chosenActionCode = this.actionCode(chosen);
      return chosen;
    }
    const fallback = this.bestNonAttack(engine, playerId, candidates, leafOf);
    if (fallback) {
      this.stats.vetos += 1;
      diag.fired.veto = true;
      diag.fired.attackSafetyFallback = true;
      diag.path = 'attack-unsafe-fallback';
      diag.chosenActionCode = this.actionCode(fallback);
      return fallback;
    }
    diag.path = 'attack-unsafe-keep';
    diag.chosenActionCode = this.actionCode(chosen);
    return chosen;
  }

  /** 攻击是否安全：优势/杀指挥官直接放行； zicht 有利交换（杀掉价值相当或更高的目标）
   * 即使攻击者会死也放行（Crossing game1 全局零杀戮就是这么输的：安全检查把 1 换 1
   * 的好买卖全否了）；只否决“白送”（杀不掉还搭上自己）。
   */
  private isAttackSafe(engine: GameEngine, playerId: number, action: Action): boolean {
    if (action.type !== 'attack') return true;
    const state = engine.getState();
    if (this.materialRatio(state, playerId) > 1.25) return true;
    const target = state.units.find(u => u.id === action.targetId);
    if (target && isCommanderUnit(state, target)) return true;
    const attackerBefore = state.units.find(u => u.id === action.attackerId);
    const targetValue = target ? (getUnitCost(state, target.ownerId, target.unitClass) ?? 200) : 0;
    const attackerValue = attackerBefore ? (getUnitCost(state, attackerBefore.ownerId, attackerBefore.unitClass) ?? 200) : 99999;
    const sim = this.cloneEngine(engine);
    try {
      this.stepEngine(sim, action);
    } catch {
      this.bump('catchIsAttackSafeStep');
      return false;
    }
    const after = sim.getState();
    const targetAfter = after.units.find(u => u.id === action.targetId);
    const targetDied = !targetAfter || targetAfter.hp <= 0;
    // 有利交换：杀掉价值相当或更高的目标，攻击者陪葬也值
    if (targetDied && targetValue >= attackerValue * 0.8) return true;
    const attacker = after.units.find(u => u.id === action.attackerId);
    if (!attacker || attacker.hp <= 0) return false;
    // 有战后撤离手段则假定可逃生
    try {
      const legal = sim.getLegalActions(playerId);
      if (legal.some(a => a.type === 'post_attack_move' && a.unitId === attacker.id)) return true;
    } catch {
      // 取不到合法动作则继续按火力验算
      this.bump('catchIsAttackSafeLegal');
      this.bump('getLegalActionsFailures');
    }
    const allied = getAllianceId(after, playerId);
    let incoming = 0;
    for (const enemy of after.units) {
      if (enemy.hp <= 0 || getAllianceId(after, enemy.ownerId) === allied) continue;
      const stats = getEffectiveStats(enemy);
      if (!inRange(enemy.pos, attacker.pos, stats.minRange, stats.maxRange)) continue;
      try {
        incoming += Math.min(attacker.hp, calculateDamage(after, enemy.id, attacker.id));
      } catch {
        this.bump('catchIsAttackSafeDamage');
        continue;
      }
      if (incoming >= attacker.hp) return false;
    }
    return incoming < attacker.hp;
  }

  /** 受偷袭威胁的我方城堡：敌指挥官逼近（曼哈顿≤8）且城堡周边3格无我方守军。
   * 双条件缺一不可：半径≤5 会漏掉两回合走上来偷城（Crossing game1 T10 丢第二城堡教训）；
   * 无“无人防守”条件则会在指挥官中场游荡时全程误报，把部队钉死在城堡里（Peak game2 教训）。 */
  private threatenedOwnCastles(state: GameState, playerId: number): Array<{ x: number; y: number }> {
    const enemyCommanders: Array<{ x: number; y: number }> = [];
    for (const u of state.units) {
      if (u.hp <= 0 || u.ownerId === playerId) continue;
      if (getAllianceId(state, u.ownerId) === getAllianceId(state, playerId)) continue;
      if (isCommanderUnit(state, u)) enemyCommanders.push(u.pos);
    }
    if (enemyCommanders.length === 0) return [];
    const allied = getAllianceId(state, playerId);
    const out: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const tile = state.map.tiles[y][x];
        if (getTileTerrainConfig(tile).key !== 'castle') continue;
        if ((tile as { ownerId: number | null }).ownerId !== playerId) continue;
        const d = Math.min(...enemyCommanders.map(e => Math.abs(e.x - x) + Math.abs(e.y - y)));
        if (d > 8) continue;
        // 周边3格有守军则不告警（ heuristic 自带近身急救；避免中场误报）
        let defended = false;
        for (const u of state.units) {
          if (u.hp <= 0 || getAllianceId(state, u.ownerId) !== allied) continue;
          if (Math.abs(u.pos.x - x) + Math.abs(u.pos.y - y) <= 3) {
            defended = true;
            break;
          }
        }
        if (!defended) out.push({ x, y });
      }
    }
    return out;
  }

  /** 候选中的最优非攻击动作（按叶子+局面修正），攻击被安全否决时的退路。 */
  private bestNonAttack(
    engine: GameEngine,
    playerId: number,
    candidates: Array<{ action: Action; score: number }>,
    leafOf: (idx: number) => number
  ): Action | null {
    const state = engine.getState();
    let best: Action | null = null;
    let bestValue = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i].action;
      if (a.type === 'attack') continue;
      const v = leafOf(i) + this.phaseBonus(state, playerId, a);
      if (v > bestValue) {
        bestValue = v;
        best = a;
      }
    }
    return best;
  }

  /** 己方/敌方物质比（ commander 溢价 600，与叶子评估同口径）。 */
  private materialRatio(state: GameState, playerId: number): number {
    const allied = getAllianceId(state, playerId);
    let myMat = 0;
    let enemyMat = 0;
    for (const u of state.units) {
      if (u.hp <= 0) continue;
      const cost = getUnitCost(state, u.ownerId, u.unitClass) ?? 200;
      const value = cost * (u.hp / 100) + (isCommanderUnit(state, u) ? 600 : 0);
      if (getAllianceId(state, u.ownerId) === allied) myMat += value;
      else enemyMat += value;
    }
    return myMat / Math.max(1, enemyMat);
  }

  /**
   * 局面导向修正（零模拟成本）：劣势不换子+不送（拉开距离）、
   * 开局抢扩张（向无主目标靠拢+占领）、优势压迫不拖延。
   * 返回加到叶子值上的修正分。
   */
  private phaseBonus(state: GameState, playerId: number, action: Action): number {
    const allied = getAllianceId(state, playerId);
    const enemies: Array<{ x: number; y: number }> = [];
    for (const u of state.units) {
      if (u.hp <= 0) continue;
      if (getAllianceId(state, u.ownerId) !== allied) enemies.push(u.pos);
    }
    const ratio = this.materialRatio(state, playerId);
    const turn = state.turn;
    const behind = ratio < 0.85;
    const ahead = ratio > 1.25;
    switch (action.type) {
      case 'attack': {
        // 击杀偷袭指挥官优先
        const target = state.units.find(u => u.id === (action as { targetId: string }).targetId);
        if (target && isCommanderUnit(state, target)) {
          const threatened = this.threatenedOwnCastles(state, playerId);
          if (threatened.length > 0) {
            const d = Math.min(...threatened.map(c => Math.abs(c.x - target.pos.x) + Math.abs(c.y - target.pos.y)));
            if (d <= 8) return 1500;
          }
        }
        if (behind) return -600;
        if (ahead) return 250;
        return 0;
      }
      case 'capture': {
        // 扫尾模式：敌方只剩≤3单位时，占领即胜势，强推结束比赛（Liberty game4 67回合打扫教训）
        let enemyCount = 0;
        for (const u of state.units) {
          if (u.hp > 0 && getAllianceId(state, u.ownerId) !== allied) enemyCount += 1;
        }
        if (enemyCount <= 3) return 1500;
        return (turn <= 8 ? 500 : 0) + (behind ? 250 : 0);
      }
      case 'recruit_to_castle': {
        // 开局指挥官让城：指挥官站城堡时堆叠招募会堵住第二招，先让指挥官走开
        if (turn <= 3) {
          const commander = state.units.find(
            u => u.ownerId === playerId && u.hp > 0 && isCommanderUnit(state, u)
          );
          if (commander
            && commander.pos.x === action.castlePos.x
            && commander.pos.y === action.castlePos.y) {
            return -3000;
          }
        }
      }
      // eslint-disable-next-line no-fallthrough
      case 'recruit_and_deploy': {
        const me = state.players.find(p => p.id === playerId);
        const gold = me?.gold ?? 0;
        // 部署招募优先于堆叠招募：堆叠占住城堡会堵住后续招募（P1 靠 deploy 连爆两兵）
        const deployBonus = action.type === 'recruit_and_deploy' && turn <= 4 ? 300 : 0;
        // 开局强制爆兵：T1 不招募整局少一单位（P1 每局 T1 招募就是这么领先的）。
        // 必须买便宜货：贵单位一次掏空金库会堵死第二招（dark_mage 300 教训）。
        if (turn <= 2 && gold >= 150) {
          const cost = getUnitCost(state, playerId, action.unitClass) ?? 999;
          return 2000 + Math.max(0, 300 - cost) * 5 + deployBonus;
        }
        // 有钱买精兵：金库充裕时偏好 400~800 中坚（paladin/witch/elf/berserker），
        // 避免 soldier 人海（Liberty game2 教训）；缺人时才用便宜货填数。
        if (gold >= 450) {
          const cost = getUnitCost(state, playerId, action.unitClass) ?? 999;
          if (cost >= 400 && cost <= 800) return 350 + deployBonus;
        }
        // 缺人就爆兵：均势/劣势且数量落后时有钱就爆兵（Liberty game4 T11囤475金被骷髅海淹死教训）。
        // 只看物质比会陷入“便宜人海”陷阱（Peak game2：15个弱兵被8个精兵全歼），必须同时数量落后才加码；
        // 数量持平/领先时让 heuristic 按质取舍，避免弱兵稀释战力。
        // 优势才允许存钱憋大怪。
        let myCount = 0;
        let enemyCount = 0;
        for (const u of state.units) {
          if (u.hp <= 0) continue;
          if (getAllianceId(state, u.ownerId) === allied) myCount += 1;
          else enemyCount += 1;
        }
        if (gold >= 250 && (turn <= 10 || (ratio < 1.1 && myCount < enemyCount))) {
          return 600 + (behind ? 150 : 0) + deployBonus;
        }
        return behind ? 150 : 0;
      }
      case 'wait':
      case 'end_turn':
        return ahead ? -400 : 0;
      case 'move':
      case 'post_attack_move': {
        const unit = state.units.find(u => u.id === action.unitId);
        if (!unit) return 0;
        // 城堡防偷：敌指挥官逼近时，重奖回防驻守
        if (enemies.length > 0) {
          const threatened = this.threatenedOwnCastles(state, playerId);
          if (threatened.length > 0
            && threatened.some(c => c.x === action.to.x && c.y === action.to.y)) {
            return 1500;
          }
        }
        if (enemies.length === 0) return 0;
        const manhattan = (x1: number, y1: number, x2: number, y2: number): number => (
          Math.abs(x1 - x2) + Math.abs(y1 - y2)
        );
        const dBefore = Math.min(...enemies.map(e => manhattan(unit.pos.x, unit.pos.y, e.x, e.y)));
        const dAfter = Math.min(...enemies.map(e => manhattan(action.to.x, action.to.y, e.x, e.y)));
        let bonus = 0;
        // 劣势：远离敌群（放风筝），靠近敌群重罚（不送）
        if (behind) bonus += Math.max(-600, Math.min(600, (dAfter - dBefore) * 150));
        else if (ahead) bonus += Math.max(-400, Math.min(400, (dBefore - dAfter) * 80));
        // 局部兵力：别落单进人堆（Icy game2 T17-T18 五个单位两回合蒸发教训）；
        // 抱团推进则奖励。曼哈顿3格为局部。
        {
          let alliesNear = 0;
          let enemiesNear = 0;
          for (const u of state.units) {
            if (u.hp <= 0 || u.id === unit.id) continue;
            const d = Math.abs(u.pos.x - action.to.x) + Math.abs(u.pos.y - action.to.y);
            if (d > 3) continue;
            if (getAllianceId(state, u.ownerId) === allied) alliesNear += 1;
            else enemiesNear += 1;
          }
          const abilities = UNIT_CONFIGS[unit.unitClass]?.abilities ?? [];
          const isCapturer = abilities.includes('village_capturer') || abilities.includes('castle_capturer');
          if (enemiesNear > alliesNear + 1) {
            bonus += behind ? -800 : -400;
          } else if (alliesNear === 0 && enemiesNear >= 1 && !isCapturer) {
            // 非占领单位落单进敌区 = 送（Crossing game1 T6 9v8 优势开局随后被各个击破教训）；
            // 占领单位单走是本职，不罚。
            bonus += -700;
          } else if (alliesNear >= 2) {
            // 抱团推进才是战力
            bonus += 400;
          }
        }
        // 开局：占领者向无主建筑靠拢
        if (turn <= 8) {
          const abilities = UNIT_CONFIGS[unit.unitClass]?.abilities ?? [];
          if (abilities.includes('village_capturer') || abilities.includes('castle_capturer')) {
            let objBefore = Infinity;
            let objAfter = Infinity;
            for (let y = 0; y < state.map.height; y++) {
              for (let x = 0; x < state.map.width; x++) {
                const tile = state.map.tiles[y][x];
                const key = getTileTerrainConfig(tile).key;
                if (key !== 'town' && key !== 'castle') continue;
                const owner = (tile as { ownerId: number | null }).ownerId;
                if (owner !== null && getAllianceId(state, owner) === allied) continue;
                if (key === 'town' && !abilities.includes('village_capturer')) continue;
                if (key === 'castle' && !abilities.includes('castle_capturer')) continue;
                objBefore = Math.min(objBefore, manhattan(unit.pos.x, unit.pos.y, x, y));
                objAfter = Math.min(objAfter, manhattan(action.to.x, action.to.y, x, y));
              }
            }
            if (objBefore !== Infinity) bonus += Math.max(-300, Math.min(300, (objBefore - objAfter) * 60));
          }
        }
        return Math.round(bonus);
      }
      default:
        return 0;
    }
  }

  /**
   * 战术覆盖候选集：heuTop 保底第一位，其余按 capture > 高分 attack >
   * 指挥官招募 > heuristic 顺序填充，上限 topK。拥挤残局也不漏关键招。
   */
  private buildTacticalCandidates(
    pool: Action[],
    ordered: Array<{ action: Action; score: number }>,
    state: GameState,
    playerId: number
  ): Array<{ action: Action; score: number }> {
    const seen = new Set<string>();
    const out: Array<{ action: Action; score: number }> = [];
    const push = (item: { action: Action; score: number }): void => {
      const key = this.actionCode(item.action);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    if (ordered.length === 0) return out;
    // 1. heuTop 保底
    push(ordered[0]);
    // 2. 全部 capture（通常很少，全部纳入）
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      if (item.action.type === 'capture') push(item);
    }
    // 3. 按分取 top 攻击（最多 3 个，省名额给招募）
    let attacks = 0;
    for (const item of ordered) {
      if (out.length >= this.topK || attacks >= 3) break;
      if (item.action.type === 'attack') {
        push(item);
        attacks += 1;
      }
    }
    // 4. 指挥官招募（若有）
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      const a = item.action;
      if ((a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy')
        && (a as { unitClass?: string }).unitClass === 'commander') {
        push(item);
      }
    }
    // 5. 招募名额：开局（T≤4）按最便宜优先，保证穷时也能连爆（Peak P0 开局 300 金买
    // mermaid(200)会卡死第二招，买 soldier(150)x2 才是正解；heuristic 的 cost*2 偏好贵兵是陷阱）；
    // 中后期按 heuristic 评分优先，保证兵种质量（便宜槽全期开放会导致 soldier 人海稀释战力，
    // Liberty game2 十几个弱兵被精兵全歼教训）。
    {
      const turn = state.turn;
      if (turn <= 4) {
        let cheapest: { action: Action; score: number } | null = null;
        let cheapestCost = Infinity;
        for (const item of ordered) {
          const a = item.action;
          if (a.type !== 'recruit_to_castle' && a.type !== 'recruit_and_deploy') continue;
          const cost = getUnitCost(state, playerId, a.unitClass) ?? Infinity;
          if (cost < cheapestCost || (cost === cheapestCost && cheapest !== null && item.score > cheapest.score)) {
            cheapestCost = cost;
            cheapest = item;
          }
        }
        if (cheapest && out.length < this.topK) push(cheapest);
      } else {
        for (const item of ordered) {
          if (out.length >= this.topK) break;
          const a = item.action;
          if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') {
            push(item);
            break;
          }
        }
      }
    }
    // 6. heuristic 顺序填充
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      push(item);
    }
    void pool;
    return out;
  }

  public getStats(): BattleSearchStats {
    return { ...this.stats };
  }

  public resetStats(): void {
    this.stats = { decisions: 0, urgentHits: 0, forcedWins: 0, takeovers: 0, vetos: 0, follows: 0 };
  }

  /** A阶段便宜叶子：只模拟1步、直接叶子评估（无连动展开、无对手探测）。 */
  private cheapLeafOf(engine: GameEngine, playerId: number, action: Action): number {
    const sim = this.cloneEngine(engine);
    try {
      this.stepEngine(sim, action);
    } catch {
      this.bump('catchCheapLeafStep');
      return -99999;
    }
    return this.evaluateLeaf(sim.getState(), playerId);
  }

  private evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {
    const sim = this.cloneEngine(engine);
    try {
      this.stepEngine(sim, action);
    } catch {
      this.bump('catchEvaluateStep');
      return -99999;
    }
    if (sim.getState().winner !== null) {
      return this.evaluateLeaf(sim.getState(), playerId);
    }
    // 己方连动展开：同一回合内继续用 heuristic 走最多 N 步，把 move-then-attack 价值展开
    for (let i = 0; i < this.friendlyRolloutSteps; i++) {
      if (sim.getState().winner !== null) break;
      if (sim.getState().currentPlayer !== playerId) break;
      let follow: Action;
      try {
        const legal = sim.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legal.length === 0) break;
        // end_turn 意味着本回合连动结束，停止展开（保留当前局面评估）
        const nonEnd = legal.filter(a => a.type !== 'end_turn');
        if (nonEnd.length === 0) break;
        follow = this.chooseWithHeuristic(sim, playerId, nonEnd);
        if (follow.type === 'end_turn') break;
      } catch {
        this.bump('catchEvaluateLegal');
        this.bump('getLegalActionsFailures');
        break;
      }
      try {
        this.stepEngine(sim, follow);
      } catch {
        this.bump('catchEvaluateRolloutStep');
        break;
      }
    }
    const after = sim.getState();
    if (after.winner !== null) {
      return this.evaluateLeaf(after, playerId);
    }
    if (after.currentPlayer === playerId) {
      return this.evaluateLeaf(after, playerId);
    }
    // 对手回合：贪心多步集火探测（看穿多单位围殴同一目标），取最坏叶子。
    // 纯静态攻击排序、零 heuristic 评分，又快又能发现 focus fire。
    if (after.currentPlayer === playerId) {
      return this.evaluateLeaf(after, playerId);
    }
    const probed = this.probeOpponentFocusFire(sim, playerId, after.currentPlayer);
    // 劣势下再扣“走位进人堆”罚分：对手走上来就能围殴的落单单位（Crossing game1 T7/T11、
    // Liberty T9、Icy T17 都是这么一次蒸发好几个；单步探测看不见 move-then-attack）。
    if (this.materialRatio(after, playerId) < 1.0) {
      return probed - this.repositionCrowdPenalty(after, playerId);
    }
    return probed;
  }

  /** 动作归属单位（pending 过滤用；招募/终局动作返回 null）。 */
  private getActionUnitId(action: Action): string | null {
    switch (action.type) {
      case 'move':
      case 'capture':
      case 'repair':
      case 'wait':
      case 'destroy_town':
      case 'post_attack_move':
        return action.unitId;
      case 'attack':
        return action.attackerId;
      case 'heal':
        return action.healerId;
      case 'support':
        return action.supporterId;
      case 'summon':
        return action.summonerId;
      default:
        return null;
    }
  }

  /**
   * 走位进人堆罚分：每个可被≥2个敌人（ present 站位或一动可达站位）纳入射程的我方单位，
   * 罚 700（指挥官 2500）。只在劣势时启用；顺风时接触战正常，不罚。
   */
  private repositionCrowdPenalty(state: GameState, rootId: number): number {
    const allied = getAllianceId(state, rootId);
    const mine = state.units.filter(u => u.hp > 0 && getAllianceId(state, u.ownerId) === allied);
    if (mine.length === 0) return 0;
    const enemies = state.units
      .filter(u => u.hp > 0 && getAllianceId(state, u.ownerId) !== allied)
      .slice(0, 10);
    if (enemies.length === 0) return 0;
    // 敌人可达站位只算一次（多候选间状态不同，此处按当前 sim 态估算）
    const reachCache = new Map<string, Array<{ x: number; y: number }>>();
    const reachOf = (enemyId: string): Array<{ x: number; y: number }> => {
      const cached = reachCache.get(enemyId);
      if (cached) return cached;
      let r: Array<{ x: number; y: number }> = [];
      try {
        r = getReachablePositions(state, enemyId).slice(0, 20);
      } catch {
        this.bump('catchRepositionReach');
        r = [];
      }
      reachCache.set(enemyId, r);
      return r;
    };
    let penalty = 0;
    for (const m of mine) {
      let threateners = 0;
      for (const e of enemies) {
        const stats = getEffectiveStats(e);
        if (inRange(e.pos, m.pos, stats.minRange, stats.maxRange)) {
          threateners += 1;
        } else {
          const reach = reachOf(e.id);
          for (const dest of reach) {
            if (inRange(dest, m.pos, stats.minRange, stats.maxRange)) {
              threateners += 1;
              break;
            }
          }
        }
        if (threateners >= 2) break;
      }
      if (threateners >= 2) {
        penalty += isCommanderUnit(state, m) ? 2500 : 700;
      }
    }
    return penalty;
  }

  /** 无需模拟的静态攻击威胁分（杀招重奖，与 heuristic 击杀观一致）。 */
  private staticAttackScore(state: GameState, attackerId: string, targetId: string): number {
    const attacker = state.units.find(u => u.id === attackerId);
    const target = state.units.find(u => u.id === targetId);
    if (!attacker || !target || attacker.hp <= 0 || target.hp <= 0) return -Infinity;
    let dmg: number;
    try {
      dmg = Math.min(target.hp, calculateDamage(state, attackerId, targetId));
    } catch {
      this.bump('catchStaticAttackDamage');
      return -Infinity;
    }
    if (dmg <= 0) return -Infinity;
    const tVal = getUnitCost(state, target.ownerId, target.unitClass) ?? 200;
    const kill = dmg >= target.hp;
    let score = kill ? 12000 + tVal * 6 : dmg * 25 + (tVal * dmg) / Math.max(1, target.hp);
    if (isCommanderUnit(state, target)) score += kill ? 18000 : 4500;
    return score;
  }

  /**
   * 对手贪心集火线：每步取静态最危险攻击模拟，最深 oppDepth 步，
   * 全程取最坏叶子。能看穿“两下打死 u_11、三下打死 u_2”这类围殴。
   */
  private probeOpponentFocusFire(sim: GameEngine, rootId: number, oppId: number): number {
    const probe = this.cloneEngine(sim);
    let worst = this.evaluateLeaf(probe.getState(), rootId);
    for (let d = 0; d < this.oppDepth; d++) {
      const st = probe.getState();
      if (st.winner !== null || st.currentPlayer !== oppId) break;
      let actions: Action[];
      try {
        actions = probe.getLegalActions(oppId);
      } catch {
        this.bump('catchProbeLegal');
        this.bump('getLegalActionsFailures');
        break;
      }
      let best: Action | null = null;
      let bestScore = -Infinity;
      for (const a of actions) {
        if (a.type !== 'attack') continue;
        const s = this.staticAttackScore(st, a.attackerId, a.targetId);
        if (s > bestScore) {
          bestScore = s;
          best = a;
        }
      }
      if (!best || bestScore === -Infinity) break;
      try {
        this.stepEngine(probe, best);
      } catch {
        this.bump('catchProbeStep');
        break;
      }
      const leaf = this.evaluateLeaf(probe.getState(), rootId);
      if (leaf < worst) worst = leaf;
      if (worst <= -90000) break;
    }
    return worst;
  }

  public actionCode(action: Action): string {
    return encodeAction(action);
  }
}
