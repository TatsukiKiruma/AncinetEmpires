import type { Action, GameState, Position, Unit } from '../types';
import { GameEngine } from '../engine';
import { getEffectiveStats, hasAbility } from '../abilities';
import { getDistance, getReachablePositions } from '../map';
import { calculateDamage, estimateCounterDamage } from '../rules';
import { areEnemyPlayers, canRecruitUnitClass, getAllianceId, getRecruitableUnits, getUnitCost, isActivePlayer, isCommanderUnit } from '../rule_config';
import { getTileDefenseBonus, getTileTerrainKey } from '../terrain_rules';
import { encodeAction } from '../env';
import { HeuristicAI } from './heuristic_ai';
import { evaluatePositionHeuristic } from './runtime/v7_heuristic_bounded_search';

export type Rng = () => number;

export interface BattleSearchV2Options {
  /** 协作式墙钟截止，最大 180ms；底盘评分与权威引擎的单次同步调用无法抢占。 */
  budgetMs?: number;
  topK?: number;
  maxExtraUnits?: number;
  enableQueue?: boolean;
  takeoverThreshold?: number;
  vetoMargin?: number;
  dangerLine?: number;
  allowSurrender?: boolean;
}

export interface BattleSearchV2Telemetry {
  elapsedMs: number;
  queued: boolean;
  rootCandidates: number;
  nodes: number;
  takeover: boolean;
  veto: boolean;
  urgent: boolean;
  worstThreatPenalty: number;
}

interface Scored { action: Action; score: number }
interface Queued { before: string; action: Action }
interface Threat {
  penalty: number;
  commanders: Map<string, { loss: number; dead: boolean }>;
  actorLoss: number;
  castles: number;
  complete: boolean;
}
interface Branch {
  action: Action;
  score: number;
  gain: number;
  threat: Threat;
  queue: Queued[];
  won: boolean;
}
interface SearchContext { deadline: number; nodes: number }

const samePos = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
const posKey = (p: Position): string => `${p.x},${p.y}`;
const expired = (ctx: SearchContext): boolean => performance.now() >= ctx.deadline;
const actorOf = (a: Action): string | undefined => {
  if ('unitId' in a) return a.unitId;
  if ('attackerId' in a) return a.attackerId;
  if ('healerId' in a) return a.healerId;
  if ('supporterId' in a) return a.supporterId;
  if ('summonerId' in a) return a.summonerId;
  return undefined;
};
const costOf = (s: GameState, u: Unit): number => getUnitCost(s, u.ownerId, u.unitClass) ?? 600;
// 摘要保留规则、地形来源、状态、金币及脚本变量；不能仅凭回合号复用已验证链。
const signature = (s: GameState): string => JSON.stringify(s);
const emptyThreat = (): Threat => ({ penalty: 0, commanders: new Map(), actorLoss: 0, castles: 0, complete: true });

function seededRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 单次搜索内共享寻路结果；位置投影只替换局部单位数组，不克隆引擎。 */
class ReachableThreats {
  private readonly paths = new Map<string, Position[]>();
  constructor(private readonly state: GameState, private readonly playerId: number) {}

  enemies(): Unit[] {
    return this.state.units.filter(u => u.hp > 0 && isActivePlayer(this.state, u.ownerId)
      && areEnemyPlayers(this.state, this.playerId, u.ownerId));
  }

  positions(enemy: Unit): Position[] {
    let result = this.paths.get(enemy.id);
    if (!result) {
      // 下一回合行动标记重置。对即将到期的控制状态采用解除后的保守威胁上界。
      const duration = enemy.status?.remainingTurns ?? enemy.status?.remainingTicks ?? 0;
      const projected = enemy.status && enemy.status.type !== 'poisoned' && duration <= 1
        ? { ...enemy, status: undefined } : enemy;
      const state = projected === enemy ? this.state
        : { ...this.state, units: this.state.units.map(u => u.id === enemy.id ? projected : u) };
      result = enemy.apkStatic ? [enemy.pos] : getReachablePositions(state, enemy.id);
      this.paths.set(enemy.id, result);
    }
    return result;
  }

