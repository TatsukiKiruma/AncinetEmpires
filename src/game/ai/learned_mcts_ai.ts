/**
 * LearnedMctsAI：AlphaZero-lite（B 方案 bootstrap）。
 * - 先验 P：learned policy softmax（分色网自动按座位选择）。
 * - 叶子价值：learned value（根阵营视角胜率），终局用精确 1/0/0.5。
 * - 选择：PUCT（己方层 max、对方层 min），无 rollout、无手调局面阈值。
 * - 自博弈时根加 Dirichlet 噪声；评测时确定性（访问数 argmax）。
 * 目标：验证“搜索能否让弱网变强”（bootstrap），为专家迭代循环提供对弈器。
 */
import type { Action, GameState } from '../types';
import { GameEngine } from '../engine';
import { getDefaultLearnedDuelNet, getSeatLearnedDuelNet, type LearnedDuelNet } from './learned_duel_net';
import { HeuristicAI } from './heuristic_ai';
import { getAllianceId } from '../rule_config';

export interface LearnedMctsOptions {
  sims?: number;
  cPuct?: number;
  maxBranch?: number;
  dirichletAlpha?: number;
  dirichletEps?: number;
  net?: LearnedDuelNet;
  useSeatNets?: boolean;
}

interface MctsNode {
  sim: GameEngine;
  /** 节点创建时缓存的状态快照（getState() 是深拷贝，每节点只调一次，热路径不再调）。 */
  st: GameState;
  pid: number;
  children: Array<{
    action: Action;
    prior: number;
    visits: number;
    valueSum: number;
    child: MctsNode | null;
  }>;
  expanded: boolean;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LearnedMctsAI {
  private overrideNet: LearnedDuelNet | null;
  private useSeatNets: boolean;
  private heuristic: HeuristicAI;
  private sims: number;
  private cPuct: number;
  private maxBranch: number;
  private dirichletAlpha: number;
  private dirichletEps: number;
  private rng: () => number;

  constructor(seedOrRng?: number | (() => number), options?: LearnedMctsOptions) {
    this.overrideNet = options?.net ?? null;
    this.useSeatNets = (options?.net === undefined) && (options?.useSeatNets !== false);
    this.heuristic = new HeuristicAI();
    this.sims = options?.sims ?? 16;
    this.cPuct = options?.cPuct ?? 1.2;
    this.maxBranch = options?.maxBranch ?? 8;
    this.dirichletAlpha = options?.dirichletAlpha ?? 0.3;
    this.dirichletEps = options?.dirichletEps ?? 0;
    this.rng = typeof seedOrRng === 'function' ? seedOrRng : mulberry(seedOrRng ?? 777123);
  }

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

    // 安全规则保底（与 policy 模式一致，保证对比只差在搜索本身）
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

    const rootPid = playerId;
    const rootSim = engine.clone();
    const root: MctsNode = { sim: rootSim, st: rootSim.getState(), pid: playerId, children: [], expanded: false };
    this.expand(root, true);

    for (let i = 0; i < this.sims; i++) {
      this.simulate(root, rootPid, 256);
    }

    let best = root.children[0];
    for (const c of root.children) {
      if (c.visits > (best?.visits ?? -1)) best = c;
    }
    return best?.action ?? pool[0];
  }

  /** 根访问数分布（自博弈训练目标）。 */
  public getRootVisits(engine: GameEngine, playerId: number, preparedActions?: readonly Action[]): { actions: Action[]; visits: number[] } {
    const legal = (preparedActions ?? engine.getLegalActions(playerId)).slice();
    const nonSurrender = legal.filter(a => a.type !== 'surrender');
    const pool = nonSurrender.length > 0 ? nonSurrender : legal;
    if (pool.length <= 1) {
      return { actions: pool.length > 0 ? pool : [{ type: 'end_turn' }], visits: [1] };
    }
    const rootSim = engine.clone();
    const root: MctsNode = { sim: rootSim, st: rootSim.getState(), pid: playerId, children: [], expanded: false };
    this.expand(root, true);
    for (let i = 0; i < this.sims; i++) {
      this.simulate(root, playerId, 256);
    }
    return { actions: root.children.map(c => c.action), visits: root.children.map(c => c.visits) };
  }

