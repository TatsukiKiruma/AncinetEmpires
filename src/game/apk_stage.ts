import { getEffectiveStats, getExpThresholdForLevel } from './abilities';
import { APK_STATUS_ID_TO_TYPE, APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { getAllianceId, getCommanderUnit, getTurnPlayerIds, isActivePlayer, isCommanderUnit } from './rule_config';
import { TERRAIN_CONFIG } from './terrain';
import { GameState, Position, RuleConfig, TeamRuleConfig, Unit, UnitClass, UnitLevel, UnitStatus } from './types';

function ensureRules(state: GameState): RuleConfig {
    state.rules ??= {};
    return state.rules;
}

function ensureTeamRules(state: GameState, teamId: number): TeamRuleConfig {
    const rules = ensureRules(state);
    rules.teams ??= {};
    rules.teams[teamId] ??= {};
    return rules.teams[teamId];
}

function findUnitAt(state: GameState, pos: Position): Unit | undefined {
    return state.units.find(unit => unit.pos.x === pos.x && unit.pos.y === pos.y && unit.hp > 0);
}

function toUnitLevel(level: number): UnitLevel | null {
    if (!Number.isInteger(level) || level < 0 || level > 9) return null;
    return level as UnitLevel;
}

function mapApkUnitIds(apkUnitIds: number[]): UnitClass[] {
    return [...new Set(apkUnitIds.map(id => APK_UNIT_ID_TO_CLASS[id]).filter(Boolean))];
}

function normalizeStatus(statusId: number, rounds: number): UnitStatus | null {
    const type = APK_STATUS_ID_TO_TYPE[statusId];
    if (!type || !Number.isInteger(rounds) || rounds <= 0) return null;

    if (type === 'poisoned') {
        return { type, remainingTicks: rounds };
    }

    return { type, remainingTurns: rounds };
}

function moveCurrentPlayerIfDisabled(state: GameState) {
    if (isActivePlayer(state, state.currentPlayer)) return;
    const nextPlayerId = getTurnPlayerIds(state)[0];
    if (nextPlayerId !== undefined) {
        state.currentPlayer = nextPlayerId;
    }
}

function getAliveAllianceIds(state: GameState): number[] {
    return [...new Set(state.players
        .filter(player => isActivePlayer(state, player.id))
        .map(player => getAllianceId(state, player.id)))];
}

export function syncSetGold(state: GameState, gold: number): boolean {
    if (!Number.isInteger(gold) || gold < 0) return false;
    for (const player of state.players) {
        player.gold = gold;
    }
    return true;
}

export function syncSetGoldForTeam(state: GameState, teamId: number, gold: number): boolean {
    const player = state.players.find(entry => entry.id === teamId);
    if (!player || !Number.isInteger(gold) || gold < 0) return false;
    player.gold = gold;
    return true;
}

export function syncChangeGold(state: GameState, teamId: number, delta: number): boolean {
    const player = state.players.find(entry => entry.id === teamId);
    if (!player || !Number.isInteger(delta)) return false;
    player.gold = Math.max(0, player.gold + delta);
    return true;
}

export function syncSetCurrentTeam(state: GameState, teamId: number): boolean {
    if (!isActivePlayer(state, teamId)) return false;
    state.currentPlayer = teamId;
    return true;
}

export function syncDisableTeam(state: GameState, teamId: number): boolean {
    if (!state.players.some(player => player.id === teamId)) return false;
    const rules = ensureRules(state);
    const disabledTeams = new Set(rules.disabledTeams ?? []);
    disabledTeams.add(teamId);
    rules.disabledTeams = [...disabledTeams].sort((a, b) => a - b);
    moveCurrentPlayerIfDisabled(state);
    return true;
}

export function syncRestoreTeam(state: GameState, teamId: number): boolean {
    if (!state.players.some(player => player.id === teamId)) return false;
    const rules = ensureRules(state);
    rules.disabledTeams = (rules.disabledTeams ?? []).filter(id => id !== teamId);
    return true;
}

export function syncDestroyTeam(state: GameState, teamId: number): boolean {
    const player = state.players.find(entry => entry.id === teamId);
    if (!player) return false;
    player.isAlive = false;
    moveCurrentPlayerIfDisabled(state);
    return true;
}

export function syncGameOver(state: GameState, allianceId: number): boolean {
    if (!Number.isInteger(allianceId) || !getAliveAllianceIds(state).includes(allianceId)) {
        return false;
    }
    state.winner = allianceId;
    return true;
}

export function syncSetAlliance(state: GameState, teamId: number, allianceId: number): boolean {
    if (!state.players.some(player => player.id === teamId) || !Number.isInteger(allianceId) || allianceId < 0) {
        return false;
    }
    const rules = ensureRules(state);
    rules.alliances ??= {};
    rules.alliances[teamId] = allianceId;
    return true;
}

export function syncSetCommander(state: GameState, teamId: number, pos: Position): boolean {
    if (!state.players.some(player => player.id === teamId)) return false;

    const unit = findUnitAt(state, pos);
    if (!unit || unit.ownerId !== teamId) return false;

    const rules = ensureRules(state);
    rules.commanderUnitIds ??= {};
    rules.commanderUnitIds[teamId] = unit.id;
    return true;
}

export function syncSetUnitLimit(state: GameState, limit: number): boolean {
    if (!Number.isInteger(limit) || limit < 0) return false;
    ensureRules(state).unitLimit = limit;
    return true;
}

export function syncSetUnitLimitForTeam(state: GameState, teamId: number, limit: number): boolean {
    if (!state.players.some(player => player.id === teamId) || !Number.isInteger(limit) || limit < 0) {
        return false;
    }
    ensureTeamRules(state, teamId).unitLimit = limit;
    return true;
}

export function syncSetRecruitUnits(state: GameState, apkUnitIds: number[]): boolean {
    const units = mapApkUnitIds(apkUnitIds);
    if (units.length !== apkUnitIds.length) return false;
    ensureRules(state).recruitableUnits = units;
    return true;
}

export function syncSetRecruitUnitsForTeam(state: GameState, teamId: number, apkUnitIds: number[]): boolean {
    if (!state.players.some(player => player.id === teamId)) return false;
    const units = mapApkUnitIds(apkUnitIds);
    if (units.length !== apkUnitIds.length) return false;
    ensureTeamRules(state, teamId).recruitableUnits = units;
    return true;
}

export function syncSetUnitLevel(state: GameState, pos: Position, level: number, refillHp = true): boolean {
    const unitLevel = toUnitLevel(level);
    const unit = findUnitAt(state, pos);
    if (!unit || unitLevel === null) return false;

    unit.level = unitLevel;
    unit.exp = getExpThresholdForLevel(unitLevel);
    const effectiveStats = getEffectiveStats(unit);
    unit.movementRemaining = effectiveStats.move;
    if (refillHp) {
        unit.hp = effectiveStats.maxHp;
    } else {
        unit.hp = Math.min(unit.hp, effectiveStats.maxHp);
    }
    return true;
}

export function syncSetUnitStatus(state: GameState, pos: Position, statusId: number, rounds: number): boolean {
    const unit = findUnitAt(state, pos);
    const status = normalizeStatus(statusId, rounds);
    if (!unit || !status) return false;

    unit.status = status;
    return true;
}

export function checkGameOver(state: GameState): boolean {
    return state.winner !== null;
}

export function checkTeamDestroyed(state: GameState, teamId: number): boolean {
    const player = state.players.find(entry => entry.id === teamId);
    return !player || !player.isAlive;
}

export function checkCommander(state: GameState, unitId: string, teamId?: number): boolean {
    const unit = state.units.find(entry => entry.id === unitId && entry.hp > 0);
    if (!unit) return false;
    return isCommanderUnit(state, unit, teamId);
}

export function getCommander(state: GameState, teamId: number): Unit | null {
    return getCommanderUnit(state, teamId);
}

export function countUnit(state: GameState, teamId: number, apkUnitId?: number): number {
    const unitClass = apkUnitId === undefined ? undefined : APK_UNIT_ID_TO_CLASS[apkUnitId];
    if (apkUnitId !== undefined && !unitClass) return 0;

    return state.units.filter(unit => (
        unit.ownerId === teamId
        && unit.hp > 0
        && (unitClass === undefined || unit.unitClass === unitClass)
    )).length;
}

export function countCastle(state: GameState, teamId: number): number {
    return state.map.tiles
        .flat()
        .filter(tile => tile.ownerId === teamId && TERRAIN_CONFIG[tile.terrainId]?.key === 'castle')
        .length;
}

export function countVillage(state: GameState, teamId: number): number {
    return state.map.tiles
        .flat()
        .filter(tile => tile.ownerId === teamId && TERRAIN_CONFIG[tile.terrainId]?.key === 'town')
        .length;
}
