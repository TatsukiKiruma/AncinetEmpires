import { GameState, LevelCap, Unit, Ability, UnitLevel } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { Tile, TerrainId } from './terrain';
import { getApkTerrainConfig } from './apk_terrain';
import { getTileMoveCost, tileHasTerrainTag } from './terrain_rules';
import { getRuleConfig } from './rule_config';

/**
 * 检查单位是否拥有特定能力
 */
export function hasAbility(unit: Unit, ability: Ability): boolean {
    const config = UNIT_CONFIGS[unit.unitClass];
    return config?.abilities.includes(ability) || false;
}

/**
 * 是否是空军（飞行单位）
 */
export function isFlying(unit: Unit): boolean {
    return hasAbility(unit, 'flying');
}

/**
 * 是否是亡灵单位
 */
export function isUndead(unit: Unit): boolean {
    return hasAbility(unit, 'undead');
}

type TerrainRef = TerrainId | Tile;

/**
 * 检查地形标签，APK 地形有多种贴图变体，规则层优先按 APK tile 映射归类。
 */
function terrainHasTag(terrain: TerrainRef, tag: string): boolean {
    if (typeof terrain === 'number') {
        return TERRAIN_CONFIG[terrain]?.tags.includes(tag) ?? false;
    }

    if (terrain.apkTerrainId !== undefined) {
        const apkConfig = getApkTerrainConfig(terrain.apkTerrainId);
        const apkIsLand = terrain.apkTerrainIsLand ?? (
            apkConfig ? apkConfig.flagA !== 0 : undefined
        );
        const apkKind = terrain.apkTerrainKind ?? apkConfig?.kind;

        if (tag === 'water' && apkIsLand !== undefined) {
            return !apkIsLand;
        }
        if (tag === 'land' && apkIsLand !== undefined) {
            return apkIsLand;
        }
        if (tag === 'forest' && apkKind === 2) {
            return true;
        }
        if (tag === 'mountain' && apkKind === 1) {
            return true;
        }
    }

    return tileHasTerrainTag(terrain, tag);
}

/**
 * 水地形：无 APK 元数据时使用项目标签；有 APK 元数据时按 isLand 语义判断规则水域。
 */
export function isWaterTerrain(terrain: TerrainRef): boolean {
    return terrainHasTag(terrain, 'water');
}

/**
 * 山地地形：含 mountain 标签，不包含孤岛。
 */
export function isMountainTerrain(terrain: TerrainRef): boolean {
    return terrainHasTag(terrain, 'mountain');
}

/**
 * 森林地形：含 forest 标签。
 */
export function isForestTerrain(terrain: TerrainRef): boolean {
    return terrainHasTag(terrain, 'forest');
}

/**
 * 陆地地形：具有 land 标签的地形
 */
export function isLandTerrain(terrain: TerrainRef): boolean {
    return terrainHasTag(terrain, 'land');
}

/**
 * 获取单位在当前地形下的移动力消耗公用逻辑
 */
export function getMoveCostForUnit(state: GameState, unit: Unit, tile: Tile): number {
    const terrainId = tile.terrainId;
    const baseMoveCost = tile.apkMoveCost ?? getTileMoveCost(tile);

    const scriptedMoveCostByApkKind = tile.apkTerrainId === undefined
        ? undefined
        : unit.apkMoveOverrides?.[getApkTerrainConfig(tile.apkTerrainId)?.kind ?? -1];
    if (scriptedMoveCostByApkKind !== undefined) {
        return scriptedMoveCostByApkKind;
    }

    const scriptedMoveCostByApkId = tile.apkTerrainId === undefined
        ? undefined
        : unit.apkMoveOverrides?.[tile.apkTerrainId];
    if (scriptedMoveCostByApkId !== undefined) {
        return scriptedMoveCostByApkId;
    }

    const scriptedMoveCostByProjectId = unit.apkMoveOverrides?.[terrainId];
    if (scriptedMoveCostByProjectId !== undefined) {
        return scriptedMoveCostByProjectId;
    }
    
    // 飞行单位所有地形移动消耗 1
    if (isFlying(unit)) {
        return 1;
    }
    
    const apkIsWater = tile.apkTerrainIsLand === false;
    const apkKind = tile.apkTerrainKind;
    
    // 水之子在水地形移动消耗 1
    if (hasAbility(unit, 'water_child') && (apkIsWater || isWaterTerrain(tile))) {
        return 1;
    }
    
    // 森林之子在森林移动消耗 1
    if (hasAbility(unit, 'forest_child') && (apkKind === 2 || isForestTerrain(tile))) {
        return 1;
    }
    
    // 山之子在山脉/丘陵移动消耗 1
    if (hasAbility(unit, 'mountain_child') && (apkKind === 1 || isMountainTerrain(tile))) {
        return 1;
    }
    
    // 大地之子。APK C0600q.m4357a：陆地为 1；非陆地为基础移动消耗 + 1。
    if (hasAbility(unit, 'earth_child')) {
        if (tile.apkTerrainIsLand === true || (tile.apkTerrainIsLand === undefined && isLandTerrain(tile))) {
            return 1;
        }
        if (tile.apkTerrainIsLand === false) {
            return baseMoveCost >= 0x0fffffff ? baseMoveCost : baseMoveCost + 1;
        }
        if (isWaterTerrain(tile)) {
            return 2; // 无 APK 元数据时保留旧兜底。
        }
    }
    
    return baseMoveCost;
}

/**
 * 获取攻击方的加成（如地形之子加成）
 */
