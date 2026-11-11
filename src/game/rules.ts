import { Action, GameState, Position, Unit, UnitClass, Ability } from './types';
import { UNIT_CONFIGS } from './constants';
import { getDistance, getReachablePositions, isWithinBounds, getRecruitDeployPositions } from './map';
import { isFlying, isUndead, isWaterTerrain, getAttackBonus, getDefenseBonus, getFinalDamageMultiplier, getEffectiveStats, hasAbility as hasAbi, projectExpOutcome, ATTACK_EXP, KILL_EXP } from './abilities';
import { areAlliedPlayers, areEnemyPlayers, canRecruitUnitClass, getRecruitableUnits, getScalarRule, getNumericRule, isActivePlayer, isCommanderUnit } from './rule_config';
import { getTileDefenseBonus, getTileTerrainConfig, getTileTerrainKey, isTileDestroyableForRules } from './terrain_rules';

/**
 * 纯规则校验模块
 */

export function hasAbility(unitClass: UnitClass, ability: Ability) {
    return UNIT_CONFIGS[unitClass].abilities.includes(ability);
}

// 战斗伤害计算 - 纯函数
//
// V14/T14-03：伤害公式中有一处按「攻击者当前 HP / 最大 HP」的缩放。反击发生时反击方
// 的 HP 已经因本次攻击而下降，因此预测反击必须能传入「用于缩放的那一点 HP」。
// 公开入口 calculateDamage 的行为与历史实现完全一致（使用单位当前 hp）。
export function calculateDamage(state: GameState, attackerId: string, defenderId: string): number {
    const attacker = state.units.find(u => u.id === attackerId);
    return calculateDamageAtHp(state, attackerId, defenderId, attacker?.hp ?? 0);
}

