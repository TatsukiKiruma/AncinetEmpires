import { GameEngine } from './engine';
import { encodeAction } from './env';
import { APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { getEffectiveStats, hasAbility } from './abilities';
import { getDistance } from './map';
import { getLegalActions } from './rules';
import { areAlliedPlayers, areEnemyPlayers } from './rule_config';
import { isTileDestroyableForRules } from './terrain_rules';
import type { Tile } from './terrain';
import type { Action, GameState, Position, Unit, UnitClass } from './types';

export const APK_REPLAY_MAGIC = 365703;

export const APK_REPLAY_EVENT_TYPES = [
    'ATTACK',
    'GAME_START',
    'HEAL',
    'MOVE',
    'NEXT_TURN',
    'NONE',
    'OCCUPY',
    'RECRUIT',
    'REPAIR',
    'REVERSE',
    'SELECT',
    'STANDBY',
    'SUMMON',
    'SUPPORT',
    'SURRENDER'
] as const;

export type ApkReplayEventType = typeof APK_REPLAY_EVENT_TYPES[number];

export interface ApkReplayActionRecord {
    source: Position | null;
    moveTo: Position | null;
    postMoveTo: Position | null;
    target: Position | null;
    recruitUnitId: number;
    eventType: ApkReplayEventType;
    raw: {
        sourceX: number;
        sourceY: number;
        moveX: number;
        moveY: number;
        postMoveX: number;
        postMoveY: number;
        targetX: number;
        targetY: number;
        recruitUnitId: number;
        eventOrdinal: number;
    };
}

export interface ParsedApkReplayActions {
    magic: number;
    actions: ApkReplayActionRecord[];
    remainingBytes: number;
}

export interface ApkReplayExpansionOptions {
    allowAmbiguousRecruitDeployFirstMatch?: boolean;
    allowMissingAttackTargetAsNoop?: boolean;
    allowMissingSourceAsNoop?: boolean;
    allowInvalidRecruitAsNoop?: boolean;
    skipInvalidEventAsNoop?: boolean;
    recruitDeployResolver?: (
        record: ApkReplayActionRecord,
        legalDeployActions: Extract<Action, { type: 'recruit_and_deploy' }>[],
        state: GameState
    ) => Extract<Action, { type: 'recruit_and_deploy' }>;
}

export interface ApkReplayValidationOptions {
    maxRecords?: number;
    expansionOptions?: ApkReplayExpansionOptions;
    stopOnFirstError?: boolean;
    disableAutoAdvanceWhenNoMeaningfulAction?: boolean;
    applyInitialTurnStart?: boolean;
    forceExecuteReplayActions?: boolean;
}

export interface ApkReplayValidationStep {
    recordIndex: number;
    subActionIndex: number;
    eventType: ApkReplayEventType;
    action: Action | null;
    actionCode: string | null;
    currentPlayerBefore: number;
    turnBefore: number;
    legalActionCount: number;
    info: string;
    done: boolean;
    error: string | null;
    diagnostic?: ApkReplayStepDiagnostic;
}

export interface ApkReplayUnitDiagnostic {
    id: string;
    ownerId: number;
    unitClass: UnitClass;
    pos: Position;
    hp: number;
    maxHp: number;
    level: number | null;
    exp: number | null;
    status: Unit['status'] | null;
    movementRemaining: number | null;
    hasMoved: boolean;
    hasActed: boolean;
    minRange: number;
    maxRange: number;
}

export interface ApkReplayStepDiagnostic {
    actor: ApkReplayUnitDiagnostic | null;
    target: ApkReplayUnitDiagnostic | null;
    moveDestinationOccupant: ApkReplayUnitDiagnostic | null;
    moveDestinationTile: ApkReplayTileDiagnostic | null;
    sourceToTargetDistance: number | null;
    moveToTargetDistance: number | null;
}

export interface ApkReplayTileDiagnostic {
    terrainId: Tile['terrainId'];
    ownerId: number | null;
    apkTerrainId: number | null;
    apkTerrainRaw: number | null;
    apkOwnerCode: number | null;
    apkTerrainKind: number | null;
    apkTerrainIsLand: boolean | null;
    apkMoveCost: number | null;
}

export interface ApkReplayValidationResult {
    success: boolean;
    recordCount: number;
    executedRecordCount: number;
    expandedActionCount: number;
    steps: ApkReplayValidationStep[];
    firstError: string | null;
    finalState: GameState;
}

class ApkReplayBinaryReader {
    private readonly view: DataView;
    private offset = 0;

    constructor(private readonly data: Uint8Array) {
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }

    get remainingBytes(): number {
        return this.data.byteLength - this.offset;
    }

    readBoolean(): boolean {
        this.requireBytes(1);
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value !== 0;
    }

    readInt32(): number {
        this.requireBytes(4);
        const value = this.view.getInt32(this.offset, false);
        this.offset += 4;
        return value;
    }

    private requireBytes(length: number) {
        if (this.offset + length > this.data.byteLength) {
            throw new Error('APK 回放数据长度不足');
        }
    }
}

function positionOrNull(x: number, y: number): Position | null {
    return x >= 0 && y >= 0 ? { x, y } : null;
}

function isSamePos(left: Position | null, right: Position | null): boolean {
    if (!left || !right) return left === right;
    return left.x === right.x && left.y === right.y;
}

function parseReplayActionRecord(reader: ApkReplayBinaryReader): ApkReplayActionRecord {
    const isNullRecord = reader.readBoolean();
    if (isNullRecord) {
        throw new Error('APK 回放动作数组包含 null 记录');
    }

    const sourceX = reader.readInt32();
    const sourceY = reader.readInt32();
    const moveX = reader.readInt32();
    const moveY = reader.readInt32();
    const postMoveX = reader.readInt32();
    const postMoveY = reader.readInt32();
    const targetX = reader.readInt32();
    const targetY = reader.readInt32();
    const recruitUnitId = reader.readInt32();

    const isNullEvent = reader.readBoolean();
    if (isNullEvent) {
        throw new Error('APK 回放动作缺少事件类型');
    }

    const eventOrdinal = reader.readInt32();
    const eventType = APK_REPLAY_EVENT_TYPES[eventOrdinal];
    if (!eventType) {
        throw new Error(`未知 APK 回放事件 ordinal: ${eventOrdinal}`);
    }

    return {
        source: positionOrNull(sourceX, sourceY),
        moveTo: positionOrNull(moveX, moveY),
        postMoveTo: positionOrNull(postMoveX, postMoveY),
        target: positionOrNull(targetX, targetY),
        recruitUnitId,
        eventType,
        raw: {
            sourceX,
            sourceY,
            moveX,
            moveY,
            postMoveX,
            postMoveY,
            targetX,
            targetY,
            recruitUnitId,
            eventOrdinal
        }
    };
}

export function parseDecryptedApkReplayActions(data: Uint8Array): ParsedApkReplayActions {
    const reader = new ApkReplayBinaryReader(data);
    const magic = reader.readInt32();
    if (magic !== APK_REPLAY_MAGIC) {
        throw new Error(`未知 APK 回放 magic: ${magic}`);
    }

    const isNullArray = reader.readBoolean();
    if (isNullArray) {
        return { magic, actions: [], remainingBytes: reader.remainingBytes };
    }

    const actionCount = reader.readInt32();
    if (actionCount < 0) {
        throw new Error(`APK 回放动作数量无效: ${actionCount}`);
    }

    const actions: ApkReplayActionRecord[] = [];
    for (let index = 0; index < actionCount; index += 1) {
        actions.push(parseReplayActionRecord(reader));
    }

    return {
        magic,
        actions,
        remainingBytes: reader.remainingBytes
    };
}

function writeBoolean(bytes: number[], value: boolean) {
    bytes.push(value ? 1 : 0);
}

function writeInt32(bytes: number[], value: number) {
    const unsigned = value >>> 0;
    bytes.push(
        (unsigned >>> 24) & 0xff,
        (unsigned >>> 16) & 0xff,
        (unsigned >>> 8) & 0xff,
        unsigned & 0xff
    );
}

export function encodeDecryptedApkReplayActions(records: readonly ApkReplayActionRecord[]): Uint8Array {
    const bytes: number[] = [];
    writeInt32(bytes, APK_REPLAY_MAGIC);
    writeBoolean(bytes, false);
    writeInt32(bytes, records.length);

    for (const record of records) {
        writeBoolean(bytes, false);
        writeInt32(bytes, record.raw.sourceX);
        writeInt32(bytes, record.raw.sourceY);
        writeInt32(bytes, record.raw.moveX);
        writeInt32(bytes, record.raw.moveY);
        writeInt32(bytes, record.raw.postMoveX);
        writeInt32(bytes, record.raw.postMoveY);
        writeInt32(bytes, record.raw.targetX);
        writeInt32(bytes, record.raw.targetY);
        writeInt32(bytes, record.raw.recruitUnitId);
        writeBoolean(bytes, false);
        writeInt32(bytes, record.raw.eventOrdinal);
    }

    return new Uint8Array(bytes);
}

export function createApkReplayRecord(input: {
    source?: Position | null;
    moveTo?: Position | null;
    postMoveTo?: Position | null;
    target?: Position | null;
    recruitUnitId?: number;
    eventType: ApkReplayEventType;
}): ApkReplayActionRecord {
    const eventOrdinal = APK_REPLAY_EVENT_TYPES.indexOf(input.eventType);
    if (eventOrdinal < 0) {
        throw new Error(`未知 APK 回放事件类型: ${input.eventType}`);
    }

    const source = input.source ?? null;
    const moveTo = input.moveTo ?? null;
    const postMoveTo = input.postMoveTo ?? null;
    const target = input.target ?? null;
    const recruitUnitId = input.recruitUnitId ?? -1;

    return {
        source,
        moveTo,
        postMoveTo,
        target,
        recruitUnitId,
        eventType: input.eventType,
        raw: {
            sourceX: source?.x ?? -1,
            sourceY: source?.y ?? -1,
            moveX: moveTo?.x ?? -1,
            moveY: moveTo?.y ?? -1,
            postMoveX: postMoveTo?.x ?? -1,
            postMoveY: postMoveTo?.y ?? -1,
            targetX: target?.x ?? -1,
            targetY: target?.y ?? -1,
            recruitUnitId,
            eventOrdinal
        }
    };
}

function requirePosition(pos: Position | null, label: string, record: ApkReplayActionRecord): Position {
    if (!pos) {
        throw new Error(`APK 回放 ${record.eventType} 缺少${label}坐标`);
    }
    return pos;
}

function findUnitAt(state: GameState, pos: Position): Unit | undefined {
    const pendingUnit = state.pendingUnitId
        ? state.units.find(candidate => (
            candidate.id === state.pendingUnitId
            && candidate.pos.x === pos.x
            && candidate.pos.y === pos.y
            && candidate.hp > 0
        ))
        : undefined;
    if (pendingUnit) return pendingUnit;

    return state.units.find(candidate => (
        candidate.pos.x === pos.x
        && candidate.pos.y === pos.y
        && candidate.hp > 0
    ));
}

function getUnitAt(state: GameState, pos: Position, label: string): Unit {
    const unit = findUnitAt(state, pos);
    if (!unit) {
        throw new Error(`找不到${label}单位: (${pos.x}, ${pos.y})`);
    }
    return unit;
}

function snapshotUnit(unit: Unit | undefined): ApkReplayUnitDiagnostic | null {
    if (!unit) return null;
    const stats = getEffectiveStats(unit);
    return {
        id: unit.id,
        ownerId: unit.ownerId,
        unitClass: unit.unitClass,
        pos: { ...unit.pos },
        hp: unit.hp,
        maxHp: stats.maxHp,
        level: unit.level ?? null,
        exp: unit.exp ?? null,
        status: unit.status ? { ...unit.status } : null,
        movementRemaining: unit.movementRemaining ?? null,
        hasMoved: unit.hasMoved,
        hasActed: unit.hasActed,
        minRange: stats.minRange,
        maxRange: stats.maxRange
    };
}

function snapshotTile(tile: Tile | undefined): ApkReplayTileDiagnostic | null {
    if (!tile) return null;
    return {
        terrainId: tile.terrainId,
        ownerId: tile.ownerId ?? null,
        apkTerrainId: tile.apkTerrainId ?? null,
        apkTerrainRaw: tile.apkTerrainRaw ?? null,
        apkOwnerCode: tile.apkOwnerCode ?? null,
        apkTerrainKind: tile.apkTerrainKind ?? null,
        apkTerrainIsLand: tile.apkTerrainIsLand ?? null,
        apkMoveCost: tile.apkMoveCost ?? null
    };
}

function findUnitByActionId(state: GameState, id: string | undefined): Unit | undefined {
    return id ? state.units.find(unit => unit.id === id && unit.hp > 0) : undefined;
}

function buildStepDiagnostic(
    state: GameState,
    record: ApkReplayActionRecord,
    action: Action | null
): ApkReplayStepDiagnostic {
    let actor: Unit | undefined;
    let target: Unit | undefined;
    let moveDestinationOccupant: Unit | undefined;
    let moveDestination: Position | null = null;

    if (action) {
        switch (action.type) {
            case 'move':
            case 'post_attack_move':
            case 'capture':
            case 'repair':
            case 'destroy_town':
            case 'wait':
                actor = findUnitByActionId(state, action.unitId);
                break;
            case 'attack':
                actor = findUnitByActionId(state, action.attackerId);
                target = findUnitByActionId(state, action.targetId);
                break;
            case 'heal':
                actor = findUnitByActionId(state, action.healerId);
                target = findUnitByActionId(state, action.targetId);
                break;
            case 'summon':
                actor = findUnitByActionId(state, action.summonerId);
                break;
            case 'support':
                actor = findUnitByActionId(state, action.supporterId);
                target = findUnitByActionId(state, action.targetId);
                break;
            default:
                break;
        }

        if ((action.type === 'move' || action.type === 'post_attack_move')) {
            moveDestination = action.to;
            moveDestinationOccupant = findUnitAt(state, action.to);
        }
    }

    if (!actor && record.source) {
        actor = findUnitAt(state, record.source);
    }
    if (!target && record.target) {
        target = findUnitAt(state, record.target);
    }
    if (!moveDestinationOccupant && record.moveTo) {
        moveDestinationOccupant = findUnitAt(state, record.moveTo);
    }
    if (!moveDestination && record.moveTo) {
        moveDestination = record.moveTo;
    }

    return {
        actor: snapshotUnit(actor),
        target: snapshotUnit(target),
        moveDestinationOccupant: snapshotUnit(moveDestinationOccupant),
        moveDestinationTile: snapshotTile(
            moveDestination
                ? state.map.tiles[moveDestination.y]?.[moveDestination.x]
                : undefined
        ),
        sourceToTargetDistance: record.source && record.target
            ? getDistance(record.source, record.target)
            : null,
        moveToTargetDistance: record.moveTo && record.target
            ? getDistance(record.moveTo, record.target)
            : null
    };
}

function getGraveAt(state: GameState, pos: Position) {
    const grave = state.graves?.find(candidate => (
        candidate.pos.x === pos.x
        && candidate.pos.y === pos.y
    ));
    if (!grave) {
        throw new Error(`找不到召唤目标墓碑: (${pos.x}, ${pos.y})`);
    }
    return grave;
}

function createStateWithMovedUnit(state: GameState, unitId: string, to: Position): GameState {
    return {
        ...state,
        units: state.units.map(unit => (
            unit.id === unitId
                ? { ...unit, pos: { ...to } }
                : unit
        ))
    };
}

function isRecruitActionAtCastle(
    action: Action,
    unitClass: UnitClass,
    castlePos: Position
): action is Extract<Action, { type: 'recruit_to_castle' | 'recruit_and_deploy' }> {
    return (
        (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
        && action.unitClass === unitClass
        && action.castlePos.x === castlePos.x
        && action.castlePos.y === castlePos.y
    );
}

function expandRecruitRecord(
    record: ApkReplayActionRecord,
    state: GameState,
    options: ApkReplayExpansionOptions
): Action[] {
    const castlePos = requirePosition(record.source, '招募城堡', record);
    const unitClass = APK_UNIT_ID_TO_CLASS[record.recruitUnitId];
    if (!unitClass) {
        throw new Error(`未知 APK 招募单位 ID: ${record.recruitUnitId}`);
    }

    const legalRecruitActions = getLegalActions(state, state.currentPlayer)
        .filter(action => isRecruitActionAtCastle(action, unitClass, castlePos));
    const toCastle = legalRecruitActions.find(
        (action): action is Extract<Action, { type: 'recruit_to_castle' }> => action.type === 'recruit_to_castle'
    );
    if (toCastle) {
        return [toCastle];
    }

    const deploys = legalRecruitActions.filter(
        (action): action is Extract<Action, { type: 'recruit_and_deploy' }> => action.type === 'recruit_and_deploy'
    );
    if (deploys.length === 1) {
        return [deploys[0]];
    }
    if (deploys.length > 1) {
        if (options.recruitDeployResolver) {
            return [options.recruitDeployResolver(record, deploys, state)];
        }
        if (options.allowAmbiguousRecruitDeployFirstMatch) {
            return [deploys[0]];
        }
        throw new Error(`APK 招募记录缺少部署坐标，存在 ${deploys.length} 个可部署动作`);
    }

    if (options.allowInvalidRecruitAsNoop) {
        return [];
    }

    throw new Error(`当前局面没有合法招募动作: ${unitClass} @ (${castlePos.x}, ${castlePos.y})`);
}

function createLookaheadRecruitDeployResolver(
    records: readonly ApkReplayActionRecord[],
    recordIndex: number,
    baseOptions: ApkReplayExpansionOptions
): ApkReplayExpansionOptions['recruitDeployResolver'] {
    return (record, legalDeployActions, state) => {
        if (baseOptions.recruitDeployResolver) {
            return baseOptions.recruitDeployResolver(record, legalDeployActions, state);
        }

        const nextRecord = records[recordIndex + 1];
        if (nextRecord?.source) {
            const matched = legalDeployActions.find(action => (
                action.to.x === nextRecord.source?.x
                && action.to.y === nextRecord.source.y
            ));
            if (matched) return matched;
        }

        if (baseOptions.allowAmbiguousRecruitDeployFirstMatch) {
            return legalDeployActions[0];
        }

        throw new Error(`APK 招募记录缺少部署坐标，存在 ${legalDeployActions.length} 个可部署动作`);
    };
}

export function createRecordExpansionOptions(
    records: readonly ApkReplayActionRecord[],
    recordIndex: number,
    baseOptions: ApkReplayExpansionOptions = {}
): ApkReplayExpansionOptions {
    return {
        ...baseOptions,
        recruitDeployResolver: createLookaheadRecruitDeployResolver(records, recordIndex, baseOptions)
    };
}

function canApplyApkAttackToUnit(state: GameState, actor: Unit, target: Unit): boolean {
    if (actor.id === target.id) return false;
    if (!areEnemyPlayers(state, actor.ownerId, target.ownerId)) return false;

    const stats = getEffectiveStats(actor);
    if (stats.maxRange <= 0) return false;

    const distance = getDistance(actor.pos, target.pos);
    return distance >= stats.minRange && distance <= stats.maxRange;
}

function hasLegalMoveAction(state: GameState, unitId: string, to: Position): boolean {
    return getLegalActions(state, state.currentPlayer).some(action => (
        action.type === 'move'
        && action.unitId === unitId
        && isSamePos(action.to, to)
    ));
}

function replaceInvalidAttackWithNoopActions(
    actions: Action[],
    state: GameState,
    actor: Unit,
    source: Position,
    moveTo: Position,
    postMoveTo: Position | null
): boolean {
    if (!postMoveTo) return true;
    if (isSamePos(postMoveTo, moveTo)) return true;
    if (!hasLegalMoveAction(state, actor.id, postMoveTo)) return true;

    actions.length = 0;
    if (!isSamePos(source, postMoveTo)) {
        actions.push({ type: 'move', unitId: actor.id, to: postMoveTo });
    }
    actions.push({ type: 'wait', unitId: actor.id });
    return false;
}

function canApplyApkDestroyAttack(state: GameState, actor: Unit, targetPos: Position): boolean {
    const targetTile = state.map.tiles[targetPos.y]?.[targetPos.x];
    if (!targetTile || !hasAbility(actor, 'destroyer') || !isTileDestroyableForRules(targetTile)) {
        return false;
    }

    const stats = getEffectiveStats(actor);
    if (stats.maxRange <= 0) return false;

    const distance = getDistance(actor.pos, targetPos);
    return distance >= stats.minRange && distance <= stats.maxRange;
}

function canApplyApkSummonEvent(state: GameState, actor: Unit, spawnPos: Position): boolean {
    if (!hasAbility(actor, 'summoner')) return false;
    if (!state.graves?.some(grave => grave.pos.x === spawnPos.x && grave.pos.y === spawnPos.y)) return false;
    if (findUnitAt(state, spawnPos)) return false;

    const stats = getEffectiveStats(actor);
    const distance = getDistance(actor.pos, spawnPos);
    return distance >= stats.minRange && distance <= stats.maxRange;
}

function canApplyApkSupportEvent(state: GameState, actor: Unit, target: Unit): boolean {
    if (!hasAbility(actor, 'supporter')) return false;
    if (hasAbility(target, 'supporter')) return false;
    if (!areAlliedPlayers(state, actor.ownerId, target.ownerId)) return false;
    if (actor.id === target.id) return false;
    if (!target.hasActed || target.hasBeenSupportedThisTurn) return false;
    if ((actor.level ?? 0) < (target.level ?? 0)) return false;

    return getDistance(actor.pos, target.pos) <= 2;
}

export function expandApkReplayRecordToProjectActions(
    record: ApkReplayActionRecord,
    state: GameState,
    options: ApkReplayExpansionOptions = {}
): Action[] {
    if (record.recruitUnitId >= 0) {
        return expandRecruitRecord(record, state, options);
    }

    switch (record.eventType) {
        case 'GAME_START':
            return [];
        case 'NEXT_TURN':
            return [{ type: 'end_turn' }];
        case 'SURRENDER':
            return [{ type: 'surrender' }];
        default:
            break;
    }

    const source = requirePosition(record.source, '来源', record);
    const actor = findUnitAt(state, source);
    if (!actor) {
        if (options.allowMissingSourceAsNoop) {
            return [];
        }
        throw new Error(`找不到来源单位: (${source.x}, ${source.y})`);
    }
    const moveTo = record.moveTo ?? source;
    const actions: Action[] = [];

    if (!isSamePos(source, moveTo)) {
        actions.push({ type: 'move', unitId: actor.id, to: moveTo });
    }
    const targetResolutionState = isSamePos(source, moveTo)
        ? state
        : createStateWithMovedUnit(state, actor.id, moveTo);
    const eventActor = findUnitByActionId(targetResolutionState, actor.id) ?? actor;

    switch (record.eventType) {
        case 'ATTACK': {
            const targetPos = requirePosition(record.target, '攻击目标', record);
            const target = findUnitAt(targetResolutionState, targetPos);
            if (target) {
                if (!canApplyApkAttackToUnit(targetResolutionState, eventActor, target)) {
                    const shouldSkipPostMove = replaceInvalidAttackWithNoopActions(
                        actions,
                        state,
                        actor,
                        source,
                        moveTo,
                        record.postMoveTo
                    );
                    if (shouldSkipPostMove) {
                        break;
                    }
                    return actions;
                }
                actions.push({ type: 'attack', attackerId: actor.id, targetId: target.id });
                break;
            }

            if ((!options.skipInvalidEventAsNoop || canApplyApkDestroyAttack(targetResolutionState, eventActor, targetPos))
                && hasAbility(eventActor, 'destroyer')) {
                const targetTile = targetResolutionState.map.tiles[targetPos.y]?.[targetPos.x];
                if (!targetTile || !isTileDestroyableForRules(targetTile)) {
                    if (options.skipInvalidEventAsNoop) {
                        break;
                    }
                    getUnitAt(targetResolutionState, targetPos, '攻击目标');
                    break;
                }
                actions.push({ type: 'destroy_town', unitId: actor.id, target: targetPos });
                break;
            }

            if (options.skipInvalidEventAsNoop || options.allowMissingAttackTargetAsNoop) {
                break;
            }

            getUnitAt(targetResolutionState, targetPos, '攻击目标');
            break;
        }
        case 'HEAL': {
            const targetPos = requirePosition(record.target, '治疗目标', record);
            const target = isSamePos(targetPos, moveTo)
                ? actor
                : getUnitAt(targetResolutionState, targetPos, '治疗目标');
            actions.push({ type: 'heal', healerId: actor.id, targetId: target.id });
            break;
        }
        case 'SUPPORT': {
            const targetPos = requirePosition(record.target, '支援目标', record);
            const target = findUnitAt(targetResolutionState, targetPos);
            if (!target) {
                if (options.skipInvalidEventAsNoop) {
                    break;
                }
                getUnitAt(targetResolutionState, targetPos, '支援目标');
                break;
            }
            if (options.skipInvalidEventAsNoop && !canApplyApkSupportEvent(targetResolutionState, eventActor, target)) {
                break;
            }
            actions.push({ type: 'support', supporterId: actor.id, targetId: target.id });
            break;
        }
        case 'SUMMON': {
            const spawnPos = requirePosition(record.target, '召唤目标', record);
            if (options.skipInvalidEventAsNoop && !canApplyApkSummonEvent(targetResolutionState, eventActor, spawnPos)) {
                break;
            }
            const grave = getGraveAt(targetResolutionState, spawnPos);
            actions.push({ type: 'summon', summonerId: actor.id, graveId: grave.id, spawnPos });
            break;
        }
        case 'OCCUPY': {
            const tile = state.map.tiles[moveTo.y]?.[moveTo.x];
            const shouldCapture = tile && (tile.ownerId === null || tile.ownerId !== actor.ownerId);
            actions.push(shouldCapture
                ? { type: 'capture', unitId: actor.id }
                : { type: 'wait', unitId: actor.id });
            break;
        }
        case 'REPAIR':
            actions.push({ type: 'repair', unitId: actor.id });
            break;
        case 'STANDBY':
            actions.push({ type: 'wait', unitId: actor.id });
            break;
        default:
            throw new Error(`暂不支持的 APK 回放事件: ${record.eventType}`);
    }

    if (record.postMoveTo) {
        actions.push({ type: 'post_attack_move', unitId: actor.id, to: record.postMoveTo });
    }

    return actions;
}

export function validateApkReplay(
    initialState: GameState,
    records: readonly ApkReplayActionRecord[],
    options: ApkReplayValidationOptions = {}
): ApkReplayValidationResult {
    const engine = new GameEngine(initialState, {
        // APK C0580c.m4578a 回放记录时直接下发 SELECT/MOVE/事件指令；
        // 对比 APK 执行结果时可跳过项目合法动作枚举，只保留项目规则结算。
        unsafeBypassValidationForTests: options.forceExecuteReplayActions ?? false,
        // APK 回放包含显式 NEXT_TURN；校验时不能让项目自动跳过“无动作”玩家，否则会双重换人。
        disableAutoAdvanceWhenNoMeaningfulAction: options.disableAutoAdvanceWhenNoMeaningfulAction ?? true,
        // /api/game_get 内嵌地图是开局配置；APK 在第一条玩家动作前已经结算当前玩家回合开始收益。
        applyInitialTurnStart: options.applyInitialTurnStart ?? true
    });
    const steps: ApkReplayValidationStep[] = [];
    const maxRecords = options.maxRecords ?? records.length;
    let firstError: string | null = null;
    let expandedActionCount = 0;
    let executedRecordCount = 0;

    for (let recordIndex = 0; recordIndex < Math.min(records.length, maxRecords); recordIndex += 1) {
        const record = records[recordIndex];
        let actions: Action[];
        try {
            actions = expandApkReplayRecordToProjectActions(
                record,
                engine.getState(),
                createRecordExpansionOptions(records, recordIndex, {
                    ...options.expansionOptions,
                    allowMissingSourceAsNoop: options.forceExecuteReplayActions
                        || options.expansionOptions?.allowMissingSourceAsNoop,
                    allowInvalidRecruitAsNoop: options.forceExecuteReplayActions
                        || options.expansionOptions?.allowInvalidRecruitAsNoop,
                    skipInvalidEventAsNoop: options.forceExecuteReplayActions
                        || options.expansionOptions?.skipInvalidEventAsNoop
                })
            );
        } catch (error) {
            const state = engine.getState();
            const message = error instanceof Error ? error.message : String(error);
            firstError = firstError ?? message;
            steps.push({
                recordIndex,
                subActionIndex: 0,
                eventType: record.eventType,
                action: null,
                actionCode: null,
                currentPlayerBefore: state.currentPlayer,
                turnBefore: state.turn,
                legalActionCount: engine.getLegalActions(state.currentPlayer).length,
                info: '',
                done: engine.isTerminal(),
                error: message,
                diagnostic: buildStepDiagnostic(state, record, null)
            });
            if (options.stopOnFirstError !== false) break;
            continue;
        }

        expandedActionCount += actions.length;
        for (let subActionIndex = 0; subActionIndex < actions.length; subActionIndex += 1) {
            const action = actions[subActionIndex];
            const stateBefore = engine.getState();
            const legalActionCount = engine.getLegalActions(stateBefore.currentPlayer).length;
            const result = engine.step(action);
            const error = result.info.includes('非法动作') ? result.info : null;
            firstError = firstError ?? error;
            steps.push({
                recordIndex,
                subActionIndex,
                eventType: record.eventType,
                action,
                actionCode: encodeAction(action),
                currentPlayerBefore: stateBefore.currentPlayer,
                turnBefore: stateBefore.turn,
                legalActionCount,
                info: result.info,
                done: result.done,
                error,
                diagnostic: error ? buildStepDiagnostic(stateBefore, record, action) : undefined
            });
            if (error && options.stopOnFirstError !== false) {
                return {
                    success: false,
                    recordCount: records.length,
                    executedRecordCount,
                    expandedActionCount,
                    steps,
                    firstError,
                    finalState: engine.getState()
                };
            }
        }
        executedRecordCount += 1;
    }

    return {
        success: firstError === null,
        recordCount: records.length,
        executedRecordCount,
        expandedActionCount,
        steps,
        firstError,
        finalState: engine.getState()
    };
}