export function getAttackBonus(state: GameState, attacker: Unit, defender: Unit): number {
    let bonus = 0;
    const ruleConfig = getRuleConfig(state);
    const atkTile = state.map.tiles[attacker.pos.y][attacker.pos.x];
    
    if (hasAbility(attacker, 'water_child') && isWaterTerrain(atkTile)) {
        bonus += ruleConfig.terrainChildCombatBonus;
    }
    if (hasAbility(attacker, 'forest_child') && isForestTerrain(atkTile)) {
        bonus += ruleConfig.terrainChildCombatBonus;
    }
    if (hasAbility(attacker, 'mountain_child') && isMountainTerrain(atkTile)) {
        bonus += ruleConfig.terrainChildCombatBonus;
    }
    
    return bonus;
}

/**
 * 获取防守方的加成（如地形之子加成）
 */
export function getDefenseBonus(state: GameState, attacker: Unit, defender: Unit): number {
    let bonus = 0;
    const ruleConfig = getRuleConfig(state);
    const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
    
    if (hasAbility(defender, 'water_child') && isWaterTerrain(defTile)) {
        bonus += ruleConfig.terrainChildCombatBonus;
    }
    if (hasAbility(defender, 'forest_child') && isForestTerrain(defTile)) {
        bonus += ruleConfig.terrainChildCombatBonus;
    }
    if (hasAbility(defender, 'mountain_child') && isMountainTerrain(defTile)) {
        bonus += ruleConfig.terrainChildCombatBonus;
    }
    
    return bonus;
}

/**
 * 获取最终伤害乘数（如近战大师、远程防御、突击加成）
 */
export function getFinalDamageMultiplier(state: GameState, attacker: Unit, defender: Unit, distance: number): number {
    let multiplier = 1.0;
    
    if (hasAbility(attacker, 'melee_master') && !hasAbility(defender, 'melee_master') && distance === 1) {
        multiplier *= 1.5;
    }
    
    if (hasAbility(defender, 'ranged_defense') && distance > 1) {
        multiplier *= 0.5;
    }
    
    return multiplier;
}

/**
 * 净化负面状态（清除中毒、致盲、虚弱）
 */
export function clearNegativeStatus(unit: Unit): void {
    if (unit.status) {
        const type = unit.status.type;
        if (type === 'poisoned' || type === 'blinded' || type === 'weakened') {
            delete unit.status;
        }
    }
}

export interface EffectiveStats {
    attack: number;
    physicalDefense: number;
    magicDefense: number;
    maxHp: number;
    move: number;
    minRange: number;
    maxRange: number;
}

export function getEffectiveStats(unit: Unit): EffectiveStats {
    const base = UNIT_CONFIGS[unit.unitClass];
    const level = unit.level ?? 0;
    const attackBonus = base.attackGrowth * level;
    const defBonus = base.defenseGrowth * level;
    const maxHpBonus = base.maxHpGrowth * level;
    const moveBonus = base.moveGrowth * level;

    let pDef = base.physicalDefense + defBonus;
    let mDef = base.magicDefense + defBonus;
    let maxHp = (unit.maxHp ?? 100) + maxHpBonus;
    let move = base.move + moveBonus;

    // 虚弱：APK 文案确认为移动力降至 1，近战防御 -10；远程减半在伤害公式中按距离处理。
    if (unit.status && unit.status.type === 'weakened') {
        pDef -= 10;
        mDef -= 10;
        move = 1;
    }

    // 攻击距离致盲缩减为 0
    let minRange = base.minRange;
    let maxRange = base.maxRange;
    if (unit.status && unit.status.type === 'blinded') {
        minRange = 0;
        maxRange = 0;
    }

    return {
        attack: base.attack + attackBonus,
        physicalDefense: pDef,
        magicDefense: mDef,
        maxHp,
        move,
        minRange,
        maxRange
    };
}

export function getExpThresholdForLevel(level: UnitLevel): number {
    if (level <= 0) return 0;
    return ((level + 1) * 100 * level) / 2;
}

const MAX_EXP = 99999;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function addExp(unit: Unit, amount: number, levelCap: LevelCap = 3): boolean {
    if (unit.level === undefined) unit.level = 0;
    if (unit.exp === undefined) unit.exp = 0;

    unit.exp = clamp(unit.exp + amount, 0, MAX_EXP);
    let upgraded = false;
    let levelsGained = 0;
    
    while (unit.level < levelCap) {
        // APK 的单位配置类中使用同一公式计算等级经验阈值：1=100、2=300、3=600，最高内部检查到 9。
        const nextLevel = (unit.level + 1) as UnitLevel;
        const threshold = getExpThresholdForLevel(nextLevel);
        if (unit.exp >= threshold) {
            unit.level = nextLevel;
            upgraded = true;
            levelsGained += 1;
        } else {
            break;
        }
    }

    if (levelsGained > 0) {
        const config = UNIT_CONFIGS[unit.unitClass];
        const hpGain = config.maxHpGrowth * levelsGained;
        const moveGain = config.moveGrowth * levelsGained;

        // APK 升级只把当前 HP 增加生命成长值，不会给没有生命成长的单位回满血。
        if (hpGain !== 0) {
            unit.hp = clamp(unit.hp + hpGain, 1, 9999);
        }

        // 项目只在需要追踪剩余移动力时保存 movementRemaining；有值时同步 APK 的当前移动力增长。
        if (moveGain !== 0 && unit.movementRemaining !== undefined) {
            unit.movementRemaining = clamp(unit.movementRemaining + moveGain, 0, 99);
        }
    }

    return upgraded;
}
