/**
 * 困难补丁 Java 回退专用评分。来源为补丁 DEX `c.a.b.c.j.b`。
 * 普通版源码级移植的固有限制仍在；公共规则计算继续复用项目权威函数。
 */
/**
 * OriginalApkLikeHardNativeAI 评分层（C1275a 源码级移植）
 *
 * 目标：把 APK `C1275a` 的动作评分、位置评分、单位价值、治疗/支援/攻击估值
 * 按反编译源码逐条翻译到项目状态上，而不是复用 `HeuristicAI` 的评分。
 *
 * 重要边界：
 * 1. 本文件只移植“AI 如何估值”，伤害、移动、状态、反击仍使用项目权威引擎
 *    （`calculateDamage` / `estimateCounterDamage` / `getReachablePositions`），
 *    不另写一套规则。
 * 2. APK `C1275a` 在 Java 侧使用 `C0613f` 单位拷贝和 `m4339b` 伤害估算；项目没有
 *    完全相同的单位拷贝对象，因此这里用“只投影一个单位位置”的浅拷贝状态来调用
 *    项目规则。这是已知差异，详见 docs/rules/original-apk-ai.md。
 * 3. 任何常量、取整顺序都尽量保持 Java 的整数语义（`Math.trunc`），避免 JS 浮点
 *    把 APK 的整数除法算出不同档位。
 */

import { Ability, Action, GameState, Position, Unit, UnitClass } from '../types';
import { UNIT_CONFIGS } from '../constants';
import { APK_UNIT_CLASS_TO_ID } from '../apk_compat';
import { getEffectiveStats, getDefenseBonus, hasAbility } from '../abilities';
import {
    areAlliedPlayers,
    areEnemyPlayers,
    getRecruitableUnits,
    getNumericRule,
    getUnitCost,
    isCommanderUnit,
} from '../rule_config';
import { calculateDamage, estimateCounterDamage } from '../rules';
import { getDistance, getReachablePositions } from '../map';
import {
    getTileDefenseBonus,
    getTileHealPerTurn,
    getTileTerrainKey,
    isTileDestroyableForRules,
    tileHasTerrainTag,
} from '../terrain_rules';

export type ApkActionKind =
    | 'STANDBY'
    | 'ATTACK'
    | 'HEAL'
    | 'SUMMON'
    | 'SUPPORT'
    | 'OCCUPY'
    | 'REPAIR'
    | 'DESTROY';

export interface ApkActionCandidate {
    kind: ApkActionKind;
    moveTo: Position;
    targetUnitId?: string;
    targetPos?: Position;
    graveId?: string;
    spawnPos?: Position;
    /** APK `m2372a`：治疗目标与移动终点相同，视为自疗，不作为“真实动作”。 */
    isSelfHeal?: boolean;
    /** APK `m2370a` 计算出的突击部队攻击后移动终点。 */
    postMoveTo?: Position;
}

export interface ApkScoringContext {
    state: GameState;
    playerId: number;
    /** APK `f3107r`：`call()` 统计的非 0/5 状态队伍数（包含自己）。 */
    activePlayerCount: number;
    /** APK `f3108s`：可招募单位价格均值。 */
    avgCost: number;
    /**
     * APK `f3104o`：被敌方单位本回合威胁到的己方城堡/村庄。
     * 注意：这不是“我方可以占领的格子”，而是 `m2336l` 的威胁图。
     */
    threatenedTiles: Set<string>;
    /** APK `f3105p`：能到达上述己方城堡/村庄的敌方单位位置。 */
    threatSourcePositions: Set<string>;
    /** APK `f3106q`：能到达己方城堡的敌方城堡占领单位计数。 */
    threateningCastleCaptors: number;
    /** APK `f3099j`：全地图村庄数量，用于 `m2341j` 招募上限。 */
    villageCount: number;
    /** APK `f3110u`：村庄包围盒内的水域比例。 */
    waterRatio: number;
    /** APK `f3109t`：村庄包围盒内的开阔陆地比例。 */
    openLandRatio: number;
    valueCache: Map<string, number>;
    combatCache: Map<string, number>;
}

export function posKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

export function samePos(a: Position, b: Position): boolean {
    return a.x === b.x && a.y === b.y;
}

export function unitAt(state: GameState, pos: Position): Unit | undefined {
    return state.units.find(unit => unit.pos.x === pos.x && unit.pos.y === pos.y && unit.hp > 0);
}

export function tileAt(state: GameState, pos: Position) {
    return state.map.tiles[pos.y]?.[pos.x];
}

