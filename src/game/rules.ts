import { Action, GameState, Position, UnitClass, Ability } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { getDistance, getReachablePositions, isWithinBounds } from './map';
import { isFlying, getAttackBonus, getDefenseBonus, getFinalDamageMultiplier, getEffectiveStats, hasAbility as hasAbi } from './abilities';

/**
 * 纯规则校验模块
 */

export function hasAbility(unitClass: UnitClass, ability: Ability) {
    return UNIT_CONFIGS[unitClass].abilities.includes(ability);
}

// 战斗伤害计算 - 纯函数
export function calculateDamage(state: GameState, attackerId: string, defenderId: string): number {
    const attacker = state.units.find(u => u.id === attackerId);
    const defender = state.units.find(u => u.id === defenderId);
    
    if (!attacker || !defender) return 0;

    const effAtk = getEffectiveStats(attacker);
    const effDef = getEffectiveStats(defender);

    const atkStats = UNIT_CONFIGS[attacker.unitClass];
    const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
    const defTerrain = TERRAIN_CONFIG[defTile.terrainId];

    // 其他攻击加成
    let extraAttack = 0;
    if (hasAbi(attacker, 'sharpshooter') && hasAbi(defender, 'flying')) {
        extraAttack += 10;
    }
    if (hasAbi(attacker, 'destroyer') && defTerrain.key === 'town') {
        extraAttack += 10;
    }

    // 地形防御加成
    const defBonus = isFlying(defender) ? 0 : defTerrain.defenseBonus;

    // 动态能力增加的攻防加成（如地形之子）
    const abilityAtkBonus = getAttackBonus(state, attacker, defender);
    const abilityDefBonus = getDefenseBonus(state, attacker, defender);

    // 攻击光环附加 (近战 +10, 远程 +5)
    let auraAttackBonus = 0;
    if (attacker.attackAuraActive) {
        if (effAtk.maxRange === 1) {
            auraAttackBonus += 10;
        } else {
            auraAttackBonus += 5;
        }
    }

    // 选择物理防御还是魔法防御
    const isMagic = atkStats.attackType === 'magic';
    const actualDefenderDefense = isMagic ? effDef.magicDefense : effDef.physicalDefense;

    // 最终伤害 = (单位攻击 + 地形之子攻击 + 其他伤害加成 + 光环加成 - 实际防御 - 地形防御加成 - 地形之子防御)
    let rawDamage = (effAtk.attack + abilityAtkBonus + extraAttack + auraAttackBonus) - (actualDefenderDefense + defBonus + abilityDefBonus);

    // fighting_spirit 保证 1 (满状态)，否则按当前血量 / 最大血量
    const isFightingSpirit = hasAbi(attacker, 'fighting_spirit');
    const hpRatio = isFightingSpirit ? 1 : (attacker.hp / effAtk.maxHp);

    let finalDamage = Math.floor(rawDamage * hpRatio);

    const dist = getDistance(attacker.pos, defender.pos);
    const finalMultiplier = getFinalDamageMultiplier(state, attacker, defender, dist);
    finalDamage = Math.floor(finalDamage * finalMultiplier);

    return Math.max(0, finalDamage);
}

// 检查是否在射程内
export function inRange(pos1: Position, pos2: Position, minRange: number, maxRange: number): boolean {
    const dist = getDistance(pos1, pos2);
    return dist >= minRange && dist <= maxRange;
}