/** 伤害公式内部入口：extraAttackerHp 覆盖「用于 HP 缩放」的攻击者血量。 */
export function calculateDamageAtHp(
    state: GameState,
    attackerId: string,
    defenderId: string,
    extraAttackerHp: number,
    /**
     * V15/T15-02：攻击者在伤害结算时使用的实际等级与最大 HP。
     *
     * 反击场景下引擎已经对攻击者执行过 `addExp`，升级会同时提高攻击、防御与最大 HP。
     * 只覆盖 `extraAttackerHp` 不足以表达这一变化，因此这里允许调用方显式给出
     * 「已投影的攻击者等级/最大 HP」。缺省（undefined）时读取单位自身字段，
     * 与历史实现完全一致。
     *
     * 注意区分两个"血量"参数：`extraAttackerHp` 是本函数唯一使用的 HP，
     * 它表示**发起这一击的单位**用于伤害缩放的当前 HP。在反击场景里发起者是反击方，
     * 因此传的是被攻击者受击后的剩余 HP，而不是攻击者的 HP。
     */
    attackerOverride?: { level?: number; maxHp?: number } | null,
): number {
    const attacker = state.units.find(u => u.id === attackerId);
    const defender = state.units.find(u => u.id === defenderId);
    
    if (!attacker || !defender) return 0;

    // 投影只有在本函数内部生效；绝不写回 state 或 attacker。
    const projectedAttacker: Unit = attackerOverride
        ? ({
            ...attacker,
            level: attackerOverride.level ?? attacker.level,
            maxHp: attackerOverride.maxHp ?? attacker.maxHp,
        } as Unit)
        : attacker;

    const effAtk = getEffectiveStats(projectedAttacker);
    const effDef = getEffectiveStats(defender);
    const atkStats = UNIT_CONFIGS[attacker.unitClass];
    const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
    const defTerrain = getTileTerrainConfig(defTile);
    const dist = getDistance(attacker.pos, defender.pos);

    // 其他攻击加成
    let extraAttack = 0;
    if (hasAbi(attacker, 'sharpshooter') && hasAbi(defender, 'flying')) {
        extraAttack += getNumericRule(state, 'sharpshooterAttackBonus');
    }
    if (hasAbi(attacker, 'destroyer') && defTerrain.key === 'town') {
        extraAttack += getNumericRule(state, 'destroyerAttackBonus');
    }
    if (hasAbi(attacker, 'flying') && isWaterTerrain(defTile) && !hasAbi(defender, 'flying')) {
        extraAttack += getNumericRule(state, 'flyingWaterAttackBonus');
    }
    if (hasAbi(attacker, 'death_reaper') && defender.status && (defender.status.type === 'poisoned' || defender.status.type === 'blinded' || defender.status.type === 'weakened')) {
        extraAttack += getNumericRule(state, 'deathReaperAttackBonus');
    }

    // 地形防御加成
    const defBonus = isFlying(defender) ? 0 : getTileDefenseBonus(defTile);

    // 动态能力增加的攻防加成（如地形之子）
    const abilityAtkBonus = getAttackBonus(state, projectedAttacker, defender);
    const abilityDefBonus = getDefenseBonus(state, projectedAttacker, defender);

    // 鼓舞状态：攻击 +10，远程攻击减半为 +5。
    const inspiredAttackBonus = attacker.status?.type === 'inspired'
        ? (dist > 1 ? Math.trunc(getNumericRule(state, 'inspiredAttackBonus') / 2) : getNumericRule(state, 'inspiredAttackBonus'))
        : 0;

    // 选择物理防御还是魔法防御
    const isMagic = atkStats.attackType === 'magic';
    // getEffectiveStats 已按默认 -10 应用虚弱；这里按 APK C0611d.f1266E 校正自定义规则，远程惩罚减半。
    const weakenedPenalty = dist > 1
        ? Math.trunc(getNumericRule(state, 'weakenedDefensePenalty') / 2)
        : getNumericRule(state, 'weakenedDefensePenalty');
    const weakenedRangedDefenseAdjustment = defender.status?.type === 'weakened'
        ? 10 - weakenedPenalty
        : 0;
    const actualDefenderDefense = (isMagic ? effDef.magicDefense : effDef.physicalDefense) + weakenedRangedDefenseAdjustment;

    // 最终伤害 = (单位攻击 + 地形之子攻击 + 其他伤害加成 + 光环加成 - 实际防御 - 地形防御加成 - 地形之子防御)
    const rawDamage = Math.max(0, (effAtk.attack + abilityAtkBonus + extraAttack + inspiredAttackBonus) - (actualDefenderDefense + defBonus + abilityDefBonus));

    // APK C0600q.m4339b 使用整数乘除，避免 JS 浮点误差把 45 * 140 / 100 错取整为 62。
    const isFightingSpirit = hasAbi(projectedAttacker, 'fighting_spirit');
    let finalDamage = isFightingSpirit
        ? rawDamage
        : Math.trunc((rawDamage * extraAttackerHp) / effAtk.maxHp);

    const finalMultiplier = getFinalDamageMultiplier(state, projectedAttacker, defender, dist);
    finalDamage = Math.floor(finalDamage * finalMultiplier);

    return Math.max(0, finalDamage);
}

// 检查是否在射程内
export function inRange(pos1: Position, pos2: Position, minRange: number, maxRange: number): boolean {
    const dist = getDistance(pos1, pos2);
    return dist >= minRange && dist <= maxRange;
}

/**
 * V14/T14-03：反击判定的唯一权威实现。
 *
 * 调用约定（必须与 engine.step 的 attack 分支一致）：
 * 传入的 `state` 必须已经应用了本次攻击的伤害与状态效果；因此本函数只看
 * 应用之后的目标血量与状态。历史实现（v13 的
 * src/game/ai/spatial_tensor_encoder.ts:313）在原状态上直接反算，
 * 于是把 3 格外投石车攻击也标成会反击，与引擎结果矛盾。
 *
 * 规则要点：目标存活才可能反击；反击风暴只看能力与距离（<=2），
 * 普通反击要求相邻 (distance === 1) 且目标射程能覆盖攻击者。
 * 致盲等状态在伤害之后结算，因此会阻止普通反击。
 */
