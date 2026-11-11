import { TacticalPathfinder } from './tactical_pathfinding';
import { UNIT_CONFIGS } from '../constants';
import {
    getEffectiveStats,
    hasAbility,
    isFlying,
    isForestTerrain,
    isMountainTerrain,
    isUndead,
    isWaterTerrain
} from '../abilities';
import { getDistance, getReachablePositions, isWithinBounds } from '../map';
import { calculateDamage } from '../rules';
import {
    areAlliedPlayers,
    areEnemyPlayers,
    getAllianceId,
    getCurrentPopulation,
    getCurrentUnitCount,
    getRuleConfig,
    getTeamRuleConfig,
    getTileIncome,
    getUnitCost,
    isCommanderUnit
} from '../rule_config';
import {
    getTileDefenseBonus,
    getTileHealPerTurn,
    getTileTerrainConfig,
    getTileTerrainKey,
    tileClearsNegativeStatusAtTurnStart
} from '../terrain_rules';
import type { Tile } from '../terrain';
import type { Ability, Action, GameState, Position, Unit, UnitClass } from '../types';

interface UnitProfile {
    capturers: number;
    castleCapturers: number;
    healers: number;
    supporters: number;
    summoners: number;
    destroyers: number;
    ranged: number;
    magic: number;
    physical: number;
    antiAir: number;
    durablePhysical: number;
    fast: number;
    flying: number;
}

interface EnemyProfile extends UnitProfile {
    undead: number;
    lowMagicDefense: number;
    physicalAttackers: number;
    magicAttackers: number;
    dragons: number;
    slimes: number;
}

interface MapProfile {
    waterTiles: number;
    forestTiles: number;
    mountainTiles: number;
    bridgeTiles: number;
    healingTiles: number;
    totalTiles: number;
}

interface ObjectiveTarget {
    pos: Position;
    kind: 'castle' | 'town' | 'unit' | 'damaged_town';
    priority: number;
}

function posKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

function samePos(left: Position, right: Position): boolean {
    return left.x === right.x && left.y === right.y;
}

function isNegativeStatus(unit: Unit): boolean {
    return unit.status?.type === 'poisoned' || unit.status?.type === 'blinded' || unit.status?.type === 'weakened';
}

function unitConfig(unitOrClass: Unit | UnitClass) {
    return UNIT_CONFIGS[typeof unitOrClass === 'string' ? unitOrClass : unitOrClass.unitClass];
}

function hasUnitAbility(unitOrClass: Unit | UnitClass, ability: Ability): boolean {
    return unitConfig(unitOrClass).abilities.includes(ability);
}

export class RuleTacticalEvaluator {
    private readonly ownUnits: Unit[];
    private readonly enemyUnits: Unit[];
    private readonly ownProfile: UnitProfile;
    private readonly enemyProfile: EnemyProfile;
    private readonly mapProfile: MapProfile;
    private readonly pathfinder: TacticalPathfinder;
    private readonly reachableCache = new Map<string, Position[]>();
    private readonly threatCache = new Map<string, number>();
    private readonly unitValueCache = new Map<string, number>();

