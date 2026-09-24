/**
 * 学习型对战 AI 的关系事实特征（14 维），拼接到 45 维动作向量之后（共 59 维）。
 * 全部是可验证的局面事实（击杀判定、伤害比、落点地形、可占领性等），不含任何手调评分；
 * 权重全部由 torch 训练学到。导出（learn_duel_export）与推理（learned_duel_net）共用，
 * 保证训练/测试同分布。
 */
import type { Action, GameState } from '../src/game/types';
import { UNIT_CONFIGS } from '../src/game/constants';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { calculateDamage, inRange } from '../src/game/rules';
import { getEffectiveStats } from '../src/game/abilities';
import { getDistance } from '../src/game/map';
import { getTileDefenseBonus, getTileHealPerTurn, getTileTerrainConfig } from '../src/game/terrain_rules';

export const EXTRA_DIM = 19;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface TileOwner {
  ownerId: number | null;
}

/** 无主/敌方城/镇（我方扩张目标）。 */
function listObjectives(state: GameState, allied: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const tile = state.map.tiles[y][x];
      const key = getTileTerrainConfig(tile).key;
      if (key !== 'castle' && key !== 'town') continue;
      const owner = (tile as unknown as TileOwner).ownerId;
      if (owner !== null && getAllianceId(state, owner) === allied) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** 落点被现有站位敌火力威胁：最大单发伤害/100 与威胁者数量/5。 */
function threatAt(
  state: GameState,
  enemies: Array<{ id: string; pos: { x: number; y: number } }>,
  dest: { x: number; y: number },
  victimId: string,
  victimHp: number
): { max: number; count: number } {
  let max = 0;
  let count = 0;
  for (const e of enemies.slice(0, 10)) {
    if (e.id === victimId) continue;
    const eu = state.units.find(u => u.id === e.id);
    if (!eu || eu.hp <= 0) continue;
    const stats = getEffectiveStats(eu);
    if (!inRange(e.pos, dest, stats.minRange, stats.maxRange)) continue;
    count += 1;
    try {
      const d = calculateDamage(state, eu.id, victimId);
      if (d > max) max = d;
    } catch {
      continue;
    }
  }
  void victimHp;
  return { max: clamp(max / 100, 0, 2) / 2, count: clamp(count / 5, 0, 1) };
}

/**
 * [0] attackKill 攻击是否击杀
 * [1] attackDmgRatio 伤害/目标血量
 * [2] attackCounterDeath 攻击者是否会被现有站位火力反杀
 * [3] targetIsCommander 目标是否指挥官
 * [4] targetValue 目标价值/1000
 * [5] destDefense 落点防御加成/15
 * [6] destCapturable 落点是否本单位可占领（敌方/无主城/镇）
 * [7] destOwnCastle 落点是否为自家城堡
 * [8] approach 逼近敌群量（before-after)/10
 * [9] nearestEnemyAfter 落点距敌距离/20
 * [10] lone 落单进敌区（无友军在2格内且有敌在3格内）
 * [11] recruitCost 招募费/1000
 * [12] recruitDeploy 是否部署招募
 * [13] recruitCommander 是否指挥官招募
 * [14] threatMax 落点最大单发敌方伤害/100（去了会不会被秒）
 * [15] threatCount 落点威胁者数量/5
 * [16] objApproach 向无主/敌方城镇逼近量/10
 * [17] destHeal 落点回血/20
 * [18] tradeEV 攻击期望 material 交换/1000（杀伤价值-被反杀价值）
 */
export function extraActionFeatures(state: GameState, playerId: number, action: Action): number[] {
  const out = new Array<number>(EXTRA_DIM).fill(0);
  const allied = getAllianceId(state, playerId);
  const byId = new Map(state.units.filter(u => u.hp > 0).map(u => [u.id, u]));
  const enemies = state.units.filter(u => u.hp > 0 && getAllianceId(state, u.ownerId) !== allied);

  if (action.type === 'attack') {
    const attacker = byId.get(action.attackerId);
    const target = byId.get(action.targetId);
    if (attacker && target) {
      let dmg = 0;
      try {
        dmg = calculateDamage(state, attacker.id, target.id);
      } catch {
        dmg = 0;
      }
      out[0] = dmg >= target.hp && dmg > 0 ? 1 : 0;
      out[1] = clamp(dmg / Math.max(1, target.hp), 0, 2) / 2;
      out[3] = isCommanderUnit(state, target) ? 1 : 0;
      const tVal = getUnitCost(state, target.ownerId, target.unitClass) ?? 200;
      const aVal = getUnitCost(state, attacker.ownerId, attacker.unitClass) ?? 200;
      out[4] = tVal / 1000;
      // 反杀验算（静态）：攻击者原地，被现有站位敌人火力能否带走
      let incoming = 0;
      let worstOne = 0;
      for (const e of enemies) {
        if (e.id === target.id && dmg >= target.hp) continue; // 已击杀的目标不反击
        const stats = getEffectiveStats(e);
        if (!inRange(e.pos, attacker.pos, stats.minRange, stats.maxRange)) continue;
        try {
          const d = calculateDamage(state, e.id, attacker.id);
          if (d > worstOne) worstOne = d;
          incoming += Math.min(attacker.hp, d);
        } catch {
          continue;
        }
        if (incoming >= attacker.hp) break;
      }
      out[2] = incoming >= attacker.hp ? 1 : 0;
      out[14] = clamp(worstOne / 100, 0, 2) / 2;
      // 期望交换：杀伤价值 - 被反杀价值（事实，无权重）
      const killGain = tVal * Math.min(1, dmg / Math.max(1, target.hp));
      const counterLoss = aVal * Math.min(1, incoming / Math.max(1, attacker.hp));
      out[18] = clamp((killGain - counterLoss) / 1000, -2, 2) / 2;
    }
    return out;
  }

  if (action.type === 'move' || action.type === 'post_attack_move' || action.type === 'capture') {
    const unitId = action.type === 'capture' ? action.unitId : action.unitId;
    const unit = byId.get(unitId);
    if (!unit) return out;
    const dest = action.type === 'capture' ? unit.pos : action.to;
    const tile = state.map.tiles[dest.y]?.[dest.x];
    if (tile) {
      out[5] = getTileDefenseBonus(tile) / 15;
      const key = getTileTerrainConfig(tile).key;
      const abilities: readonly string[] = UNIT_CONFIGS[unit.unitClass]?.abilities ?? [];
      const owner = (tile as { ownerId: number | null }).ownerId;
      const unfriendly = owner === null || getAllianceId(state, owner) !== allied;
      if (unfriendly && ((key === 'town' && abilities.includes('village_capturer'))
        || (key === 'castle' && abilities.includes('castle_capturer')))) {
        out[6] = 1;
      }
      if (key === 'castle' && owner === playerId) out[7] = 1;
      const heal = getTileHealPerTurn(tile);
      out[17] = clamp(heal / 20, 0, 1);
    }
    if (enemies.length > 0) {
      const dBefore = Math.min(...enemies.map(e => getDistance(unit.pos, e.pos)));
      const dAfter = Math.min(...enemies.map(e => getDistance(dest, e.pos)));
      out[8] = clamp((dBefore - dAfter) / 10, -1, 1);
      out[9] = clamp(dAfter / 20, 0, 2) / 2;
      let alliesNear = 0;
      let enemiesNear = 0;
      for (const u of state.units) {
        if (u.hp <= 0 || u.id === unit.id) continue;
        if (getDistance(dest, u.pos) > 3) continue;
        if (getDistance(dest, u.pos) <= 2 && getAllianceId(state, u.ownerId) === allied) alliesNear += 1;
        if (getAllianceId(state, u.ownerId) !== allied) enemiesNear += 1;
      }
      out[10] = alliesNear === 0 && enemiesNear > 0 ? 1 : 0;
      // 落点威胁（静态火力）与目标逼近
      const enemyPoss = enemies.map(e => ({ id: e.id, pos: e.pos }));
      const th = threatAt(state, enemyPoss, dest, unit.id, unit.hp);
      out[14] = th.max;
      out[15] = th.count;
      const objectives = listObjectives(state, allied);
      if (objectives.length > 0) {
        const oBefore = Math.min(...objectives.map(o => getDistance(unit.pos, o)));
        const oAfter = Math.min(...objectives.map(o => getDistance(dest, o)));
        out[16] = clamp((oBefore - oAfter) / 10, -1, 1);
      }
    }
    return out;
  }

  if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
    const cost = getUnitCost(state, playerId, action.unitClass) ?? 999;
    out[11] = clamp(cost / 1000, 0, 2) / 2;
    out[12] = action.type === 'recruit_and_deploy' ? 1 : 0;
    out[13] = action.unitClass === 'commander' ? 1 : 0;
    return out;
  }

  return out;
}