export function canCounterAttack(state: GameState, attackerId: string, defenderId: string): boolean {
    const attacker = state.units.find(u => u.id === attackerId);
    const target = state.units.find(u => u.id === defenderId);
    if (!attacker || !target) return false;
    if (target.hp <= 0) return false;
    const targetStats = getEffectiveStats(target);
    const distance = getDistance(target.pos, attacker.pos);
    const isCounterStorm = hasAbi(target, 'counter_storm') && distance <= 2;
    const canNormalCounter = distance === 1 && inRange(
        target.pos,
        attacker.pos,
        targetStats.minRange,
        targetStats.maxRange
    );
    return isCounterStorm || canNormalCounter;
}

/**
 * V15/T15-02：不改动 state 的反击伤害预测。用于特征编码与搜索估算。
 *
 * 与 `engine.step` 的 attack 分支逐步对齐（顺序是权威）：
 *   主动伤害 → 附加状态 → 攻击者 addExp → 反击资格 → 反击伤害
 *   （src/game/engine.ts:577 / 582 / 585 / 592 / 600）
 *
 * 因此本函数必须在**投影状态**上完成最后两步，而不是在原状态上直接算：
 * 1. 只有目标在本次攻击后仍存活才可能反击；
 * 2. 攻击者击中目标后立刻获得经验，跨过阈值就升级，攻/防/最大 HP 同时变化；
 *    引擎的反击伤害是在「已经升级」的攻击者身上算的（V14b 审核反例：
 *    经验 90 的 0 级士兵攻击后升到 1 级，引擎实际反击 22，旧预测给 25）。
 * 3. 反击伤害按「反击方受击后的剩余 HP / 反击方最大 HP」缩放。
 *
 * 历史缺陷（保留在显式历史适配器里，不在这里）：v13 在原状态上无条件反算反击，
 * 把 3 格外投石车攻击也标成会反击（estCounter=50，引擎实际 0）。
 */
export function estimateCounterDamage(state: GameState, attackerId: string, defenderId: string): number {
    const attacker = state.units.find(u => u.id === attackerId);
    const target = state.units.find(u => u.id === defenderId);
    if (!attacker || !target) return 0;
    const levelCap = getScalarRule(state, 'levelCap');
    const incoming = calculateDamage(state, attackerId, defenderId);
    const targetHpAfter = target.hp - incoming;
    if (targetHpAfter <= 0) return 0;

    // V14/T14-03：引擎在反击判定之前就会对目标施加本次攻击的状态效果
    // （applyCombatStatusEffects），而致盲会把目标的 minRange/maxRange 归零，
    // 从而阻止普通反击。早期实现在攻击前的状态上调用 canCounterAttack，
    // 因此 wolf_archer / dark_mage 相邻攻击时会把反击预测成 15 / 30（引擎实际 0）。
    // 投影只修改攻守双方的标量和状态引用；地图及其他单位保持只读共享。
    // 避免每个候选攻击都序列化整张多人地图，同时保留完整光环上下文。
    const projected: GameState = { ...state, units: state.units.map(u => u.id === attackerId || u.id === defenderId ? { ...u } : u) };
    const projectedAttacker = projected.units.find(u => u.id === attackerId);
    const projectedTarget = projected.units.find(u => u.id === defenderId);
    if (!projectedAttacker || !projectedTarget) return 0;
    projectedTarget.hp = targetHpAfter;
    applyCombatStatusEffectsForProjection(attacker, projectedTarget);

    // V15/T15-02：把「攻击者本次攻击获得的经验」投影到 projected 上，与引擎顺序一致。
    // 用真正的 addExp 在一份拷贝上演算（projectExpOutcome），避免预测路径重写公式。
    const outgoingExp = targetHpAfter <= 0 ? KILL_EXP : ATTACK_EXP;
    const beforeLevel = projectedAttacker.level ?? 0;
    const beforeMaxHp = projectedAttacker.maxHp ?? 100;
    const hpProjection = projectExpOutcome(projectedAttacker, outgoingExp, levelCap);
    if (hpProjection) {
        projectedAttacker.level = hpProjection.level as Unit['level'];
        projectedAttacker.exp = hpProjection.exp;
        projectedAttacker.hp = hpProjection.hp;
        const levelsGained = hpProjection.level - beforeLevel;
        if (levelsGained > 0) {
            projectedAttacker.maxHp = beforeMaxHp
                + UNIT_CONFIGS[projectedAttacker.unitClass].maxHpGrowth * levelsGained;
        }
    }

    if (!canCounterAttack(projected, attackerId, defenderId)) return 0;
    // 反击伤害的缩放基准是反击方（defenderId）受击后的剩余 HP。
    return calculateDamageAtHp(projected, defenderId, attackerId, targetHpAfter);
}

