import { Action, GameState, Position, Unit, UnitClass } from '../types';
import { GameEngine } from '../engine';
import { UNIT_CONFIGS } from '../constants';
import { getEffectiveStats } from '../abilities';
import { getDistance, getReachablePositions } from '../map';
import { calculateDamage } from '../rules';
import { areEnemyPlayers, getAllianceId, getUnitCost, isCommanderUnit } from '../rule_config';
import { getTileDefenseBonus, getTileTerrainConfig } from '../terrain_rules';

export type Rng = () => number;

export class HeuristicAI {
    private rng: Rng;

    constructor(rng?: Rng) {
        this.rng = rng ?? Math.random;
    }

    public getAction(engine: GameEngine, playerId: number): Action {
        const actions = engine.getLegalActions(playerId);
        if (actions.length === 0) return { type: 'end_turn' };

        const state = engine.getState();
        let bestAction = actions[0];
        let maxScore = -Infinity;

        for (const action of actions) {
            const score = this.scoreAction(engine, state, playerId, action);
            if (score > maxScore) {
                maxScore = score;
                bestAction = action;
            }
        }

        return bestAction;
    }

    private scoreAction(engine: GameEngine, state: GameState, playerId: number, action: Action): number {
        switch (action.type) {
            case 'attack':
                return this.scoreAttack(engine, state, playerId, action);
            case 'capture':
                return this.scoreCapture(state, playerId, action.unitId);
            case 'repair':
                return 4200 + this.rng() * 20;
            case 'heal':
                return this.scoreHeal(engine, state, playerId, action);
            case 'support':
                return this.scoreSupport(state, action.supporterId, action.targetId);
            case 'summon':
                return 2600 + this.scorePositionPressure(state, playerId, action.spawnPos) + this.rng() * 20;
            case 'destroy_town':
                return this.scoreDestroyTown(state, playerId, action.unitId);
            case 'post_attack_move':
                return this.scoreMove(state, playerId, action.unitId, action.to, 180);
            case 'move':
                return this.scoreMove(state, playerId, action.unitId, action.to, 260);
            case 'recruit_to_castle':
                return this.scoreRecruit(state, playerId, action.unitClass, action.castlePos, action.castlePos);
            case 'recruit_and_deploy':
                return this.scoreRecruit(state, playerId, action.unitClass, action.castlePos, action.to);
            case 'wait':
                return this.scoreWait(state, playerId, action.unitId);
            case 'end_turn':
                return -250;
            case 'surrender':
                return -100000;
        }
    }

    private scoreAttack(
        engine: GameEngine,
        state: GameState,
        playerId: number,
        action: Extract<Action, { type: 'attack' }>
    ): number {
        const attacker = this.getUnit(state, action.attackerId);
        const target = this.getUnit(state, action.targetId);
        if (!attacker || !target) return -1000;

        const targetValue = this.getUnitValue(state, target);
        const attackerValue = this.getUnitValue(state, attacker);
        const damage = Math.min(target.hp, calculateDamage(state, attacker.id, target.id));
        const damageRatio = damage / Math.max(1, target.hp);
        const sim = engine.clone();
        sim.step(action);
        const afterState = sim.getState();
        const targetAfter = this.getUnit(afterState, target.id);
        const attackerAfter = this.getUnit(afterState, attacker.id);
        const killsTarget = !targetAfter || targetAfter.hp <= 0;
        const losesAttacker = !attackerAfter || attackerAfter.hp <= 0;

        let score = 5200 + targetValue * damageRatio * 8 + damage * 22;
        if (killsTarget) score += 15000 + targetValue * 8;
        if (isCommanderUnit(state, target)) score += killsTarget ? 18000 : 4500;
        if (losesAttacker) score -= attackerValue * 6 + 2200;
        if (attacker.hp < getEffectiveStats(attacker).maxHp * 0.35 && !killsTarget) score -= 900;

        return score + this.rng() * 30;
    }

    private scoreCapture(state: GameState, playerId: number, unitId: string): number {
        const unit = this.getUnit(state, unitId);
        if (!unit) return -1000;
        const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
        if (!tile) return -1000;
        const terrain = getTileTerrainConfig(tile);
        const isEnemyOwned = tile.ownerId !== null && areEnemyPlayers(state, playerId, tile.ownerId);
        const base = terrain.key === 'castle' ? 14000 : 9500;
        return base + (isEnemyOwned ? 2200 : 700) + this.rng() * 20;
    }

