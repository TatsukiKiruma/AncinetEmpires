import type { Action, GameState } from '../../game/types';
import { encodeAction } from '../../game/env';
import { getActionSemantics } from '../../game/ai/runtime/skirmish_action_semantics';
import { isCommanderUnit } from '../../game/rule_config';

export type Atom = number | string | boolean | null;
export type RecordToken = Record<string, Atom>;
export interface SemanticPacket {
  tokens: RecordToken[]; groups: number[];
  candidates: RecordToken[]; refs: number[][]; codes: string[];
}
export const CLASSES = 'soldier ghost mermaid archer slime water_elemental dark_mage witch paladin elf berserker wolf golem ice_elemental druid catapult wolf_archer dragon commander skeleton crystal'.split(' ');
export const ACTIONS = 'move attack capture repair wait recruit_to_castle recruit_and_deploy heal summon support destroy_town post_attack_move surrender end_turn'.split(' ');
const RULES = 'initialGold incomeVillage incomeCastle incomeCommanderBase incomeCommanderGrowth levelCap destroyerAttackBonus flyingWaterAttackBonus deathReaperAttackBonus inspiredAttackBonus sharpshooterAttackBonus terrainChildCombatBonus weakenedDefensePenalty unitLimit populationLimit recruitableUnits prices commanderRecruitBaseCost commanderRecruitCostGrowth allowSurrender allowPendingRecruitEndTurn allowPendingRecruitSurrender commanderCastleRecruitUsesPending defeatOnNoUnitsAndNoCastles defeatOnNoUnits defeatOnCommanderDeath defeatOnNoCastles alliances disabledTeams commanderUnitIds campaignEvents teams'.split(' ');
function known(value: object, names: string[], scope: string) {
  for (const key of Object.keys(value)) if (!names.includes(key)) throw Error(`未知${scope}字段:${key}`);
}
function flatten(value: unknown, prefix = '', out: RecordToken = {}): RecordToken {
  if (value === undefined) return out;
  if (value === null || typeof value !== 'object') {
    if (!['number', 'string', 'boolean'].includes(typeof value) && value !== null) throw Error('不可编码字段');
    if (typeof value === 'number' && !Number.isFinite(value)) throw Error('非有限输入');
    out[prefix] = value as Atom;
  } else if (Array.isArray(value)) {
    out[prefix + '.length'] = value.length;
    // 招募集合按兵种命名，避免数组位置成为隐藏的兵种编码。
    for (const item of value) {
      if (typeof item !== 'string' && typeof item !== 'number') throw Error('首轮不支持复杂规则数组');
      out[`${prefix}.item.${item}`] = true;
    }
  } else {
    out[prefix + '.present'] = true;
    for (const key of Object.keys(value as object).sort()) flatten((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/** 完整实体观察；ID只用于引用，来源元数据与无战役语境的脚本标识不进入模型。 */
export function observe(state: GameState, legal: readonly Action[]): SemanticPacket {
  known(state, 'turn currentPlayer map units players winner graves nextUnitId nextGraveId pendingUnitId rules metadata apkScriptState'.split(' '), '状态');
  known(state.rules ?? {}, RULES, '规则');
  if (state.rules?.campaignEvents?.length) throw Error('首轮拒绝战役事件');
  if (Object.values(state.apkScriptState ?? {}).some(v => Object.keys(v).length)) throw Error('首轮拒绝非空脚本变量');
  if (state.map.width > 32 || state.map.height > 32) throw Error('首轮地图范围超限');
  const mentioned = new Set([state.currentPlayer, ...state.players.map(p => p.id), ...state.units.map(u => u.ownerId), ...state.map.tiles.flat().flatMap(t => t.ownerId == null ? [] : [t.ownerId]), ...(state.graves ?? []).flatMap(g => g.ownerId == null ? [] : [g.ownerId]), ...(state.rules?.disabledTeams ?? [])]);
  for (const field of ['teams', 'alliances', 'commanderUnitIds'] as const) for (const id of Object.keys(state.rules?.[field] ?? {})) mentioned.add(Number(id));
  const ids = [state.currentPlayer, ...[...mentioned].filter(x => x !== state.currentPlayer).sort((a, b) => a - b)];
  const owner = (id: number | null | undefined) => id == null ? null : ids.indexOf(id) < 0 ? (() => { throw Error('未知归属'); })() : ids.indexOf(id);
  const alliances = ids.map(id => state.rules?.alliances?.[id] ?? id);
  const ally = (id: number) => alliances.indexOf(id);
  const tokens: RecordToken[] = [], groups: number[] = [];
  const push = (kind: string, data: unknown, group: number) => { const i = tokens.length; tokens.push({ kind, ...flatten(data) }); groups.push(group); return i; };
  const rules = { ...state.rules } as Record<string, unknown>;
  for (const field of ['teams', 'alliances']) if (rules[field]) rules[field] = Object.fromEntries(Object.entries(rules[field] as object).map(([id, value]) => [owner(Number(id)), field === 'alliances' ? ally(value as number) : value]));
  if (state.rules?.disabledTeams) rules.disabledTeams = state.rules.disabledTeams.map(id => owner(id));
  delete rules.commanderUnitIds; delete rules.campaignEvents;
  push('global', { turn: state.turn, width: state.map.width, height: state.map.height, winner: state.winner == null ? null : state.winner === -1 ? -1 : ally(state.winner), rules }, 0);
  for (const p of state.players) {
    known(p, 'id gold isAlive commanderDeathCount commanderReserveLevel commanderReserveExp'.split(' '), '玩家');
    push('player', { ...p, id: owner(p.id), alliance: ally(state.rules?.alliances?.[p.id] ?? p.id), commanderConfigured: state.rules?.commanderUnitIds?.[p.id] !== undefined }, 0);
  }
  const tiles: number[][] = [];
  for (let y = 0; y < state.map.height; y++) {
    tiles[y] = [];
    for (let x = 0; x < state.map.width; x++) {
      const t = state.map.tiles[y][x];
      known(t, 'terrainId ownerId apkTerrainId apkTerrainRaw apkOwnerCode apkTerrainKind apkTerrainIsLand apkMoveCost'.split(' '), '地形');
      // raw/ownerCode是已被terrainId、ownerId及APK规则字段解释的序列化来源。
      const { apkTerrainRaw: _raw, apkOwnerCode: _ownerCode, ...rest } = t;
      tiles[y][x] = push('tile', { ...rest, ownerId: owner(t.ownerId), x, y }, 1);
    }
  }
  const unitRefs = new Map<string, number>(), graveRefs = new Map<string, number>();
  for (const u of state.units) {
    known(u, 'id ownerId unitClass pos hp maxHp hasMoved hasActed status level exp movementRemaining hasPostAttackMoved hasBeenHealedThisTurn hasBeenSupportedThisTurn apkPendingRecruitSource apkUnitId apkUnitExtra apkUnitCode apkStatic apkTargeted apkUnitHead apkMoveOverrides'.split(' '), '单位');
    if (!CLASSES.includes(u.unitClass)) throw Error('未知兵种');
    const { id: _id, apkUnitId: _apkId, apkUnitExtra: _extra, apkUnitCode: _code, apkUnitHead: _head, ...rest } = u;
    unitRefs.set(u.id, push('unit', { ...rest, ownerId: owner(u.ownerId), pending: state.pendingUnitId === u.id, commander: isCommanderUnit(state, u) }, 2));
  }
  for (const g of state.graves ?? []) {
    known(g, 'id pos remainingTurns ownerId'.split(' '), '墓碑');
    const { id: _id, ...rest } = g;
    graveRefs.set(g.id, push('grave', { ...rest, ownerId: owner(g.ownerId) }, 3));
  }
  if (state.pendingUnitId && !unitRefs.has(state.pendingUnitId)) throw Error('悬空pending引用');
  const units = new Map(state.units.map(u => [u.id, { id: u.id, ...u.pos }]));
  const ordered = legal.map(action => ({ action, code: encodeAction(action) })).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  if (ordered.some((v, i) => v.code === 'unknown' || (i > 0 && v.code === ordered[i - 1].code))) throw Error('候选动作码非双射');
  const candidates: RecordToken[] = [], refs: number[][] = [];
  for (const { action } of ordered) {
    const s = getActionSemantics(action, units);
    const pos = s.landingPos ?? s.targetPos ?? s.sourceCastlePos;
    candidates.push(flatten({ type: action.type, unitClass: 'unitClass' in action ? action.unitClass : null, actorPos: s.actorPos, targetPos: s.targetPos, landingPos: s.landingPos, sourceCastlePos: s.sourceCastlePos, deployPos: s.deployPos, targetExplicit: s.targetExplicit }));
    const ref = (map: Map<string, number>, id: string | null) => id === null ? -1 : map.has(id) ? map.get(id)! : (() => { throw Error('悬空动作引用'); })();
    refs.push([ref(unitRefs, s.actorId), action.type === 'summon' ? ref(graveRefs, action.graveId) : ref(unitRefs, s.targetUnitId), pos ? tiles[pos.y][pos.x] : -1]);
  }
  return { tokens, groups, candidates, refs, codes: ordered.map(v => v.code) };
}