/**
 * V15/T15-02：**历史 V14 口径**的反击预测，仅供历史 V14 权重复核使用。
 *
 * 与 `estimateCounterDamage` 的唯一差别：不投影攻击者本次攻击获得的经验/升级。
 * T15-02 的审核反例正是靠它复现：经验 90 的 0 级士兵攻击后升到 1 级，
 * 本函数给出 25，引擎实际 22。新 schema（V15）与正式数据生成一律不得调用它。
 */
export function estimateCounterDamageWithoutExpProjection(
    state: GameState,
    attackerId: string,
    defenderId: string,
): number {
    const attacker = state.units.find(u => u.id === attackerId);
    const target = state.units.find(u => u.id === defenderId);
    if (!attacker || !target) return 0;
    const incoming = calculateDamage(state, attackerId, defenderId);
    const targetHpAfter = target.hp - incoming;
    if (targetHpAfter <= 0) return 0;
    const projected = JSON.parse(JSON.stringify(state)) as GameState;
    const projectedTarget = projected.units.find(u => u.id === defenderId);
    if (!projectedTarget) return 0;
    projectedTarget.hp = targetHpAfter;
    applyCombatStatusEffectsForProjection(attacker, projectedTarget);
    if (!canCounterAttack(projected, attackerId, defenderId)) return 0;
    return calculateDamageAtHp(projected, defenderId, attackerId, targetHpAfter);
}

/**
 * V14/T14-03：与 `GameEngine.applyCombatStatusEffects` 相同规则的状态附加投影。
 *
 * 只做「先中毒、后致盲；不覆盖已有其它状态」这一套与反击判定相关的规则。
 * 之所以在这里复制而不是导出引擎私有方法：引擎那侧是实例方法且带副作用语义，
 * 而预测路径必须无副作用。两处规则必须同步修改（engine.ts 的 applyCombatStatusEffects）。
 */
function applyCombatStatusEffectsForProjection(source: Unit, target: Unit): void {
    if (target.hp <= 0) return;
    if (hasAbi(source, 'poisoner') && !hasAbi(target, 'poisoner')) {
        if (!target.status || target.status.type === 'poisoned') {
            target.status = { type: 'poisoned', remainingTicks: 2 };
        }
    }
    if (hasAbi(source, 'blinder') && !hasAbi(target, 'blinder')) {
        if (!target.status || target.status.type === 'blinded') {
            target.status = { type: 'blinded', remainingTurns: 1 };
        }
    }
}

/**
 * V14/T14-03：在「本次攻击已经结算」的状态上计算实际反击伤害。
 *
 * 与 estimateCounterDamage 的区别只在调用时机：
 * - estimateCounterDamage 接受攻击前的状态，自己预测伤害与存活；
 * - counterDamageOnResolvedState 接受引擎已经扣血、已经附加状态之后的状态，
 *   因此不再预测伤害，直接用当前 HP 作为缩放基准（与 engine.step 的调用点一致）。
 */
export function counterDamageOnResolvedState(state: GameState, attackerId: string, defenderId: string): number {
    const attacker = state.units.find(u => u.id === attackerId);
    const target = state.units.find(u => u.id === defenderId);
    if (!attacker || !target) return 0;
    if (!canCounterAttack(state, attackerId, defenderId)) return 0;
    return calculateDamageAtHp(state, defenderId, attackerId, target.hp);
}

