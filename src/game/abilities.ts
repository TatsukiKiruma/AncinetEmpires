import { GameState, LevelCap, Unit, Ability, UnitLevel } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { Tile, TerrainId } from './terrain';

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

/**
 * 检查地形标签，APK 地形有多种贴图变体，规则层按标签归类。
 */
function terrainHasTag(terrainId: TerrainId, tag: string): boolean {
    return TERRAIN_CONFIG[terrainId]?.tags.includes(tag) ?? false;
}

/**
 * 水地形：含 water 标签；APK 文案明确桥也算水面地形。
 */
export function isWaterTerrain(terrainId: TerrainId): boolean {
    return terrainHasTag(terrainId, 'water');
}

/**
 * 山地地形：含 mountain 标签，不包含孤岛。
 */
export function isMountainTerrain(terrainId: TerrainId): boolean {
    return terrainHasTag(terrainId, 'mountain');
}

/**
 * 森林地形：含 forest 标签。
 */
export function isForestTerrain(terrainId: TerrainId): boolean {
    return terrainHasTag(terrainId, 'forest');
}

/**
 * 陆地地形：具有 land 标签的地形
 */
export function isLandTerrain(terrainId: TerrainId): boolean {
    return terrainHasTag(terrainId, 'land');
}

/**
 * 获取单位在当前地形下的移动力消耗公用逻辑
 */
export function getMoveCostForUnit(state: GameState, unit: Unit, tile: Tile): number {
    const terrainId = tile.terrainId;
    
    // 飞行单位所有地形移动消耗 1
    if (isFlying(unit)) {
        return 1;
    }
    
    // 水之子在水地形移动消耗 1
    if (hasAbility(unit, 'water_child') && isWaterTerrain(terrainId)) {
        return 1;
    }
    
    // 森林之子在森林移动消耗 1
    if (hasAbility(unit, 'forest_child') && isForestTerrain(terrainId)) {
        return 1;
    }
    
    // 山之子在山脉/丘陵移动消耗 1
    if (hasAbility(unit, 'mountain_child') && isMountainTerrain(terrainId)) {
        return 1;
    }
    
    // 大地之子
    if (hasAbility(unit, 'earth_child')) {
        if (isWaterTerrain(terrainId)) {
            return 2; // 水地形移动消耗 2
        }
        if (isLandTerrain(terrainId)) {
            return 1; // 陆地移动消耗 1
        }
    }
    
    const terrainConfig = TERRAIN_CONFIG[terrainId];
    return terrainConfig?.moveCost ?? 1;
}

/**
 * 获取攻击方的加成（如地形之子加成）
 */
export function getAttackBonus(state: GameState, attacker: Unit, defender: Unit): number {
    let bonus = 0;
    const atkTile = state.map.tiles[attacker.pos.y][attacker.pos.x];
    const terrainId = atkTile.terrainId;
    
    if (hasAbility(attacker, 'water_child') && isWaterTerrain(terrainId)) {
        bonus += 10;
    }
    if (hasAbility(attacker, 'forest_child') && isForestTerrain(terrainId)) {
        bonus += 10;
    }
    if (hasAbility(attacker, 'mountain_child') && isMountainTerrain(terrainId)) {
        bonus += 10;
    }
    
    return bonus;
}

/**
 * 获取防守方的加成（如地形之子加成）
 */
export function getDefenseBonus(state: GameState, attacker: Unit, defender: Unit): number {
    let bonus = 0;
    const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
    const terrainId = defTile.terrainId;
    
    if (hasAbility(defender, 'water_child') && isWaterTerrain(terrainId)) {
        bonus += 10;
    }
    if (hasAbility(defender, 'forest_child') && isForestTerrain(terrainId)) {
        bonus += 10;
    }
    if (hasAbility(defender, 'mountain_child') && isMountainTerrain(terrainId)) {
        bonus += 10;
    }
    
    return bonus;
}

/**
 * 获取最终伤害乘数（如近战大师、远程防御、突击加成）
 */
export function getFinalDamageMultiplier(state: GameState, attacker: Unit, defender: Unit, distance: number): number {
    let multiplier = 1.0;
    
    if (hasAbility(attacker, 'melee_master') && distance === 1) {
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

export function addExp(unit: Unit, amount: number, levelCap: LevelCap = 3): boolean {
    if (unit.level === undefined) unit.level = 0;
    if (unit.exp === undefined) unit.exp = 0;
    
    if (unit.level >= levelCap) return false; // 满级
    
    unit.exp += amount;
    let upgraded = false;
    
    while (unit.level < levelCap) {
        // APK 的单位配置类中使用同一公式计算等级经验阈值：1=100、2=300、3=600，最高内部检查到 9。
        const nextLevel = (unit.level + 1) as UnitLevel;
        const threshold = getExpThresholdForLevel(nextLevel);
        if (unit.exp >= threshold) {
            unit.level = nextLevel;
            upgraded = true;
            // 升级时回满血
            unit.hp = getEffectiveStats(unit).maxHp; 
        } else {
            break;
        }
    }
    return upgraded;
}