/** APK `C0619b.f1369b` 地形类别：1 山、2 森林、3 城堡、4 村庄，其余 0。 */
export function apkTerrainKind(state: GameState, pos: Position): number {
    const tile = tileAt(state, pos);
    if (!tile) return 0;
    if (tile.apkTerrainKind !== undefined) return tile.apkTerrainKind;
    const key = getTileTerrainKey(tile);
    if (key === 'castle') return 3;
    // 损坏城镇不是可占领村庄；APK 的 kind 4 只对应正常村庄。
    if (key === 'town') return 4;
    if (key === 'mountain' || key === 'hill') return 1;
    if (key === 'forest') return 2;
    return 0;
}

/** APK `C0619b.f1368a`：是否陆地。 */
export function apkTerrainIsLand(state: GameState, pos: Position): boolean {
    const tile = tileAt(state, pos);
    if (!tile) return false;
    return tile.apkTerrainIsLand ?? tileHasTerrainTag(tile, 'land');
}

export function apkIsCastle(state: GameState, pos: Position): boolean {
    const tile = tileAt(state, pos);
    return tile ? getTileTerrainKey(tile) === 'castle' : false;
}

export function apkIsVillage(state: GameState, pos: Position): boolean {
    const tile = tileAt(state, pos);
    if (!tile) return false;
    // 以项目地形键为准，避免把 damaged_town 误当成可占领村庄。
    return getTileTerrainKey(tile) === 'town';
}

export function apkIsCapturable(state: GameState, pos: Position): boolean {
    const tile = tileAt(state, pos);
    if (!tile) return false;
    const key = getTileTerrainKey(tile);
    return key === 'castle' || key === 'town';
}

function isOwnCastle(state: GameState, playerId: number, pos: Position): boolean {
    const tile = tileAt(state, pos);
    return apkIsCastle(state, pos) && tile?.ownerId === playerId;
}

function isOwnVillage(state: GameState, playerId: number, pos: Position): boolean {
    const tile = tileAt(state, pos);
    return apkIsVillage(state, pos) && tile?.ownerId === playerId;
}

export function apkIsOwnCastle(ctx: ApkScoringContext, pos: Position): boolean {
    return isOwnCastle(ctx.state, ctx.playerId, pos);
}

export function apkIsOwnVillage(ctx: ApkScoringContext, pos: Position): boolean {
    return isOwnVillage(ctx.state, ctx.playerId, pos);
}

export function apkIsEnemyCastle(ctx: ApkScoringContext, pos: Position): boolean {
    const tile = tileAt(ctx.state, pos);
    return apkIsCastle(ctx.state, pos)
        && tile?.ownerId !== null
        && tile?.ownerId !== undefined
        && areEnemyPlayers(ctx.state, tile.ownerId, ctx.playerId);
}

export function apkIsHealingTile(state: GameState, pos: Position): boolean {
    const tile = tileAt(state, pos);
    return tile ? getTileHealPerTurn(tile) > 0 : false;
}

export function apkIsRepairableTile(state: GameState, pos: Position): boolean {
    const tile = tileAt(state, pos);
    if (!tile) return false;
    return getTileTerrainKey(tile) === 'damaged_town' || tileHasTerrainTag(tile, 'repairable');
}

export function apkIsDestroyableTile(state: GameState, pos: Position): boolean {
    const tile = tileAt(state, pos);
    return tile ? isTileDestroyableForRules(tile) : false;
}

/** APK `m4252z` 移动力；被虚弱时固定 1。 */
export function apkMoveRange(unit: Unit): number {
    return getEffectiveStats(unit).move;
}

/** APK `m4257u` / `m4258t` 射程；致盲时项目 `getEffectiveStats` 已归零。 */
export function apkAttackRange(unit: Unit): { min: number; max: number } {
    const stats = getEffectiveStats(unit);
    return { min: stats.minRange, max: stats.maxRange };
}

/** APK 单位类型 ID：优先使用 .aem 原始 ID，否则按项目兵种映射。 */
export function apkUnitTypeId(unit: Unit): number {
    if (unit.apkUnitId !== undefined && Number.isInteger(unit.apkUnitId)) return unit.apkUnitId;
    return APK_UNIT_CLASS_TO_ID[unit.unitClass] ?? -1;
}

export function apkUnitCost(state: GameState, ownerId: number, unit: Unit): number {
    const cost = getUnitCost(state, ownerId, unit.unitClass);
    if (cost !== null) return cost;
    const base = UNIT_CONFIGS[unit.unitClass].cost;
    // APK 指挥官基础价格为 400；召唤物/水晶为 0，但估值下限在 m2337k 中另有限制。
    if (unit.unitClass === 'commander') return 400;
    return base ?? 0;
}