function canHealTarget(state: GameState, healer: Unit, target: Unit): boolean {
    if (getDistance(healer.pos, target.pos) > 1) return false;

    // APK m4355a(..., true) 先筛选有效射程和自身；致盲只留下自身候选。
    const range = getEffectiveStats(healer);
    if (healer.id !== target.id && !inRange(healer.pos, target.pos, range.minRange, range.maxRange)) return false;

    // APK m4276k：候选中的亡灵不再限制阵营或中毒状态。
    if (isUndead(target)) {
        return true;
    }

    const notPoisoned = !(target.status && target.status.type === 'poisoned');
    const targetCanReceiveHealing = target.hp <= getEffectiveStats(target).maxHp;
    return areAlliedPlayers(state, healer.ownerId, target.ownerId) && notPoisoned && targetCanReceiveHealing;
}

// 获取当前玩家所有合法动作
/** 定向查询只省略无关候选的生成，未指定时保持完整候选顺序。 */
export interface LegalActionQuery {
    skipMovement?: boolean;
    unitId?: string;
    /** 定向战术或非招募动作校验可跳过全局招募，其他候选及顺序保持。 */
    skipRecruitment?: boolean;
    /** 仅生成普通攻击，等同完整候选过滤attack；仍应用单位和pending限制。 */
    onlyAttacks?: boolean;
    /** 仅生成普通move的有序子集；不含突击二次移动，与onlyAttacks同时启用时为空。 */
    onlyOrdinaryMoves?: boolean;
}

function appendOrdinaryMoves(actions: Action[], state: GameState, unit: Unit) {
    if (unit.hasMoved) return;
    for (const pos of getReachablePositions(state, unit.id)) {
        if (pos.x !== unit.pos.x || pos.y !== unit.pos.y) {
            actions.push({ type: 'move', unitId: unit.id, to: pos });
        }
    }
}

function appendAttackActions(actions: Action[], unit: Unit, enemies: readonly Unit[], stats: ReturnType<typeof getEffectiveStats>) {
    if (stats.maxRange > 0) for (const enemy of enemies) {
        if (inRange(unit.pos, enemy.pos, stats.minRange, stats.maxRange)) {
            actions.push({ type: 'attack', attackerId: unit.id, targetId: enemy.id });
        }
    }
}

function pendingAssaultUnit(state: GameState, playerId: number): Unit | undefined {
    // 阶段三必须先完成存活突击单位的收尾，定向查询不能绕过此锁。
    return state.units.find(u => u.ownerId === playerId && u.hp > 0 && u.hasActed
        && hasAbi(u, 'assault_troop') && (u.movementRemaining ?? 0) > 0
        && !u.hasPostAttackMoved && !u.apkStatic);
}

function actionReadyUnits(state: GameState, playerId: number): Unit[] {
    if (pendingAssaultUnit(state, playerId)) return [];
    const pendingId = state.pendingUnitId;
    const locked = Boolean(pendingId && state.units.find(u => u.id === pendingId)?.apkPendingRecruitSource !== 'empty_castle');
    return state.units.filter(u => u.ownerId === playerId && !u.hasActed && !u.apkStatic && (!locked || u.id === pendingId));
}

/** 数量与skipMovement/skipRecruitment查询中的wait完全一致，不生成其他候选。 */
export function getActionReadyUnitCount(state: GameState, playerId: number): number {
    return isActivePlayer(state, playerId) ? actionReadyUnits(state, playerId).length : 0;
}

