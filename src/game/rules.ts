import { Action, GameState, Position, Unit, UnitClass, Ability } from './types';
import { UNIT_CONFIGS } from './constants';
import { getDistance, getReachablePositions, isWithinBounds, getRecruitDeployPositions } from './map';
import { isFlying, isUndead, isWaterTerrain, getAttackBonus, getDefenseBonus, getFinalDamageMultiplier, getEffectiveStats, hasAbility as hasAbi } from './abilities';
import { areAlliedPlayers, areEnemyPlayers, canRecruitUnitClass, getRecruitableUnits, getRuleConfig, isActivePlayer, isCommanderUnit } from './rule_config';
import { getTileDefenseBonus, getTileTerrainConfig, getTileTerrainKey, isTileDestroyableForRules } from './terrain_rules';

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
    const ruleConfig = getRuleConfig(state);

    const atkStats = UNIT_CONFIGS[attacker.unitClass];
    const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
    const defTerrain = getTileTerrainConfig(defTile);
    const dist = getDistance(attacker.pos, defender.pos);

    // 其他攻击加成
    let extraAttack = 0;
    if (hasAbi(attacker, 'sharpshooter') && hasAbi(defender, 'flying')) {
        extraAttack += ruleConfig.sharpshooterAttackBonus;
    }
    if (hasAbi(attacker, 'destroyer') && defTerrain.key === 'town') {
        extraAttack += ruleConfig.destroyerAttackBonus;
    }
    if (hasAbi(attacker, 'flying') && isWaterTerrain(defTile) && !hasAbi(defender, 'flying')) {
        extraAttack += ruleConfig.flyingWaterAttackBonus;
    }
    if (hasAbi(attacker, 'death_reaper') && defender.status && (defender.status.type === 'poisoned' || defender.status.type === 'blinded' || defender.status.type === 'weakened')) {
        extraAttack += ruleConfig.deathReaperAttackBonus;
    }

    // 地形防御加成
    const defBonus = isFlying(defender) ? 0 : getTileDefenseBonus(defTile);

    // 动态能力增加的攻防加成（如地形之子）
    const abilityAtkBonus = getAttackBonus(state, attacker, defender);
    const abilityDefBonus = getDefenseBonus(state, attacker, defender);

    // 鼓舞状态：攻击 +10，远程攻击减半为 +5。
    const inspiredAttackBonus = attacker.status?.type === 'inspired'
        ? (dist > 1 ? Math.trunc(ruleConfig.inspiredAttackBonus / 2) : ruleConfig.inspiredAttackBonus)
        : 0;

    // 选择物理防御还是魔法防御
    const isMagic = atkStats.attackType === 'magic';
    // getEffectiveStats 已按默认 -10 应用虚弱；这里按 APK C0611d.f1266E 校正自定义规则，远程惩罚减半。
    const weakenedPenalty = dist > 1
        ? Math.trunc(ruleConfig.weakenedDefensePenalty / 2)
        : ruleConfig.weakenedDefensePenalty;
    const weakenedRangedDefenseAdjustment = defender.status?.type === 'weakened'
        ? 10 - weakenedPenalty
        : 0;
    const actualDefenderDefense = (isMagic ? effDef.magicDefense : effDef.physicalDefense) + weakenedRangedDefenseAdjustment;

    // 最终伤害 = (单位攻击 + 地形之子攻击 + 其他伤害加成 + 光环加成 - 实际防御 - 地形防御加成 - 地形之子防御)
    const rawDamage = Math.max(0, (effAtk.attack + abilityAtkBonus + extraAttack + inspiredAttackBonus) - (actualDefenderDefense + defBonus + abilityDefBonus));

    // APK C0600q.m4339b 使用整数乘除，避免 JS 浮点误差把 45 * 140 / 100 错取整为 62。
    const isFightingSpirit = hasAbi(attacker, 'fighting_spirit');
    let finalDamage = isFightingSpirit
        ? rawDamage
        : Math.trunc((rawDamage * attacker.hp) / effAtk.maxHp);

    const finalMultiplier = getFinalDamageMultiplier(state, attacker, defender, dist);
    finalDamage = Math.floor(finalDamage * finalMultiplier);

    return Math.max(0, finalDamage);
}

// 检查是否在射程内
export function inRange(pos1: Position, pos2: Position, minRange: number, maxRange: number): boolean {
    const dist = getDistance(pos1, pos2);
    return dist >= minRange && dist <= maxRange;
}

function canHealTarget(state: GameState, healer: Unit, target: Unit): boolean {
    if (getDistance(healer.pos, target.pos) > 1) return false;

    // APK 反编译 C0600q.m4276k：亡灵目标直接允许治疗，不再限制阵营或中毒状态。
    if (isUndead(target)) {
        return true;
    }

    const notPoisoned = !(target.status && target.status.type === 'poisoned');
    const targetCanReceiveHealing = target.hp <= getEffectiveStats(target).maxHp;
    return areAlliedPlayers(state, healer.ownerId, target.ownerId) && notPoisoned && targetCanReceiveHealing;
}