  maxDamage(enemy: Unit, target: Unit): number {
    const duration = enemy.status?.remainingTurns ?? enemy.status?.remainingTicks ?? 0;
    const projected = { ...enemy, status: enemy.status?.type !== 'poisoned' && duration <= 1 ? undefined : enemy.status };
    const stats = getEffectiveStats(projected);
    if (stats.maxRange <= 0 || enemy.apkStatic) return 0;
    const units = this.state.units.map(u => u.id === enemy.id ? projected : u);
    if (!units.some(u => u.id === target.id)) units.push(target);
    const view = { ...this.state, units };
    let maximum = 0;
    for (const pos of this.positions(enemy)) {
      const distance = getDistance(pos, target.pos);
      if (distance < stats.minRange || distance > stats.maxRange) continue;
      projected.pos = pos;
      maximum = Math.max(maximum, calculateDamage(view, enemy.id, target.id));
    }
    return maximum;
  }

  castleThreats(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    const occupied = new Set(this.state.units.filter(u => u.hp > 0).map(u => posKey(u.pos)));
    const capturers = this.enemies().filter(u => hasAbility(u, 'castle_capturer') && !u.apkStatic);
    for (const row of this.state.map.tiles) for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (getTileTerrainKey(tile) !== 'castle' || tile.ownerId === null
        || areEnemyPlayers(this.state, this.playerId, tile.ownerId)) continue;
      const pos = { x, y: this.state.map.tiles.indexOf(row) };
      if (occupied.has(posKey(pos))) continue;
      const ids = new Set(capturers.filter(e => this.positions(e).some(p => samePos(p, pos))).map(e => e.id));
      if (ids.size) result.set(posKey(pos), ids);
    }
    return result;
  }
}

/** 纯规则战术搜索：每个根分支只克隆一次，完成本单位后再检查有限配合。 */
export class BattleSearchV2AI {
  private readonly heuristic: HeuristicAI;
  private readonly options: Required<BattleSearchV2Options>;
  private queue: Queued[] = [];
  private queueEngine?: GameEngine;
  private queuePlayer?: number;
  private lastTelemetry: Readonly<BattleSearchV2Telemetry> = Object.freeze({
    elapsedMs: 0, queued: false, rootCandidates: 0, nodes: 0,
    takeover: false, veto: false, urgent: false, worstThreatPenalty: 0
  });

  constructor(seedOrRng?: number | Rng, options: BattleSearchV2Options = {}) {
    this.heuristic = new HeuristicAI(typeof seedOrRng === 'function' ? seedOrRng : seededRng(seedOrRng ?? 0xbeef));
    const bounded = (value: number | undefined, fallback: number, min: number, max: number): number =>
      Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
    this.options = {
      budgetMs: bounded(options.budgetMs, 180, 1, 180),
      topK: Math.floor(bounded(options.topK, 8, 1, 64)),
      maxExtraUnits: Math.floor(bounded(options.maxExtraUnits, 1, 0, 4)),
      enableQueue: options.enableQueue ?? true,
      takeoverThreshold: bounded(options.takeoverThreshold, 900, 0, 100000),
      vetoMargin: bounded(options.vetoMargin, 600, 0, 100000),
      dangerLine: bounded(options.dangerLine, -1200, -100000, 100000),
      allowSurrender: options.allowSurrender ?? false
    };
  }

  get telemetry(): Readonly<BattleSearchV2Telemetry> { return this.lastTelemetry; }