export function getLegalActions(state: GameState, playerId: number, query: LegalActionQuery = {}): Action[] {
    const actions: Action[] = [];

    if (!isActivePlayer(state, playerId)) {
        return actions;
    }

    const assault = pendingAssaultUnit(state, playerId);
    if (assault) {
        if (!query.skipMovement && !query.onlyAttacks && !query.onlyOrdinaryMoves
            && (query.unitId === undefined || query.unitId === assault.id)) {
            for (const pos of getReachablePositions(state, assault.id, assault.movementRemaining)) {
                actions.push({ type: 'post_attack_move', unitId: assault.id, to: pos });
            }
        }
        return actions;
    }
    
    // APK stacked 规则：pending 单位未处理时只能操作该单位；空城堡招募 pending 可额外结束回合/投降。
    const pendingUnitId = state.pendingUnitId;
    const pendingUnit = pendingUnitId ? state.units.find(u => u.id === pendingUnitId) : undefined;
    const canResolveEmptyCastlePendingWithTurnAction = pendingUnit?.apkPendingRecruitSource === 'empty_castle';
    
    // 只属于当前玩家、未行动完且未被 APK 脚本静态锁定的单位
    let validUnits = actionReadyUnits(state, playerId);
    if (query.unitId !== undefined) validUnits = validUnits.filter(u => u.id === query.unitId);

    if (query.onlyOrdinaryMoves) {
        if (!query.onlyAttacks && !query.skipMovement) for (const unit of validUnits) appendOrdinaryMoves(actions, state, unit);
        return actions;
    }
    const enemyUnits = state.units.filter(u => areEnemyPlayers(state, u.ownerId, playerId));
    if (query.onlyAttacks) {
        for (const unit of validUnits) appendAttackActions(actions, unit, enemyUnits, getEffectiveStats(unit));
        return actions;
    }
    const rules = {
        commanderCastleRecruitUsesPending: getScalarRule(state, 'commanderCastleRecruitUsesPending'),
        allowSurrender: getScalarRule(state, 'allowSurrender'),
        allowPendingRecruitSurrender: getScalarRule(state, 'allowPendingRecruitSurrender'),
        allowPendingRecruitEndTurn: getScalarRule(state, 'allowPendingRecruitEndTurn')
    };

    const sameTeamUnits = state.units.filter(u => u.ownerId === playerId);

    // 2. 正常尚未行动单位的合法动作
    for (const unit of validUnits) {
        const eff = getEffectiveStats(unit);
        const tileUnder = state.map.tiles[unit.pos.y][unit.pos.x];
        const terrainConfig = getTileTerrainConfig(tileUnder);

        // 2.1 移动 (在还没移动的情况下)
        if (!query.skipMovement) appendOrdinaryMoves(actions, state, unit);

        // 2.2 攻击动作
        if (eff.maxRange > 0) {
            appendAttackActions(actions, unit, enemyUnits, eff);
            if (hasAbi(unit, 'destroyer')) {
                for (let y = 0; y < state.map.height; y++) {
                    for (let x = 0; x < state.map.width; x++) {
                        const targetTile = state.map.tiles[y][x];
                        // 只有可破坏且在射程内的格子才查询占位，避免每个假想落点反复扫描全图单位。
                        if (isTileDestroyableForRules(targetTile) && inRange(unit.pos, { x, y }, eff.minRange, eff.maxRange)
                            && !state.units.some(u => u.pos.x === x && u.pos.y === y)) {
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
                if (inRange(unit.pos, grave.pos, eff.minRange, eff.maxRange)) {
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
        const canCaptureOwner = tileUnder.ownerId === null || !areAlliedPlayers(state, tileUnder.ownerId, playerId);
        if (terrainConfig.key === 'town' && canCaptureOwner && hasAbi(unit, 'village_capturer')) {
            actions.push({ type: 'capture', unitId: unit.id });
        }
        if (terrainConfig.key === 'castle' && canCaptureOwner && hasAbi(unit, 'castle_capturer')) {
            actions.push({ type: 'capture', unitId: unit.id });
        }

        // 2.8 修理 (standing on damaged_town)
        if (terrainConfig.key === 'damaged_town' && hasAbi(unit, 'repairer')) {
            actions.push({ type: 'repair', unitId: unit.id });
        }

        // 2.9 待机
        actions.push({ type: 'wait', unitId: unit.id });
    }

    // 3. 招募: 只有在没有 pendingUnitId 时才能招募。
    if (!pendingUnitId && !query.skipRecruitment) {
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
                                // 扣费前按兵种检查移出落点，飞行单位复用可越过敌军的移动规则。
                                if (getRecruitDeployPositions(state, playerId, c, { x, y }).length > 0) {
                                    actions.push({ type: 'recruit_to_castle', unitClass: c, castlePos: { x, y } });
                                }
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
