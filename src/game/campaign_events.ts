import {
    CampaignArea,
    CampaignEventConfig,
    CampaignEventEffect,
    CampaignEventTrigger,
    CampaignReinforcement,
    CampaignUnitSelector,
    GameState,
    Position,
    Unit
} from './types';
import { UNIT_CONFIGS } from './constants';
import { getEffectiveStats } from './abilities';
import { getRuleConfig, isCommanderUnit } from './rule_config';
import {
    putBoolean,
    putInteger,
    syncChangeGold,
    syncDestroyTeam,
    syncDisableTeam,
    syncGameOver,
    syncRestoreTeam,
    syncSetAlliance,
    syncSetCurrentTeam
} from './apk_stage';
import { setTileOwnerForRules, setTileTerrainForRules } from './terrain_rules';
import type { TerrainId } from './terrain';

export type CampaignRuntimeEvent =
    | { type: 'turn_start'; playerId: number; turn: number }
    | { type: 'unit_standby'; unit: Unit }
    | { type: 'unit_destroyed'; unit: Unit }
    | { type: 'tile_occupied'; pos: Position; ownerId: number | null; previousOwnerId: number | null };

export interface CampaignEventApplyResult {
    firedEventIds: string[];
    effectCount: number;
}

function ensureScriptState(state: GameState) {
    state.apkScriptState ??= {};
    state.apkScriptState.booleans ??= {};
    return state.apkScriptState;
}

function eventFiredKey(eventId: string): string {
    return `#campaignEvent:${eventId}`;
}

function markEventFired(state: GameState, eventId: string) {
    const scriptState = ensureScriptState(state);
    scriptState.booleans![eventFiredKey(eventId)] = true;
}

function wasEventFired(state: GameState, eventId: string): boolean {
    return state.apkScriptState?.booleans?.[eventFiredKey(eventId)] === true;
}

function inArea(pos: Position, area: CampaignArea): boolean {
    return pos.x >= area.minX && pos.x <= area.maxX && pos.y >= area.minY && pos.y <= area.maxY;
}

function samePos(left: Position, right: Position): boolean {
    return left.x === right.x && left.y === right.y;
}

function matchesSelector(state: GameState, unit: Unit, selector?: CampaignUnitSelector): boolean {
    if (!selector) return true;
    if (selector.teamId !== undefined && unit.ownerId !== selector.teamId) return false;
    if (selector.unitId !== undefined && unit.id !== selector.unitId) return false;
    if (selector.unitCode !== undefined && unit.apkUnitCode !== selector.unitCode) return false;
    if (selector.unitClass !== undefined && unit.unitClass !== selector.unitClass) return false;
    if (selector.commanderOfTeam !== undefined && !isCommanderUnit(state, unit, selector.commanderOfTeam)) return false;
    if (selector.pos && !samePos(unit.pos, selector.pos)) return false;
    if (selector.area && !inArea(unit.pos, selector.area)) return false;
    return true;
}

function selectUnits(state: GameState, selector?: CampaignUnitSelector): Unit[] {
    return state.units.filter(unit => unit.hp > 0 && matchesSelector(state, unit, selector));
}

function triggerMatches(state: GameState, trigger: CampaignEventTrigger, runtimeEvent: CampaignRuntimeEvent): boolean {
    if (trigger.type !== runtimeEvent.type) return false;

    switch (trigger.type) {
        case 'turn_start': {
            if (runtimeEvent.type !== 'turn_start') return false;
            if (trigger.playerId !== undefined && trigger.playerId !== runtimeEvent.playerId) return false;
            if (trigger.turn !== undefined && trigger.turn !== runtimeEvent.turn) return false;
            if (trigger.minTurn !== undefined && runtimeEvent.turn < trigger.minTurn) return false;
            if (trigger.maxTurn !== undefined && runtimeEvent.turn > trigger.maxTurn) return false;
            if (trigger.everyTurns !== undefined) {
                if (trigger.everyTurns <= 0 || runtimeEvent.turn % trigger.everyTurns !== 0) return false;
            }
            return true;
        }
        case 'unit_standby': {
            return runtimeEvent.type === 'unit_standby'
                && matchesSelector(state, runtimeEvent.unit, trigger.selector);
        }
        case 'unit_destroyed': {
            return runtimeEvent.type === 'unit_destroyed'
                && matchesSelector(state, runtimeEvent.unit, trigger.selector);
        }
        case 'tile_occupied': {
            if (runtimeEvent.type !== 'tile_occupied') return false;
            if (trigger.pos && !samePos(trigger.pos, runtimeEvent.pos)) return false;
            if (trigger.ownerId !== undefined && trigger.ownerId !== runtimeEvent.ownerId) return false;
            if (trigger.previousOwnerId !== undefined && trigger.previousOwnerId !== runtimeEvent.previousOwnerId) return false;
            return true;
        }
    }
}

