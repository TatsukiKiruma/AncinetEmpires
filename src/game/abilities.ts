import { GameState, Unit } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { Tile, TerrainId } from './terrain';

export type AbilityKey = string;

/**
 * 检查单位是否拥有特定能力
 */
export function hasAbility(unit: Unit, ability: AbilityKey): boolean {
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
 * 水地形：水里/深水 (2)、水中神庙 (16)、孤岛 (5)
 */
export function isWaterTerrain(terrainId: TerrainId): boolean {
    return terrainId === 2 || terrainId === 16 || terrainId === 5;
}

/**
 * 山地地形：山脉 (3)、丘陵 (4)，不包含孤岛 (5)
 */
export function isMountainTerrain(terrainId: TerrainId): boolean {
    return terrainId === 3 || terrainId === 4;
}

/**
 * 森林地形：森林 (7)
 */
export function isForestTerrain(terrainId: TerrainId): boolean {
    return terrainId === 7;
}

/**
 * 陆地地形：具有 land 标签的地形
 */
export function isLandTerrain(terrainId: TerrainId): boolean {
    const config = TERRAIN_CONFIG[terrainId];
    if (!config) return false;
    return config.tags.includes('land');
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
    let level = unit.level ?? 0;
    
    let attackBonus = 0;
    let defBonus = 0;
    let maxHpBonus = 0;
    let moveBonus = 0;

    // 每次升级的属性增长
    for (let i = 0; i < level; i++) {
        if (unit.unitClass === 'witch' || unit.unitClass === 'paladin' || unit.unitClass === 'elf' || unit.unitClass === 'golem' || unit.unitClass === 'druid') {
            attackBonus += 5;
            defBonus += 5;
        } else if (unit.unitClass === 'ghost' || unit.unitClass === 'commander' || unit.unitClass === 'slime' || unit.unitClass === 'ice_elemental') {
            attackBonus += 10;
            defBonus += 5;
        } else {
            // 普通单位
            attackBonus += 10;
            defBonus += 5;
        }

        // 生命增加
        if (unit.unitClass === 'golem') {
            maxHpBonus += 25;
        } else if (unit.unitClass === 'slime') {
            maxHpBonus += 5;
        } else if (unit.unitClass === 'ice_elemental') {
            maxHpBonus += 10; // TODO 确认
        }

        // 移动增加
        if (unit.unitClass === 'druid' || unit.unitClass === 'ghost' || unit.unitClass === 'commander') {
            moveBonus += 1;
        }
    }

    let pDef = base.physicalDefense + defBonus;
    let mDef = base.magicDefense + defBonus;
    let maxHp = (unit.maxHp ?? 100) + maxHpBonus;
    let move = base.move + moveBonus;

    // 状态对防御和移动力的改变
    if (unit.status && unit.status.type === 'weakened') {
        pDef -= 5;
        mDef -= 5;
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

export function addExp(unit: Unit, amount: number): boolean {
    if (unit.level === undefined) unit.level = 0;
    if (unit.exp === undefined) unit.exp = 0;
    
    if (unit.level >= 3) return false; // 满级
    
    unit.exp += amount;
    let upgraded = false;
    
    while (unit.level < 3) {
        const threshold = unit.level === 0 ? 100 : (unit.level === 1 ? 300 : 600);
        if (unit.exp >= threshold) {
            unit.level = (unit.level + 1) as 0 | 1 | 2 | 3;
            upgraded = true;
            // 升级时回满血
            unit.hp = getEffectiveStats(unit).maxHp; 
        } else {
            break;
        }
    }
    return upgraded;
}