    private scoreHeal(
        engine: GameEngine,
        state: GameState,
        playerId: number,
        action: Extract<Action, { type: 'heal' }>
    ): number {
        const target = this.getUnit(state, action.targetId);
        const healer = this.getUnit(state, action.healerId);
        if (!target || !healer) return -1000;

        const sim = engine.clone();
        sim.step(action);
        const afterState = sim.getState();
        const targetAfter = this.getUnit(afterState, target.id);

        if (areEnemyPlayers(state, playerId, target.ownerId)) {
            const killed = !targetAfter || targetAfter.hp <= 0;
            return 4800 + (killed ? 9000 : 0) + this.getUnitValue(state, target) * (killed ? 6 : 1) + this.rng() * 20;
        }

        const maxHp = getEffectiveStats(target).maxHp;
        const missingHp = Math.max(0, maxHp - target.hp);
        return 3200 + missingHp * 55 + this.getUnitValue(state, target) * 0.25 + this.rng() * 20;
    }

    private scoreSupport(state: GameState, supporterId: string, targetId: string): number {
        const target = this.getUnit(state, targetId);
        const supporter = this.getUnit(state, supporterId);
        if (!target || !supporter) return -1000;

        return 3000 + this.getUnitValue(state, target) * 0.8 + this.nearestEnemyPressure(state, target.ownerId, target.pos) + this.rng() * 20;
    }

    private scoreDestroyTown(state: GameState, playerId: number, unitId: string): number {
        const unit = this.getUnit(state, unitId);
        if (!unit) return -1000;
        const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
        const isEnemyOwned = tile?.ownerId !== null && tile?.ownerId !== undefined && areEnemyPlayers(state, playerId, tile.ownerId);
        return 3600 + (isEnemyOwned ? 1600 : 0) + this.rng() * 20;
    }

    private scoreMove(state: GameState, playerId: number, unitId: string, to: Position, base: number): number {
        const unit = this.getUnit(state, unitId);
        if (!unit) return -1000;

        const abilities = UNIT_CONFIGS[unit.unitClass].abilities;
        const canCaptureCastle = abilities.includes('castle_capturer');
        const objectiveBefore = this.nearestObjectiveDistance(state, playerId, unit, unit.pos);
        const objectiveAfter = this.nearestObjectiveDistance(state, playerId, unit, to);
        const castleBefore = this.nearestCastleObjectiveDistance(state, playerId, unit.pos);
        const castleAfter = this.nearestCastleObjectiveDistance(state, playerId, to);
        const enemyBefore = this.nearestEnemyDistance(state, playerId, unit.pos);
        const enemyAfter = this.nearestEnemyDistance(state, playerId, to);
        const objectiveImprovement = this.distanceImprovement(objectiveBefore, objectiveAfter);
        const castleImprovement = this.distanceImprovement(castleBefore, castleAfter);
        const enemyImprovement = this.distanceImprovement(enemyBefore, enemyAfter);
        const tile = state.map.tiles[to.y]?.[to.x];
        const terrainBonus = tile ? getTileDefenseBonus(tile) * 70 : 0;
        const positionPressure = this.scorePositionPressure(state, playerId, to);
        const captureSetup = this.isCapturableTileForUnit(state, playerId, unit, to) ? 2400 : 0;
        const castleSetup = this.isUnfriendlyCastleTile(state, playerId, to)
            ? (canCaptureCastle ? 5200 : 650)
            : 0;
        const attackSetup = this.canThreatenEnemyFrom(state, playerId, unit, to) ? 1300 : 0;
        const castleDefenseSetup = this.isThreatenedOwnCastle(state, playerId, to) ? 68000 : 0;

        return (
            base
            + castleDefenseSetup
            + objectiveImprovement * 620
            + castleImprovement * (canCaptureCastle ? 980 : 180)
            + enemyImprovement * 340
            + captureSetup
            + castleSetup
            + attackSetup
            + terrainBonus
            + positionPressure
            - Math.max(0, objectiveAfter ?? 0) * 12
            + this.rng() * 25
        );
    }