// 获取当前玩家所有合法动作
export function getLegalActions(state: GameState, playerId: number): Action[] {
    const actions: Action[] = [];
    
    // 只属于当前玩家的未行动完的单位
    const validUnits = state.units.filter(u => u.ownerId === playerId && !u.hasActed);
    // 突击部队可在攻击后未进行突击移动时再移动一次
    const assaultUnits = state.units.filter(u => 
        u.ownerId === playerId && 
        u.hasActed && 
        hasAbi(u, 'assault_troop') && 
        (u.movementRemaining ?? 0) > 0 && 
        !u.hasPostAttackMoved
    );

    const enemyUnits = state.units.filter(u => u.ownerId !== playerId);
    const friendUnits = state.units.filter(u => u.ownerId === playerId);

    // 1. 突击二次移动作为专用合法指令生成
    for (const unit of assaultUnits) {
        const reachable = getReachablePositions(state, unit.id, unit.movementRemaining);
        for (const pos of reachable) {
            actions.push({ type: 'post_attack_move', unitId: unit.id, to: pos });
        }
    }

    // 2. 正常尚未行动单位的合法动作
    for (const unit of validUnits) {
        const eff = getEffectiveStats(unit);
        const tileUnder = state.map.tiles[unit.pos.y][unit.pos.x];
        const terrainConfig = TERRAIN_CONFIG[tileUnder.terrainId];

        // 2.1 移动 (在还没移动的情况下)
        if (!unit.hasMoved) {
            const reachable = getReachablePositions(state, unit.id);
            for (const pos of reachable) {
                if (pos.x !== unit.pos.x || pos.y !== unit.pos.y) {
                    actions.push({ type: 'move', unitId: unit.id, to: pos });
                }
            }
        }

        // 2.2 攻击动作 (已经完美配合 blindness 导致致盲时 range 为 0)
        if (eff.maxRange > 0) {
            for (const enemy of enemyUnits) {
                if (inRange(unit.pos, enemy.pos, eff.minRange, eff.maxRange)) {
                    actions.push({ type: 'attack', attackerId: unit.id, targetId: enemy.id });
                }
            }
        }

        // 2.3 治疗 (healer，仅对相邻格生效/或者曼哈顿距离为1)
        if (hasAbi(unit, 'healer')) {
            for (const friend of friendUnits) {
                if (friend.id !== unit.id && getDistance(unit.pos, friend.pos) <= 1) {
                    const friendEff = getEffectiveStats(friend);
                    const isBelowMaxHp = friend.hp < friendEff.maxHp;
                    const notHealedYet = !friend.hasBeenHealedThisTurn;
                    const notPoisoned = !(friend.status && friend.status.type === 'poisoned');
                    const isNotGroundToFlying = !(isFlying(friend) && !isFlying(unit));

                    if (isBelowMaxHp && notHealedYet && notPoisoned && isNotGroundToFlying) {
                        actions.push({ type: 'heal', healerId: unit.id, targetId: friend.id });
                    }
                }
            }
        }

        // 2.4 召唤 (summoner，距离墓碑 <= 2 格进行召唤)
        if (hasAbi(unit, 'summoner') && state.graves) {
            for (const grave of state.graves) {
                if (getDistance(unit.pos, grave.pos) <= 2) {
                    const hasUnitOnGrave = state.units.some(u => u.pos.x === grave.pos.x && u.pos.y === grave.pos.y);
                    if (!hasUnitOnGrave) {
                        actions.push({ type: 'summon', summonerId: unit.id, graveId: grave.id, spawnPos: { ...grave.pos } });
                    }
                }
            }
        }

        // 2.5 支援 (supporter，2格内被重置，除豁免兵种外)
        if (hasAbi(unit, 'supporter')) {
            for (const friend of friendUnits) {
                if (friend.id !== unit.id && getDistance(unit.pos, friend.pos) <= 2) {
                    const isFriendActed = friend.hasActed;
                    const isExcluded = hasAbi(friend, 'assault_troop') || hasAbi(friend, 'castle_capturer') || hasAbi(friend, 'supporter');
                    const isLevelLesserOrEqual = (friend.level ?? 0) <= (unit.level ?? 0);
                    const notSupportedYet = !friend.hasBeenSupportedThisTurn;

                    if (isFriendActed && !isExcluded && isLevelLesserOrEqual && notSupportedYet) {
                        actions.push({ type: 'support', supporterId: unit.id, targetId: friend.id });
                    }
                }
            }
        }

        // 2.6 占领 (城镇和城堡)
        if (terrainConfig.key === 'town' && tileUnder.ownerId !== playerId && hasAbi(unit, 'village_capturer')) {
            actions.push({ type: 'capture', unitId: unit.id });
        }
        if (terrainConfig.key === 'castle' && tileUnder.ownerId !== playerId && hasAbi(unit, 'castle_capturer')) {
            actions.push({ type: 'capture', unitId: unit.id });
        }

        // 2.7 摧毁城镇 (destroyer，能站在town上面就可破坏之)
        if (terrainConfig.key === 'town' && hasAbi(unit, 'destroyer')) {
            actions.push({ type: 'destroy_town', unitId: unit.id });
        }

        // 2.8 修理 (standing on damaged_town)
        if (terrainConfig.key === 'damaged_town' && hasAbi(unit, 'repairer')) {
            actions.push({ type: 'repair', unitId: unit.id });
        }

        // 2.9 待机
        actions.push({ type: 'wait', unitId: unit.id });
    }

    // 3. 招募: 只有指挥官位于友方城堡时，才能招募。
    const commanders = state.units.filter(u => u.ownerId === playerId && u.unitClass === 'commander');
    const unitPositions = new Set(state.units.map(u => `${u.pos.x},${u.pos.y}`));
    const playerGold = state.players.find(p => p.id === playerId)?.gold || 0;

    for (const commander of commanders) {
        const tile = state.map.tiles[commander.pos.y][commander.pos.x];
        const tConfig = TERRAIN_CONFIG[tile.terrainId];
        if (tConfig.key === 'castle' && tile.ownerId === playerId) {
            const dirs = [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]];
            const validSpawns: Position[] = [];
            
            for (const [dx, dy] of dirs) {
                const spx = commander.pos.x + dx;
                const spy = commander.pos.y + dy;
                const sp = {x: spx, y: spy};
                if (isWithinBounds(state, sp) && !unitPositions.has(`${spx},${spy}`)) {
                    const spawnTile = state.map.tiles[spy][spx];
                    const spawnCost = TERRAIN_CONFIG[spawnTile.terrainId].moveCost || 1;
                    if (spawnCost <= 4) {
                        validSpawns.push(sp);
                    }
                }
            }

            for (const spawnPos of validSpawns) {
                const classes = Object.keys(UNIT_CONFIGS).filter(c => c !== 'commander' && UNIT_CONFIGS[c].cost !== null) as UnitClass[];
                for (const c of classes) {
                    if (playerGold >= UNIT_CONFIGS[c].cost!) {
                        actions.push({ type: 'recruit', unitClass: c, spawnPos, castlePos: { ...commander.pos } });
                    }
                }
            }
        }
    }

    // 4. 结束回合
    actions.push({ type: 'end_turn' });

    return actions;
}
