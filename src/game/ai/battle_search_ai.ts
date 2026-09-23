import type { Action, GameState } from '../types';
import { GameEngine } from '../engine';
import { HeuristicAI } from './heuristic_ai';
import { evaluatePositionHeuristic } from '../../../tools/v7_heuristic_bounded_search';
import { encodeAction } from '../env';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../rule_config';
import { calculateDamage, inRange } from '../rules';
import { getEffectiveStats } from '../abilities';
import { getReachablePositions } from '../map';
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
    let pool = this.allowSurrender ? legal : (nonSurrender.length > 0 ? nonSurrender : legal);

    if (pool.length === 1) return pool[0];

    // 待行动（pending）单位优先：刚招募的单位必须先行动才能解锁后续招募。
    // 否则出现“招一停”：pending 常驻整回合，招募链断裂（Peak P0 T1 单招 vs P1 三连招教训）。
    const pendingId = engine.getState().pendingUnitId;
    if (pendingId) {
      const pendingUnit = engine.getState().units.find(u => u.id === pendingId && u.ownerId === playerId);
      if (pendingUnit && !pendingUnit.hasActed && pendingUnit.hp > 0) {
        const pendingActions = pool.filter(a => this.getActionUnitId(a) === pendingId);
        if (pendingActions.length > 0) {
          pool = pendingActions;
          if (pool.length === 1) return pool[0];
        }
      }
    }

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
    const candidates = this.buildTacticalCandidates(pool, ordered, engine.getState(), playerId);
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
    const sim = engine.clone();
    try {
      sim.step(action);
    } catch {
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