  getAction(engine: GameEngine, playerId: number, preparedActions?: readonly Action[]): Action {
    const start = performance.now();
    const telemetry: BattleSearchV2Telemetry = {
      elapsedMs: 0, queued: false, rootCandidates: 0, nodes: 0,
      takeover: false, veto: false, urgent: false, worstThreatPenalty: 0
    };
    const finish = (action: Action): Action => {
      telemetry.elapsedMs = performance.now() - start;
      this.lastTelemetry = Object.freeze(telemetry);
      return structuredClone(action);
    };
    const root = engine.getState();
    if (this.options.enableQueue && this.queueEngine === engine && this.queuePlayer === playerId
      && this.queue.length && this.queue[0].before === signature(root)) {
      const next = this.queue[0].action;
      const actor = actorOf(next);
      const legal = preparedActions ?? engine.getLegalActions(playerId, { unitId: actor, skipRecruitment: true });
      if (root.currentPlayer === playerId && legal.some(a => encodeAction(a) === encodeAction(next))) {
        this.queue.shift();
        telemetry.queued = true;
        return finish(next);
      }
    }
    this.queue = [];
    let legal = (preparedActions ?? engine.getLegalActions(playerId))
      .filter(a => this.options.allowSurrender || a.type !== 'surrender');
    // 招募存在时，结束回合不能在叶子接管或预算回退中重新漏入。
    if (legal.some(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy')) {
      legal = legal.filter(a => a.type !== 'end_turn');
    }
    if (!legal.length) return finish({ type: 'end_turn' });
    if (legal.length === 1 && (legal[0].type === 'end_turn' || legal[0].type === 'surrender')) return finish(legal[0]);
    const ctx: SearchContext = { deadline: start + this.options.budgetMs, nodes: 0 };
    const rootThreats = new ReachableThreats(root, playerId);
    const castles = rootThreats.castleThreats();
    const scored = this.scoreRoots(engine, root, playerId, legal, castles, start, ctx);
    this.correctRootScores(root, playerId, scored, castles, rootThreats);
    scored.sort((a, b) => b.score - a.score);
    const candidates = this.rootPool(scored);
    const primary = candidates[0];
    telemetry.urgent = primary.score >= 50000;
    let baseline: Branch | undefined;
    let chosen: Branch | undefined;
    for (const candidate of candidates) {
      if (expired(ctx)) break;
      const branch = this.expand(engine, root, playerId, candidate.action, ctx);
      telemetry.rootCandidates++;
      telemetry.worstThreatPenalty = Math.max(telemetry.worstThreatPenalty, branch.threat.penalty);
      if (branch.won) { chosen = branch; break; }
      // 默认分支尚未完整评估时不能拿后续候选冒充默认安全基线。
      if (!branch.threat.complete) break;
      if (!baseline) { baseline = branch; chosen = branch; continue; }
      if (!this.commanderSafe(baseline.threat, branch.threat)) continue;
      const dangerous = this.dangerous(baseline);
      const margin = dangerous ? this.options.vetoMargin : this.options.takeoverThreshold;
      const riskReduced = this.risk(branch.threat) < this.risk(baseline.threat)
        || (baseline.score <= this.options.dangerLine && branch.score > baseline.score);
      if (branch.score >= baseline.score + margin && branch.score > chosen!.score
        && (dangerous ? riskReduced : branch.gain > baseline.gain)) {
        chosen = branch;
        telemetry.veto = dangerous;
        telemetry.takeover = !dangerous;
      }
    }
    telemetry.nodes = ctx.nodes;
    if (chosen && this.options.enableQueue && chosen.threat.complete && !chosen.threat.actorLoss) {
      this.queue = chosen.queue;
      this.queueEngine = engine;
      this.queuePlayer = playerId;
    }
    return finish(chosen?.action ?? primary.action);
  }

  evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {
    const root = engine.getState();
    const ctx = { deadline: performance.now() + this.options.budgetMs, nodes: 0 };
    if (!engine.getLegalActions(playerId).some(a => encodeAction(a) === encodeAction(action))) return -100000;
    return this.expand(engine, root, playerId, action, ctx).score;
  }

  actionCode(action: Action): string { return encodeAction(action); }

  private scoreRoots(engine: GameEngine, root: GameState, playerId: number, legal: Action[], castles: Map<string, Set<string>>, start: number, ctx: SearchContext): Scored[] {
    // 旧底盘的整批评分不可抢占。按类型、单位首选交错成小批，给真实叶子和安全检查留预算。
    // 时间充裕时覆盖完整合法集合；预算不足时只使用已完成的权威启发式评分。
    const prior = legal.map(action => {
      const actor = root.units.find(u => u.id === actorOf(action));
      let score = 0;
      if (actor && (action.type === 'move' || action.type === 'post_attack_move')) {
        score = this.moveValue(root, actor, action.to) + (castles.has(posKey(action.to)) ? 68000 : 0);
      } else if (action.type === 'attack') {
        const target = root.units.find(u => u.id === action.targetId)!;
        const damage = calculateDamage(root, action.attackerId, action.targetId);
        score = 8000 + damage * 50 + (damage >= target.hp ? 20000 : 0);
      } else if (action.type === 'capture') score = 40000;
      else if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') score = action.unitClass === 'commander' ? 56000 : 3600 + (getUnitCost(root, playerId, action.unitClass) ?? 0) * 2;
      else if (action.type === 'support') score = 6000;
      else if (action.type === 'heal' || action.type === 'repair' || action.type === 'summon') score = 4000;
      else if (action.type === 'end_turn') score = -90000;
      else if (action.type === 'surrender') score = -100000;
      return { action, score };
    }).sort((a, b) => b.score - a.score);
    const work: Action[] = [], seen = new Set<Action>();
    const add = (item?: Scored): void => { if (item && !seen.has(item.action)) { seen.add(item.action); work.push(item.action); } };
    add(prior[0]);
    for (const type of ['attack', 'capture', 'recruit_to_castle', 'support', 'heal', 'wait'] as const) add(prior.find(s => s.action.type === type));
    const actors = new Set<string>();
    for (const item of prior) {
      const actor = actorOf(item.action);
      if (actor && !actors.has(actor)) { actors.add(actor); add(item); }
    }
    for (const item of prior) add(item);
    const scored: Scored[] = [];
    const scoringDeadline = Math.min(ctx.deadline, start + Math.min(12, this.options.budgetMs * 0.15));
    for (let offset = 0; offset < work.length && performance.now() < scoringDeadline; offset += 8) {
      scored.push(...this.heuristic.scoreCandidateActions(engine, playerId, work.slice(offset, offset + 8)));
    }
    return scored.length ? scored : prior;
  }

  private correctRootScores(root: GameState, playerId: number, scored: Scored[], castles: Map<string, Set<string>>, threats: ReachableThreats): void {
    const recruitment = scored.some(s => s.action.type === 'recruit_to_castle' || s.action.type === 'recruit_and_deploy');
    const canRecruit = getRecruitableUnits(root, playerId).some(c => canRecruitUnitClass(root, playerId, c));
    const enemies = threats.enemies();
    const actionable = new Set<string>();
    for (const item of scored) {
      const a = item.action, actor = actorOf(a);
      const unit = root.units.find(u => u.id === actor);
      if (!unit) continue;
      if (a.type === 'move' || a.type === 'post_attack_move') {
        const tile = root.map.tiles[a.to.y][a.to.x];
        if (castles.has(posKey(a.to))) item.score += 68000;
        if (getTileTerrainKey(tile) === 'castle' && (tile.ownerId === null || areEnemyPlayers(root, playerId, tile.ownerId))
          && !hasAbility(unit, 'castle_capturer') && root.units.some(u => u.hp > 0 && u.ownerId === playerId
            && hasAbility(u, 'castle_capturer') && getDistance(u.pos, a.to) <= 6)) item.score -= 8000;
        const under = root.map.tiles[unit.pos.y][unit.pos.x];
        if (canRecruit && under.ownerId === playerId && getTileTerrainKey(under) === 'castle'
          && this.moveValue(root, unit, a.to) > 0) item.score += 1800;
        if (!unit.hasMoved && this.moveValue(root, unit, a.to) > 0
          && enemies.every(e => getDistance(e.pos, a.to) > getEffectiveStats(e).move + getEffectiveStats(e).maxRange)) actionable.add(unit.id);
      } else if (a.type === 'attack' || a.type === 'capture') {
        if (!unit.hasMoved && (a.type === 'capture' || estimateCounterDamage(root, unit.id, a.targetId) < unit.hp)) actionable.add(unit.id);
        if (a.type === 'attack') {
          const target = root.units.find(u => u.id === a.targetId);
          if (target && calculateDamage(root, unit.id, target.id) >= target.hp
            && [...castles.values()].some(ids => ids.has(target.id))) item.score += 25000;
        }
      }
    }
    for (const item of scored) {
      if (recruitment && item.action.type === 'end_turn') item.score = -90000;
      if (item.action.type === 'wait' && actionable.has(item.action.unitId)) item.score -= 15000;
    }
  }

  private rootPool(ordered: Scored[]): Scored[] {
    const pool: Scored[] = [], seen = new Set<string>();
    const add = (item?: Scored): void => {
      if (!item || pool.length >= this.options.topK) return;
      const code = encodeAction(item.action);
      if (!seen.has(code)) { seen.add(code); pool.push(item); }
    };
    add(ordered[0]);
    for (const type of ['attack', 'capture', 'recruit_to_castle', 'support', 'heal'] as const) add(ordered.find(s => s.action.type === type));
    const actors = new Set(pool.map(s => actorOf(s.action)));
    for (const item of ordered) {
      const actor = actorOf(item.action);
      if (actor && !actors.has(actor)) { add(item); actors.add(actor); }
    }
    // 为首单位保留驻防和不同移动落点，才能对默认进攻走位执行避险否决。
    add(ordered.find(s => s.action.type === 'wait' && actorOf(s.action) === actorOf(ordered[0].action)));
    for (const item of ordered) add(item);
    return pool;
  }

  private expand(engine: GameEngine, root: GameState, playerId: number, action: Action, ctx: SearchContext): Branch {
    const sim = engine.clone();
    const actors = new Set<string>();
    const queue: Queued[] = [];
    let after = sim.step(action).state;
    ctx.nodes++;
    let actor = actorOf(action);
    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
      actor = after.units.find(u => u.ownerId === playerId && !root.units.some(old => old.id === u.id)
        && samePos(u.pos, action.type === 'recruit_to_castle' ? action.castlePos : action.to))?.id;
    }
    if (actor) {
      actors.add(actor);
      after = this.completeUnit(sim, after, playerId, actor, ctx, queue);
    }
    for (let extra = 0; extra < this.options.maxExtraUnits && !expired(ctx)
      && after.winner === null && after.currentPlayer === playerId; extra++) {
      let best: Scored | undefined;
      for (const unit of after.units) {
        if (unit.ownerId !== playerId || unit.hasActed || actors.has(unit.id)) continue;
        const legal = sim.getLegalActions(playerId, { unitId: unit.id, skipMovement: true, skipRecruitment: true });
        for (const follow of legal) {
          if (follow.type !== 'capture' && !(follow.type === 'attack'
            && calculateDamage(after, unit.id, follow.targetId) >= (after.units.find(u => u.id === follow.targetId)?.hp ?? Infinity))) continue;
          const score = this.localScore(after, follow);
          if (!best || score > best.score) best = { action: follow, score };
        }
      }
      if (!best || expired(ctx)) break;
      const extraActor = actorOf(best.action)!;
      actors.add(extraActor);
      after = sim.step(best.action).state;
      ctx.nodes++;
      // 配合单位只用于估值；缓存仅保存第一单位链，外部状态变化后重新搜索。
      after = this.completeUnit(sim, after, playerId, extraActor, ctx, []);
    }
    const ledger = this.ledger(root, after, playerId);
    const threat = after.winner !== null ? emptyThreat() : this.threat(root, after, playerId, actors, ledger.credit, ctx);
    const won = after.winner === getAllianceId(after, playerId);
    const score = after.winner !== null ? evaluatePositionHeuristic(after, playerId)
      : evaluatePositionHeuristic(after, playerId) + ledger.score - threat.penalty;
    return { action, score, gain: ledger.gain, threat, queue, won };
  }