// 获取当前玩家所有合法动作
export function getLegalActions(state: GameState, playerId: number): Action[] {
    const actions: Action[] = [];

    if (!isActivePlayer(state, playerId)) {
        return actions;
    }
    
    // APK stacked 规则：pending 单位未处理时只能操作该单位；空城堡招募 pending 可额外结束回合/投降。
    const pendingUnitId = state.pendingUnitId;
    const pendingUnit = pendingUnitId ? state.units.find(u => u.id === pendingUnitId) : undefined;
    const rules = getRuleConfig(state);
    const canResolveEmptyCastlePendingWithTurnAction = pendingUnit?.apkPendingRecruitSource === 'empty_castle';
    const pendingLocksUnitActions = Boolean(pendingUnitId && pendingUnit?.apkPendingRecruitSource !== 'empty_castle');
    
    // 只属于当前玩家、未行动完且未被 APK 脚本静态锁定的单位
    let validUnits = state.units.filter(u => u.ownerId === playerId && !u.hasActed && !u.apkStatic);
    if (pendingLocksUnitActions) {
        validUnits = validUnits.filter(u => u.id === pendingUnitId);
    }

    // 突击部队可在攻击后未进行突击移动时再移动一次
    let assaultUnits = state.units.filter(u => 
        u.ownerId === playerId && 
        u.hasActed && 
        hasAbi(u, 'assault_troop') && 
        (u.movementRemaining ?? 0) > 0 && 
        !u.hasPostAttackMoved &&
        !u.apkStatic
    );
    if (pendingLocksUnitActions) {
        assaultUnits = assaultUnits.filter(u => u.id === pendingUnitId);
    }

    const enemyUnits = state.units.filter(u => areEnemyPlayers(state, u.ownerId, playerId));
    const sameTeamUnits = state.units.filter(u => u.ownerId === playerId);

    // 1. 突击二次移动作为专用合法指令生成
    for (const unit of assaultUnits) {
        // 由于突击后移动逻辑本身可能没有使用 getRecruitDeployPositions，我们可以直接用原本的即可
        const reachable = getReachablePositions(state, unit.id, unit.movementRemaining);
        for (const pos of reachable) {
            // APK 在突击后移动状态允许点当前格，用于原地结束突击移动并触发 POST_ACTION。
            actions.push({ type: 'post_attack_move', unitId: unit.id, to: pos });
        }
    }

    // 2. 正常尚未行动单位的合法动作
    for (const unit of validUnits) {
        const eff = getEffectiveStats(unit);
        const tileUnder = state.map.tiles[unit.pos.y][unit.pos.x];
        const terrainConfig = getTileTerrainConfig(tileUnder);

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
            if (hasAbi(unit, 'destroyer')) {
                for (let y = 0; y < state.map.height; y++) {
                    for (let x = 0; x < state.map.width; x++) {
                        const targetTile = state.map.tiles[y][x];
                        const occupied = state.units.some(u => u.pos.x === x && u.pos.y === y);
                        if (!occupied && isTileDestroyableForRules(targetTile) && inRange(unit.pos, { x, y }, eff.minRange, eff.maxRange)) {
                            actions.push({ type: 'destroy_town', unitId: unit.id, target: { x, y } });
                        }
                    }
                }
            }
        }

        // 2.3 治疗 (healer，对相邻格或自身生效)
        if (hasAbi(unit, 'healer')) {
            for (const target of state.units) {
                if (canHealTarget(state, unit, target)) {
                    actions.push({ type: 'heal', healerId: unit.id, targetId: target.id });
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
            for (const friend of sameTeamUnits) {
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
        const canCaptureOwner = tileUnder.ownerId === null || tileUnder.ownerId !== playerId;
        if (terrainConfig.key === 'town' && canCaptureOwner && hasAbi(unit, 'village_capturer')) {
            actions.push({ type: 'capture', unitId: unit.id });
        }
        if (terrainConfig.key === 'castle' && canCaptureOwner && hasAbi(unit, 'castle_capturer')) {
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
        const recruitClasses = getRecruitableUnits(state, playerId)
            .filter(c => canRecruitUnitClass(state, playerId, c));
        
        // Find all castles owned by player
        for (let y = 0; y < state.map.height; y++) {
            for (let x = 0; x < state.map.width; x++) {
                const tile = state.map.tiles[y][x];
                if (getTileTerrainKey(tile) === 'castle' && tile.ownerId === playerId) {
                    const occupant = state.units.find(u => u.pos.x === x && u.pos.y === y);
                    
                    if (!occupant) {
                        // 城堡为空：使用 recruit_to_castle
                        for (const c of recruitClasses) {
                            actions.push({ type: 'recruit_to_castle', unitClass: c, castlePos: { x, y } });
                        }
                    } else if (occupant.ownerId === playerId && isCommanderUnit(state, occupant, playerId)) {
                        if (rules.commanderCastleRecruitUsesPending) {
                            // APK 多人回放中，指挥官城堡招募会先生成堆叠 pending 单位，随后由下一条动作移出城堡。
                            for (const c of recruitClasses) {
                                actions.push({ type: 'recruit_to_castle', unitClass: c, castlePos: { x, y } });
                            }
                            continue;
                        }

                        // 非 APK 默认规则保留旧的直接部署动作。
                        for (const c of recruitClasses) {
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

    // 4. 投降/结束回合：APK 实测为空城堡招募 pending 时允许，指挥官站城堡的堆叠招募 pending 时禁止。
    if (!pendingUnitId || canResolveEmptyCastlePendingWithTurnAction) {
        if (rules.allowSurrender && (!pendingUnitId || rules.allowPendingRecruitSurrender)) {
            actions.push({ type: 'surrender' });
        }
        if (!pendingUnitId || rules.allowPendingRecruitEndTurn) {
            actions.push({ type: 'end_turn' });
        }
    }

    return actions;
}
