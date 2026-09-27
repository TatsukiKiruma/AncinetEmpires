import type { Action, GameState, Position, Unit } from '../types';
import { GameEngine } from '../engine';
import { HeuristicAI } from './heuristic_ai';
import { evaluatePositionHeuristic } from '../../../tools/v7_heuristic_bounded_search';
import { encodeAction } from '../env';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../rule_config';
import { calculateDamage, inRange } from '../rules';
import { getEffectiveStats, hasAbility, isFlying } from '../abilities';
import { UNIT_CONFIGS } from '../constants';
import { getDistance } from '../map';
import { getTileDefenseBonus, getTileTerrainConfig } from '../terrain_rules';

export type Rng = () => number;

export interface BattleSearchOptions {
  /** 每个决策评估的候选数（按 heuristic 排序取 topK） */
  topK?: number;
  /** 对手集火探测深度 */
  oppDepth?: number;
  /** 己方连动展开步数 */
  friendlyRolloutSteps?: number;
  /** 接管阈值：候选叶子比 heuristic 首选高出多少才接管 */
  takeoverThreshold?: number;
  /** 避险阈值：heuristic 首选已很差时，备选好出多少才否决 */
  vetoMargin?: number;
  /** 危险线：heuristic 首选叶子低于此线视为危险 */
  dangerLine?: number;
  /** 第几回合开始启用搜索接管/否决 */
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
    this.heuristic = new HeuristicAI(this.rng);
    this.topK = options?.topK ?? 6;
    this.oppDepth = options?.oppDepth ?? 3;
    this.friendlyRolloutSteps = options?.friendlyRolloutSteps ?? 1;
    this.takeoverThreshold = options?.takeoverThreshold ?? 300;
    this.vetoMargin = options?.vetoMargin ?? 250;
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

    // 待行动（pending）单位优先：刚招募的单位必须先行动/待机才能解锁后续招募
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
    
    // 紧急行动快捷响应（救指挥官/保城 >= 50000 直接走）
    let urgentBest: { action: Action; score: number } | null = null;
    for (const s of scored) {
      if (s.score >= 50000 && (!urgentBest || s.score > urgentBest.score)) urgentBest = s;
    }
    if (urgentBest) {
      this.stats.urgentHits += 1;
      return urgentBest.action;
    }

    const state = engine.getState();
    const ordered = [...scored].sort((a, b) => b.score - a.score);
    const candidates = this.buildTacticalCandidates(pool, ordered, state, playerId);
    const heuTop = candidates[0];

    // 两阶段评估：A阶段便宜叶子直评，B阶段对优质候选做连动展开与对手反击探测
    const cheapLeaf = candidates.map(c => this.cheapLeafOf(engine, playerId, c.action));
    
    // 即时终局必胜直取
    for (let i = 0; i < candidates.length; i++) {
      if (cheapLeaf[i] >= 100000) {
        this.stats.forcedWins += 1;
        return candidates[i].action;
      }
    }

    // B阶段：heuTop(0号) + cheap前3
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

    const heuTopLeaf = leafOf(0) + this.phaseBonus(state, playerId, candidates[0].action);
    let bestIdx = 0;
    let bestLeaf = heuTopLeaf;

    for (let i = 1; i < candidates.length; i++) {
      const leaf = leafOf(i) + this.phaseBonus(state, playerId, candidates[i].action);
      if (leaf > bestLeaf) {
        bestLeaf = leaf;
        bestIdx = i;
      }
    }

    const bestAction = candidates[bestIdx].action;
    const gate = bestAction.type === 'attack' && state.turn <= 6 ? 1000 : this.takeoverThreshold;
    let chosen: Action;

    if (bestLeaf >= heuTopLeaf + gate) {
      this.stats.takeovers += 1;
      chosen = bestAction;
    } else if (heuTopLeaf <= this.dangerLine && bestLeaf >= heuTopLeaf + this.vetoMargin) {
      this.stats.vetos += 1;
      chosen = bestAction;
    } else {
      this.stats.follows += 1;
      chosen = heuTop.action;
    }

    // 攻击安全验证
    if (chosen.type === 'attack' && !this.isAttackSafe(engine, playerId, chosen)) {
      const fallback = this.bestNonAttack(engine, playerId, candidates, leafOf);
      if (fallback) {
        this.stats.vetos += 1;
        return fallback;
      }
    }