function unitMaxHp(unit: Unit): number {
    return getEffectiveStats(unit).maxHp;
}

function unitAttack(unit: Unit): number {
    return getEffectiveStats(unit).attack;
}

/** APK `m4264p` / `C0620c.f1381c` 元素类型：项目用 attackType 近似。 */
function attackElement(unit: Unit): 'physical' | 'magic' {
    return UNIT_CONFIGS[unit.unitClass].attackType;
}

/** 针对该攻击者时，防御方实际参与伤害计算的基础防御（APK `m4266o + m4320d`）。 */
export function apkDefenseAgainst(defender: Unit, attacker: Unit): number {
    const stats = getEffectiveStats(defender);
    return attackElement(attacker) === 'magic' ? stats.magicDefense : stats.physicalDefense;
}

/** APK `m2337k` 单位价值。 */
export function apkUnitValue(ctx: ApkScoringContext, unit: Unit): number {
    const cacheKey = `${unit.id}:${unit.pos.x},${unit.pos.y}`;
    const cached = ctx.valueCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const level = unit.level ?? 0;
    let value = Math.trunc((Math.max(150, apkUnitCost(ctx.state, unit.ownerId, unit)) * (level + 3)) / 3);
    // APK m2337k：敌方单位站在“我方城堡”上时额外 +5000。
    if (areEnemyPlayers(ctx.state, unit.ownerId, ctx.playerId) && apkIsOwnCastle(ctx, unit.pos)) {
        value += 5000;
    }
    if (apkUnitTypeId(unit) === 9) {
        value += 200 + level * 100;
    }
    // APK m4407b 的脚本 tagged 单位；项目以 apkTargeted 作为可用近似。
    if (unit.apkTargeted) value += 5000;

    ctx.valueCache.set(cacheKey, value);
    return value;
}

/** APK `m2340j` 战斗价值。 */
export function apkCombatValue(ctx: ApkScoringContext, unit: Unit): number {
    const cached = ctx.combatCache.get(unit.id);
    if (cached !== undefined) return cached;

    const level = unit.level ?? 0;
    let attack = unitAttack(unit) - 20;
    if (hasAbility(unit, 'fighting_spirit')) attack += level * 10 + 20;
    if (hasAbility(unit, 'summoner')) attack += level * 15 + 15;
    if (hasAbility(unit, 'healer') || hasAbility(unit, 'cleansing_aura')) attack += level * 5 + 15;
    if (hasAbility(unit, 'melee_master')) attack += level * 5 + 10;
    if (
        hasAbility(unit, 'sharpshooter')
        || hasAbility(unit, 'water_child')
        || hasAbility(unit, 'mountain_child')
        || hasAbility(unit, 'forest_child')
    ) {
        attack += 5;
    }
    const value = Math.trunc((attack * unit.hp) / Math.max(1, unitMaxHp(unit)));
    ctx.combatCache.set(unit.id, value);
    return value;
}

/** APK `m2346h` 位置价值。项目没有 blindResist 字段，按 0 处理。 */
export function apkPositionValue(unit: Unit): number {
    let bonus = 0;
    if (hasAbility(unit, 'flying')) bonus = 2;
    else if (hasAbility(unit, 'earth_child')) bonus = 1;
    // APK `m2346h`：`(moveRange - 2) + maxRange + 地形之子的 1 / 飞行的 2`。
    return (apkMoveRange(unit) - 2) + getEffectiveStats(unit).maxRange + bonus;
}

/** APK `m4312e` 治疗量：治疗亡灵时变为 1.5 倍伤害。 */
export function apkHealAmount(healer: Unit, target: Unit): number {
    const raw = 40 + (healer.level ?? 0) * 10;
    return hasAbility(target, 'undead') ? -Math.trunc((raw * 3) / 2) : raw;
}

/** APK `m2363b` 治疗价值。 */
export function apkHealValue(ctx: ApkScoringContext, healer: Unit, target: Unit): number {
    const maxHp = unitMaxHp(target);
    if (hasAbility(target, 'healer') && target.hp <= Math.trunc(maxHp / 2)) return 0;

    const heal = apkHealAmount(healer, target);
    // Java 整数除法：先算 attack*hp/max，再与位置价值相加后除以 5。
    const attackPart = Math.trunc((unitAttack(target) * target.hp) / Math.max(1, maxHp));
    let unitScore = Math.trunc((attackPart + apkPositionValue(target) * 5) / 5);
    if (apkIsOwnCommander(ctx, target) && target.hp < Math.trunc(maxHp / 2)) {
        unitScore = Math.trunc(unitScore * 1.5);
    }

    let castleBonus = 0;
    if (apkIsOwnCastle(ctx, target.pos) && ctx.threatenedTiles.has(posKey(target.pos))) {
        castleBonus = 5000;
    }

    // APK `m2363b` 使用 `m4274l(type, this.f1201b)`，即 AI 自己队伍的价格表。
    const hpDeficit = Math.trunc(((target.hp - maxHp) / Math.max(1, maxHp)) * apkUnitCost(ctx.state, ctx.playerId, target) * 2);
    return heal * unitScore + castleBonus + hpDeficit;
}