    private scoreRecruit(
        state: GameState,
        playerId: number,
        unitClass: UnitClass,
        castlePos: Position,
        deployPos: Position
    ): number {
        const cost = getUnitCost(state, playerId, unitClass);
        if (cost === null) return -1000;

        const player = state.players.find(p => p.id === playerId);
        const playerGold = player?.gold ?? 0;
        const unitCount = state.units.filter(unit => unit.ownerId === playerId).length;
        const goldAfterRecruit = playerGold - cost;
        const commanderCost = getUnitCost(state, playerId, 'commander');
        const shouldRestoreCommander = !this.hasAliveCommander(state, playerId) && commanderCost !== null;
        const distanceToObjective = this.nearestGlobalObjectiveDistance(state, playerId, deployPos) ?? 0;
        const distanceToEnemy = this.nearestEnemyDistance(state, playerId, deployPos) ?? 0;

        if (this.isThreatenedOwnCastle(state, playerId, castlePos) && this.isSamePosition(castlePos, deployPos)) {
            return 72000 - cost * 0.5 + this.rng() * 20;
        }

        if (shouldRestoreCommander && unitClass !== 'commander') {
            return playerGold < commanderCost ? -6000 + this.rng() * 10 : 300 + this.rng() * 10;
        }

        if (shouldRestoreCommander && unitClass === 'commander') {
            const distanceToCastle = this.nearestCastleObjectiveDistance(state, playerId, deployPos) ?? distanceToObjective;
            return (
                16500
                + this.countEnemyOwnedCastles(state, playerId) * 500
                + Math.max(0, 24 - distanceToCastle) * 130
                + Math.max(0, goldAfterRecruit) * 0.04
                + this.rng() * 20
            );
        }

        const classPriority = this.getRecruitClassPriority(unitClass);
        const advancedRecruitBonus = this.scoreAdvancedRecruitBonus(state, playerId, unitClass);

        return (
            3600
            + classPriority
            + cost * 6.8
            + advancedRecruitBonus
            + Math.min(unitCount, 14) * 90
            + Math.max(0, 18 - distanceToObjective) * 35
            + Math.max(0, 14 - distanceToEnemy) * 22
            + Math.max(0, goldAfterRecruit) * 0.03
            + (castlePos.x === deployPos.x && castlePos.y === deployPos.y ? 80 : 0)
            + this.rng() * 20
        );
    }

    private scoreWait(state: GameState, playerId: number, unitId: string): number {
        const unit = this.getUnit(state, unitId);
        if (!unit) return -1000;
        const pressure = this.nearestEnemyPressure(state, playerId, unit.pos);
        const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
        const terrainBonus = tile ? getTileDefenseBonus(tile) * 35 : 0;
        const castleGuardBonus = this.isGuardingOwnCastleAgainstCommander(state, playerId, unit) ? 69000 : 0;
        return 120 + castleGuardBonus + pressure + terrainBonus + (unit.ownerId === playerId ? 0 : -1000) + this.rng() * 10;
    }

    private getUnit(state: GameState, unitId: string): Unit | undefined {
        return state.units.find(unit => unit.id === unitId);
    }

    private getUnitValue(state: GameState, unit: Unit): number {
        return getUnitCost(state, unit.ownerId, unit.unitClass) ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
    }

    private getRecruitClassPriority(unitClass: UnitClass): number {
        const priority: Partial<Record<UnitClass, number>> = {
            soldier: 120,
            ghost: 180,
            mermaid: 220,
            slime: 260,
            archer: 320,
            dark_mage: 360,
            water_elemental: 420,
            paladin: 700,
            witch: 900,
            elf: 1200,
            berserker: 1300,
            druid: 1450,
            ice_elemental: 1500,
            golem: 1550,
            wolf: 1700,
            catapult: 2050,
            wolf_archer: 2400,
            dragon: 3100,
            commander: 2600
        };
        return priority[unitClass] ?? 0;
    }