  private completeUnit(sim: GameEngine, state: GameState, playerId: number, actorId: string, ctx: SearchContext, queue: Queued[]): GameState {
    let after = state;
    // 普通移动、动作、突击移动最多三段；上限也防止脚本反复重置同一单位。
    for (let step = 0; step < 4 && !expired(ctx) && after.winner === null && after.currentPlayer === playerId; step++) {
      const unit = after.units.find(u => u.id === actorId && u.hp > 0);
      if (!unit) break;
      const assault = unit.hasActed && hasAbility(unit, 'assault_troop') && !unit.hasPostAttackMoved && (unit.movementRemaining ?? 0) > 0;
      if (unit.hasActed && !assault) break;
      const legal = sim.getLegalActions(playerId, { unitId: actorId, skipRecruitment: true, skipMovement: unit.hasMoved && !assault })
        .filter(a => actorOf(a) === actorId);
      if (!legal.length) break;
      // 移动排序复用移除本单位后的可达上界；最终叶子仍按落点占用做精确寻路。
      const threats = new ReachableThreats({ ...after, units: after.units.filter(u => u.id !== actorId) }, playerId);
      const enemies = threats.enemies();
      const leavingThreatenedCastle = getTileTerrainKey(after.map.tiles[unit.pos.y][unit.pos.x]) === 'castle'
        && threats.castleThreats().has(posKey(unit.pos));
      let best: Scored | undefined;
      for (const follow of legal) {
        let score = this.localScore(after, follow);
        if (follow.type === 'move' || follow.type === 'post_attack_move') {
          const target = { ...unit, pos: follow.to };
          const focus = enemies.map(e => threats.maxDamage(e, target)).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
          score -= focus * (isCommanderUnit(after, unit) ? 120 : 12) + (focus >= unit.hp ? 9000 : 0);
          // 让新兵优先腾出城堡；受威胁的城堡由真实反扑惩罚约束，不能盲目离开。
          if (getTileTerrainKey(after.map.tiles[unit.pos.y][unit.pos.x]) === 'castle' && !samePos(unit.pos, follow.to)) {
            score += leavingThreatenedCastle ? -22000 : 1800;
          }
        } else if (follow.type === 'wait' && !unit.hasMoved) {
          score -= Math.max(0, ...enemies.map(e => threats.maxDamage(e, unit))) * 12;
        }
        if (!best || score > best.score) best = { action: follow, score };
        if (expired(ctx)) break;
      }
      if (!best || expired(ctx)) break;
      queue.push({ before: signature(after), action: best.action });
      after = sim.step(best.action).state;
      ctx.nodes++;
    }
    return after;
  }

