import type { Action } from '../types';
import { GameEngine } from '../engine';
import { HeuristicAI } from './heuristic_ai';
import { evaluatePositionHeuristic } from '../../../tools/v7_heuristic_bounded_search';
import { encodeAction } from '../env';

export type Rng = () => number;

export interface BattleSearchOptions {
  /** 每个决策评估的候选数（按 heuristic 排序取 topK） */
  topK?: number;
  /** 对手回应探测数（攻击优先） */
  oppProbeK?: number;
  /** 己方连动展开步数（move 后接 capture/attack 的价值必须展开才看得见） */
  friendlyRolloutSteps?: number;
  /** 接管阈值：候选叶子比 heuristic 首选高出多少才接管（默认 1200） */
  takeoverThreshold?: number;
  /** 避险阈值：heuristic 首选已很差时，备选好出多少才否决（默认 800） */
  vetoMargin?: number;
  /** 危险线：heuristic 首选叶子低于此线视为危险（默认 -1500） */
  dangerLine?: number;
  /** 是否允许投降（默认永不投降） */
  allowSurrender?: boolean;
}

function mulberryDefault(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * BattleSearchAI（训练分支工作模型 v3，保底+否决）:
 * - 默认完全跟随 HeuristicAI 首选（保底不低于 heuristic，避免叶子噪声主导走位）；
 * - 每个候选真实模拟 1 步 + 己方连动展开（最多 friendlyRolloutSteps 步），
 *   再探测对手最危险回应，得到 maximin 叶子值；
 * - 只有两种情况接管：① 发现比 heuristic 首选高出 takeoverThreshold 的大优解；
 *   ② heuristic 首选已低于 dangerLine 且备选好出 vetoMargin 以上（否决送子/被反打）。
 * - 终局胜负严格主导（±100000）。
 */
export class BattleSearchAI {
  private heuristic: HeuristicAI;
  private rng: Rng;
  private topK: number;
  private oppProbeK: number;
  private friendlyRolloutSteps: number;
  private takeoverThreshold: number;
  private vetoMargin: number;
  private dangerLine: number;
  private allowSurrender: boolean;

  constructor(seedOrRng?: number | Rng, options?: BattleSearchOptions) {
    if (typeof seedOrRng === 'function') this.rng = seedOrRng;
    else this.rng = mulberryDefault(seedOrRng ?? 0xBEEF);
    // heuristic 内部有 rng 抖动（*20/*30），给它一个派生 rng 以保证可复现
    this.heuristic = new HeuristicAI(this.rng);
    this.topK = options?.topK ?? 10;
    this.oppProbeK = options?.oppProbeK ?? 6;
    this.friendlyRolloutSteps = options?.friendlyRolloutSteps ?? 3;
    this.takeoverThreshold = options?.takeoverThreshold ?? 1200;
    this.vetoMargin = options?.vetoMargin ?? 800;
    this.dangerLine = options?.dangerLine ?? -1500;
    this.allowSurrender = options?.allowSurrender ?? false;
  }

  public getAction(engine: GameEngine, playerId: number, preparedActions?: readonly Action[]): Action {
    const legal = (preparedActions ?? engine.getLegalActions(playerId)).slice();
    if (legal.length === 0) return { type: 'end_turn' };
    const nonSurrender = legal.filter(a => a.type !== 'surrender');
    const pool = this.allowSurrender ? legal : (nonSurrender.length > 0 ? nonSurrender : legal);

    if (pool.length === 1) return pool[0];

    const scored = this.heuristic.scoreCandidateActions(engine, playerId, pool);
    // 与 HeuristicAI 一致的 urgent 快捷（守城/救指挥官等 >=50000 直接走）
    let urgentBest: { action: Action; score: number } | null = null;
    for (const s of scored) {
      if (s.score >= 50000 && (!urgentBest || s.score > urgentBest.score)) urgentBest = s;
    }
    if (urgentBest) return urgentBest.action;

    const ordered = [...scored].sort((a, b) => b.score - a.score);
    const candidates = ordered.slice(0, Math.min(this.topK, ordered.length));
    const heuTop = candidates[0];

    // 默认保底：跟 heuristic 首选；只在搜索发现显著更优/避险时接管
    const leafByIndex = new Map<number, number>();
    const leafOf = (idx: number): number => {
      const cached = leafByIndex.get(idx);
      if (cached !== undefined) return cached;
      const v = this.evaluateCandidate(engine, playerId, candidates[idx].action);
      leafByIndex.set(idx, v);
      return v;
    };

    const heuTopLeaf = leafOf(0);
    // 必胜直取
    for (let i = 0; i < candidates.length; i++) {
      if (leafOf(i) >= 100000) return candidates[i].action;
    }

    let bestIdx = 0;
    let bestLeaf = heuTopLeaf;
    for (let i = 1; i < candidates.length; i++) {
      const leaf = leafOf(i);
      if (leaf > bestLeaf) {
        bestLeaf = leaf;
        bestIdx = i;
      }
    }

    // ① 大优接管：最优叶子比 heuristic 首选高出 takeoverThreshold
    if (bestLeaf >= heuTopLeaf + this.takeoverThreshold) {
      return candidates[bestIdx].action;
    }
    // ② 否决避险：heuristic 首选已落入危险线，且备选明显更安全
    if (heuTopLeaf <= this.dangerLine && bestLeaf >= heuTopLeaf + this.vetoMargin) {
      return candidates[bestIdx].action;
    }
    return heuTop.action;
  }

  /**
   * Maximin leaf value (proxy reference Q_ref) for stepping `action` in `engine`.
   *
   * T12-06 change: visibility widened from `private` to `public` so the
   * continuous-label tooling (`v12/tools/search_labels.ts`) can read the exact
   * same maximin leaf the policy itself uses. No other change: same body, same
   * seeding contract, same behaviour. It is a pure function of
   * (state, playerId, action, this.rng's seed) — it never touches `engine`.
   */
  public evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {
    const sim = engine.clone();
    try {
      sim.step(action);
    } catch {
      return -99999;
    }
    if (sim.getState().winner !== null) {
      return evaluatePositionHeuristic(sim.getState(), playerId);
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
        follow = this.heuristic.getAction(sim, playerId, nonEnd);
        if (follow.type === 'end_turn') break;
      } catch {
        break;
      }
      try {
        sim.step(follow);
      } catch {
        break;
      }
    }
    const after = sim.getState();
    if (after.winner !== null) {
      return evaluatePositionHeuristic(after, playerId);
    }
    if (after.currentPlayer === playerId) {
      return evaluatePositionHeuristic(after, playerId);
    }
    // 对手回合：探测最危险回应，取最坏情况（maximin）
    const oppActions = sim.getLegalActions(after.currentPlayer).filter(a => a.type !== 'surrender');
    if (oppActions.length === 0) {
      return evaluatePositionHeuristic(after, playerId);
    }
    const orderedOpp = [
      ...oppActions.filter(a => a.type === 'attack'),
      ...oppActions.filter(a => a.type === 'capture'),
      ...oppActions.filter(a => a.type !== 'attack' && a.type !== 'capture')
    ].slice(0, this.oppProbeK);

    let worst = Infinity;
    for (const opp of orderedOpp) {
      const probe = sim.clone();
      try {
        probe.step(opp);
      } catch {
        continue;
      }
      const leaf = evaluatePositionHeuristic(probe.getState(), playerId);
      if (leaf < worst) worst = leaf;
      // 已被反击致死/大亏可早停
      if (worst <= -90000) break;
    }
    if (worst === Infinity) {
      return evaluatePositionHeuristic(after, playerId);
    }
    return worst;
  }

  public actionCode(action: Action): string {
    return encodeAction(action);
  }
}
