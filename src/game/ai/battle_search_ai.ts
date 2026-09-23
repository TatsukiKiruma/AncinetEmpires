import type { Action, GameState } from '../types';
import { GameEngine } from '../engine';
import { HeuristicAI } from './heuristic_ai';
import { evaluatePositionHeuristic } from '../../../tools/v7_heuristic_bounded_search';
import { encodeAction } from '../env';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../rule_config';
import { calculateDamage, inRange } from '../rules';
import { getEffectiveStats } from '../abilities';
import { UNIT_CONFIGS } from '../constants';
import { getTileTerrainConfig } from '../terrain_rules';

export type Rng = () => number;

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
  }

  public getAction(engine: GameEngine, playerId: number, preparedActions?: readonly Action[]): Action {
    const legal = (preparedActions ?? engine.getLegalActions(playerId)).slice();
    if (legal.length === 0) return { type: 'end_turn' };
    const nonSurrender = legal.filter(a => a.type !== 'surrender');
    const pool = this.allowSurrender ? legal : (nonSurrender.length > 0 ? nonSurrender : legal);

    if (pool.length === 1) return pool[0];

    this.stats.decisions += 1;
    const scored = this.heuristic.scoreCandidateActions(engine, playerId, pool);
    // 与 HeuristicAI 一致的 urgent 快捷（守城/救指挥官等 >=50000 直接走）
    let urgentBest: { action: Action; score: number } | null = null;
    for (const s of scored) {
      if (s.score >= 50000 && (!urgentBest || s.score > urgentBest.score)) urgentBest = s;
    }
    if (urgentBest) {
      this.stats.urgentHits += 1;
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
      return best.action;
    }

    const ordered = [...scored].sort((a, b) => b.score - a.score);
    const candidates = this.buildTacticalCandidates(pool, ordered);
    const heuTop = candidates[0];

    // 两阶段评估：A阶段便宜叶子（1步模拟直评）全覆盖找即时胜负并排序，
    // B阶段只对 heuTop + A阶段前3做连动展开+对手探测（贵）。
    const cheapLeaf = candidates.map(c => this.cheapLeafOf(engine, playerId, c.action));
    // 必胜直取（A阶段即可发现即时终局）
    for (let i = 0; i < candidates.length; i++) {
      if (cheapLeaf[i] >= 100000) {
        this.stats.forcedWins += 1;
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
    const leafByIndex = new Map<number, number>();
    const leafOf = (idx: number): number => {
      const cached = leafByIndex.get(idx);
      if (cached !== undefined) return cached;
      const v = stageB.has(idx) ? this.evaluateCandidate(engine, playerId, candidates[idx].action) : cheapLeaf[idx];
      leafByIndex.set(idx, v);
      return v;
    };

    const heuTopLeaf = leafOf(0) + this.phaseBonus(engine.getState(), playerId, candidates[0].action);

    let bestIdx = 0;
    let bestLeaf = heuTopLeaf;
    for (let i = 1; i < candidates.length; i++) {
      const leaf = leafOf(i) + this.phaseBonus(engine.getState(), playerId, candidates[i].action);
      if (leaf > bestLeaf) {
        bestLeaf = leaf;
        bestIdx = i;
      }
    }

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
    let chosen: Action;
    if (bestLeaf >= heuTopLeaf + gate) {
      this.stats.takeovers += 1;
      chosen = bestAction;
    } else if (heuTopLeaf <= this.dangerLine && bestLeaf >= heuTopLeaf + this.vetoMargin) {
      // ② 否决避险：heuristic 首选已落入危险线，且备选明显更安全
      this.stats.vetos += 1;
      chosen = candidates[bestIdx].action;
    } else {
      this.stats.follows += 1;
      chosen = heuTop.action;
    }
    // ③ 攻击安全检查：非优势下，被现有火力围殴致死的攻击一律否决
    // （杀指挥官除外；能战后撤离的突击单位除外）
    const safe = this.isAttackSafe(engine, playerId, chosen);
    if (safe) return chosen;
    const fallback = this.bestNonAttack(engine, playerId, candidates, leafOf);
    if (fallback) {
      this.stats.vetos += 1;
      return fallback;
    }
    return chosen;
  }

  /** 攻击是否安全：优势/杀指挥官直接放行，否则验算现有站位火力围殴。 */
  private isAttackSafe(engine: GameEngine, playerId: number, action: Action): boolean {
    if (action.type !== 'attack') return true;
    const state = engine.getState();
    if (this.materialRatio(state, playerId) > 1.25) return true;
    const target = state.units.find(u => u.id === action.targetId);
    if (target && isCommanderUnit(state, target)) return true;
    const sim = engine.clone();
    try {
      sim.step(action);
    } catch {
      return false;
    }
    const after = sim.getState();
    const attacker = after.units.find(u => u.id === action.attackerId);
    if (!attacker || attacker.hp <= 0) return false;
    // 有战后撤离手段则假定可逃生
    try {
      const legal = sim.getLegalActions(playerId);
      if (legal.some(a => a.type === 'post_attack_move' && a.unitId === attacker.id)) return true;
    } catch {
      // 取不到合法动作则继续按火力验算
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
        continue;
      }
      if (incoming >= attacker.hp) return false;
    }
    return incoming < attacker.hp;
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
      case 'attack':
        if (behind) return -600;
        if (ahead) return 250;
        return 0;
      case 'capture':
        return (turn <= 8 ? 500 : 0) + (behind ? 250 : 0);
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
        // 扩张期绝不屯钱：有钱就爆兵（T9 5v9 就是这么输的）
        if (turn <= 10 && gold >= 250) return 600 + (behind ? 150 : 0) + deployBonus;
        return behind ? 150 : 0;
      }
      case 'wait':
      case 'end_turn':
        return ahead ? -400 : 0;
      case 'move':
      case 'post_attack_move': {
        const unit = state.units.find(u => u.id === action.unitId);
        if (!unit || enemies.length === 0) return 0;
        const manhattan = (x1: number, y1: number, x2: number, y2: number): number => (
          Math.abs(x1 - x2) + Math.abs(y1 - y2)
        );
        const dBefore = Math.min(...enemies.map(e => manhattan(unit.pos.x, unit.pos.y, e.x, e.y)));
        const dAfter = Math.min(...enemies.map(e => manhattan(action.to.x, action.to.y, e.x, e.y)));
        let bonus = 0;
        // 劣势：远离敌群（放风筝），靠近敌群重罚（不送）
        if (behind) bonus += Math.max(-600, Math.min(600, (dAfter - dBefore) * 150));
        else if (ahead) bonus += Math.max(-400, Math.min(400, (dBefore - dAfter) * 80));
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
    ordered: Array<{ action: Action; score: number }>
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
    // 5. 最优招募（任意兵种，保证屯钱时有兵可爆；扩张期胜负手）
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      const a = item.action;
      if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') {
        push(item);
        break;
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
    const sim = engine.clone();
    try {
      sim.step(action);
    } catch {
      return -99999;
    }
    return evaluatePositionHeuristic(sim.getState(), playerId);
  }

  private evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {
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
    // 对手回合：贪心多步集火探测（看穿多单位围殴同一目标），取最坏叶子。
    // 纯静态攻击排序、零 heuristic 评分，又快又能发现 focus fire。
    if (after.currentPlayer === playerId) {
      return evaluatePositionHeuristic(after, playerId);
    }
    return this.probeOpponentFocusFire(sim, playerId, after.currentPlayer);
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
    const probe = sim.clone();
    let worst = evaluatePositionHeuristic(probe.getState(), rootId);
    for (let d = 0; d < this.oppDepth; d++) {
      const st = probe.getState();
      if (st.winner !== null || st.currentPlayer !== oppId) break;
      let actions: Action[];
      try {
        actions = probe.getLegalActions(oppId);
      } catch {
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
        probe.step(best);
      } catch {
        break;
      }
      const leaf = evaluatePositionHeuristic(probe.getState(), rootId);
      if (leaf < worst) worst = leaf;
      if (worst <= -90000) break;
    }
    return worst;
  }

  public actionCode(action: Action): string {
    return encodeAction(action);
  }
}
