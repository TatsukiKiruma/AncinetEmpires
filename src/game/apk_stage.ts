import { getEffectiveStats, getExpThresholdForLevel } from './abilities';
import { APK_STATUS_ID_TO_TYPE, APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { APK_TERRAIN_COUNT } from './apk_terrain';
import { getDistance as getMapDistance } from './map';
import { getAllianceId, getCommanderUnit, getTurnPlayerIds, isActivePlayer, isCommanderUnit } from './rule_config';
import { getTileTerrainKey } from './terrain_rules';
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

function isPosition(value: unknown): value is Position {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Position;
    return Number.isInteger(candidate.x) && Number.isInteger(candidate.y);
}

function toPosition(posOrX: Position | number, maybeY?: number): Position | null {
    if (typeof posOrX === 'number') {
        const pos = { x: posOrX, y: maybeY };
        return isPosition(pos) ? pos : null;
    }

    return isPosition(posOrX) ? posOrX : null;
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

function isValidTileType(tileType: number): boolean {
    return Number.isInteger(tileType) && tileType >= 0 && tileType < APK_TERRAIN_COUNT;
}

function isValidMoveCost(mov: number): boolean {
    return Number.isInteger(mov) && mov > 0 && mov <= 0xffffff;
}

function isValidUnitHead(head: number): boolean {
    return Number.isInteger(head) && head >= 0;
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

export function getDistance(from: Position, to: Position): number;
export function getDistance(x1: number, y1: number, x2: number, y2: number): number;
export function getDistance(
    fromOrX: Position | number,
    toOrY: Position | number,
    maybeX?: number,
    maybeY?: number
): number {
    const from = typeof fromOrX === 'number'
        ? toPosition(fromOrX, toOrY as number)
        : toPosition(fromOrX);
    const to = typeof fromOrX === 'number'
        ? (typeof maybeX === 'number' ? toPosition(maybeX, maybeY) : null)
        : toPosition(toOrY as Position);

    if (!from || !to) return Number.NaN;
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

export function getTileTeam(state: GameState, pos: Position): number | null;
export function getTileTeam(state: GameState, x: number, y: number): number | null;
export function getTileTeam(state: GameState, posOrX: Position | number, maybeY?: number): number | null {
    const pos = toPosition(posOrX, maybeY);
    if (!pos) return null;
    const tile = getTileAt(state, pos);
    return tile?.ownerId ?? null;
}

export function checkCastle(state: GameState, pos: Position, teamId?: number): boolean;
export function checkCastle(state: GameState, x: number, y: number, teamId?: number): boolean;
export function checkCastle(
    state: GameState,
    posOrX: Position | number,
    teamIdOrY?: number,
    maybeTeamId?: number
): boolean {
    const pos = toPosition(posOrX, typeof posOrX === 'number' ? teamIdOrY : undefined);
    const teamId = typeof posOrX === 'number' ? maybeTeamId : teamIdOrY;
    if (!pos) return false;
    const tile = getTileAt(state, pos);
    if (!tile || getTileTerrainKey(tile) !== 'castle') return false;
    return teamId === undefined || tile.ownerId === teamId;
}

export function checkVillage(state: GameState, pos: Position, teamId?: number): boolean;
export function checkVillage(state: GameState, x: number, y: number, teamId?: number): boolean;
export function checkVillage(
    state: GameState,
    posOrX: Position | number,
    teamIdOrY?: number,
    maybeTeamId?: number
): boolean {
    const pos = toPosition(posOrX, typeof posOrX === 'number' ? teamIdOrY : undefined);
    const teamId = typeof posOrX === 'number' ? maybeTeamId : teamIdOrY;
    if (!pos) return false;
    const tile = getTileAt(state, pos);
    if (!tile || getTileTerrainKey(tile) !== 'town') return false;
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

export function syncSetCommander(state: GameState, teamId: number, pos: Position): boolean;
export function syncSetCommander(state: GameState, x: number, y: number): boolean;
export function syncSetCommander(state: GameState, teamIdOrX: number, posOrY: Position | number): boolean {
    let teamId = teamIdOrX;
    let unit: Unit | undefined;

    if (typeof posOrY === 'number') {
        unit = findUnitAt(state, { x: teamIdOrX, y: posOrY });
        if (!unit) return false;
        teamId = unit.ownerId;
        if (!state.players.some(player => player.id === teamId)) return false;
    } else {
        if (!isPosition(posOrY)) return false;
        if (!state.players.some(player => player.id === teamId)) return false;
        unit = findUnitAt(state, posOrY);
        if (!unit || unit.ownerId !== teamId) return false;
    }

    const rules = ensureRules(state);
    rules.commanderUnitIds ??= {};
    rules.commanderUnitIds[teamId] = unit.id;
    return true;
}

export function syncSetUnitCode(state: GameState, pos: Position, code: string): boolean;
export function syncSetUnitCode(state: GameState, x: number, y: number, code: string): boolean;
export function syncSetUnitCode(
    state: GameState,
    posOrX: Position | number,
    codeOrY: string | number,
    maybeCode?: string
): boolean {
    const pos = toPosition(posOrX, typeof posOrX === 'number' ? codeOrY as number : undefined);
    const code = typeof posOrX === 'number' ? maybeCode : codeOrY;
    if (typeof code !== 'string') return false;
    const normalizedCode = code.trim();
    if (normalizedCode === '') return false;

    if (!pos) return false;
    const unit = findUnitAt(state, pos);
    if (!unit) return false;

    const existing = findUnitByCode(state, normalizedCode);
    if (existing && existing.id !== unit.id) return false;

    unit.apkUnitCode = normalizedCode;
    return true;
}

export function syncSetUnitStatic(state: GameState, pos: Position, isStatic: boolean): boolean;
export function syncSetUnitStatic(state: GameState, x: number, y: number, isStatic: boolean): boolean;
export function syncSetUnitStatic(
    state: GameState,
    posOrX: Position | number,
    isStaticOrY: boolean | number,
    maybeIsStatic?: boolean
): boolean {
    const pos = toPosition(posOrX, typeof posOrX === 'number' ? isStaticOrY as number : undefined);
    const isStatic = typeof posOrX === 'number' ? maybeIsStatic : isStaticOrY;
    if (typeof isStatic !== 'boolean') return false;
    if (!pos) return false;
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

export function syncSetUnitTargeted(state: GameState, pos: Position, targeted: boolean): boolean;
export function syncSetUnitTargeted(state: GameState, x: number, y: number, targeted: boolean): boolean;
export function syncSetUnitTargeted(
    state: GameState,
    posOrX: Position | number,
    targetedOrY: boolean | number,
    maybeTargeted?: boolean
): boolean {
    const pos = toPosition(posOrX, typeof posOrX === 'number' ? targetedOrY as number : undefined);
    const targeted = typeof posOrX === 'number' ? maybeTargeted : targetedOrY;
    if (typeof targeted !== 'boolean') return false;
    if (!pos) return false;
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

export function syncSetUnitHead(state: GameState, pos: Position, head: number): boolean;
export function syncSetUnitHead(state: GameState, x: number, y: number, head: number): boolean;
export function syncSetUnitHead(
    state: GameState,
    posOrX: Position | number,
    headOrY: number,
    maybeHead?: number
): boolean {
    const pos = toPosition(posOrX, typeof posOrX === 'number' ? headOrY : undefined);
    const head = typeof posOrX === 'number' ? maybeHead : headOrY;
    if (typeof head !== 'number') return false;
    if (!isValidUnitHead(head)) return false;
    if (!pos) return false;
    const unit = findUnitAt(state, pos);
    if (!unit) return false;

    unit.apkUnitHead = head;
    return true;
}

export function syncSetUnitHeadWithCode(state: GameState, code: string, head: number): boolean {
    const normalizedCode = normalizeScriptName(code);
    if (!normalizedCode || !isValidUnitHead(head)) return false;

    const unit = findUnitByCode(state, normalizedCode);
    if (!unit) return false;

    unit.apkUnitHead = head;
    return true;
}

export function syncOverrideMov(state: GameState, code: string, tileType: number, mov: number): boolean {
    const normalizedCode = normalizeScriptName(code);
    if (!normalizedCode || !isValidTileType(tileType) || !isValidMoveCost(mov)) return false;

    const unit = findUnitByCode(state, normalizedCode);
    if (!unit) return false;

    unit.apkMoveOverrides ??= {};
    unit.apkMoveOverrides[tileType] = mov;
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

export function syncSetUnitLevel(state: GameState, pos: Position, level: number, refillHp?: boolean): boolean;
export function syncSetUnitLevel(state: GameState, x: number, y: number, level: number, refillHp?: boolean): boolean;
export function syncSetUnitLevel(
    state: GameState,
    posOrX: Position | number,
    levelOrY: number,
    levelOrRefillHp?: number | boolean,
    maybeRefillHp = true
): boolean {
    const pos = typeof posOrX === 'number'
        ? { x: posOrX, y: levelOrY }
        : posOrX;
    const level = typeof posOrX === 'number'
        ? levelOrRefillHp
        : levelOrY;
    const refillHp = typeof posOrX === 'number'
        ? maybeRefillHp
        : (typeof levelOrRefillHp === 'boolean' ? levelOrRefillHp : true);

    if (!isPosition(pos) || typeof level !== 'number') return false;
    const unitLevel = toUnitLevel(level);
    const unit = findUnitAt(state, pos);
    if (!unit || unitLevel === null) return false;

    unit.level = unitLevel;
    unit.exp = getExpThresholdForLevel(unitLevel);
    const effectiveStats = getEffectiveStats(unit);
    unit.movementRemaining = effectiveStats.move;
    if (refillHp) {
        // 脚本设等级默认回满血，但不裁剪治疗师造成的超上限生命。
        unit.hp = Math.max(unit.hp, effectiveStats.maxHp);
    } else {
        unit.hp = Math.min(unit.hp, effectiveStats.maxHp);
    }
    return true;
}

export function syncSetUnitStatus(state: GameState, pos: Position, statusId: number, rounds: number, replaceExisting?: boolean): boolean;
export function syncSetUnitStatus(state: GameState, x: number, y: number, statusId: number, rounds: number, replaceExisting?: boolean): boolean;
export function syncSetUnitStatus(
    state: GameState,
    posOrX: Position | number,
    statusIdOrY: number,
    roundsOrStatusId: number,
    maybeRoundsOrReplaceExisting?: number | boolean,
    maybeReplaceExisting?: boolean
): boolean {
    const pos = typeof posOrX === 'number'
        ? { x: posOrX, y: statusIdOrY }
        : posOrX;
    const statusId = typeof posOrX === 'number'
        ? roundsOrStatusId
        : statusIdOrY;
    const rounds = typeof posOrX === 'number'
        ? maybeRoundsOrReplaceExisting
        : roundsOrStatusId;
    const replaceExisting = typeof posOrX === 'number'
        ? (maybeReplaceExisting ?? true)
        : (typeof maybeRoundsOrReplaceExisting === 'boolean' ? maybeRoundsOrReplaceExisting : true);

    if (!isPosition(pos) || typeof rounds !== 'number') return false;
    const unit = findUnitAt(state, pos);
    const status = normalizeStatus(statusId, rounds);
    if (!unit || !status) return false;
    if (unit.status && !replaceExisting) return false;

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

export function getUnit(state: GameState, query: string | Position): Unit | null;
export function getUnit(state: GameState, x: number, y: number): Unit | null;
export function getUnit(state: GameState, queryOrX: string | Position | number, maybeY?: number): Unit | null {
    if (typeof queryOrX === 'string') {
        return findUnitByCode(state, queryOrX) ?? null;
    }

    const pos = toPosition(queryOrX, maybeY);
    if (!pos) return null;
    return findUnitAt(state, pos) ?? null;
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
        .filter(tile => tile.ownerId === teamId && getTileTerrainKey(tile) === 'castle')
        .length;
}

export function countVillage(state: GameState, teamId: number): number {
    return state.map.tiles
        .flat()
        .filter(tile => tile.ownerId === teamId && getTileTerrainKey(tile) === 'town')
        .length;
}