function apkIsOwnCommander(ctx: ApkScoringContext, unit: Unit): boolean {
    return isCommanderUnit(ctx.state, unit, ctx.playerId) && unit.ownerId === ctx.playerId;
}

function apkCanCommand(ctx: ApkScoringContext, unit: Unit): boolean {
    return isCommanderUnit(ctx.state, unit, ctx.playerId) && unit.ownerId === ctx.playerId;
}

/** APK `m4328c` 在目标无状态时会附加的中毒/致盲。 */
function statusApplication(source: Unit, target: Unit): { poison: boolean; blind: boolean } {
    if (target.status) return { poison: false, blind: false };
    // APK `m4328c` 先施毒、后致盲；`m4358a(z=false)` 只在目标仍为 NONE 时写入，
    // 因此两者同时具备时实际只会附加中毒。
    if (hasAbility(source, 'poisoner') && !hasAbility(target, 'poisoner')) {
        return { poison: true, blind: false };
    }
    return {
        poison: false,
        blind: hasAbility(source, 'blinder') && !hasAbility(target, 'blinder'),
    };
}

function projectUnitAt(state: GameState, unitId: string, pos: Position): GameState {
    return {
        ...state,
        units: state.units.map(unit => (
            unit.id === unitId ? { ...unit, pos: { ...pos } } : unit
        )),
    };
}

export interface ApkAttackScore {
    score: number;
    targetDies: boolean;
    attackerDies: boolean;
}

/**
 * APK `m2369a` 攻击评分。
 *
 * 与 APK 的差异：伤害与反击使用项目 `calculateDamage` / `estimateCounterDamage`，
 * 因为项目规则已按 APK 反编译逐项对齐，并且必须复用权威引擎；APK 侧是
 * `m4339b` 单位拷贝模拟。
 */
export function apkAttackScore(
    ctx: ApkScoringContext,
    attacker: Unit,
    moveTo: Position,
    target: Unit,
): ApkAttackScore {
    const projected = projectUnitAt(ctx.state, attacker.id, moveTo);
    const damage = calculateDamage(projected, attacker.id, target.id);
    const targetHpAfter = target.hp - damage;
    const targetValue = apkUnitValue(ctx, target);
    const baseDamageValue = Math.trunc((damage * targetValue) / 20);
    const damageValue = apkHardAttackDamageScore(ctx, { ...attacker, pos: moveTo }, target, baseDamageValue);

    let killValue = 0;
    if (targetHpAfter <= 0) {
        killValue = Math.trunc((targetValue * 10) / 4);
        if (apkUnitTypeId(target) === 9) killValue += (target.level ?? 0) * 200;
        if (target.apkTargeted) killValue += 1000;
        if (hasAbility(target, 'healer')) killValue += (target.level ?? 0) * 100;
        if (hasAbility(target, 'cleansing_aura')) killValue += (target.level ?? 0) * 150;
        if (hasAbility(target, 'supporter')) killValue += (target.level ?? 0) * 200;
    }

    const doubled = ctx.threatSourcePositions.has(posKey(target.pos)) ? 2 : 1;
    let score = (damageValue + killValue) * doubled;

    const applied = statusApplication(attacker, target);
    if (applied.poison) {
        score += hasAbility(target, 'undead') ? -Math.trunc(targetValue / 4) : Math.trunc(targetValue / 4);
    }
    if (applied.blind) {
        score += Math.trunc(targetValue / 2);
    }

    const attackerValue = apkUnitValue(ctx, attacker);
    let attackerDies = false;
    const counter = estimateCounterDamage(projected, attacker.id, target.id);
    if (targetHpAfter > 0 && counter > 0) {
        const dies = counter >= attacker.hp;
        const penalty = apkUnitTypeId(attacker) === 9
            ? (dies ? attackerValue * 20 : Math.trunc((counter * attackerValue) / 10))
            : (dies ? attackerValue * 10 : Math.trunc((counter * attackerValue) / 20));
        score -= penalty;
        attackerDies = dies;

        const counterStatus = statusApplication(target, attacker);
        if (counterStatus.poison) {
            score += hasAbility(attacker, 'undead')
                ? Math.trunc(attackerValue / 4)
                : -Math.trunc(attackerValue / 4);
        }
        if (counterStatus.blind) {
            score -= Math.trunc(attackerValue / 2);
        }
    }

    if (apkIsRepairableTile(ctx.state, target.pos) && hasAbility(target, 'repairer')) {
        score += Math.trunc(targetValue / 4);
    }
    if (hasAbility(attacker, 'summoner') && killValue === 0) {
        score -= 200;
    }
    return { score, targetDies: targetHpAfter <= 0, attackerDies };
}