    // 移动安全验证（特别是指挥官绝不送死，绝不弃守城堡）
    if (chosen.type === 'move' && !this.isMoveSafe(state, playerId, chosen.unitId, chosen.to)) {
      const fallback = this.bestSafeMove(state, playerId, candidates, leafOf, chosen.unitId);
      if (fallback) {
        this.stats.vetos += 1;
        return fallback;
      }
      // 绝不执行自杀移动：直接原地待机
      this.stats.vetos += 1;
      return { type: 'wait', unitId: chosen.unitId };
    }

    return chosen;
  }

  /** 检测指定城堡是否受到敌方指挥官威胁（敌方指挥官在5步以内） */
  private isCastleThreatenedByEnemyCommander(state: GameState, playerId: number, castlePos: Position): boolean {
    const tile = state.map.tiles[castlePos.y]?.[castlePos.x];
    if (!tile) return false;
    const terrain = getTileTerrainConfig(tile);
    if (terrain.key !== 'castle') return false;
    if (tile.ownerId === null || getAllianceId(state, tile.ownerId) !== getAllianceId(state, playerId)) return false;

    const allied = getAllianceId(state, playerId);
    return state.units.some(u =>
      u.hp > 0 &&
      getAllianceId(state, u.ownerId) !== allied &&
      isCommanderUnit(state, u) &&
      (Math.abs(u.pos.x - castlePos.x) + Math.abs(u.pos.y - castlePos.y) <= 5)
    );
  }

  /** 检测指定动作是否会将受敌方指挥官威胁的城堡弃守（即原先在城堡上，现在走开） */
  private isLeavingCastleUnguardedAgainstCommander(state: GameState, playerId: number, unitId: string, to: Position): boolean {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return false;
    if (unit.pos.x === to.x && unit.pos.y === to.y) return false;

    const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
    if (!tile || getTileTerrainConfig(tile).key !== 'castle') return false;
    if (tile.ownerId === null || getAllianceId(state, tile.ownerId) !== getAllianceId(state, playerId)) return false;

    if (!this.isCastleThreatenedByEnemyCommander(state, playerId, unit.pos)) return false;

    // 关键修正：如果玩家拥有足够金币（>= 150）可以在城堡让空后立即招募新兵，
    // 则单位走开腾出城堡是健康良性的生产轮转，不视为弃守！
    // 只有当玩家金币不足（< 150）无法招募新兵填补城堡时，走开才会导致城堡空虚沦陷！
    const player = state.players.find(p => p.id === playerId);
    const gold = player?.gold ?? 0;
    if (gold >= 150) {
      return false;
    }

    return true;
  }

  /** 估算敌方下回合能对指定格子的目标单位造成的最大潜在总伤害。 */
  private estimateIncomingDamageToTile(state: GameState, alliedPlayerId: number, targetUnit: Unit, to: Position): number {
    const allied = getAllianceId(state, alliedPlayerId);
    const effDef = getEffectiveStats(targetUnit);
    const defTile = state.map.tiles[to.y]?.[to.x];
    if (!defTile) return 0;
    const defBonus = isFlying(targetUnit) ? 0 : getTileDefenseBonus(defTile);

    let totalIncoming = 0;
    for (const enemy of state.units) {
      if (enemy.hp <= 0 || getAllianceId(state, enemy.ownerId) === allied) continue;
      const stats = getEffectiveStats(enemy);
      const dist = Math.abs(enemy.pos.x - to.x) + Math.abs(enemy.pos.y - to.y);
      const maxThreat = stats.move + stats.maxRange;
      if (dist <= maxThreat) {
        const atkStats = UNIT_CONFIGS[enemy.unitClass];
        const isMagic = atkStats.attackType === 'magic';
        const def = (isMagic ? effDef.magicDefense : effDef.physicalDefense) + defBonus;
        const raw = Math.max(5, stats.attack - def);
        const dmg = Math.max(5, Math.trunc((raw * enemy.hp) / stats.maxHp));
        totalIncoming += dmg;
      }
    }
    return totalIncoming;
  }

  /** 移动是否安全：敌方是否能在下回合围殴致死或严重杀伤指挥官，或导致城堡失守。 */
  private isMoveSafe(state: GameState, playerId: number, unitId: string, to: Position): boolean {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return true;

    // 严禁弃守正受敌方指挥官威胁的自家城堡！
    if (this.isLeavingCastleUnguardedAgainstCommander(state, playerId, unitId, to)) {
      return false;
    }

    const isCmd = isCommanderUnit(state, unit);
    const incoming = this.estimateIncomingDamageToTile(state, playerId, unit, to);

    if (isCmd) {
      if (incoming >= unit.hp) return false;
      if (incoming >= 25) return false; // 指挥官绝不涉险
    } else {
      const tile = state.map.tiles[to.y]?.[to.x];
      const terrain = tile ? getTileTerrainConfig(tile) : null;
      const isCapturing = (terrain?.key === 'town' || terrain?.key === 'castle') && tile?.ownerId !== playerId;
      if (incoming >= unit.hp && !isCapturing) {
        return false;
      }
    }
    return true;
  }

  /** 寻找安全移动动作替代 */
  private bestSafeMove(
    state: GameState,
    playerId: number,
    candidates: Array<{ action: Action; score: number }>,
    leafOf: (idx: number) => number,
    unitId?: string
  ): Action | null {
    let best: Action | null = null;
    let bestValue = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i].action;
      if (a.type === 'move' && !this.isMoveSafe(state, playerId, a.unitId, a.to)) continue;
      const v = leafOf(i) + this.phaseBonus(state, playerId, a);
      if (v > bestValue) {
        bestValue = v;
        best = a;
      }
    }
    if (!best && unitId) {
      const waitAction = candidates.find(c => c.action.type === 'wait' && (c.action as any).unitId === unitId);
      if (waitAction) return waitAction.action;
    }
    return best;
  }

  /** 攻击是否安全：目标是敌方指挥官全力放行集火；小兵舍身斩首，我方指挥官避免自杀。 */
  private isAttackSafe(engine: GameEngine, playerId: number, action: Action): boolean {
    if (action.type !== 'attack') return true;
    const state = engine.getState();
    const target = state.units.find(u => u.id === action.targetId);
    const attacker = state.units.find(u => u.id === action.attackerId);
    if (!attacker || !target) return false;

    // 斩首行动：只要目标是敌方指挥官，小兵全力集火放行！
    if (isCommanderUnit(state, target)) {
      if (isCommanderUnit(state, attacker)) {
        // 我方指挥官自身打敌方指挥官：能斩杀或自身安全（剩余HP>25）才打
        const dmg = calculateDamage(state, attacker.id, target.id);
        if (dmg >= target.hp) return true;
        const sim = engine.clone();
        try {
          sim.step(action);
        } catch {
          return false;
        }
        const after = sim.getState();
        const attackerAfter = after.units.find(u => u.id === action.attackerId);
        if (!attackerAfter || attackerAfter.hp <= 25) return false;
      }
      return true;
    }

    if (this.materialRatio(state, playerId) > 1.35) return true;

    if (hasAbility(attacker, 'assault_troop') && (attacker.movementRemaining ?? 0) > 0) {
      return true;
    }

    const sim = engine.clone();
    try {
      sim.step(action);
    } catch {
      return false;
    }
    const after = sim.getState();
    const attackerAfter = after.units.find(u => u.id === action.attackerId);
    if (!attackerAfter || attackerAfter.hp <= 0) {
      const targetAfter = after.units.find(u => u.id === action.targetId);
      const targetDied = !targetAfter || targetAfter.hp <= 0;
      if (!targetDied) return false;
      const targetVal = getUnitCost(state, target.ownerId, target.unitClass) ?? 200;
      const attackerVal = getUnitCost(state, attacker.ownerId, attacker.unitClass) ?? 200;
      return targetVal > attackerVal;
    }

    const incoming = this.estimateIncomingDamageToTile(after, playerId, attackerAfter, attackerAfter.pos);
    return incoming < attackerAfter.hp;
  }

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

  private phaseBonus(state: GameState, playerId: number, action: Action): number {
    const allied = getAllianceId(state, playerId);
    const ratio = this.materialRatio(state, playerId);
    const turn = state.turn;
    const behind = ratio < 0.85;
    const ahead = ratio > 1.25;

    switch (action.type) {
      case 'attack': {
        const target = state.units.find(u => u.id === action.targetId);
        const attacker = state.units.find(u => u.id === action.attackerId);
        if (target && attacker) {
          const dmg = calculateDamage(state, attacker.id, target.id);
          const killsTarget = dmg >= target.hp;
          if (isCommanderUnit(state, target)) {
            return killsTarget ? 50000 : 18000;
          }
          if (killsTarget) {
            const tVal = getUnitCost(state, target.ownerId, target.unitClass) ?? 200;
            return 800 + tVal * 2;
          }
        }
        if (behind) return -600;
        if (ahead) return 250;
        return 0;
      }
      case 'capture':
        return 1200 + (turn <= 8 ? 600 : 0) + (behind ? 300 : 0);
      case 'recruit_to_castle':
      case 'recruit_and_deploy': {
        const me = state.players.find(p => p.id === playerId);
        const gold = me?.gold ?? 0;
        const deployBonus = action.type === 'recruit_and_deploy' ? 250 : 0;

        // 如果该城堡正受敌方指挥官威胁，直接在此招募并驻守享有极高优先级
        if (this.isCastleThreatenedByEnemyCommander(state, playerId, action.castlePos)) {
          return 30000;
        }

        if (action.type === 'recruit_to_castle' && turn <= 3) {
          const commander = state.units.find(
            u => u.ownerId === playerId && u.hp > 0 && isCommanderUnit(state, u)
          );
          if (commander && commander.pos.x === action.castlePos.x && commander.pos.y === action.castlePos.y) {
            return -3000;
          }
        }

        const cost = getUnitCost(state, playerId, action.unitClass) ?? 999;
        // 开局 T1-T2：300金局面强烈鼓励买150士兵实现一回合双招，严惩买贵兵掏空金库
        if (turn <= 2 && gold >= 150) {
          if (gold >= 300 && gold < 400 && cost > 150) {
            return -2500;
          }
          const doubleRecruitBonus = (gold >= 300 && cost <= 150) ? 2500 : 0;
          return 2000 + doubleRecruitBonus + deployBonus;
        }
        // T3+ 扩张期/会战期：钱多时不屯钱，且支持买高阶兵种与射手
        if (gold >= 350) {
          const archerBonus = action.unitClass === 'archer' ? 600 : 0;
          return 800 + (cost >= 350 ? 600 : 0) + archerBonus + deployBonus;
        }
        if (gold >= 250 && action.unitClass === 'archer') {
          return 800 + deployBonus;
        }
        if (gold >= 150) return 400 + deployBonus;
        return 0;
      }
      case 'wait': {
        const unit = state.units.find(u => u.id === (action as any).unitId);
        if (unit) {
          const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
          if (tile && getTileTerrainConfig(tile).key === 'castle' && this.isCastleThreatenedByEnemyCommander(state, playerId, unit.pos)) {
            const player = state.players.find(p => p.id === playerId);
            const gold = player?.gold ?? 0;
            // 只有当没钱再招新兵（gold < 150）时，驻守待机才是最高优先级！
            // 如果手头有大笔金币（gold >= 150），待机占着城堡会卡死招募生产，应当适度惩罚促使其移出
            if (gold < 150) {
              return 35000;
            } else {
              return -2000;
            }
          }
        }
        return ahead ? -400 : 0;
      }
      case 'end_turn':
        return ahead ? -400 : 0;
      case 'move':
      case 'post_attack_move': {
        const unit = state.units.find(u => u.id === action.unitId);
        if (!unit) return 0;
        if (this.isLeavingCastleUnguardedAgainstCommander(state, playerId, action.unitId, action.to)) {
          return -45000; // 严厉否决弃守城堡
        }
        if (!this.isMoveSafe(state, playerId, action.unitId, action.to)) {
          return -3000;
        }
        // 移入受威胁的空城堡驻守
        if (this.isCastleThreatenedByEnemyCommander(state, playerId, action.to)) {
          return 25000;
        }
        if (turn <= 10) {
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
                objBefore = Math.min(objBefore, Math.abs(unit.pos.x - x) + Math.abs(unit.pos.y - y));
                objAfter = Math.min(objAfter, Math.abs(action.to.x - x) + Math.abs(action.to.y - y));
              }
            }
            if (objBefore !== Infinity) {
              return Math.max(-400, Math.min(400, (objBefore - objAfter) * 100));
            }
          }
        }
        return 0;
      }
      default:
        return 0;
    }
  }

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

    // 2. 紧急防御：若城堡受敌方指挥官威胁，优先纳入移入驻守，并在金币不足招新时纳入驻守待机
    const playerGold = state.players.find(p => p.id === playerId)?.gold ?? 0;
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      if (item.action.type === 'wait' && playerGold < 150) {
        const u = state.units.find(unit => unit.id === (item.action as any).unitId);
        if (u && this.isCastleThreatenedByEnemyCommander(state, playerId, u.pos)) {
          push(item);
        }
      } else if (item.action.type === 'move' && this.isCastleThreatenedByEnemyCommander(state, playerId, item.action.to)) {
        push(item);
      }
    }

    // 3. 击杀/斩首优先攻击（优先纳入对敌方指挥官的所有攻击）
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      if (item.action.type === 'attack') {
        const a = item.action;
        const target = state.units.find(u => u.id === a.targetId);
        if (target && isCommanderUnit(state, target)) {
          push(item);
        }
      }
    }

    // 4. 全部 capture
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      if (item.action.type === 'capture') push(item);
    }

    // 5. 其余致命一击攻击
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      if (item.action.type === 'attack') {
        const a = item.action;
        const target = state.units.find(u => u.id === a.targetId);
        if (target) {
          const dmg = calculateDamage(state, a.attackerId, a.targetId);
          if (dmg >= target.hp) {
            push(item);
          }
        }
      }
    }

    // 6. 其余攻击（最多2个）
    let attacks = 0;
    for (const item of ordered) {
      if (out.length >= this.topK || attacks >= 2) break;
      if (item.action.type === 'attack') {
        push(item);
        attacks += 1;
      }
    }

    // 7. 招募候选
    if (state.turn <= 2) {
      let cheapest: { action: Action; score: number } | null = null;
      let cheapestCost = Infinity;
      for (const item of ordered) {
        const a = item.action;
        if (a.type !== 'recruit_to_castle' && a.type !== 'recruit_and_deploy') continue;
        const cost = getUnitCost(state, playerId, a.unitClass) ?? Infinity;
        if (cost < cheapestCost) {
          cheapestCost = cost;
          cheapest = item;
        }
      }
      if (cheapest && out.length < this.topK) push(cheapest);
    } else {
      let recruitsPushed = 0;
      for (const item of ordered) {
        if (out.length >= this.topK || recruitsPushed >= 2) break;
        const a = item.action;
        if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') {
          push(item);
          recruitsPushed++;
        }
      }
    }

    // 8. heuristic 顺序填充
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

    // 己方连动展开
    for (let i = 0; i < this.friendlyRolloutSteps; i++) {
      if (sim.getState().winner !== null) break;
      if (sim.getState().currentPlayer !== playerId) break;
      try {
        const legal = sim.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legal.length === 0) break;
        const nonEnd = legal.filter(a => a.type !== 'end_turn');
        if (nonEnd.length === 0) break;
        const follow = this.heuristic.getAction(sim, playerId, nonEnd);
        if (follow.type === 'end_turn') break;
        sim.step(follow);
      } catch {
        break;
      }
    }

    const after = sim.getState();
    if (after.winner !== null || after.currentPlayer === playerId) {
      return evaluatePositionHeuristic(after, playerId);
    }

    return this.probeOpponentFocusFire(sim, playerId, after.currentPlayer);
  }

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
   * 高速对手集火探测：直接扫描对手攻击能力，无需完整 Dijkstra 动作生成。
   */
  private probeOpponentFocusFire(sim: GameEngine, rootId: number, oppId: number): number {
    const probe = sim.clone();
    let worst = evaluatePositionHeuristic(probe.getState(), rootId);
    for (let d = 0; d < this.oppDepth; d++) {
      const st = probe.getState();
      if (st.winner !== null || st.currentPlayer !== oppId) break;

      const oppUnits = st.units.filter(u => u.ownerId === oppId && u.hp > 0 && !u.hasActed);
      const myUnits = st.units.filter(u => u.ownerId === rootId && u.hp > 0);
      if (oppUnits.length === 0 || myUnits.length === 0) break;

      let best: Action | null = null;
      let bestScore = -Infinity;

      for (const attacker of oppUnits) {
        const eff = getEffectiveStats(attacker);
        for (const target of myUnits) {
          if (inRange(attacker.pos, target.pos, eff.minRange, eff.maxRange)) {
            const s = this.staticAttackScore(st, attacker.id, target.id);
            if (s > bestScore) {
              bestScore = s;
              best = { type: 'attack', attackerId: attacker.id, targetId: target.id };
            }
          }
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
