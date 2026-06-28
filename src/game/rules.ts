import { Action, GameState, Position, UnitClass, Ability } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { getDistance, getReachablePositions, isWithinBounds, getRecruitDeployPositions } from './map';
import { isFlying, isUndead, isWaterTerrain, getAttackBonus, getDefenseBonus, getFinalDamageMultiplier, getEffectiveStats, hasAbility as hasAbi } from './abilities';

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
    const dist = getDistance(attacker.pos, defender.pos);

    // 其他攻击加成
    let extraAttack = 0;
    if (hasAbi(attacker, 'sharpshooter') && hasAbi(defender, 'flying')) {
        extraAttack += 10;
    }
    if (hasAbi(attacker, 'destroyer') && defTerrain.key === 'town') {
        extraAttack += 10;
    }
    if (hasAbi(attacker, 'flying') && isWaterTerrain(defTile.terrainId) && !hasAbi(defender, 'flying')) {
        extraAttack += 10;
    }
    if (hasAbi(attacker, 'death_reaper') && defender.status && (defender.status.type === 'poisoned' || defender.status.type === 'blinded' || defender.status.type === 'weakened')) {
        extraAttack += 20;
    }

    // 地形防御加成
    const defBonus = isFlying(defender) ? 0 : defTerrain.defenseBonus;

    // 动态能力增加的攻防加成（如地形之子）
    const abilityAtkBonus = getAttackBonus(state, attacker, defender);
    const abilityDefBonus = getDefenseBonus(state, attacker, defender);

    // 鼓舞状态：攻击 +10，远程攻击减半为 +5。
    const inspiredAttackBonus = attacker.status?.type === 'inspired'
        ? (dist > 1 ? 5 : 10)
        : 0;

    // 选择物理防御还是魔法防御
    const isMagic = atkStats.attackType === 'magic';
    const weakenedRangedDefenseAdjustment = defender.status?.type === 'weakened' && dist > 1 ? 5 : 0;
    const actualDefenderDefense = (isMagic ? effDef.magicDefense : effDef.physicalDefense) + weakenedRangedDefenseAdjustment;

    // 最终伤害 = (单位攻击 + 地形之子攻击 + 其他伤害加成 + 光环加成 - 实际防御 - 地形防御加成 - 地形之子防御)
    let rawDamage = (effAtk.attack + abilityAtkBonus + extraAttack + inspiredAttackBonus) - (actualDefenderDefense + defBonus + abilityDefBonus);

    // fighting_spirit 保证 1 (满状态)，否则按当前血量 / 最大血量
    const isFightingSpirit = hasAbi(attacker, 'fighting_spirit');
    const hpRatio = isFightingSpirit ? 1 : (attacker.hp / effAtk.maxHp);

    let finalDamage = Math.floor(rawDamage * hpRatio);

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
    
    // 如果有 pendingUnitId，只能执行该 unit 的操作，并且不能招募，通常也不能 end_turn (如果可能的话最好限制)
    const pendingUnitId = state.pendingUnitId;
    
    // 只属于当前玩家的未行动完的单位
    let validUnits = state.units.filter(u => u.ownerId === playerId && !u.hasActed);
    if (pendingUnitId) {
        validUnits = validUnits.filter(u => u.id === pendingUnitId);
    }

    // 突击部队可在攻击后未进行突击移动时再移动一次
    let assaultUnits = state.units.filter(u => 
        u.ownerId === playerId && 
        u.hasActed && 
        hasAbi(u, 'assault_troop') && 
        (u.movementRemaining ?? 0) > 0 && 
        !u.hasPostAttackMoved
    );
    if (pendingUnitId) {
        assaultUnits = assaultUnits.filter(u => u.id === pendingUnitId);
    }

    const enemyUnits = state.units.filter(u => u.ownerId !== playerId);
    const friendUnits = state.units.filter(u => u.ownerId === playerId);

    // 1. 突击二次移动作为专用合法指令生成
    for (const unit of assaultUnits) {
        // 由于突击后移动逻辑本身可能没有使用 getRecruitDeployPositions，我们可以直接用原本的即可
        const reachable = getReachablePositions(state, unit.id, unit.movementRemaining);
        for (const pos of reachable) {
            // 不能发呆在原位
            if (pos.x !== unit.pos.x || pos.y !== unit.pos.y) {
                actions.push({ type: 'post_attack_move', unitId: unit.id, to: pos });
            }
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

        // 2.2 攻击动作
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
                    const canReceiveHealer = isUndead(friend) || friend.hp <= friendEff.maxHp;
                    const notHealedYet = !friend.hasBeenHealedThisTurn;
                    const notPoisoned = !(friend.status && friend.status.type === 'poisoned');
                    const isNotGroundToFlying = !(isFlying(friend) && !isFlying(unit));

                    if (canReceiveHealer && notHealedYet && notPoisoned && isNotGroundToFlying) {
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

    // 3. 招募: 只有在没有 pendingUnitId 时才能招募。
    if (!pendingUnitId) {
        const playerGold = state.players.find(p => p.id === playerId)?.gold || 0;
        const recruitClasses = Object.keys(UNIT_CONFIGS).filter(c => c !== 'commander' && UNIT_CONFIGS[c].cost !== null) as UnitClass[];
        
        // Find all castles owned by player
        for (let y = 0; y < state.map.height; y++) {
            for (let x = 0; x < state.map.width; x++) {
                const tile = state.map.tiles[y][x];
                if (TERRAIN_CONFIG[tile.terrainId].key === 'castle' && tile.ownerId === playerId) {
                    const occupant = state.units.find(u => u.pos.x === x && u.pos.y === y);
                    
                    if (!occupant) {
                        // 城堡为空：使用 recruit_to_castle
                        for (const c of recruitClasses) {
                            if (playerGold >= UNIT_CONFIGS[c].cost!) {
                                actions.push({ type: 'recruit_to_castle', unitClass: c, castlePos: { x, y } });
                            }
                        }
                    } else if (occupant.ownerId === playerId && occupant.unitClass === 'commander') {
                        // 城堡上有己方指挥官：使用 recruit_and_deploy
                        for (const c of recruitClasses) {
                            if (playerGold >= UNIT_CONFIGS[c].cost!) {
                                // 检查可部署的位置
                                const validSpawns = getRecruitDeployPositions(state, playerId, c, { x, y });
                                for (const to of validSpawns) {
                                    actions.push({ type: 'recruit_and_deploy', unitClass: c, castlePos: { x, y }, to });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 4. 结束回合: 仅在无 pendingUnitId 或该单位已完成行动(但还没被engine清理，理论上清理会在动作结束时发生)时允许
    if (!pendingUnitId) {
        actions.push({ type: 'end_turn' });
    } else {
        // 安全起见，如果 pendingUnit 死活无法行动，或者已经行动，还是允许 end_turn 防止卡死
        const unit = state.units.find(u => u.id === pendingUnitId);
        if (!unit || unit.hasActed) {
             actions.push({ type: 'end_turn' });
        }
    }

    return actions;
}