/** APK `m2371a` 动作分。位置分由调用方另加。 */
export function apkActionScore(
    ctx: ApkScoringContext,
    unit: Unit,
    candidate: ApkActionCandidate,
    target: Unit | undefined,
): number {
    switch (candidate.kind) {
        case 'OCCUPY': {
            const kind = apkTerrainKind(ctx.state, candidate.moveTo);
            // APK 源码 switch 在城堡分支存在 JADX 展示歧义；按项目既有反编译报告采用
            // 城堡 10000、村庄 15000（村庄 = 城堡 + 5000）。
            if (kind === 3) return 10000;
            if (kind === 4) return 15000;
            return 0;
        }
        case 'REPAIR':
            return 2500;
        case 'SUMMON':
            return 500;
        case 'HEAL': {
            if (!target) return 0;
            let heal = apkHealValue(ctx, unit, target);
            if (target.hasActed) heal = Math.trunc(heal * 1.2);
            if (samePos(candidate.moveTo, target.pos)) {
                return target.hp > Math.trunc(unitMaxHp(target) / 2) ? -50 : heal + 50;
            }
            if (!areEnemyPlayers(ctx.state, unit.ownerId, target.ownerId)) {
                return heal + 50;
            }
            // 对亡灵“治疗”是伤害，APK 在敌方分支按 +heal 计（heal 已为负）。
            return heal;
        }
        case 'ATTACK': {
            if (!target) {
                // APK 对无单位目标仅在自己村庄上返回 1000；普通可摧毁地形为 0。
                const tile = tileAt(ctx.state, candidate.targetPos ?? candidate.moveTo);
                return tile?.ownerId === ctx.playerId && apkIsVillage(ctx.state, candidate.targetPos ?? candidate.moveTo)
                    ? 1000
                    : 0;
            }
            if (!areEnemyPlayers(ctx.state, unit.ownerId, target.ownerId)) return 0;
            const attack = apkAttackScore(ctx, unit, candidate.moveTo, target);
            return attack.score + Math.trunc(apkUnitValue(ctx, target) / 50);
        }
        case 'SUPPORT':
            // 支援需要目标完整候选枚举，由决策层 apkHardSupportActionScore 负责。
            return 0;
        case 'DESTROY':
            return 0;
        case 'STANDBY':
        default:
            return 0;
    }
}

function averageDistance(state: GameState, pos: Position, predicate: (unit: Unit) => boolean): number {
    let count = 0;
    let total = 0;
    for (const unit of state.units) {
        if (unit.hp <= 0 || !predicate(unit)) continue;
        count += 1;
        total += getDistance(unit.pos, pos);
    }
    return count === 0 ? 999 : Math.trunc(total / count);
}

/** 补丁 `h(pos)-g(pos)`：敌方平均距离减盟友平均距离，空集合按 999。 */
export function apkHardDistanceDifference(ctx: ApkScoringContext, pos: Position): number {
    const ally = averageDistance(ctx.state, pos, unit => areAlliedPlayers(ctx.state, unit.ownerId, ctx.playerId));
    const enemy = averageDistance(ctx.state, pos, unit => areEnemyPlayers(ctx.state, unit.ownerId, ctx.playerId));
    return enemy - ally;
}

/** 补丁只允许生命大于五十且未致盲的单位因真实动作抑制目标距离奖励。 */
export function apkHardHasRealAction(unit: Unit, candidates: ApkActionCandidate[]): boolean {
    return unit.hp > 50 && unit.status?.type !== 'blinded'
        && candidates.some(candidate => candidate.kind !== 'STANDBY' && !candidate.isSelfHeal);
}