  private localScore(state: GameState, action: Action): number {
    const unit = state.units.find(u => u.id === actorOf(action));
    if (!unit) return -100000;
    switch (action.type) {
      case 'attack': {
        const target = state.units.find(u => u.id === action.targetId)!;
        const damage = Math.min(target.hp, calculateDamage(state, unit.id, target.id));
        const counter = estimateCounterDamage(state, unit.id, target.id);
        return 4000 + damage * 28 + costOf(state, target) * damage / Math.max(1, target.hp) * 4
          + (damage >= target.hp ? 12000 + (isCommanderUnit(state, target) ? 18000 : 0) : 0)
          - counter * (isCommanderUnit(state, unit) ? 120 : 20) - (counter >= unit.hp ? 20000 : 0);
      }
      case 'capture': return getTileTerrainKey(state.map.tiles[unit.pos.y][unit.pos.x]) === 'castle' ? 40000 : 24000;
      case 'heal': {
        const target = state.units.find(u => u.id === action.targetId)!;
        return 3200 + (hasAbility(target, 'undead') ? 4000 : Math.max(0, getEffectiveStats(target).maxHp - target.hp) * 65);
      }
      case 'support': return 6000 + costOf(state, state.units.find(u => u.id === action.targetId)!);
      case 'summon': return 5000;
      case 'repair': return 4500;
      case 'destroy_town': return 1000;
      case 'move': case 'post_attack_move': return this.moveValue(state, unit, action.to);
      case 'wait': return 0;
      default: return -90000;
    }
  }