  private expand(node: MctsNode, isRoot: boolean): void {
    if (node.expanded) return;
    node.expanded = true;
    let legal: Action[];
    try {
      legal = node.sim.getLegalActions(node.pid).filter(a => a.type !== 'surrender');
    } catch {
      return;
    }
    if (legal.length === 0) return;
    const net = this.netFor(node.pid);
    const scores = net.policyScores(node.st, node.pid, legal);
    const order = legal.map((_, i) => i).sort((x, y) => scores[y] - scores[x]);
    const top = order.slice(0, Math.min(this.maxBranch, order.length));
    // 先验：softmax（温度 1）；根自博弈噪声在调用处混入
    const sel = top.map(i => scores[i]);
    const mx = Math.max(...sel);
    const exps = sel.map(s => Math.exp(s - mx));
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    let priors = exps.map(e => e / sum);
    if (isRoot && this.dirichletEps > 0) {
      const noise = top.map(() => this.sampleGamma(this.dirichletAlpha));
      const nsum = noise.reduce((a, b) => a + b, 0) || 1;
      priors = priors.map((p, i) => (1 - this.dirichletEps) * p + this.dirichletEps * (noise[i] / nsum));
    }
    node.children = top.map((i, k) => ({
      action: legal[i],
      prior: priors[k],
      visits: 0,
      valueSum: 0,
      child: null
    }));
  }

  private simulate(node: MctsNode, rootPid: number, depth: number): number {
    const st = node.st;
    if (st.winner !== null) {
      const w = st.winner;
      return w === -1 ? 0.5 : (w === getAllianceId(st, rootPid) ? 1 : 0);
    }
    // 深度截断（防循环/超长对局爆栈）：直接用 learned value 估计
    if (depth <= 0) {
      return this.netFor(rootPid).valueOf(st, rootPid);
    }
    // 标准 MCTS：未展开节点展开后立即用 value 评估，不再深入（每 sim 至多扩展 1 节点）
    if (!node.expanded) {
      this.expand(node, false);
      return this.netFor(rootPid).valueOf(st, rootPid);
    }
    if (node.children.length === 0) {
      return this.netFor(rootPid).valueOf(st, rootPid);
    }
    const isMax = node.pid === rootPid;
    const total = node.children.reduce((a, c) => a + c.visits, 0);
    let best = node.children[0];
    let bestScore = isMax ? -Infinity : Infinity;
    for (const c of node.children) {
      const q = c.visits > 0 ? c.valueSum / c.visits : 0.5;
      const u = this.cPuct * c.prior * Math.sqrt(total) / (1 + c.visits);
      // max 层取 q+u 最大，min 层取 q-u 最小
      if (isMax ? (q + u > bestScore) : (q - u < bestScore)) {
        bestScore = isMax ? q + u : q - u;
        best = c;
      }
    }
    if (!best.child) {
      const childSim = node.sim.clone();
      try {
        childSim.step(best.action);
      } catch {
        return 0;
      }
      best.child = { sim: childSim, st: childSim.getState(), pid: childSim.getState().currentPlayer, children: [], expanded: false };
    }
    const v = this.simulate(best.child, rootPid, depth - 1);
    best.visits += 1;
    best.valueSum += v;
    return v;
  }

  private sampleGamma(alpha: number): number {
    // Marsaglia-Tsang（alpha 通用，够自博弈噪声用）
    if (alpha <= 0) return 1;
    if (alpha < 1) {
      return this.sampleGamma(alpha + 1) * Math.pow(this.rng(), 1 / alpha);
    }
    const d = alpha - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x = 0;
      let v = 0;
      for (;;) {
        x = this.randn();
        v = 1 + c * x;
        if (v > 0) break;
      }
      v = v * v * v;
      const u = this.rng();
      if (u < 1 - 0.331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  private randn(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.rng();
    while (v === 0) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}