/** 补丁 `attackDamageScore`：只调整伤害分，之后才叠加击杀奖励和反击风险。 */
export function apkHardAttackDamageScore(
    ctx: ApkScoringContext,
    attacker: Unit,
    target: Unit,
    baseDamageValue: number,
): number {
    const distanceFactor = 1 + Math.min(2, Math.max(-2, apkHardDistanceDifference(ctx, target.pos))) / 10;
    const healthFactor = 1 + Math.max(100 - target.hp, -50) / 100;
    const targetTile = tileAt(ctx.state, target.pos);
    const tileDefense = targetTile && !hasAbility(target, 'flying') ? getTileDefenseBonus(targetTile) : 0;
    const distance = getDistance(attacker.pos, target.pos);
    const weakenedPenalty = distance > 1
        ? Math.trunc(getNumericRule(ctx.state, 'weakenedDefensePenalty') / 2)
        : getNumericRule(ctx.state, 'weakenedDefensePenalty');
    const statusAdjustment = target.status?.type === 'weakened' ? 10 - weakenedPenalty : 0;
    const defense = apkDefenseAgainst(target, attacker) + statusAdjustment
        + tileDefense + getDefenseBonus(ctx.state, attacker, target);
    return Math.trunc(baseDamageValue * distanceFactor * healthFactor * (1 + defense / 100));
}

/** 补丁 `moveDistanceScore`：待机使用截断距离差，其他动作使用固定 1。 */
export function apkHardMoveDistanceScore(ctx: ApkScoringContext, unit: Unit, candidate: ApkActionCandidate): number {
    const difference = candidate.kind === 'STANDBY'
        ? Math.min(4, Math.max(-4, apkHardDistanceDifference(ctx, candidate.moveTo)))
        : 1;
    const moved = { ...unit, pos: candidate.moveTo };
    const tile = tileAt(ctx.state, candidate.moveTo);
    const defense = tile && !hasAbility(unit, 'flying') ? getTileDefenseBonus(tile) : 0;
    return Math.trunc(((difference * 5 + defense) * apkUnitValue(ctx, moved)) / 100);
}

/**
 * APK `m2367a` 位置评分。
 *
 * `objective` 是 APK `m2343i()` 选出的目标位置；`hasRealAction` 对应
 * `m2366a` 里“候选集中存在非待机、非自疗动作”的布尔值。
 */
export function apkPositionScore(
    ctx: ApkScoringContext,
    unit: Unit,
    moveTo: Position,
    objective: Position | null,
    hasRealAction: boolean,
): number {
    const projected = projectUnitAt(ctx.state, unit.id, moveTo);
    const moved = projected.units.find(entry => entry.id === unit.id)!;
    const tile = tileAt(ctx.state, moveTo);
    if (!tile) return -999999;

    const originalPos = unit.pos;
    const flying = hasAbility(moved, 'flying');
    let score = (flying ? 0 : getTileDefenseBonus(tile)) * 5;

    if (apkIsHealingTile(ctx.state, moveTo) && moved.hp <= Math.trunc(unitMaxHp(moved) / 2)) {
        // APK `m2367a` 使用 `m2337k` 单位价值，而不是 `m2340j` 战斗价值。
        score += Math.trunc((apkUnitValue(ctx, moved) * getTileHealPerTurn(tile)) / 10);
    }
    const kind = apkTerrainKind(ctx.state, moveTo);
    if (kind === 1 || kind === 2) {
        const penalty = Math.trunc(apkUnitValue(ctx, moved) / 10);
        score += hasAbility(moved, 'undead') ? penalty : -penalty;
    }

    if (objective && !hasRealAction) {
        score += (getDistance(originalPos, objective) - getDistance(moveTo, objective)) * 500;
        if (apkIsEnemyCastle(ctx, objective)) score += 2000;
    }

    if (!apkCanCommand(ctx, moved) && apkIsEnemyCastle(ctx, moveTo)) {
        score -= Math.trunc((apkUnitValue(ctx, moved) * 50) / 20);
    }
    if (apkIsEnemyCastle(ctx, moveTo)) {
        score -= 10000;
    }

    if (ctx.threatenedTiles.has(posKey(moveTo)) && moved.hp >= Math.trunc((unitMaxHp(moved) * 4) / 5)) {
        if (apkIsOwnCastle(ctx, moveTo)) {
            // APK `m2367a` 还要求 `!m4326d(unit.type)`：指挥官不参与这项 -5000。
            if (ctx.threateningCastleCaptors <= 1 && !apkCanCommand(ctx, moved) && !hasPreferredCostType(moved)) {
                score -= 5000;
            }
            score += 10000;
        }
        if (apkIsOwnVillage(ctx, moveTo)) {
            score += 5000;
        }
    } else if (apkIsOwnCastle(ctx, moveTo) && !apkCanCommand(ctx, moved)) {
        score -= 5000;
    }

    score += apkAuraScore(ctx, moved, moveTo);
    return score;
}

const PREFERRED_COST_TYPES = new Set([6, 2, 0]);