  private moveValue(state: GameState, unit: Unit, to: Position): number {
    let before = Infinity, after = Infinity;
    for (const row of state.map.tiles) for (let x = 0; x < row.length; x++) {
      const tile = row[x], key = getTileTerrainKey(tile);
      if (tile.ownerId !== null && !areEnemyPlayers(state, unit.ownerId, tile.ownerId)) continue;
      if (!(key === 'castle' && hasAbility(unit, 'castle_capturer')) && !(key === 'town' && hasAbility(unit, 'village_capturer'))) continue;
      const pos = { x, y: state.map.tiles.indexOf(row) };
      before = Math.min(before, getDistance(unit.pos, pos));
      after = Math.min(after, getDistance(to, pos));
    }
    for (const enemy of state.units) if (enemy.hp > 0 && areEnemyPlayers(state, unit.ownerId, enemy.ownerId)) {
      before = Math.min(before, getDistance(unit.pos, enemy.pos));
      after = Math.min(after, getDistance(to, enemy.pos));
    }
    const tile = state.map.tiles[to.y][to.x], key = getTileTerrainKey(tile);
    const capture = (tile.ownerId === null || areEnemyPlayers(state, unit.ownerId, tile.ownerId))
      && ((key === 'castle' && hasAbility(unit, 'castle_capturer')) || (key === 'town' && hasAbility(unit, 'village_capturer')));
    const stats = getEffectiveStats(unit);
    const attack = state.units.some(e => areEnemyPlayers(state, unit.ownerId, e.ownerId)
      && getDistance(to, e.pos) >= stats.minRange && getDistance(to, e.pos) <= stats.maxRange);
    return (Number.isFinite(before) ? (before - after) * 250 : 0) + (capture ? 9000 : 0) + (attack ? 1500 : 0) + getTileDefenseBonus(tile) * 15;
  }

