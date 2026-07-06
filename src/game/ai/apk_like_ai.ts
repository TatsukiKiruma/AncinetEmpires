import { Action, GameState, Unit } from '../types';
import { GameEngine } from '../engine';
import { UNIT_CONFIGS } from '../constants';
import { isCommanderUnit } from '../rule_config';
import { getTileTerrainConfig } from '../terrain_rules';
import { HeuristicAI } from './heuristic_ai';

export type Rng = () => number;

const APK_SPECIAL_ABILITIES = [
    'summoner',
    'healer',
    'cleansing_aura',
    'poisoner',
    'weakness_aura',
    'blinder',
    'supporter',
    'repairer',
    'castle_capturer',
    'village_capturer'
] as const;

const GRIM_REAPER_ABILITIES = ['death_reaper'] as const;

export class ApkLikeAI {
    private rng: Rng;
    private heuristic: HeuristicAI;

    constructor(rng?: Rng) {
        this.rng = rng ?? Math.random;
        this.heuristic = new HeuristicAI(() => this.rng());
    }

    public getAction(engine: GameEngine, playerId: number): Action {
        const actions = engine.getLegalActions(playerId);
        if (actions.length === 0) return { type: 'end_turn' };

        const state = engine.getState();
        const candidateActions = this.selectCandidateActions(state, actions, playerId);
        if (candidateActions.length === 0) return this.pickBestAction(engine, playerId, actions);

        return this.pickBestAction(engine, playerId, candidateActions);
    }

    private selectCandidateActions(state: GameState, actions: Action[], playerId: number): Action[] {
        const pendingUnitId = state.pendingUnitId;
        if (pendingUnitId) {
            const pendingUnit = state.units.find(unit => unit.id === pendingUnitId && unit.ownerId === playerId);
            if (pendingUnit) {
                const pendingActions = this.filterActionsByUnit(actions, pendingUnit.id);
                if (pendingActions.length > 0) return pendingActions;
            }
        }

        const actionUnitIds = new Set<string>();
        for (const action of actions) {
            const unitId = this.getActionUnitId(action);
            if (unitId) actionUnitIds.add(unitId);
        }

        const availableUnits = state.units
            .filter(unit => unit.ownerId === playerId && !unit.apkStatic && actionUnitIds.has(unit.id))
            .sort((left, right) => this.compareUnits(state, left, right));

        for (const unit of availableUnits) {
            const unitActions = this.filterActionsByUnit(actions, unit.id);
            if (unitActions.length > 0) {
                return unitActions;
            }
        }

        const nonUnitActions = actions.filter(action => this.isRecruitOrFinalAction(action));
        if (nonUnitActions.length > 0) return nonUnitActions;

        return [];
    }

    private filterActionsByUnit(actions: Action[], unitId: string): Action[] {
        const matched: Action[] = [];
        for (const action of actions) {
            if (this.getActionUnitId(action) === unitId) {
                matched.push(action);
            }
        }
        return matched;
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

    private isRecruitOrFinalAction(action: Action): boolean {
        return action.type === 'recruit_to_castle'
            || action.type === 'recruit_and_deploy'
            || action.type === 'end_turn'
            || action.type === 'surrender';
    }

    private compareUnits(state: GameState, left: Unit, right: Unit): number {
        const leftPriority = this.getUnitPriority(state, left);
        const rightPriority = this.getUnitPriority(state, right);
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;

        if (left.hasMoved !== right.hasMoved) return left.hasMoved ? 1 : -1;
        if (left.id === right.id) return 0;

        return left.id < right.id ? -1 : 1;
    }

    private getUnitPriority(state: GameState, unit: Unit): number {
        if (this.isCommanderOnOwnCastle(state, unit)) return 0;
        if (this.hasAbility(unit, APK_SPECIAL_ABILITIES)) return 1;
        if (this.hasAbility(unit, GRIM_REAPER_ABILITIES)) return 2;
        if (!unit.hasMoved) return 3;

        return 10;
    }

    private isCommanderOnOwnCastle(state: GameState, unit: Unit): boolean {
        if (!isCommanderUnit(state, unit, unit.ownerId)) return false;
        const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
        if (!tile) return false;
        return getTileTerrainConfig(tile).key === 'castle' && tile.ownerId === unit.ownerId;
    }

    private hasAbility(unit: Unit, abilities: readonly string[]): boolean {
        return UNIT_CONFIGS[unit.unitClass].abilities.some(unitAbility => (
            abilities.includes(unitAbility)
        ));
    }

    private pickBestAction(
        engine: GameEngine,
        playerId: number,
        actions: Action[]
    ): Action {
        const nonEndTurnActions = actions.filter(action => action.type !== 'surrender');
        const candidateActions = nonEndTurnActions.length > 0 ? nonEndTurnActions : actions;
        const scoredActions = this.heuristic.scoreCandidateActions(engine, playerId, candidateActions);
        let bestAction = scoredActions[0]?.action ?? candidateActions[0];
        let bestScore = -Infinity;

        for (const { action, score: baseScore } of scoredActions) {
            const score = baseScore + (this.isAggressiveAction(action) ? this.rng() * 16 : 0);
            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            } else if (score === bestScore && this.rng() < 0.2) {
                bestAction = action;
            }
        }

        return bestAction;
    }

    private isAggressiveAction(action: Action): boolean {
        return action.type === 'attack'
            || action.type === 'capture'
            || action.type === 'destroy_town'
            || action.type === 'summon'
            || action.type === 'heal';
    }
}