function createUnitFromReinforcement(state: GameState, reinforcement: CampaignReinforcement): boolean {
    if (!UNIT_CONFIGS[reinforcement.unitClass]) return false;
    if (!state.players.some(player => player.id === reinforcement.teamId)) return false;
    if (
        reinforcement.pos.x < 0
        || reinforcement.pos.y < 0
        || reinforcement.pos.x >= state.map.width
        || reinforcement.pos.y >= state.map.height
    ) {
        return false;
    }
    if (state.units.some(unit => unit.hp > 0 && samePos(unit.pos, reinforcement.pos))) {
        return false;
    }

    const nextId = state.nextUnitId ?? 100;
    const unit: Unit = {
        id: `u_${nextId}`,
        ownerId: reinforcement.teamId,
        unitClass: reinforcement.unitClass,
        pos: { ...reinforcement.pos },
        hp: reinforcement.hp ?? 100,
        maxHp: 100,
        hasMoved: false,
        hasActed: reinforcement.hasActed ?? false,
        level: reinforcement.level ?? 0,
        exp: 0,
        apkUnitCode: reinforcement.code,
        apkUnitHead: reinforcement.head,
        apkStatic: reinforcement.static,
        apkTargeted: reinforcement.targeted
    };
    unit.movementRemaining = getEffectiveStats(unit).move;
    state.nextUnitId = nextId + 1;
    state.units.push(unit);
    return true;
}

function applyEffect(state: GameState, effect: CampaignEventEffect): number {
    switch (effect.type) {
        case 'create_unit':
            return createUnitFromReinforcement(state, effect.unit) ? 1 : 0;
        case 'reinforce':
            return effect.units.reduce((count, unit) => count + (createUnitFromReinforcement(state, unit) ? 1 : 0), 0);
        case 'damage_units': {
            const targets = selectUnits(state, effect.selector);
            targets.forEach(unit => {
                unit.hp -= effect.amount;
            });
            return targets.length;
        }
        case 'change_unit_hp': {
            const targets = selectUnits(state, effect.selector);
            targets.forEach(unit => {
                unit.hp += effect.delta;
            });
            return targets.length;
        }
        case 'change_unit_team': {
            const targets = selectUnits(state, effect.selector);
            targets.forEach(unit => {
                unit.ownerId = effect.teamId;
                if (effect.resetStatus) {
                    delete unit.status;
                }
                unit.hasMoved = false;
                unit.hasActed = false;
                unit.movementRemaining = getEffectiveStats(unit).move;
            });
            return targets.length;
        }
        case 'destroy_units': {
            const targets = selectUnits(state, effect.selector);
            targets.forEach(unit => {
                unit.hp = 0;
            });
            return targets.length;
        }
        case 'remove_units': {
            const ids = new Set(selectUnits(state, effect.selector).map(unit => unit.id));
            const before = state.units.length;
            state.units = state.units.filter(unit => !ids.has(unit.id));
            return before - state.units.length;
        }
        case 'move_unit': {
            const targets = selectUnits(state, effect.selector);
            const unit = targets[0];
            if (!unit) return 0;
            if (effect.to.x < 0 || effect.to.y < 0 || effect.to.x >= state.map.width || effect.to.y >= state.map.height) return 0;
            if (state.units.some(other => other.id !== unit.id && other.hp > 0 && samePos(other.pos, effect.to))) return 0;
            unit.pos = { ...effect.to };
            if (effect.endAction) {
                unit.hasMoved = true;
                unit.hasActed = true;
                unit.movementRemaining = 0;
            }
            return 1;
        }
        case 'set_tile': {
            const tile = state.map.tiles[effect.pos.y]?.[effect.pos.x];
            if (!tile) return 0;
            if (effect.terrainId !== undefined) {
                setTileTerrainForRules(tile, effect.terrainId as TerrainId);
            }
            if (effect.ownerId !== undefined) {
                setTileOwnerForRules(tile, effect.ownerId);
            }
            return 1;
        }
        case 'restore_team':
            return syncRestoreTeam(state, effect.teamId) ? 1 : 0;
        case 'disable_team':
            return syncDisableTeam(state, effect.teamId) ? 1 : 0;
        case 'destroy_team':
            return syncDestroyTeam(state, effect.teamId) ? 1 : 0;
        case 'set_alliance':
            return syncSetAlliance(state, effect.teamId, effect.allianceId) ? 1 : 0;
        case 'game_over':
            return syncGameOver(state, effect.allianceId) ? 1 : 0;
        case 'set_boolean':
            return putBoolean(state, effect.key, effect.value) ? 1 : 0;
        case 'set_integer':
            return putInteger(state, effect.key, effect.value) ? 1 : 0;
        case 'change_gold':
            return syncChangeGold(state, effect.teamId, effect.delta) ? 1 : 0;
        case 'set_current_team':
            return syncSetCurrentTeam(state, effect.teamId) ? 1 : 0;
    }
}

export function applyCampaignEvents(state: GameState, runtimeEvent: CampaignRuntimeEvent): CampaignEventApplyResult {
    const events: CampaignEventConfig[] = getRuleConfig(state).campaignEvents;
    const result: CampaignEventApplyResult = {
        firedEventIds: [],
        effectCount: 0
    };

    for (const event of events) {
        if (event.enabled === false || event.effects.length === 0) continue;
        if (event.once !== false && wasEventFired(state, event.id)) continue;
        if (!triggerMatches(state, event.trigger, runtimeEvent)) continue;

        let appliedEffects = 0;
        for (const effect of event.effects) {
            appliedEffects += applyEffect(state, effect);
        }

        if (event.once !== false) {
            markEventFired(state, event.id);
        }
        result.firedEventIds.push(event.id);
        result.effectCount += appliedEffects;
    }

    return result;
}