  private ledger(root: GameState, after: GameState, playerId: number): { score: number; gain: number; credit: number } {
    let score = 0, gain = 0, credit = 0;
    for (const unit of root.units) {
      const next = after.units.find(u => u.id === unit.id && u.hp > 0);
      const enemy = areEnemyPlayers(root, playerId, unit.ownerId), cost = costOf(root, unit);
      if (!next) {
        const value = cost * 8 + (isCommanderUnit(root, unit) ? 18000 : 0);
        score += enemy ? value : -value;
        if (enemy) { gain += value; credit += cost; }
      } else {
        const delta = unit.hp - next.hp;
        score += (enemy ? 1 : -1) * delta * cost * 2 / Math.max(1, getEffectiveStats(unit).maxHp);
        if (enemy && delta > 0) gain += delta * cost / Math.max(1, getEffectiveStats(unit).maxHp);
      }
    }
    for (let y = 0; y < root.map.height; y++) for (let x = 0; x < root.map.width; x++) {
      const old = root.map.tiles[y][x], next = after.map.tiles[y][x];
      if (old.ownerId === next.ownerId || next.ownerId === null || areEnemyPlayers(after, playerId, next.ownerId)) continue;
      if (old.ownerId !== null && !areEnemyPlayers(root, playerId, old.ownerId)) continue;
      const value = getTileTerrainKey(next) === 'castle' ? 18000 : getTileTerrainKey(next) === 'town' ? 6500 : 0;
      score += value; gain += value; credit += value;
    }
    for (const unit of after.units) if (unit.ownerId === playerId && !root.units.some(u => u.id === unit.id)) {
      // 金币变成满血军力：补足静态估值中金币的折价，展开新兵另记有限收益。
      const value = costOf(after, unit) * Math.min(1, unit.hp / getEffectiveStats(unit).maxHp);
      score += value * 0.5;
      gain += value + (unit.hasMoved ? 450 : 0);
    }
    return { score, gain, credit };
  }

