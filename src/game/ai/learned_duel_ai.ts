/**
 * LearnedDuelAI：纯学习型对战 AI（监督蒸馏 policy + 结局回归 value，均由 torch 训练）。
 * - 候选生成：战术覆盖集（heuTop 保底 + 全部 capture/attack + 招募 + 填充，上限 topK）。
 *   这是通用搜索机械（无手调分数阈值），且与训练时负例构造（curated ≤12）同分布；
 *   让 net 只做它学过的任务：在 ≤8 个候选里排序，而不是在 60 个 raw 动作里裸排。
 * - policy 模式：policy 分最高者（外加即时胜负直取），零搜索。
 * - value-search 模式：policy 排序取 topK，两阶段评估（直接价值 + 最危险对手攻击
 *   回应后的最坏价值），取最大者；除即时胜负/urgent 守城外无手工门槛。
 * 权重来自 docs/training/battle_ai/models/learned_duel_*.json。
 */
import type { Action, GameState } from '../types';
import { GameEngine } from '../engine';
import { getDefaultLearnedDuelNet, getSeatLearnedDuelNet, type LearnedDuelNet } from './learned_duel_net';
import { HeuristicAI } from './heuristic_ai';
import { getAllianceId } from '../rule_config';

export type LearnedDuelMode = 'policy' | 'value-search' | 'beam';

export interface LearnedDuelOptions {
  mode?: LearnedDuelMode;
  topK?: number;
  replyProbeMax?: number;
  /** 为 0 时不对候选做战术覆盖截断，直接对全部合法动作排序（对照实验用） */
  coverK?: number;
  /** beam 搜索：己方束宽 */
  beamW?: number;
  /** beam 搜索：对手束宽 */
  oppW?: number;
}

export class LearnedDuelAI {
  private overrideNet: LearnedDuelNet | null;
  private useSeatNets: boolean;
  private heuristic: HeuristicAI;
  private mode: LearnedDuelMode;
  private topK: number;
  private replyProbeMax: number;
  private coverK: number;
  private beamW: number;
  private oppW: number;

  constructor(net?: LearnedDuelNet, options?: LearnedDuelOptions & { seatNets?: boolean }) {
    this.overrideNet = net ?? null;
    // 默认使用分色模型（P0-net/P1-net 按行动座位选择）；显式传 net 或 seatNets:false 则用单模型
    this.useSeatNets = (net === undefined) && (options?.seatNets !== false);
    this.heuristic = new HeuristicAI();
    this.mode = options?.mode ?? 'value-search';
    this.topK = options?.topK ?? 8;
    this.replyProbeMax = options?.replyProbeMax ?? 6;
    this.coverK = options?.coverK ?? 8;
    this.beamW = options?.beamW ?? 4;
    this.oppW = options?.oppW ?? 3;
  }

  /** 行动座位对应的模型：分色开时按座位选网，否则用覆盖网/默认网。 */
  private netFor(pid: number): LearnedDuelNet {
    if (this.overrideNet) return this.overrideNet;
    if (this.useSeatNets) {
      try {
        return getSeatLearnedDuelNet(pid);
      } catch {
        return getDefaultLearnedDuelNet();
      }
    }
    return getDefaultLearnedDuelNet();
  }