function hasPreferredCostType(unit: Unit): boolean {
    return PREFERRED_COST_TYPES.has(apkUnitTypeId(unit));
}

/** APK `m2367a` 末尾的光环位置评分（半径 2 的菱形）。 */
export function apkAuraScore(ctx: ApkScoringContext, unit: Unit, moveTo: Position): number {
    const weakening = hasAbility(unit, 'weakness_aura');
    const attackAura = hasAbility(unit, 'attack_aura');
    const cleansing = hasAbility(unit, 'cleansing_aura');
    if (!weakening && !attackAura && !cleansing) return 0;

    let score = 0;
    for (const other of ctx.state.units) {
        if (other.hp <= 0) continue;
        const distance = getDistance(moveTo, other.pos);
        if (distance > 2) continue;
        const enemy = areEnemyPlayers(ctx.state, unit.ownerId, other.ownerId);
        const ally = areAlliedPlayers(ctx.state, unit.ownerId, other.ownerId);
        const value = apkUnitValue(ctx, other);
        if (weakening && enemy && !other.status) {
            score += Math.trunc(value / 4);
        }
        if (attackAura && ally && !other.status) {
            score += Math.trunc(value / 5);
        }
        if (cleansing && ally) {
            if (other.hp < unitMaxHp(other)) {
                score += Math.trunc(value / 20) * ((unit.level ?? 0) + 2);
            }
            if (other.status && (other.status.type === 'poisoned' || other.status.type === 'blinded' || other.status.type === 'weakened')) {
                score += Math.trunc(value / 5);
            }
        }
    }
    return score;
}

/** APK `m2359c` 支援/目标估值，用于 `m2360c` 选最近敌人。 */
export function apkTargetValue(ctx: ApkScoringContext, unit: Unit, target: Unit): number {
    const distance = getDistance(unit.pos, target.pos);
    const attack = unitAttack(unit);
    const targetTile = tileAt(ctx.state, target.pos);
    const terrainDefense = targetTile && !hasAbility(target, 'flying') ? getTileDefenseBonus(targetTile) : 0;
    const defense = apkDefenseAgainst(target, unit) + terrainDefense;
    let value = attack - defense;
    // APK `m2359c` 使用 `m4257u(unit) > 1`（最小射程），不是当前距离。
    if (areEnemyPlayers(ctx.state, unit.ownerId, target.ownerId) && getEffectiveStats(unit).minRange > 1) {
        value = Math.trunc(value / 2);
    }
    if (hasAbility(unit, 'sharpshooter') && hasAbility(target, 'flying')) value += 15;
    if (apkUnitTypeId(unit) === 9 || unit.apkTargeted) value += 25;
    return value - distance * 5;
}

/** APK `call()` 中 `f3108s` 的价格均值。 */
function buildAverageCost(state: GameState, playerId: number): number {
    const costs = getRecruitableUnits(state, playerId)
        .map(unitClass => getUnitCost(state, playerId, unitClass))
        .filter((cost): cost is number => cost !== null);
    if (costs.length === 0) return 0;
    return Math.trunc(costs.reduce((sum, cost) => sum + cost, 0) / costs.length);
}

/** APK `m2338k`：村庄包围盒内的水域/开阔陆地比例。 */
function buildTerrainRatios(state: GameState): { waterRatio: number; openLandRatio: number } {
    const villages: Position[] = [];
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            if (apkTerrainKind(state, { x, y }) === 4) villages.push({ x, y });
        }
    }
    if (villages.length === 0) return { waterRatio: 0, openLandRatio: 0 };

    let minX = state.map.width - 1;
    let maxX = 0;
    let minY = state.map.height - 1;
    let maxY = 0;
    for (const village of villages) {
        minX = Math.min(minX, village.x);
        maxX = Math.max(maxX, village.x);
        minY = Math.min(minY, village.y);
        maxY = Math.max(maxY, village.y);
    }

    let total = 0;
    let water = 0;
    let openLand = 0;
    // 保持 APK 的 `< maxY` 边界（源码如此），并在 total=0 时回退 0。
    for (let y = minY; y < maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            total += 1;
            if (apkTerrainIsLand(state, { x, y })) {
                const kind = apkTerrainKind(state, { x, y });
                if (kind !== 1 && kind !== 2) openLand += 1;
            } else {
                water += 1;
            }
        }
    }
    if (total === 0) return { waterRatio: 0, openLandRatio: 0 };
    return { waterRatio: water / total, openLandRatio: openLand / total };
}

/**
 * APK `m2336l`：计算“敌方本回合能威胁到的己方城堡/村庄”以及能到达这些格子的
 * 敌方单位位置。注意 `m4414a()` 返回的是不同联盟的单位（敌人），不是自己。
 */