  private threat(root: GameState, after: GameState, playerId: number, actors: Set<string>, credit: number, ctx: SearchContext): Threat {
    const result = emptyThreat(), view = new ReachableThreats(after, playerId), enemies = view.enemies();
    const keys = new Set([...actors, ...root.units.filter(u => u.hp > 0 && !areEnemyPlayers(root, playerId, u.ownerId)
      && isCommanderUnit(root, u)).map(u => u.id)]);
    for (const id of keys) {
      if (expired(ctx)) { result.complete = false; break; }
      const before = root.units.find(u => u.id === id), unit = after.units.find(u => u.id === id && u.hp > 0);
      const commander = before ? isCommanderUnit(root, before) : unit && isCommanderUnit(after, unit);
      const damages: number[] = [];
      if (unit) for (const enemy of enemies) {
        if (expired(ctx)) { result.complete = false; break; }
        damages.push(view.maxDamage(enemy, unit));
      }
      const focus = damages.sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
      if (commander) {
        const hp = before?.hp ?? unit?.hp ?? 0;
        const loss = Math.max(0, hp - Math.max(0, (unit?.hp ?? 0) - focus));
        const dead = !unit || focus >= unit.hp;
        result.commanders.set(id, { loss, dead });
        result.penalty += loss * 120 + (dead ? 65000 : 0);
      } else if ((!unit || focus >= unit.hp) && (before || unit)) {
        const cost = costOf(root, before ?? unit!);
        const netLoss = Math.max(0, cost - credit);
        result.actorLoss += netLoss;
        result.penalty += netLoss * 10;
      } else if (unit) result.penalty += focus * costOf(after, unit) / Math.max(1, getEffectiveStats(unit).maxHp);
    }
    if (!expired(ctx)) {
      result.castles = view.castleThreats().size;
      result.penalty += result.castles * 22000;
    } else result.complete = false;
    // 截断分支不能被当作安全候选，也不能缓存未经完整校验的后续动作。
    if (!result.complete) result.penalty += 200000;
    return result;
  }

  private commanderSafe(primary: Threat, candidate: Threat): boolean {
    for (const [id, risk] of candidate.commanders) {
      const baseline = primary.commanders.get(id);
      if (risk.loss > (baseline?.loss ?? 0) || (risk.dead && !baseline?.dead)) return false;
    }
    return true;
  }

  private dangerous(branch: Branch): boolean {
    return branch.score <= this.options.dangerLine || branch.threat.actorLoss > 0 || branch.threat.castles > 0
      || [...branch.threat.commanders.values()].some(c => c.dead || c.loss > 15);
  }

  private risk(threat: Threat): number {
    return [...threat.commanders.values()].reduce((sum, c) => sum + c.loss * 120 + (c.dead ? 65000 : 0), 0)
      + threat.actorLoss * 10 + threat.castles * 22000;
  }
}

export { BattleSearchV2AI as BattleSearchV2, BattleSearchV2AI as BattleSearchAI };
export function createBattleSearchV2AI(seedOrRng?: number | Rng, options?: BattleSearchV2Options): BattleSearchV2AI {
  return new BattleSearchV2AI(seedOrRng, options);
}