  public getAction(engine: GameEngine, playerId: number, preparedActions?: readonly Action[]): Action {
    const legal = (preparedActions ?? engine.getLegalActions(playerId)).slice();
    if (legal.length === 0) return { type: 'end_turn' };
    const nonSurrender = legal.filter(a => a.type !== 'surrender');
    const pool = nonSurrender.length > 0 ? nonSurrender : legal;
    if (pool.length === 1) return pool[0];

    // HeuristicAI 的 urgent 守城快车（规则性保底，非走位 Eval）
    const scored = this.heuristic.scoreCandidateActions(engine, playerId, pool);
    let urgent: Action | null = null;
    let urgentScore = -Infinity;
    for (const s of scored) {
      if (s.score >= 50000 && s.score > urgentScore) {
        urgentScore = s.score;
        urgent = s.action;
      }
    }
    if (urgent) return urgent;

    // 战术覆盖集：与训练负例同分布的候选构造（heuTop + capture/attack 全覆盖 + 招募 + 填充）；
    // coverK=0 时关闭截断，直接全合法排序（对照：验证 cover 是否漏掉了 teacher 动作）
    const cover = this.coverK > 0 ? this.buildCoverSet(engine, playerId, pool, scored) : pool;
    const policyScores = this.netFor(playerId).policyScores(engine.getState(), playerId, cover);
    const order = cover.map((_, i) => i).sort((a, b) => policyScores[b] - policyScores[a]);
    const candidates = order.slice(0, Math.min(this.topK, order.length));

    // 即时胜负直取（终局主导）
    for (const i of candidates) {
      const sim = engine.clone();
      try {
        sim.step(cover[i]);
      } catch {
        continue;
      }
      const w = sim.getState().winner;
      if (w !== null && w !== -1 && w === getAllianceId(sim.getState(), playerId)) {
        return cover[i];
      }
    }

    if (this.mode === 'policy') {
      return cover[order[0]];
    }

    if (this.mode === 'beam') {
      return this.beamSearch(engine, playerId, pool);
    }

    // value-search：直接价值 + 对手最危险攻击回应
    const direct = new Map<number, number>();
    for (const i of candidates) {
      const sim = engine.clone();
      try {
        sim.step(cover[i]);
      } catch {
        direct.set(i, -1);
        continue;
      }
      direct.set(i, this.netFor(playerId).valueOf(sim.getState(), playerId));
    }
    const byValue = [...candidates].sort((a, b) => (direct.get(b) ?? -1) - (direct.get(a) ?? -1));
    const stageB = new Set<number>([order[0]]);
    for (const i of byValue) {
      if (stageB.size >= Math.min(4, candidates.length)) break;
      stageB.add(i);
    }
    let bestIdx = order[0];
    let bestVal = -Infinity;
    for (const i of candidates) {
      let v = direct.get(i) ?? -1;
      if (stageB.has(i)) {
        v = Math.min(v, this.replyWorst(engine, playerId, cover[i]));
      }
      if (v > bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    }
    return cover[bestIdx];
  }

  private buildCoverSet(
    engine: GameEngine,
    playerId: number,
    pool: Action[],
    scored: Array<{ action: Action; score: number }>
  ): Action[] {
    void engine;
    void playerId;
    return buildLearnedCoverSet(pool, scored, this.coverK > 0 ? this.coverK : pool.length);
  }

  /**
   * 回合级 beam（通用搜索，无手调阈值）：
   * root 候选 policy-top beamW，每个候选：走完己方整回合（policy-top1 rollout，
   * 上限16步）→ 对手 policy-top oppW 首步各走一条对手整回合 rollout →
   * learned value 叶子（根视角）取 min；己方取 max。
   * 多步概念（腾城再招、集火、别堵城）靠回合展开 + value 裁决，不靠单步模仿。
   */
  private beamSearch(engine: GameEngine, playerId: number, pool: Action[]): Action {
    const rootTop = this.policyTop(engine, playerId, pool, this.beamW);
    // 即时胜负直取
    for (const a of rootTop) {
      const sim = engine.clone();
      try {
        sim.step(a);
      } catch {
        continue;
      }
      const w = sim.getState().winner;
      if (w !== null && w !== -1 && w === getAllianceId(sim.getState(), playerId)) {
        return a;
      }
    }
    let bestAction: Action = rootTop[0] ?? pool[0];
    let bestVal = -Infinity;
    for (const a of rootTop) {
      const sim = engine.clone();
      try {
        sim.step(a);
      } catch {
        continue;
      }
      const v = this.ownTurnThenOpp(sim, playerId);
      if (v > bestVal) {
        bestVal = v;
        bestAction = a;
      }
    }
    return bestAction;
  }

  /** 己方回合走完（policy-top1，最多16步）→ 对手回应 min。 */
  private ownTurnThenOpp(sim: GameEngine, rootPid: number): number {
    this.rolloutTurn(sim, rootPid, 16);
    const st = sim.getState();
    if (st.winner !== null) return this.terminalValue(st.winner, sim.getState(), rootPid);
    if (st.currentPlayer === rootPid) return this.netFor(rootPid).valueOf(st, rootPid);
    // 对手首步 top oppW，各走完对手回合取 min
    let legal: Action[];
    try {
      legal = sim.getLegalActions(st.currentPlayer).filter(x => x.type !== 'surrender');
    } catch {
      return this.netFor(rootPid).valueOf(st, rootPid);
    }
    if (legal.length === 0) return this.netFor(rootPid).valueOf(st, rootPid);
    const replies = this.policyTop(sim, st.currentPlayer, legal, this.oppW);
    let worst = Infinity;
    for (const r of replies) {
      const probe = sim.clone();
      try {
        probe.step(r);
      } catch {
        continue;
      }
      this.rolloutTurn(probe, probe.getState().currentPlayer, 16);
      const end = probe.getState();
      const v = end.winner !== null
        ? this.terminalValue(end.winner, end, rootPid)
        : this.netFor(rootPid).valueOf(end, rootPid);
      if (v < worst) worst = v;
      if (worst <= 0) break;
    }
    return worst === Infinity ? this.netFor(rootPid).valueOf(st, rootPid) : worst;
  }

  /** 用 policy-top1 走完当前方的整回合（换人/终局/步数上限即停）。 */
  private rolloutTurn(sim: GameEngine, pid: number, cap: number): void {
    for (let i = 0; i < cap; i++) {
      const st = sim.getState();
      if (st.winner !== null || st.currentPlayer !== pid) break;
      let legal: Action[];
      try {
        legal = sim.getLegalActions(pid).filter(x => x.type !== 'surrender' && x.type !== 'end_turn');
      } catch {
        break;
      }
      if (legal.length === 0) break;
      const scores = this.netFor(pid).policyScores(st, pid, legal);
      let best = 0;
      for (let k = 1; k < scores.length; k++) {
        if (scores[k] > scores[best]) best = k;
      }
      try {
        sim.step(legal[best]);
      } catch {
        break;
      }
    }
  }

  private terminalValue(winner: number | null, state: GameState, rootPid: number): number {
    if (winner === null || winner === -1) return 0.5;
    return winner === getAllianceId(state, rootPid) ? 1 : 0;
  }

  /** policy 排序取前 K（K<=0 取全部）。 */
  private policyTop(engine: GameEngine, playerId: number, legal: Action[], k: number): Action[] {
    const pool = legal.filter(a => a.type !== 'surrender');
    const base = pool.length > 0 ? pool : legal;
    if (base.length === 0) return [{ type: 'end_turn' }];
    const scores = this.netFor(playerId).policyScores(engine.getState(), playerId, base);
    const order = base.map((_, i) => i).sort((x, y) => scores[y] - scores[x]);
    const n = k <= 0 ? order.length : Math.min(k, order.length);
    return order.slice(0, n).map(i => base[i]);
  }

  /** 对手最危险攻击回应后的我方胜率（无可攻击回应则返回 +Inf 即不拉低）。 */
  private replyWorst(engine: GameEngine, playerId: number, action: Action): number {
    const sim = engine.clone();
    try {
      sim.step(action);
    } catch {
      return -1;
    }
    const after = sim.getState();
    if (after.winner !== null || after.currentPlayer === playerId) {
      return this.netFor(playerId).valueOf(after, playerId);
    }
    let attacks: Action[];
    try {
      attacks = sim.getLegalActions(after.currentPlayer).filter(a => a.type === 'attack').slice(0, this.replyProbeMax);
    } catch {
      return this.netFor(playerId).valueOf(after, playerId);
    }
    if (attacks.length === 0) return this.netFor(playerId).valueOf(after, playerId);
    let worst = Infinity;
    for (const opp of attacks) {
      const probe = sim.clone();
      try {
        probe.step(opp);
      } catch {
        continue;
      }
      const v = this.netFor(playerId).valueOf(probe.getState(), playerId);
      if (v < worst) worst = v;
      if (worst <= 0.01) break;
    }
    return worst === Infinity ? this.netFor(playerId).valueOf(after, playerId) : worst;
  }
}

/**
 * 战术覆盖候选集（通用搜索机械，无手调分数阈值；导出给诊断工具用）：
 * heuTop 保底首位 + 全部 capture + 按分取 top 攻击(≤4) + 指挥官招募 + 最优招募 +
 * heuristic 顺序填充，上限 cap。与蒸馏训练负例构造同分布。
 */
export function buildLearnedCoverSet(
  pool: Action[],
  scored: Array<{ action: Action; score: number }>,
  cap: number
): Action[] {
  const ordered = [...scored].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: Action[] = [];
  const keyOf = (a: Action): string => {
    if (a.type === 'move' || a.type === 'post_attack_move') return `${a.type}:${a.unitId}:${a.to.x},${a.to.y}`;
    if (a.type === 'attack') return `attack:${a.attackerId}:${a.targetId}`;
    if (a.type === 'recruit_to_castle') return `rc:${a.unitClass}:${a.castlePos.x},${a.castlePos.y}`;
    if (a.type === 'recruit_and_deploy') return `rd:${a.unitClass}:${a.to.x},${a.to.y}`;
    return `${a.type}:${JSON.stringify(a).slice(0, 80)}`;
  };
  const push = (a: Action): void => {
    const k = keyOf(a);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };
  if (ordered.length === 0) return pool.slice(0, Math.min(cap, pool.length));
  push(ordered[0].action);
  for (const item of ordered) {
    if (out.length >= cap) break;
    if (item.action.type === 'capture') push(item.action);
  }
  let attacks = 0;
  for (const item of ordered) {
    if (out.length >= cap || attacks >= 4) break;
    if (item.action.type === 'attack') {
      push(item.action);
      attacks += 1;
    }
  }
  for (const item of ordered) {
    if (out.length >= cap) break;
    const a = item.action;
    if ((a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy')
      && (a as { unitClass?: string }).unitClass === 'commander') {
      push(item.action);
    }
  }
  for (const item of ordered) {
    if (out.length >= cap) break;
    const a = item.action;
    if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') {
      push(item.action);
      break;
    }
  }
  for (const item of ordered) {
    if (out.length >= cap) break;
    push(item.action);
  }
  return out;
}