    private scoreAdvancedRecruitBonus(state: GameState, playerId: number, unitClass: UnitClass): number {
        const cost = getUnitCost(state, playerId, unitClass) ?? UNIT_CONFIGS[unitClass].cost ?? 0;
        const lowTierCount = this.countLowTierUnits(state, playerId);
        const isAdvanced = cost >= 500;
        const isCheapFiller = cost <= 300;

        if (isAdvanced && lowTierCount > 0) {
            return 1400 + Math.min(lowTierCount, 6) * 180;
        }
        if (isCheapFiller && lowTierCount >= 4) {
            return -900;
        }
        return 0;
    }

    private distanceImprovement(before: number | null, after: number | null): number {
        if (before === null || after === null) return 0;
        return before - after;
    }

    private isSamePosition(left: Position, right: Position): boolean {
        return left.x === right.x && left.y === right.y;
    }

    private nearestEnemyDistance(state: GameState, playerId: number, pos: Position): number | null {
        const distances = state.units
            .filter(unit => areEnemyPlayers(state, playerId, unit.ownerId) && unit.hp > 0)
            .map(unit => getDistance(pos, unit.pos));
        return distances.length > 0 ? Math.min(...distances) : null;
    }

    private nearestEnemyPressure(state: GameState, playerId: number, pos: Position): number {
        const distances = state.units
            .filter(unit => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId))
            .map(unit => getDistance(pos, unit.pos));
        const nearest = distances.length > 0 ? Math.min(...distances) : 99;
        return Math.max(0, 8 - nearest) * 90;
    }

    private nearestObjectiveDistance(state: GameState, playerId: number, unit: Unit, pos: Position): number | null {
        const canCaptureVillage = UNIT_CONFIGS[unit.unitClass].abilities.includes('village_capturer');
        const canCaptureCastle = UNIT_CONFIGS[unit.unitClass].abilities.includes('castle_capturer');
        if (!canCaptureVillage && !canCaptureCastle) {
            return this.nearestEnemyDistance(state, playerId, pos) ?? this.nearestGlobalObjectiveDistance(state, playerId, pos);
        }

        const distances: number[] = [];
        for (let y = 0; y < state.map.height; y += 1) {
            for (let x = 0; x < state.map.width; x += 1) {
                const tile = state.map.tiles[y][x];
                const terrain = getTileTerrainConfig(tile);
                const isTargetType = (terrain.key === 'town' && canCaptureVillage) || (terrain.key === 'castle' && canCaptureCastle);
                if (!isTargetType || !this.isUnfriendlyOwner(state, playerId, tile.ownerId)) continue;
                distances.push(getDistance(pos, { x, y }));
            }
        }

        return distances.length > 0 ? Math.min(...distances) : this.nearestEnemyDistance(state, playerId, pos);
    }

    private nearestGlobalObjectiveDistance(state: GameState, playerId: number, pos: Position): number | null {
        const distances: number[] = [];
        for (let y = 0; y < state.map.height; y += 1) {
            for (let x = 0; x < state.map.width; x += 1) {
                const tile = state.map.tiles[y][x];
                const terrain = getTileTerrainConfig(tile);
                if ((terrain.key === 'town' || terrain.key === 'castle') && this.isUnfriendlyOwner(state, playerId, tile.ownerId)) {
                    distances.push(getDistance(pos, { x, y }));
                }
            }
        }
        return distances.length > 0 ? Math.min(...distances) : this.nearestEnemyDistance(state, playerId, pos);
    }

    private isCapturableTileForUnit(state: GameState, playerId: number, unit: Unit, pos: Position): boolean {
        const tile = state.map.tiles[pos.y]?.[pos.x];
        if (!tile) return false;
        const terrain = getTileTerrainConfig(tile);
        const abilities = UNIT_CONFIGS[unit.unitClass].abilities;
        const canCapture = (
            (terrain.key === 'town' && abilities.includes('village_capturer'))
            || (terrain.key === 'castle' && abilities.includes('castle_capturer'))
        );
        return canCapture && this.isUnfriendlyOwner(state, playerId, tile.ownerId);
    }

    private canThreatenEnemyFrom(state: GameState, playerId: number, unit: Unit, pos: Position): boolean {
        const stats = getEffectiveStats(unit);
        return state.units.some(enemy => (
            enemy.hp > 0
            && areEnemyPlayers(state, playerId, enemy.ownerId)
            && getDistance(pos, enemy.pos) >= stats.minRange
            && getDistance(pos, enemy.pos) <= stats.maxRange
        ));
    }

    private hasAliveCommander(state: GameState, playerId: number): boolean {
        return state.units.some(unit => (
            unit.ownerId === playerId
            && unit.hp > 0
            && isCommanderUnit(state, unit, playerId)
        ));
    }

    private countEnemyOwnedCastles(state: GameState, playerId: number): number {
        let count = 0;
        for (let y = 0; y < state.map.height; y += 1) {
            for (let x = 0; x < state.map.width; x += 1) {
                const tile = state.map.tiles[y][x];
                if (
                    tile.ownerId !== null
                    && getTileTerrainConfig(tile).key === 'castle'
                    && areEnemyPlayers(state, playerId, tile.ownerId)
                ) {
                    count += 1;
                }
            }
        }
        return count;
    }

    private isThreatenedOwnCastle(state: GameState, playerId: number, pos: Position): boolean {
        const tile = state.map.tiles[pos.y]?.[pos.x];
        if (!tile || tile.ownerId !== playerId || getTileTerrainConfig(tile).key !== 'castle') return false;
        if (state.units.some(unit => unit.hp > 0 && this.isSamePosition(unit.pos, pos))) return false;

        return this.enemyCommanderCanReachPosition(state, playerId, pos);
    }

    private isGuardingOwnCastleAgainstCommander(state: GameState, playerId: number, unit: Unit): boolean {
        if (unit.ownerId !== playerId || unit.hp <= 0) return false;
        const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
        if (!tile || tile.ownerId !== playerId || getTileTerrainConfig(tile).key !== 'castle') return false;

        const stateWithoutGuard = {
            ...state,
            units: state.units.filter(candidate => candidate.id !== unit.id)
        };
        return this.enemyCommanderCanReachPosition(stateWithoutGuard, playerId, unit.pos);
    }

    private enemyCommanderCanReachPosition(state: GameState, playerId: number, pos: Position): boolean {
        return state.units.some(unit => (
            unit.hp > 0
            && areEnemyPlayers(state, playerId, unit.ownerId)
            && isCommanderUnit(state, unit, unit.ownerId)
            && getReachablePositions(state, unit.id).some(reachable => this.isSamePosition(reachable, pos))
        ));
    }

    private countLowTierUnits(state: GameState, playerId: number): number {
        return state.units
            .filter(unit => (
                unit.ownerId === playerId
                && unit.hp > 0
                && this.getUnitValue(state, unit) <= 300
            )).length;
    }

    private nearestCastleObjectiveDistance(state: GameState, playerId: number, pos: Position): number | null {
        const distances: number[] = [];
        for (let y = 0; y < state.map.height; y += 1) {
            for (let x = 0; x < state.map.width; x += 1) {
                const tile = state.map.tiles[y][x];
                if (getTileTerrainConfig(tile).key === 'castle' && this.isUnfriendlyOwner(state, playerId, tile.ownerId)) {
                    distances.push(getDistance(pos, { x, y }));
                }
            }
        }
        return distances.length > 0 ? Math.min(...distances) : null;
    }

    private isUnfriendlyCastleTile(state: GameState, playerId: number, pos: Position): boolean {
        const tile = state.map.tiles[pos.y]?.[pos.x];
        return !!tile && getTileTerrainConfig(tile).key === 'castle' && this.isUnfriendlyOwner(state, playerId, tile.ownerId);
    }

    private scorePositionPressure(state: GameState, playerId: number, pos: Position): number {
        const nearestEnemy = this.nearestEnemyDistance(state, playerId, pos) ?? 99;
        const nearestObjective = this.nearestGlobalObjectiveDistance(state, playerId, pos) ?? 99;
        return Math.max(0, 10 - nearestEnemy) * 55 + Math.max(0, 12 - nearestObjective) * 40;
    }

    private isUnfriendlyOwner(state: GameState, playerId: number, ownerId: number | null): boolean {
        return ownerId === null || getAllianceId(state, ownerId) !== getAllianceId(state, playerId);
    }
}
