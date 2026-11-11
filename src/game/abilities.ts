import { GameState, LevelCap, Unit, Ability, UnitLevel } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { Tile, TerrainId } from './terrain';
import { getApkTerrainConfig } from './apk_terrain';
import { getTileMoveCost, tileHasTerrainTag } from './terrain_rules';
import { getNumericRule } from './rule_config';

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
        if (tag === 'forest' && apkKind !== undefined) {
            return apkKind === 2;
        }
        if (tag === 'mountain' && apkKind !== undefined) {
            return apkKind === 1;
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
    const baseMoveCost = tile.apkMoveCost ?? getTileMoveCost(tile);
    const kind = tile.apkTerrainKind ?? (tile.apkTerrainId === undefined
        ? undefined : getApkTerrainConfig(tile.apkTerrainId)?.kind);
    // APK override 仅按地形类别查询，非正值表示未覆盖。
    const scripted = kind === undefined ? undefined : unit.apkMoveOverrides?.[kind];
    if (scripted !== undefined && scripted > 0) return scripted;
    if (isFlying(unit)
        || (hasAbility(unit, 'water_child') && isWaterTerrain(tile))
        || (hasAbility(unit, 'forest_child') && isForestTerrain(tile))
        || (hasAbility(unit, 'mountain_child') && isMountainTerrain(tile))
        || (hasAbility(unit, 'earth_child') && isLandTerrain(tile))) return 1;
    // APK 大地之子在非陆地额外消耗 1 点，普通水面为 3 + 1。
    if (hasAbility(unit, 'earth_child')) return baseMoveCost + 1;
    return baseMoveCost;
}

/**
 * 获取攻击方的加成（如地形之子加成）
 */
export function getAttackBonus(state: GameState, attacker: Unit, defender: Unit): number {
    let bonus = 0;
    const atkTile = state.map.tiles[attacker.pos.y][attacker.pos.x];
    
    if (hasAbility(attacker, 'water_child') && isWaterTerrain(atkTile)) {
        bonus += getNumericRule(state, 'terrainChildCombatBonus');
    }
    if (hasAbility(attacker, 'forest_child') && isForestTerrain(atkTile)) {
        bonus += getNumericRule(state, 'terrainChildCombatBonus');
    }
    if (hasAbility(attacker, 'mountain_child') && isMountainTerrain(atkTile)) {
        bonus += getNumericRule(state, 'terrainChildCombatBonus');
    }
    
    return bonus;
}

/**
 * 获取防守方的加成（如地形之子加成）
 */
export function getDefenseBonus(state: GameState, attacker: Unit, defender: Unit): number {
    let bonus = 0;
    const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
    
    if (hasAbility(defender, 'water_child') && isWaterTerrain(defTile)) {
        bonus += getNumericRule(state, 'terrainChildCombatBonus');
    }
    if (hasAbility(defender, 'forest_child') && isForestTerrain(defTile)) {
        bonus += getNumericRule(state, 'terrainChildCombatBonus');
    }
    if (hasAbility(defender, 'mountain_child') && isMountainTerrain(defTile)) {
        bonus += getNumericRule(state, 'terrainChildCombatBonus');
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

/**
 * V15/T15-02：战斗经验常量从 `engine.ts` 提升到公共模块。
 *
 * 原因：反击预测必须重放引擎「攻击者 addExp」这一步，两处若各自写一份 30/60，
 * 一旦规则改动就会出现预测与引擎不一致，而这类不一致正是 T15-02 要修的问题。
 * 数值本身没有变化（与 APK 反编译一致：普攻 30、击杀 60、助攻 10）。
 */
export const ATTACK_EXP = 30;
export const ASSIST_EXP = 10;
export const KILL_EXP = 60;

const MAX_EXP = 99999;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function addExp(unit: Unit, amount: number, levelCap: LevelCap = 3): boolean {
    if (unit.level === undefined) unit.level = 0;
    if (unit.exp === undefined) unit.exp = 0;

    // APK C0595l：达到配置等级上限后不再增加正经验，负经验仍按原规则结算。
    if (unit.level >= levelCap && amount > 0) return false;
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

/**
 * V15/T15-02：把「引擎已经实际执行的 addExp 结果」投影成单位属性覆盖值。
 *
 * 为什么需要它：引擎在 attack 分支里先给攻击者 `addExp`，**然后**才结算反击
 * （src/game/engine.ts:585 与 :600）。升级会同时改变攻击者的攻击、防御、最大 HP 与当前 HP，
 * 因此反击伤害必须在「已升级」的攻击者身上计算。T15-02 之前
 * `rules.estimateCounterDamage` 漏掉了这一步：经验 90 的 0 级士兵攻击后升到 1 级，
 * 引擎实际反击 22，而特征预测 25（V14b 审核反例）。
 *
 * 约束：
 * - 纯函数，不修改传入的 unit；返回值可能是新对象；
 * - 数值演算委托给真正的 `addExp`（在一份拷贝上执行），不在预测路径里重写一遍公式，
 *   避免规则改动后两处实现漂移；
 * - 若没有升级，返回 `null`，调用方保持原有 fast path。
 */
export function projectExpOutcome(
    unit: Unit,
    expAmount: number,
    levelCap: LevelCap = 3,
): { level: number; exp: number; hp: number } | null {
    const copy: Unit = {
        ...unit,
        pos: { ...unit.pos },
        status: unit.status ? { ...unit.status } : unit.status,
    };
    const beforeLevel = copy.level ?? 0;
    const beforeHp = copy.hp;
    addExp(copy, expAmount, levelCap);
    const afterLevel = copy.level ?? 0;
    if (afterLevel === beforeLevel && copy.hp === beforeHp) return null;
    return { level: afterLevel, exp: copy.exp ?? 0, hp: copy.hp };
}