function buildThreatMap(state: GameState, playerId: number): {
    threatenedTiles: Set<string>;
    threatSourcePositions: Set<string>;
    threateningCastleCaptors: number;
} {
    const threatenedTiles = new Set<string>();
    const threatSourcePositions = new Set<string>();
    let threateningCastleCaptors = 0;

    for (const unit of state.units) {
        if (unit.hp <= 0 || !areEnemyPlayers(state, unit.ownerId, playerId)) continue;
        const reachable = getReachablePositions(state, unit.id);
        const castleCaptor = hasAbility(unit, 'castle_capturer');
        const villageCaptor = hasAbility(unit, 'village_capturer');
        for (const pos of reachable) {
            const occupant = unitAt(state, pos);
            // APK `m2336l`：己方城堡空置，或占位单位本回合尚未行动。
            if (isOwnCastle(state, playerId, pos) && (!occupant || !occupant.hasActed)) {
                threatSourcePositions.add(posKey(unit.pos));
                if (castleCaptor) {
                    threateningCastleCaptors += 1;
                    threatenedTiles.add(posKey(pos));
                }
            }
            if (isOwnVillage(state, playerId, pos) && villageCaptor) {
                threatenedTiles.add(posKey(pos));
                threatSourcePositions.add(posKey(unit.pos));
            }
        }
    }
    return { threatenedTiles, threatSourcePositions, threateningCastleCaptors };
}

export function buildApkScoringContext(state: GameState, playerId: number): ApkScoringContext {
    const { threatenedTiles, threatSourcePositions, threateningCastleCaptors } = buildThreatMap(state, playerId);
    const ratios = buildTerrainRatios(state);
    const activePlayerCount = Math.max(1, state.players.filter(player => player.isAlive).length);
    let villageCount = 0;
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            if (apkTerrainKind(state, { x, y }) === 4) villageCount += 1;
        }
    }
    return {
        state,
        playerId,
        activePlayerCount,
        avgCost: buildAverageCost(state, playerId),
        threatenedTiles,
        threatSourcePositions,
        threateningCastleCaptors,
        villageCount,
        waterRatio: ratios.waterRatio,
        openLandRatio: ratios.openLandRatio,
        valueCache: new Map(),
        combatCache: new Map(),
    };
}

/** 仅用于测试/诊断：导出 APK 六项特殊能力优先级。 */
export const APK_SPECIAL_ABILITY_ORDER: readonly Ability[] = [
    'cleansing_aura',
    'healer',
    'village_capturer',
    'weakness_aura',
    'poisoner',
    'blinder',
];

/** 仅用于测试/诊断：APK `f3091w` / `f3092x` / `f3093y`。 */
export const APK_EARLY_RECRUIT_TYPES = [1, 18] as const;
export const APK_PREFERRED_RECRUIT_TYPES = [7, 12, 6, 13, 18] as const;
export const APK_PREFERRED_COST_TYPES_IDS = [6, 2, 0] as const;

/** 仅用于测试：按 APK `m2361c` 返回兵种数量上限。 */
export function apkRecruitCap(typeId: number, ctx: ApkScoringContext): number {
    switch (typeId) {
        case 0: return 999;
        case 1:
        case 7: return 4;
        case 2:
            if (ctx.waterRatio < 0.2) return 1;
            return ctx.waterRatio < 0.4 ? 2 : 3;
        case 3: return 1;
        case 4:
        case 5:
        case 6:
        case 12:
        case 13:
        case 14:
        case 15:
        case 16: return 2;
        case 8: return 5;
        case 17:
            if (ctx.waterRatio < 0.2) return 1;
            return ctx.waterRatio < 0.3 ? 2 : 3;
        case 18: return ctx.openLandRatio < 0.3 ? 1 : 2;
        case 19: return ctx.waterRatio < 0.6 ? 5 : 6;
        default: return 0;
    }
}

/** 仅用于测试：APK `m2341j` 每回合同兵种招募上限。 */
export function apkPerTurnRecruitCap(ctx: ApkScoringContext, population: number): number {
    if (ctx.state.turn <= 3 || population < 7) {
        return Math.max(1, Math.ceil((ctx.villageCount / ctx.activePlayerCount) * 0.3 + 1));
    }
    return Math.trunc(population / 7);
}

export function unitClassForApkType(typeId: number): UnitClass | undefined {
    return (Object.entries(APK_UNIT_CLASS_TO_ID).find(([, id]) => id === typeId)?.[0] as UnitClass | undefined);
}

export function actionsEqual(a: Action, b: Action): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
