import { getEffectiveStats, getExpThresholdForLevel } from './abilities';
import { APK_STATUS_ID_TO_TYPE, APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { getDistance as getMapDistance } from './map';
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

function ensureScriptState(state: GameState) {
    state.apkScriptState ??= {};
    return state.apkScriptState;
}

function normalizeScriptName(name: string): string | null {
    if (typeof name !== 'string') return null;
    const normalized = name.trim();
    return normalized === '' ? null : normalized;
}

function findUnitAt(state: GameState, pos: Position): Unit | undefined {
    return state.units.find(unit => unit.pos.x === pos.x && unit.pos.y === pos.y && unit.hp > 0);
}

function findUnitByCode(state: GameState, code: string): Unit | undefined {
    return state.units.find(unit => unit.apkUnitCode === code && unit.hp > 0);
}

function getTileAt(state: GameState, pos: Position) {
    if (
        !Number.isInteger(pos.x)
        || !Number.isInteger(pos.y)
        || pos.x < 0
        || pos.y < 0
        || pos.x >= state.map.width
        || pos.y >= state.map.height
    ) {
        return null;
    }

    return state.map.tiles[pos.y]?.[pos.x] ?? null;
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

export function getCurrentTeam(state: GameState): number {
    return state.currentPlayer;
}

export function checkPlayerTeam(state: GameState, teamId: number): boolean {
    return Number.isInteger(teamId)
        && state.players.some(player => player.id === teamId)
        && isActivePlayer(state, teamId);
}

export function getAliveAlliances(state: GameState): number[] {
    return getAliveAllianceIds(state);
}

export function getDistance(from: Position, to: Position): number {
    return getMapDistance(from, to);
}

export function putBoolean(state: GameState, name: string, value: boolean): boolean {
    const normalized = normalizeScriptName(name);
    if (!normalized || typeof value !== 'boolean') return false;

    const scriptState = ensureScriptState(state);
    scriptState.booleans ??= {};
    scriptState.booleans[normalized] = value;
    return true;
}

export function getBoolean(state: GameState, name: string, defaultValue = false): boolean {
    const normalized = normalizeScriptName(name);
    if (!normalized) return defaultValue;
    return state.apkScriptState?.booleans?.[normalized] ?? defaultValue;
}

export function putInteger(state: GameState, name: string, value: number): boolean {
    const normalized = normalizeScriptName(name);
    if (!normalized || !Number.isInteger(value)) return false;

    const scriptState = ensureScriptState(state);
    scriptState.integers ??= {};
    scriptState.integers[normalized] = value;
    return true;
}

export function getInteger(state: GameState, name: string, defaultValue = 0): number {
    const normalized = normalizeScriptName(name);
    if (!normalized) return defaultValue;
    return state.apkScriptState?.integers?.[normalized] ?? defaultValue;
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

export function getTileTeam(state: GameState, pos: Position): number | null {
    const tile = getTileAt(state, pos);
    return tile?.ownerId ?? null;
}

export function checkCastle(state: GameState, pos: Position, teamId?: number): boolean {
    const tile = getTileAt(state, pos);
    if (!tile || TERRAIN_CONFIG[tile.terrainId]?.key !== 'castle') return false;
    return teamId === undefined || tile.ownerId === teamId;
}

export function checkVillage(state: GameState, pos: Position, teamId?: number): boolean {
    const tile = getTileAt(state, pos);
    if (!tile || TERRAIN_CONFIG[tile.terrainId]?.key !== 'town') return false;
    return teamId === undefined || tile.ownerId === teamId;
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

export function syncSetUnitCode(state: GameState, pos: Position, code: string): boolean {
    if (typeof code !== 'string') return false;
    const normalizedCode = code.trim();
    if (normalizedCode === '') return false;

    const unit = findUnitAt(state, pos);
    if (!unit) return false;

    const existing = findUnitByCode(state, normalizedCode);
    if (existing && existing.id !== unit.id) return false;

    unit.apkUnitCode = normalizedCode;
    return true;
}

export function syncSetUnitStatic(state: GameState, pos: Position, isStatic: boolean): boolean {
    if (typeof isStatic !== 'boolean') return false;
    const unit = findUnitAt(state, pos);
    if (!unit) return false;

    unit.apkStatic = isStatic;
    return true;
}

export function syncSetUnitStaticWithCode(state: GameState, code: string, isStatic: boolean): boolean {
    const normalizedCode = normalizeScriptName(code);
    if (!normalizedCode || typeof isStatic !== 'boolean') return false;

    const unit = findUnitByCode(state, normalizedCode);
    if (!unit) return false;

    unit.apkStatic = isStatic;
    return true;
}

export function syncSetUnitTargeted(state: GameState, pos: Position, targeted: boolean): boolean {
    if (typeof targeted !== 'boolean') return false;
    const unit = findUnitAt(state, pos);
    if (!unit) return false;

    unit.apkTargeted = targeted;
    return true;
}

export function syncSetUnitTargetedWithCode(state: GameState, code: string, targeted: boolean): boolean {
    const normalizedCode = normalizeScriptName(code);
    if (!normalizedCode || typeof targeted !== 'boolean') return false;

    const unit = findUnitByCode(state, normalizedCode);
    if (!unit) return false;

    unit.apkTargeted = targeted;
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

export function getUnit(state: GameState, query: string | Position): Unit | null {
    if (typeof query === 'string') {
        return findUnitByCode(state, query) ?? null;
    }

    return findUnitAt(state, query) ?? null;
}

export function getUnits(state: GameState, teamId: number): Unit[] {
    if (!Number.isInteger(teamId) || !state.players.some(player => player.id === teamId)) return [];
    return state.units.filter(unit => unit.ownerId === teamId && unit.hp > 0);
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