    constructor(private readonly state: GameState, private readonly playerId: number) {
        this.pathfinder = new TacticalPathfinder(state);
        this.ownUnits = state.units.filter(unit => unit.ownerId === playerId && unit.hp > 0);
        this.enemyUnits = state.units.filter(unit => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId));
        this.ownProfile = this.buildUnitProfile(this.ownUnits);
        this.enemyProfile = this.buildEnemyProfile(this.enemyUnits);
        this.mapProfile = this.buildMapProfile();
    }

    public scoreAction(action: Action): number {
        switch (action.type) {
            case 'move':
                return this.scoreMove(action.unitId, action.to, false);
            case 'post_attack_move':
                return this.scoreMove(action.unitId, action.to, true);
            case 'attack':
                return this.scoreAttack(action);
            case 'capture':
                return this.scoreCapture(action.unitId);
            case 'repair':
                return this.scoreRepair(action.unitId);
            case 'heal':
                return this.scoreHeal(action);
            case 'support':
                return this.scoreSupport(action);
            case 'summon':
                return this.scoreSummon(action);
            case 'destroy_town':
                return this.scoreDestroyTown(action.unitId);
            case 'recruit_to_castle':
                return this.scoreRecruit(action.unitClass, action.castlePos, action.castlePos);
            case 'recruit_and_deploy':
                return this.scoreRecruit(action.unitClass, action.castlePos, action.to);
            case 'wait':
                return this.scoreWait(action.unitId);
            case 'end_turn':
                return this.scoreEndTurn();
            case 'surrender':
                return -100000;
        }
    }

    public hasHighValueRecruitOpportunity(): boolean {
        const player = this.state.players.find(item => item.id === this.playerId);
        if (!player) return false;
        const remainingUnitSlots = this.remainingUnitSlots();
        const remainingPopulation = this.remainingPopulation();
        return player.gold >= 150
            && (remainingUnitSlots === null || remainingUnitSlots > 0)
            && (remainingPopulation === null || remainingPopulation > 0)
            && this.ownUnits.length < 10;
    }

    private scoreMove(unitId: string, to: Position, postAttackMove: boolean): number {
        const unit = this.getUnit(unitId);
        if (!unit) return -1000;

        let score = 0;
        score += this.scoreTruePathProgress(unit, unit.pos, to);
        score += this.scoreRecoveryMove(unit, unit.pos, to);
        score += this.scoreMoveSafety(unit, unit.pos, to, postAttackMove);
        score += this.scoreTerrainFit(unit, to);
        score += this.scoreSkillPosition(unit, to);
        score += this.scoreZoneControl(unit, to);
        score += this.scoreFormation(unit, to);

        return score;
    }

    private scoreAttack(action: Extract<Action, { type: 'attack' }>): number {
        const attacker = this.getUnit(action.attackerId);
        const target = this.getUnit(action.targetId);
        if (!attacker || !target) return 0;

        const damage = Math.min(target.hp, calculateDamage(this.state, attacker.id, target.id));
        const targetValue = this.getUnitValue(target);
        const attackerValue = this.getUnitValue(attacker);
        let score = 0;

        if (damage >= target.hp) {
            score += 9500 + targetValue * 2;
            if (isCommanderUnit(this.state, target)) score += 6000;
        }

        if (target.unitClass === 'slime' && unitConfig(attacker).attackType === 'magic') score += 1800;
        if (hasAbility(target, 'flying') && hasAbility(attacker, 'sharpshooter')) score += 2200;
        if (isUndead(target) && hasAbility(attacker, 'healer')) score += 2200;

        const threatAfter = this.maxIncomingDamage(attacker, attacker.pos);
        if (attacker.hp <= threatAfter && damage < target.hp) {
            score -= Math.min(7000, attackerValue * 4);
        }

        return score;
    }

    private scoreCapture(unitId: string): number {
        const unit = this.getUnit(unitId);
        if (!unit) return 0;
        const tile = this.tileAt(unit.pos);
        if (!tile) return 0;

        const key = getTileTerrainKey(tile);
        const enemyOwned = tile.ownerId !== null && areEnemyPlayers(this.state, this.playerId, tile.ownerId);
        const income = getTileIncome(this.state, tile);
        let score = enemyOwned ? 12500 : 10200;

        score += income * 24;
        if (key === 'castle') {
            score += 7000 + this.countEnemyOwnedCastles() * 1400;
            if (this.enemyUnits.length === 0 || this.isCleanupMode()) score += 9000;
        }
        if (key === 'town') score += 2500;
        return score;
    }

    private scoreRepair(unitId: string): number {
        const unit = this.getUnit(unitId);
        if (!unit) return 0;
        const tile = this.tileAt(unit.pos);
        if (!tile || getTileTerrainKey(tile) !== 'damaged_town') return 0;
        return 2600 + getTileDefenseBonus(tile) * 80 + (this.isCleanupMode() ? 1800 : 0);
    }

    private scoreHeal(action: Extract<Action, { type: 'heal' }>): number {
        const healer = this.getUnit(action.healerId);
        const target = this.getUnit(action.targetId);
        if (!healer || !target) return 0;

        if (areEnemyPlayers(this.state, this.playerId, target.ownerId)) {
            if (!isUndead(target)) return 0;
            const healDamage = Math.floor(this.getHealAmount(healer) * 1.5);
            const targetValue = this.getUnitValue(target);
            let score = 12000 + healDamage * 70 + targetValue * 3;
            if (healDamage >= target.hp) score += 18000 + targetValue * 6;
            return score;
        }

        const maxHp = getEffectiveStats(target).maxHp;
        const missingHp = Math.max(0, maxHp - target.hp);
        const hpRatio = target.hp / Math.max(1, maxHp);
        const threat = this.maxIncomingDamage(target, target.pos);
        let score = missingHp * 35 + this.getUnitValue(target) * 0.5;
        if (healer.unitClass === 'paladin') {
            const noImmediateAttack = !this.canAnyEnemyBeAttackedFrom(healer, healer.pos);
            if (target.id === healer.id) {
                score += noImmediateAttack ? 8000 : 500;
            } else {
                score += noImmediateAttack ? 22000 + this.getUnitValue(target) * 0.7 : 1200;
                if (target.hp >= maxHp) score += noImmediateAttack ? 4000 : 0;
            }
        }
        if (hpRatio <= 0.35) score += 18000;
        if (target.hp <= threat && target.hp + 40 > threat) score += 6000;
        if (isCommanderUnit(this.state, target)) score += 3000;
        if (isNegativeStatus(target)) score += 1200;
        return score;
    }

    private scoreSupport(action: Extract<Action, { type: 'support' }>): number {
        const supporter = this.getUnit(action.supporterId);
        const target = this.getUnit(action.targetId);
        if (!supporter || !target) return 0;

        let score = this.getUnitValue(target) * 1.2 + getEffectiveStats(target).attack * 22;
        if (this.canAnyEnemyBeAttackedFrom(target, target.pos)) score += 15000;
        if (hasAbility(target, 'village_capturer') || hasAbility(target, 'castle_capturer')) score += 1800;
        if (hasAbility(target, 'healer') || hasAbility(target, 'summoner') || hasAbility(target, 'destroyer')) score += 1200;
        return score;
    }

    private scoreSummon(action: Extract<Action, { type: 'summon' }>): number {
        const summoner = this.getUnit(action.summonerId);
        if (!summoner) return 0;

        let score = 25000;
        score += Math.max(0, 8 - this.nearestEnemyDistance(action.spawnPos)) * 260;
        score += Math.max(0, 10 - this.nearestObjectivePathTurnsForVirtual('skeleton', action.spawnPos)) * 220;
        if (this.isBridgeOrChoke(action.spawnPos)) score += 1800;
        if (this.enemyUnits.length <= 2 && this.isCleanupMode()) score -= 1200;
        return score;
    }

    private scoreDestroyTown(unitId: string): number {
        const unit = this.getUnit(unitId);
        if (!unit) return 0;
        const tile = this.tileAt(unit.pos);
        if (!tile || getTileTerrainKey(tile) !== 'town') return 0;

        const enemyOwned = tile.ownerId !== null && areEnemyPlayers(this.state, this.playerId, tile.ownerId);
        if (tile.ownerId !== null && !enemyOwned) return -15000;
        if (this.canAlliedCaptureTownThisTurn(unit.pos, unit.id)) return -24000;
        return 3500 + (enemyOwned ? 16000 : 1000) + (this.isCleanupMode() ? 2500 : 0);
    }

    private scoreRecruit(unitClass: UnitClass, castlePos: Position, deployPos: Position): number {
        const cost = getUnitCost(this.state, this.playerId, unitClass);
        if (cost === null) return -1000;

        let score = 0;
        score += this.scoreRecruitSlotsAndEconomy(unitClass, cost);
        score += this.scoreRecruitRoleNeed(unitClass);
        score += this.scoreRecruitCounter(unitClass);
        score += this.scoreRecruitTerrainFit(unitClass);
        score += this.scoreRecruitDeployment(unitClass, castlePos, deployPos);
        score += this.scoreRecruitDiversity(unitClass, cost);
        return score;
    }

    private scoreWait(unitId: string): number {
        const unit = this.getUnit(unitId);
        if (!unit) return 0;

        const auraScore = this.scoreSkillPosition(unit, unit.pos);
        const tile = this.tileAt(unit.pos);
        let score = auraScore;
        if (tile && getTileHealPerTurn(tile) > 0 && unit.hp < getEffectiveStats(unit).maxHp) score += 1400;
        if (this.isCleanupMode() && auraScore < 1500) score -= 2500;
        if (this.maxIncomingDamage(unit, unit.pos) >= unit.hp && !this.isGuardingCriticalCastle(unit)) score -= 4500;
        return score;
    }

    private scoreEndTurn(): number {
        let score = 0;
        const readyUnits = this.ownUnits.filter(unit => !unit.hasActed).length;
        if (readyUnits > 0) score -= 2000 + readyUnits * 350;
        if (this.isCleanupMode() && this.hasUnresolvedEnemyBuildings()) score -= 4500;
        if (this.hasHighValueRecruitOpportunity()) score -= 1600;
        return score;
    }

    private scoreTruePathProgress(unit: Unit, from: Position, to: Position): number {
        const targets = this.getObjectiveTargetsForUnit(unit);
        if (targets.length === 0) return 0;

        let best = 0;
        for (const target of targets) {
            const beforeTurns = this.turnsToTarget(unit, from, target);
            const afterTurns = this.turnsToTarget(unit, to, target);
            if (beforeTurns === null || afterTurns === null) continue;
            const improvement = beforeTurns - afterTurns;
            const detourProgress = improvement > 0 && getDistance(to, target.pos) > getDistance(from, target.pos)
                ? target.priority * 1.5
                : 0;
            const targetScore = improvement * target.priority * 3.6 + detourProgress - afterTurns * 80;
            if (targetScore > best) best = targetScore;
            if (afterTurns === 0) best += target.priority * 2;
        }

        return best;
    }

    private scoreRecoveryMove(unit: Unit, from: Position, to: Position): number {
        const maxHp = getEffectiveStats(unit).maxHp;
        const hpRatio = unit.hp / Math.max(1, maxHp);
        const needsRecovery = hpRatio <= 0.45 || isNegativeStatus(unit);
        if (!needsRecovery) return 0;

        const healingTargets = this.getHealingTargets(unit);
        if (healingTargets.length === 0) return 0;

        const before = this.nearestTurnsToPositions(unit, from, healingTargets);
        const after = this.nearestTurnsToPositions(unit, to, healingTargets);
        if (before === null || after === null) return 0;

        let score = (before - after) * 2600;
        const tile = this.tileAt(to);
        if (tile && this.isUsefulRecoveryTileFor(unit, tile)) {
            score += 6500 + (maxHp - unit.hp) * 28;
        }

        const afterThreat = this.maxIncomingDamage(unit, to);
        if (afterThreat >= unit.hp && !this.isUsefulRecoveryTileFor(unit, tile)) score -= 5000;
        return score;
    }

    private scoreMoveSafety(unit: Unit, from: Position, to: Position, postAttackMove: boolean): number {
        const beforeThreat = this.maxIncomingDamage(unit, from);
        const afterThreat = this.maxIncomingDamage(unit, to);
        const unitValue = this.getUnitValue(unit);
        const highValueMultiplier = isCommanderUnit(this.state, unit) ? 2.2 : Math.max(1, unitValue / 500);
        let score = (beforeThreat - afterThreat) * 32 * Math.min(2.4, highValueMultiplier);

        if (beforeThreat >= unit.hp && afterThreat < unit.hp) score += 7000;
        if (afterThreat >= unit.hp && beforeThreat < unit.hp) score -= 7000;
        if (postAttackMove && afterThreat < beforeThreat) score += 1800;

        const tile = this.tileAt(to);
        if (tile) score += getTileDefenseBonus(tile) * (isCommanderUnit(this.state, unit) ? 120 : 65);
        return score;
    }

    private scoreTerrainFit(unitOrClass: Unit | UnitClass, pos: Position): number {
        const tile = this.tileAt(pos);
        if (!tile) return 0;

        let score = 0;
        if (hasUnitAbility(unitOrClass, 'water_child') && isWaterTerrain(tile)) score += 1300;
        if (hasUnitAbility(unitOrClass, 'forest_child') && isForestTerrain(tile)) score += 1050;
        if (hasUnitAbility(unitOrClass, 'mountain_child') && isMountainTerrain(tile)) score += 1400;
        if (hasUnitAbility(unitOrClass, 'mountain_child') && isMountainTerrain(tile) && this.nearestEnemyDistance(pos) <= 2) score += 4200;
        if (hasUnitAbility(unitOrClass, 'flying') && this.mapProfile.waterTiles > this.mapProfile.totalTiles * 0.18) score += 350;
        return score;
    }

    private scoreSkillPosition(unit: Unit, pos: Position): number {
        let score = 0;
        if (hasAbility(unit, 'cleansing_aura')) score += this.scoreCleansingAuraAt(unit, pos);
        if (hasAbility(unit, 'attack_aura')) score += this.scoreAttackAuraAt(unit, pos);
        if (hasAbility(unit, 'weakness_aura')) score += this.scoreWeaknessAuraAt(unit, pos);
        if (hasAbility(unit, 'summoner')) score += this.scoreSummonerPosition(unit, pos);
        if (hasAbility(unit, 'healer')) score += this.scoreHealerPosition(unit, pos);
        if (hasAbility(unit, 'supporter')) score += this.scoreSupporterPosition(unit, pos);
        if (hasAbility(unit, 'destroyer')) score += this.scoreDestroyerPosition(unit, pos);
        return score;
    }

    private scoreZoneControl(unit: Unit, pos: Position): number {
        let score = 0;
        if (this.isBridgeOrChoke(pos)) {
            score += 900;
            if (this.nearestEnemyDistance(pos) <= 4 || this.nearestObjectiveDistance(pos) <= 6) score += 1400;
        }
        if (this.isGuardingCriticalCastleAt(unit, pos)) score += 68000;
        return score;
    }

    private scoreFormation(unit: Unit, pos: Position): number {
        const allyDistance = this.nearestAllyDistance(unit, pos);
        const enemyDistance = this.nearestEnemyDistance(pos);
        let score = 0;

        if (allyDistance !== null && allyDistance <= 2) score += 450;
        if (allyDistance !== null && allyDistance >= 6 && enemyDistance <= 4 && this.getUnitValue(unit) >= 600) score -= 1400;
        if (this.isRangedUnit(unit) && enemyDistance <= 1) score -= 1400;
        if (!this.isRangedUnit(unit) && enemyDistance === 1 && this.maxIncomingDamage(unit, pos) < unit.hp) score += 500;
        return score;
    }

    private scoreRecruitSlotsAndEconomy(unitClass: UnitClass, cost: number): number {
        const player = this.state.players.find(item => item.id === this.playerId);
        const gold = player?.gold ?? 0;
        const goldAfter = gold - cost;
        const remainingUnitSlots = this.remainingUnitSlots();
        const remainingPopulation = this.remainingPopulation();
        const config = UNIT_CONFIGS[unitClass];
        let score = 0;

        if (remainingUnitSlots !== null) {
            if (remainingUnitSlots >= 12 && this.ownUnits.length <= 4) {
                score += config.population <= 2 || cost <= 400 ? 2600 : -1200;
            } else if (remainingUnitSlots <= 3) {
                score += cost >= 600 ? 1300 : -500;
            } else {
                score += Math.min(remainingUnitSlots, 10) * 130;
            }
        }

        if (remainingPopulation !== null) {
            if (remainingPopulation >= 12 && config.population <= 2) score += 2200;
            if (remainingPopulation <= 5 && config.population >= 4) score += 900;
        }

        if (goldAfter >= 150 && this.ownUnits.length < 8 && cost >= 800) score -= 1300;
        if (goldAfter < 0) score -= 5000;
        if (goldAfter >= 300 && cost <= 400) score += 500;
        return score;
    }

    private scoreRecruitRoleNeed(unitClass: UnitClass): number {
        const config = UNIT_CONFIGS[unitClass];
        let score = 0;

        if (this.ownProfile.capturers <= 1 && config.abilities.includes('village_capturer')) score += 2600;
        if (this.ownProfile.castleCapturers === 0 && config.abilities.includes('castle_capturer')) score += 4500;
        if (this.ownProfile.healers === 0 && config.abilities.includes('healer')) score += this.woundedAllyCount() > 0 ? 2800 : 1400;
        if (this.ownProfile.ranged <= 1 && config.maxRange >= 2) score += 1400;
        if (this.ownProfile.magic <= 1 && config.attackType === 'magic') score += 1300;
        if (this.ownProfile.destroyers === 0 && config.abilities.includes('destroyer') && this.enemyBuildingCount('town') >= 2) score += 1700;
        if (this.ownProfile.summoners === 0 && config.abilities.includes('summoner') && (this.state.graves?.length ?? 0) >= 2) score += 1600;
        if (this.ownProfile.supporters === 0 && config.abilities.includes('supporter') && this.ownUnits.length >= 5) score += 1200;
        return score;
    }

    private scoreRecruitCounter(unitClass: UnitClass): number {
        const config = UNIT_CONFIGS[unitClass];
        let score = 0;

        if (this.enemyProfile.flying > 0 && config.abilities.includes('sharpshooter')) score += 2200 + this.enemyProfile.flying * 650;
        if (this.enemyProfile.dragons > 0 && (unitClass === 'mermaid' || unitClass === 'wolf_archer' || config.abilities.includes('sharpshooter'))) {
            score += 1800 + this.enemyProfile.dragons * 500;
        }
        if (this.enemyProfile.slimes > 0 && config.attackType === 'magic') score += 2200 + this.enemyProfile.slimes * 550;
        if (this.enemyProfile.physicalAttackers >= 3) {
            if (unitClass === 'slime' || unitClass === 'golem') score += 2600 + this.enemyProfile.physicalAttackers * 420;
            if (config.maxRange >= 3) score += 1200 + this.enemyProfile.physicalAttackers * 220;
        }
        if (this.enemyProfile.magicAttackers >= 2 && config.magicDefense >= 20) score += 1200 + this.enemyProfile.magicAttackers * 200;
        if (this.enemyProfile.undead > 0 && (config.abilities.includes('healer') || unitClass === 'elf')) score += 2200 + this.enemyProfile.undead * 500;
        if (this.enemyProfile.summoners > 0 && (config.move >= 6 || config.maxRange >= 3 || config.abilities.includes('assault_troop'))) {
            score += 1300 + this.enemyProfile.summoners * 350;
        }
        if (this.enemyProfile.lowMagicDefense >= 2 && config.attackType === 'magic') score += 1000 + this.enemyProfile.lowMagicDefense * 220;
        return Math.min(score, 6200);
    }

    private scoreRecruitTerrainFit(unitClass: UnitClass): number {
        const config = UNIT_CONFIGS[unitClass];
        const total = Math.max(1, this.mapProfile.totalTiles);
        let score = 0;

        if (this.mapProfile.waterTiles / total >= 0.18) {
            if (config.abilities.includes('water_child')) score += 2200;
            if (config.abilities.includes('flying')) score += 1000;
        }
        if (this.mapProfile.mountainTiles / total >= 0.12 && config.abilities.includes('mountain_child')) score += 1600;
        if (this.mapProfile.forestTiles / total >= 0.12 && config.abilities.includes('forest_child')) score += 1400;
        if (this.mapProfile.bridgeTiles > 0 && (config.maxRange >= 3 || config.abilities.includes('flying'))) score += 950;
        return score;
    }

    private scoreRecruitDeployment(unitClass: UnitClass, castlePos: Position, deployPos: Position): number {
        const currentTurns = this.nearestObjectivePathTurnsForVirtual(unitClass, castlePos);
        const deployTurns = this.nearestObjectivePathTurnsForVirtual(unitClass, deployPos);
        let score = Math.max(0, currentTurns - deployTurns) * 450;
        score += this.scoreTerrainFit(unitClass, deployPos);
        if (this.maxIncomingDamageForClass(unitClass, deployPos) >= 100) score -= 1600;
        return score;
    }

    private scoreRecruitDiversity(unitClass: UnitClass, cost: number): number {
        const sameCount = this.ownUnits.filter(unit => unit.unitClass === unitClass).length;
        let score = 0;
        if (sameCount >= 3) score -= sameCount * 450;
        if (unitClass === 'dragon' && sameCount >= 1 && this.ownUnits.length < 8) score -= 1400;
        if (cost <= 400 && sameCount <= 1) score += 450;
        return score;
    }

    private getObjectiveTargetsForUnit(unit: Unit): ObjectiveTarget[] {
        const config = UNIT_CONFIGS[unit.unitClass];
        const targets: ObjectiveTarget[] = [];

        for (let y = 0; y < this.state.map.height; y += 1) {
            for (let x = 0; x < this.state.map.width; x += 1) {
                const pos = { x, y };
                const tile = this.state.map.tiles[y][x];
                const terrain = getTileTerrainConfig(tile);
                const unfriendly = this.isUnfriendlyOwner(tile.ownerId);
                if (!unfriendly) continue;

                if (terrain.key === 'castle') {
                    targets.push({
                        pos,
                        kind: 'castle',
                        priority: config.abilities.includes('castle_capturer') ? 3600 : 1200
                    });
                } else if (terrain.key === 'town') {
                    targets.push({
                        pos,
                        kind: 'town',
                        priority: config.abilities.includes('village_capturer') ? 2500 : 900
                    });
                }
            }
        }

        for (const enemy of this.enemyUnits) {
            targets.push({
                pos: enemy.pos,
                kind: 'unit',
                priority: isCommanderUnit(this.state, enemy) ? 3200 : Math.max(900, this.getUnitValue(enemy))
            });
        }

        if (config.abilities.includes('repairer')) {
            for (let y = 0; y < this.state.map.height; y += 1) {
                for (let x = 0; x < this.state.map.width; x += 1) {
                    const tile = this.state.map.tiles[y][x];
                    if (getTileTerrainKey(tile) === 'damaged_town' && (tile.ownerId === null || tile.ownerId === this.playerId)) {
                        targets.push({ pos: { x, y }, kind: 'damaged_town', priority: 1300 });
                    }
                }
            }
        }

        return targets.sort((left, right) => right.priority - left.priority).slice(0, 12);
    }

    private turnsToTarget(unit: Unit, from: Position, target: ObjectiveTarget): number | null {
        if (target.kind === 'unit') {
            return this.turnsToAttackTarget(unit, from, target.pos);
        }
        const cost = this.pathCost(unit, from, target.pos);
        if (cost === null) return null;
        return Math.ceil(cost / Math.max(1, getEffectiveStats(unit).move));
    }

    private turnsToAttackTarget(unit: Unit, from: Position, targetPos: Position): number | null {
        const stats = getEffectiveStats(unit);
        if (getDistance(from, targetPos) >= stats.minRange && getDistance(from, targetPos) <= stats.maxRange) return 0;

        const attackTiles = this.positionsWithinRange(targetPos, stats.minRange, stats.maxRange)
            .filter(pos => isWithinBounds(this.state, pos));
        const turns = this.nearestTurnsToPositions(unit, from, attackTiles);
        return turns;
    }

    private nearestTurnsToPositions(unit: Unit, from: Position, targets: readonly Position[]): number | null {
        let best: number | null = null;
        for (const target of targets) {
            const cost = this.pathCost(unit, from, target);
            if (cost === null) continue;
            const turns = Math.ceil(cost / Math.max(1, getEffectiveStats(unit).move));
            if (best === null || turns < best) best = turns;
        }
        return best;
    }

    private pathCost(unit: Unit, from: Position, target: Position): number | null {
        return this.pathfinder.cost(unit, from, target);
    }

    private maxIncomingDamage(unit: Unit, pos: Position): number {
        const key = `${unit.id}:${posKey(pos)}`;
        const cached = this.threatCache.get(key);
        if (cached !== undefined) return cached;

        const nearestEnemies = [...this.enemyUnits]
            .sort((left, right) => getDistance(left.pos, pos) - getDistance(right.pos, pos))
            .slice(0, 10);
        let maxDamage = 0;

        for (const enemy of nearestEnemies) {
            const positions = this.getReachableForThreat(enemy);
            for (const enemyPos of positions) {
                const stats = getEffectiveStats(enemy);
                const distance = getDistance(enemyPos, pos);
                if (distance < stats.minRange || distance > stats.maxRange) continue;
                maxDamage = Math.max(maxDamage, this.estimateDamageAt(enemy, enemyPos, unit, pos));
                if (maxDamage >= unit.hp) break;
            }
        }

        this.threatCache.set(key, maxDamage);
        return maxDamage;
    }

    private maxIncomingDamageForClass(unitClass: UnitClass, pos: Position): number {
        const virtual: Unit = {
            id: '__virtual_recruit__',
            ownerId: this.playerId,
            unitClass,
            pos,
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        return this.maxIncomingDamage(virtual, pos);
    }

    private getReachableForThreat(unit: Unit): Position[] {
        const key = `${unit.id}:threat`;
        const cached = this.reachableCache.get(key);
        if (cached) return cached;
        const positions = getReachablePositions(this.state, unit.id);
        this.reachableCache.set(key, positions);
        return positions;
    }

    private estimateDamageAt(attacker: Unit, attackerPos: Position, defender: Unit, defenderPos: Position): number {
        const cloned: GameState = JSON.parse(JSON.stringify(this.state));
        const clonedAttacker = cloned.units.find(unit => unit.id === attacker.id);
        let clonedDefender = cloned.units.find(unit => unit.id === defender.id);
        if (!clonedAttacker) return 0;
        if (!clonedDefender) {
            clonedDefender = { ...defender };
            cloned.units.push(clonedDefender);
        }
        clonedAttacker.pos = { ...attackerPos };
        clonedDefender.pos = { ...defenderPos };
        return calculateDamage(cloned, clonedAttacker.id, clonedDefender.id);
    }

    private getHealingTargets(unit: Unit): Position[] {
        const targets: Position[] = [];
        for (let y = 0; y < this.state.map.height; y += 1) {
            for (let x = 0; x < this.state.map.width; x += 1) {
                const tile = this.state.map.tiles[y][x];
                if (this.isUsefulRecoveryTileFor(unit, tile)) targets.push({ x, y });
            }
        }
        return targets;
    }

    private isUsefulRecoveryTileFor(unit: Unit, tile: ReturnType<RuleTacticalEvaluator['tileAt']>): boolean {
        if (!tile) return false;
        const ownerUseful = tile.ownerId === null || tile.ownerId === this.playerId || areAlliedPlayers(this.state, this.playerId, tile.ownerId);
        if (!ownerUseful) return false;
        return getTileHealPerTurn(tile) > 0
            || (isNegativeStatus(unit) && tileClearsNegativeStatusAtTurnStart(tile))
            || (hasAbility(unit, 'water_child') && isWaterTerrain(tile))
            || (hasAbility(unit, 'forest_child') && isForestTerrain(tile))
            || (hasAbility(unit, 'mountain_child') && isMountainTerrain(tile));
    }

    private scoreCleansingAuraAt(unit: Unit, pos: Position): number {
        let score = 0;
        for (const ally of this.ownUnits) {
            if (ally.id === unit.id || getDistance(pos, ally.pos) > 2) continue;
            if (isUndead(ally)) {
                score -= 1600;
                continue;
            }
            const missingHp = Math.max(0, getEffectiveStats(ally).maxHp - ally.hp);
            if (missingHp > 0) score += 650 + missingHp * 18;
            if (isNegativeStatus(ally)) score += 2200;
        }
        return score;
    }

    private scoreAttackAuraAt(unit: Unit, pos: Position): number {
        let score = 0;
        for (const ally of this.ownUnits) {
            if (ally.id === unit.id || getDistance(pos, ally.pos) > 2 || ally.status) continue;
            const canStillAct = !ally.hasActed;
            score += canStillAct ? 900 + getEffectiveStats(ally).attack * 12 : 300;
        }
        return score;
    }

    private scoreWeaknessAuraAt(unit: Unit, pos: Position): number {
        let score = 0;
        for (const enemy of this.enemyUnits) {
            if (getDistance(pos, enemy.pos) > 2 || enemy.status || hasAbility(enemy, 'weakness_aura')) continue;
            score += 1300 + this.getUnitValue(enemy) * 0.6;
        }
        return score;
    }

    private scoreSummonerPosition(unit: Unit, pos: Position): number {
        const graves = this.state.graves ?? [];
        if (graves.length === 0) return 0;
        let score = 0;
        for (const grave of graves) {
            const before = getDistance(unit.pos, grave.pos);
            const after = getDistance(pos, grave.pos);
            if (after <= 2) score += 2600;
            score += Math.max(0, before - after) * 900;
        }
        return score;
    }

    private scoreHealerPosition(unit: Unit, pos: Position): number {
        let score = 0;
        const paladinOverheal = unit.unitClass === 'paladin' && !this.canAnyEnemyBeAttackedFrom(unit, pos);
        for (const ally of this.ownUnits) {
            if (ally.id === unit.id) continue;
            const missingHp = Math.max(0, getEffectiveStats(ally).maxHp - ally.hp);
            if (missingHp <= 0 && !isNegativeStatus(ally) && !paladinOverheal) continue;
            const before = getDistance(unit.pos, ally.pos);
            const after = getDistance(pos, ally.pos);
            if (after <= 1) score += (paladinOverheal ? 3600 : 1800) + missingHp * 20;
            score += Math.max(0, before - after) * 500;
        }
        return score;
    }

    private scoreSupporterPosition(unit: Unit, pos: Position): number {
        let score = 0;
        for (const ally of this.ownUnits) {
            if (ally.id === unit.id || !ally.hasActed || ally.hasBeenSupportedThisTurn) continue;
            const before = getDistance(unit.pos, ally.pos);
            const after = getDistance(pos, ally.pos);
            if (after <= 2) score += 1500 + this.getUnitValue(ally);
            score += Math.max(0, before - after) * 420;
        }
        return score;
    }

    private scoreDestroyerPosition(unit: Unit, pos: Position): number {
        const towns = this.enemyBuildingPositions('town');
        if (towns.length === 0) return 0;
        const before = this.nearestTurnsToPositions(unit, unit.pos, towns);
        const after = this.nearestTurnsToPositions(unit, pos, towns);
        if (before === null || after === null) return 0;
        return Math.max(0, before - after) * 1200 + (after <= 1 ? 1600 : 0);
    }

    private nearestObjectivePathTurnsForVirtual(unitClass: UnitClass, from: Position): number {
        const virtual: Unit = {
            id: `__virtual_${unitClass}_${posKey(from)}__`,
            ownerId: this.playerId,
            unitClass,
            pos: from,
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        const targets = this.getObjectiveTargetsForUnit(virtual);
        const turns = targets
            .map(target => this.turnsToTarget(virtual, from, target))
            .filter((value): value is number => value !== null);
        return turns.length > 0 ? Math.min(...turns) : 99;
    }

    private canAnyEnemyBeAttackedFrom(unit: Unit, pos: Position): boolean {
        const stats = getEffectiveStats(unit);
        return this.enemyUnits.some(enemy => {
            const distance = getDistance(pos, enemy.pos);
            return distance >= stats.minRange && distance <= stats.maxRange;
        });
    }

    private getHealAmount(healer: Unit): number {
        const level = healer.level ?? 0;
        return healer.unitClass === 'paladin' ? 40 + level * 10 : 40;
    }

    private canAlliedCaptureTownThisTurn(pos: Position, ignoredUnitId?: string): boolean {
        const tile = this.tileAt(pos);
        if (!tile || getTileTerrainKey(tile) !== 'town' || !this.isUnfriendlyOwner(tile.ownerId)) return false;

        return this.ownUnits.some(unit => {
            if (unit.id === ignoredUnitId || unit.hasActed || !hasAbility(unit, 'village_capturer')) return false;
            if (samePos(unit.pos, pos)) return true;
            if (unit.hasMoved) return false;
            const cost = this.pathCost(unit, unit.pos, pos);
            return cost !== null && cost <= getEffectiveStats(unit).move;
        });
    }

    private positionsWithinRange(center: Position, minRange: number, maxRange: number): Position[] {
        const positions: Position[] = [];
        for (let y = center.y - maxRange; y <= center.y + maxRange; y += 1) {
            for (let x = center.x - maxRange; x <= center.x + maxRange; x += 1) {
                const pos = { x, y };
                const distance = getDistance(center, pos);
                if (distance >= minRange && distance <= maxRange) positions.push(pos);
            }
        }
        return positions;
    }

    private buildUnitProfile(units: readonly Unit[]): UnitProfile {
        const profile: UnitProfile = {
            capturers: 0,
            castleCapturers: 0,
            healers: 0,
            supporters: 0,
            summoners: 0,
            destroyers: 0,
            ranged: 0,
            magic: 0,
            physical: 0,
            antiAir: 0,
            durablePhysical: 0,
            fast: 0,
            flying: 0
        };

        for (const unit of units) {
            const config = UNIT_CONFIGS[unit.unitClass];
            if (config.abilities.includes('village_capturer')) profile.capturers += 1;
            if (config.abilities.includes('castle_capturer')) profile.castleCapturers += 1;
            if (config.abilities.includes('healer')) profile.healers += 1;
            if (config.abilities.includes('supporter')) profile.supporters += 1;
            if (config.abilities.includes('summoner')) profile.summoners += 1;
            if (config.abilities.includes('destroyer')) profile.destroyers += 1;
            if (config.maxRange >= 2) profile.ranged += 1;
            if (config.attackType === 'magic') profile.magic += 1;
            if (config.attackType === 'physical') profile.physical += 1;
            if (config.abilities.includes('sharpshooter')) profile.antiAir += 1;
            if (config.physicalDefense >= 25) profile.durablePhysical += 1;
            if (config.move >= 6) profile.fast += 1;
            if (config.abilities.includes('flying')) profile.flying += 1;
        }

        return profile;
    }

    private buildEnemyProfile(units: readonly Unit[]): EnemyProfile {
        const profile = this.buildUnitProfile(units) as EnemyProfile;
        profile.undead = 0;
        profile.lowMagicDefense = 0;
        profile.physicalAttackers = 0;
        profile.magicAttackers = 0;
        profile.dragons = 0;
        profile.slimes = 0;

        for (const unit of units) {
            const config = UNIT_CONFIGS[unit.unitClass];
            if (config.abilities.includes('undead')) profile.undead += 1;
            if (config.magicDefense <= 0) profile.lowMagicDefense += 1;
            if (config.attackType === 'physical' && config.attack > 0) profile.physicalAttackers += 1;
            if (config.attackType === 'magic' && config.attack > 0) profile.magicAttackers += 1;
            if (unit.unitClass === 'dragon') profile.dragons += 1;
            if (unit.unitClass === 'slime') profile.slimes += 1;
        }

        return profile;
    }

    private buildMapProfile(): MapProfile {
        const profile: MapProfile = {
            waterTiles: 0,
            forestTiles: 0,
            mountainTiles: 0,
            bridgeTiles: 0,
            healingTiles: 0,
            totalTiles: this.state.map.width * this.state.map.height
        };

        for (const row of this.state.map.tiles) {
            for (const tile of row) {
                if (isWaterTerrain(tile)) profile.waterTiles += 1;
                if (isForestTerrain(tile)) profile.forestTiles += 1;
                if (isMountainTerrain(tile)) profile.mountainTiles += 1;
                if (getTileTerrainKey(tile) === 'bridge') profile.bridgeTiles += 1;
                if (getTileHealPerTurn(tile) > 0) profile.healingTiles += 1;
            }
        }

        return profile;
    }

    private remainingUnitSlots(): number | null {
        const rules = getRuleConfig(this.state);
        const teamRules = getTeamRuleConfig(this.state, this.playerId);
        const limit = teamRules.unitLimit ?? rules.unitLimit;
        return limit === undefined ? null : Math.max(0, limit - getCurrentUnitCount(this.state, this.playerId));
    }

    private remainingPopulation(): number | null {
        const rules = getRuleConfig(this.state);
        const teamRules = getTeamRuleConfig(this.state, this.playerId);
        const limit = teamRules.populationLimit ?? rules.populationLimit;
        return limit === undefined ? null : Math.max(0, limit - getCurrentPopulation(this.state, this.playerId));
    }

    private woundedAllyCount(): number {
        return this.ownUnits.filter(unit => unit.hp < getEffectiveStats(unit).maxHp || isNegativeStatus(unit)).length;
    }

    private isCleanupMode(): boolean {
        const ownValue = this.ownUnits.reduce((sum, unit) => sum + this.getUnitValue(unit) * unit.hp / Math.max(1, getEffectiveStats(unit).maxHp), 0);
        const enemyValue = this.enemyUnits.reduce((sum, unit) => sum + this.getUnitValue(unit) * unit.hp / Math.max(1, getEffectiveStats(unit).maxHp), 0);
        return this.enemyUnits.length <= 4 || ownValue > enemyValue * 1.8 + 900;
    }

    private hasUnresolvedEnemyBuildings(): boolean {
        return this.enemyBuildingCount('castle') + this.enemyBuildingCount('town') > 0;
    }

    private enemyBuildingCount(kind: 'castle' | 'town'): number {
        return this.enemyBuildingPositions(kind).length;
    }

    private enemyBuildingPositions(kind: 'castle' | 'town'): Position[] {
        const positions: Position[] = [];
        for (let y = 0; y < this.state.map.height; y += 1) {
            for (let x = 0; x < this.state.map.width; x += 1) {
                const tile = this.state.map.tiles[y][x];
                if (getTileTerrainKey(tile) === kind && this.isUnfriendlyOwner(tile.ownerId)) {
                    positions.push({ x, y });
                }
            }
        }
        return positions;
    }

    private countEnemyOwnedCastles(): number {
        return this.enemyBuildingCount('castle');
    }

    private nearestEnemyDistance(pos: Position): number {
        if (this.enemyUnits.length === 0) return 99;
        return Math.min(...this.enemyUnits.map(unit => getDistance(pos, unit.pos)));
    }

    private nearestAllyDistance(unit: Unit, pos: Position): number | null {
        const distances = this.ownUnits
            .filter(ally => ally.id !== unit.id)
            .map(ally => getDistance(pos, ally.pos));
        return distances.length > 0 ? Math.min(...distances) : null;
    }

    private nearestObjectiveDistance(pos: Position): number {
        const positions = [
            ...this.enemyBuildingPositions('castle'),
            ...this.enemyBuildingPositions('town'),
            ...this.enemyUnits.map(unit => unit.pos)
        ];
        if (positions.length === 0) return 99;
        return Math.min(...positions.map(target => getDistance(pos, target)));
    }

    private isRangedUnit(unit: Unit): boolean {
        return getEffectiveStats(unit).maxRange >= 2;
    }

    private isBridgeOrChoke(pos: Position): boolean {
        const tile = this.tileAt(pos);
        if (!tile) return false;
        if (getTileTerrainKey(tile) === 'bridge') return true;
        const passableNeighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]]
            .map(([dx, dy]) => ({ x: pos.x + dx, y: pos.y + dy }))
            .filter(next => isWithinBounds(this.state, next))
            .filter(next => getTileTerrainConfig(this.state.map.tiles[next.y][next.x]).moveCost <= 2)
            .length;
        return passableNeighbors <= 2 && this.nearestObjectiveDistance(pos) <= 8;
    }

    private isGuardingCriticalCastle(unit: Unit): boolean {
        return this.isGuardingCriticalCastleAt(unit, unit.pos);
    }

    private isGuardingCriticalCastleAt(unit: Unit, pos: Position): boolean {
        const tile = this.tileAt(pos);
        if (!tile || tile.ownerId !== this.playerId || getTileTerrainKey(tile) !== 'castle') return false;
        return this.enemyUnits.some(enemy => (
            isCommanderUnit(this.state, enemy, enemy.ownerId)
            && getReachablePositions(this.state, enemy.id).some(reachable => samePos(reachable, pos))
            && unit.ownerId === this.playerId
        ));
    }

    private isUnfriendlyOwner(ownerId: number | null): boolean {
        return ownerId === null || getAllianceId(this.state, ownerId) !== getAllianceId(this.state, this.playerId);
    }

    private tileAt(pos: Position) {
        return this.state.map.tiles[pos.y]?.[pos.x] ?? null;
    }

    private getUnit(unitId: string): Unit | undefined {
        return this.state.units.find(unit => unit.id === unitId && unit.hp > 0);
    }

    private getUnitValue(unit: Unit): number {
        const cached = this.unitValueCache.get(unit.id);
        if (cached !== undefined) return cached;
        const value = getUnitCost(this.state, unit.ownerId, unit.unitClass) ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
        this.unitValueCache.set(unit.id, value);
        return value;
    }
}
