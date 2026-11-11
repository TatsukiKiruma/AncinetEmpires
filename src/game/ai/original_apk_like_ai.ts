/**
 * OriginalApkLikeAI：APK `C1275a` 的源码级移植。
 *
 * 命名中的 `Original` 表示“按 APK 反编译原逻辑重写”，不是“APK 运行时等价物”。
 * 目前可证明的是：
 * - 决策主流程、单位选择、目标选择、候选动作枚举、评分公式按 `C1275a.java` 逐方法翻译；
 * - 伤害、移动、治疗、召唤、支援、反击、状态仍调用项目权威规则；
 * - 同一输入与相同随机流下动作确定；
 * - 每个返回动作都先通过 `GameEngine.getLegalActions` 校验。
 *
 * 不能证明的是逐动作等价：JADX 在 `m2330p()`、`m2347h()` 存在控制流还原失败，
 * 且项目规则是独立实现，没有 APK 实机差分轨迹。详见 docs/rules/original-apk-ai.md。
 */

import { GameEngine } from '../engine';
import { Action, GameState, Position, Unit } from '../types';
import { getDistance, getMovementCosts, getReachablePositions } from '../map';
import { getEffectiveStats, hasAbility } from '../abilities';
import { inRange } from '../rules';
import {
    areAlliedPlayers,
    areEnemyPlayers,
    canRecruitUnitClass,
    getCurrentPopulation,
    getRecruitableUnits,
    isCommanderUnit,
} from '../rule_config';
import {
    APK_EARLY_RECRUIT_TYPES,
    APK_PREFERRED_RECRUIT_TYPES,
    APK_SPECIAL_ABILITY_ORDER,
    ApkActionCandidate,
    ApkScoringContext,
    actionsEqual,
    apkActionScore,
    apkAttackScore,
    apkAttackRange,
    apkCombatValue,
    apkIsCastle,
    apkIsCapturable,
    apkIsRepairableTile,
    apkIsVillage,
    apkMoveRange,
    apkPerTurnRecruitCap,
    apkPositionScore,
    apkRecruitCap,
    apkTerrainKind,
    apkTargetValue,
    apkUnitTypeId,
    apkUnitValue,
    buildApkScoringContext,
    posKey,
    samePos,
    tileAt,
    unitAt,
    unitClassForApkType,
} from './original_apk_like_scoring';

export interface OriginalApkLikeAIOptions {
    /** 注入随机流，便于测试与训练复现；默认 Math.random。 */
    rng?: () => number;
    /** 决策后回调，便于外部记录 C1275a 中间量；不影响行为。 */
    onDecision?: (summary: {
        unitId: string | null;
        objective: Position | null;
        candidate: ApkActionCandidate | null;
        sequence: Action[];
    }) => void;
}

interface PlannedStep {
    action: Action;
    /** 执行该动作前的状态签名；用于跨 GameEngine 实例验证计划没有过期。 */
    beforeSignature: string;
}

interface DecisionPlan {
    playerId: number;
    steps: PlannedStep[];
    index: number;
}

interface ScoredCandidate {
    candidate: ApkActionCandidate;
    target?: Unit;
    score: number;
}

const MAX_RECRUIT_TYPE = 20;

export class OriginalApkLikeAI {
    private readonly rng: () => number;
    private readonly onDecision?: OriginalApkLikeAIOptions['onDecision'];
    private plan: DecisionPlan | null = null;

    constructor(options: OriginalApkLikeAIOptions = {}) {
        this.rng = options.rng ?? Math.random;
        this.onDecision = options.onDecision;
    }

    /** 清空跨动作计划；切换对局或手动接管时调用。 */
    reset(): void {
        this.plan = null;
    }

    public getAction(engine: GameEngine, playerId: number): Action {
        const state = engine.getState();
        const signature = stateSignature(state);

        const planned = this.consumePlan(signature);
        if (planned) return planned;

        const legal = engine.getLegalActions(playerId);
        if (legal.length === 0) return { type: 'end_turn' };

        const unit = selectUnit(state, playerId, legal);
        let sequence: Action[];
        const summaryUnitId: string | null = unit?.id ?? null;
        let objective: Position | null = null;
        let chosen: ApkActionCandidate | null = null;

        if (!unit) {
            sequence = [selectRecruitAction(state, playerId, legal, this.rng)];
        } else {
            const ctx = buildApkScoringContext(state, playerId);
            objective = selectObjective(ctx, unit);
            const candidates = generateCandidates(ctx, unit, legal);
            const scored = scoreCandidates(ctx, unit, candidates, objective);
            const best = scored.reduce<ScoredCandidate | null>(
                (current, entry) => (current === null || entry.score > current.score ? entry : current),
                null,
            );
            if (!best) {
                sequence = fallbackAction(state, playerId, unit, legal);
            } else {
                chosen = best.candidate;
                if (!chosen) {
                    sequence = fallbackAction(state, playerId, unit, legal);
                } else {
                    applyPostAttackMove(ctx, unit, chosen, objective);
                    sequence = buildSequence(unit, chosen);
                }
            }
        }

        this.onDecision?.({
            unitId: summaryUnitId,
            objective,
            candidate: chosen,
            sequence,
        });

        const plannedSequence = this.planSequence(engine, playerId, sequence);
        if (plannedSequence.length === 0) return fallbackEndTurn(legal);
        this.plan = {
            playerId,
            steps: [],
            index: 0,
        };
        const clone = engine.clone();
        for (const action of plannedSequence) {
            const before = stateSignature(clone.getState());
            const legalNow = clone.getLegalActions(playerId);
            if (!legalNow.some(candidate => actionsEqual(candidate, action))) break;
            this.plan.steps.push({ action, beforeSignature: before });
            clone.step(action);
        }
        if (this.plan.steps.length === 0) {
            this.plan = null;
            return fallbackEndTurn(legal);
        }
        return this.consumePlan(signature) ?? fallbackEndTurn(legal);
    }

    /** 过滤掉明显不可执行的计划，避免把非法动作交给引擎。 */
    private planSequence(engine: GameEngine, playerId: number, sequence: Action[]): Action[] {
        if (sequence.length === 0) return sequence;
        const firstLegal = engine.getLegalActions(playerId).some(action => actionsEqual(action, sequence[0]));
        return firstLegal ? sequence : [];
    }

    private consumePlan(signature: string): Action | null {
        if (!this.plan) return null;
        const step = this.plan.steps[this.plan.index];
        if (!step || step.beforeSignature !== signature) {
            this.plan = null;
            return null;
        }
        this.plan.index += 1;
        if (this.plan.index >= this.plan.steps.length) this.plan = null;
        return step.action;
    }
}

function fallbackEndTurn(legal: Action[]): Action {
    return legal.find(action => action.type === 'end_turn')
        ?? legal.find(action => action.type !== 'surrender')
        ?? { type: 'end_turn' };
}

function fallbackAction(state: GameState, playerId: number, unit: Unit, legal: Action[]): Action[] {
    const wait = legal.find(action => action.type === 'wait' && action.unitId === unit.id);
    if (wait) return [wait];
    const endTurn = legal.find(action => action.type === 'end_turn');
    if (endTurn) return [endTurn];
    return [legal[0] ?? { type: 'end_turn' }];
}

/** 跨 GameEngine 实例识别同一局面；只包含会影响决策的字段。 */
function stateSignature(state: GameState): string {
    const units = [...state.units]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(unit => [
            unit.id,
            unit.ownerId,
            unit.unitClass,
            unit.pos.x,
            unit.pos.y,
            unit.hp,
            unit.level ?? 0,
            unit.exp ?? 0,
            unit.status?.type ?? '',
            unit.hasMoved ? 1 : 0,
            unit.hasActed ? 1 : 0,
            unit.movementRemaining ?? '',
            unit.apkStatic ? 1 : 0,
        ].join(','))
        .join(';');
    return `${state.turn}|${state.currentPlayer}|${state.pendingUnitId ?? ''}|${units}`;
}

/** APK `m2331o()` 单位选择。 */
function selectUnit(state: GameState, playerId: number, legal: Action[]): Unit | null {
    const unitIds = new Set<string>();
    for (const action of legal) {
        const unitId = actionUnitId(action);
        if (unitId) unitIds.add(unitId);
    }
    const candidates = state.units.filter(unit => (
        unit.ownerId === playerId
        && unit.hp > 0
        && !unit.apkStatic
        && !unit.hasActed
        && unitIds.has(unit.id)
    ));
    if (candidates.length === 0) return null;

    const pending = state.pendingUnitId
        ? candidates.find(unit => unit.id === state.pendingUnitId)
        : undefined;
    if (pending) return pending;

    // APK 先扫己方城堡：任何未行动、非 static 的己方单位都会优先行动。
    const onCastle = candidates
        .filter(unit => apkIsCastle(state, unit.pos))
        .sort(compareUnitPosition);
    if (onCastle.length > 0) return onCastle[0];

    // APK `m2352f()`：按可移动单位遍历，命中 `f3090v` 任一项即返回。
    // 源码使用 HashSet 顺序；这里按单位 ID 排序保证可复现。
    const special = candidates
        .filter(unit => !isCommanderUnit(state, unit, playerId))
        .sort(compareUnitId)
        .find(unit => APK_SPECIAL_ABILITY_ORDER.some(ability => hasAbility(unit, ability)));
    if (special) return special;

    // APK `GRIM_REAPER`（项目 death_reaper）。
    const reaper = candidates
        .filter(unit => !isCommanderUnit(state, unit, playerId) && hasAbility(unit, 'death_reaper'))
        .sort(compareUnitId);
    if (reaper.length > 0) return reaper[0];

    // APK `m2358d` 只排除已行动/static 的单位，并没有排除指挥官；
    // 指挥官不在城堡上时仍可作为普通可移动单位被选中。
    const movable = candidates
        .filter(unit => !unit.apkStatic)
        .sort(compareUnitId);
    return movable[0] ?? null;
}

function compareUnitPosition(left: Unit, right: Unit): number {
    if (left.pos.y !== right.pos.y) return left.pos.y - right.pos.y;
    if (left.pos.x !== right.pos.x) return left.pos.x - right.pos.x;
    return left.id.localeCompare(right.id);
}

function compareUnitId(left: Unit, right: Unit): number {
    return left.id.localeCompare(right.id);
}

function actionUnitId(action: Action): string | null {
    switch (action.type) {
        case 'move':
        case 'post_attack_move':
        case 'capture':
        case 'repair':
        case 'wait':
        case 'destroy_town':
            return action.unitId;
        case 'attack':
            return action.attackerId;
        case 'heal':
            return action.healerId;
        case 'support':
            return action.supporterId;
        case 'summon':
            return action.summonerId;
        default:
            return null;
    }
}

/** APK `m2343i()` 目标选择；只用于位置分，不限制实际候选目标。 */
function selectObjective(ctx: ApkScoringContext, unit: Unit): Position | null {
    const state = ctx.state;

    if (hasAbility(unit, 'supporter')) {
        const own = state.units
            // APK `m4408b(player)` 是同一队伍，不是同盟。
            .filter(other => other.id !== unit.id && other.hp > 0 && other.ownerId === unit.ownerId)
            .map(other => ({ other, value: apkCombatValue(ctx, other) }))
            .filter(entry => entry.value > apkCombatValue(ctx, unit))
            .sort((left, right) => right.value - left.value || left.other.id.localeCompare(right.other.id));
        if (own.length > 0) return own[0].other.pos;
    }

    if (hasAbility(unit, 'castle_capturer')) {
        const target = nearestTile(state, unit.pos, pos => {
            const tile = tileAt(state, pos);
            const ownerId = tile?.ownerId;
            if (ownerId === null || ownerId === undefined || !areEnemyPlayers(state, ownerId, unit.ownerId)) {
                return false;
            }
            // APK `m2353e`：敌方剩余单位 <=1 且金币 <400 时才把敌城堡当作目标。
            const enemyAlive = state.units.filter(other => other.ownerId === ownerId && other.hp > 0).length;
            const enemyGold = state.players.find(player => player.id === ownerId)?.gold ?? 0;
            return enemyAlive <= 1 && enemyGold < 400;
        });
        if (target) return target;
    }

    if (hasAbility(unit, 'village_capturer')) {
        const target = nearestTile(state, unit.pos, pos => {
            const tile = tileAt(state, pos);
            const ownerId = tile?.ownerId;
            if (ownerId !== null && ownerId !== undefined && !areEnemyPlayers(state, ownerId, unit.ownerId)) {
                return false;
            }
            return apkIsVillage(state, pos);
        });
        if (target) return target;
    }

    if (hasAbility(unit, 'repairer')) {
        const target = nearestTile(state, unit.pos, pos => apkIsRepairableTile(state, pos));
        if (target) return target;
    }

    if (hasAbility(unit, 'healer')) {
        const own = state.units
            // APK `m2356d` 遍历 `f3101l`（同队单位）。
            .filter(other => other.id !== unit.id && other.hp > 0 && other.ownerId === unit.ownerId)
            .map(other => ({ other, value: apkUnitValue(ctx, other) }))
            .sort((left, right) => right.value - left.value || left.other.id.localeCompare(right.other.id));
        if (own.length > 0) return own[0].other.pos;
    }

    const enemies = state.units
        .filter(other => other.hp > 0 && areEnemyPlayers(state, other.ownerId, unit.ownerId))
        .map(other => ({ other, value: apkTargetValue(ctx, unit, other) }))
        .sort((left, right) => right.value - left.value || left.other.id.localeCompare(right.other.id));
    return enemies[0]?.other.pos ?? null;
}

function nearestTile(state: GameState, from: Position, predicate: (pos: Position) => boolean): Position | null {
    let best: Position | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const pos = { x, y };
            if (!predicate(pos)) continue;
            const distance = getDistance(from, pos);
            if (distance < bestDistance) {
                best = pos;
                bestDistance = distance;
            }
        }
    }
    return best;
}

/** APK `m2365a` + `m2364a` 候选动作枚举。 */
function generateCandidates(ctx: ApkScoringContext, unit: Unit, legal: Action[]): ApkActionCandidate[] {
    const state = ctx.state;
    const reachable = getReachablePositions(state, unit.id);
    const costs = getMovementCosts(state, unit.id);
    const canMove = legal.some(action => action.type === 'move' && action.unitId === unit.id);
    // 已经移动过的单位（例如调用方丢失了多步计划）只能原地行动；项目合法动作
    // 不再生成 move，这里同步收紧，避免把非法 move 送进计划。
    const moveTargets = canMove ? reachable : [unit.pos];
    moveTargets.sort((left, right) => {
        const leftCost = costs.get(posKey(left)) ?? 0;
        const rightCost = costs.get(posKey(right)) ?? 0;
        if (leftCost !== rightCost) return leftCost - rightCost;
        if (left.y !== right.y) return left.y - right.y;
        return left.x - right.x;
    });

    const range = apkAttackRange(unit);
    const enemies = state.units.filter(other => other.hp > 0 && areEnemyPlayers(state, other.ownerId, unit.ownerId));
    const allies = state.units.filter(other => other.hp > 0 && areAlliedPlayers(state, other.ownerId, unit.ownerId));
    const candidates: ApkActionCandidate[] = [];
    const seen = new Set<string>();

    const add = (candidate: ApkActionCandidate) => {
        const key = [
            candidate.kind,
            posKey(candidate.moveTo),
            candidate.targetUnitId ?? '',
            candidate.targetPos ? posKey(candidate.targetPos) : '',
            candidate.graveId ?? '',
            candidate.isSelfHeal ? 'self' : '',
        ].join('|');
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(candidate);
    };

    for (const moveTo of moveTargets) {
        add({ kind: 'STANDBY', moveTo });

        for (const enemy of enemies) {
            if (inRange(moveTo, enemy.pos, range.min, range.max)) {
                add({ kind: 'ATTACK', moveTo, targetUnitId: enemy.id, targetPos: enemy.pos });
            }
        }

        if (hasAbility(unit, 'destroyer')) {
            for (let y = 0; y < state.map.height; y += 1) {
                for (let x = 0; x < state.map.width; x += 1) {
                    const targetPos = { x, y };
                    if (unitAt(state, targetPos)) continue;
                    if (!inRange(moveTo, targetPos, range.min, range.max)) continue;
                    // APK `m2365a` 只对敌-owned 的可摧毁地形生成无单位 ATTACK 候选。
                    const owner = tileAt(state, targetPos)?.ownerId;
                    if (owner === null || owner === undefined || !areEnemyPlayers(state, owner, unit.ownerId)) continue;
                    add({ kind: 'DESTROY', moveTo, targetPos });
                }
            }
        }

        if (hasAbility(unit, 'healer')) {
            for (const target of state.units) {
                if (target.hp <= 0) continue;
                if (getDistance(moveTo, target.pos) > 1) continue;
                if (!canHealTarget(state, unit, target, moveTo)) continue;
                add({
                    kind: 'HEAL',
                    moveTo,
                    targetUnitId: target.id,
                    targetPos: target.pos,
                    isSelfHeal: target.id === unit.id,
                });
            }
        }

        if (hasAbility(unit, 'summoner') && state.graves) {
            for (const grave of state.graves) {
                if (!inRange(moveTo, grave.pos, range.min, range.max)) continue;
                if (unitAt(state, grave.pos)) continue;
                add({
                    kind: 'SUMMON',
                    moveTo,
                    graveId: grave.id,
                    spawnPos: grave.pos,
                    targetPos: grave.pos,
                });
            }
        }

        if (hasAbility(unit, 'supporter')) {
            for (const target of allies) {
                if (target.id === unit.id || target.hasActed === false) continue;
                if (getDistance(moveTo, target.pos) > 2) continue;
                if (target.hasBeenSupportedThisTurn) continue;
                if (hasAbility(target, 'assault_troop') || hasAbility(target, 'castle_capturer') || hasAbility(target, 'supporter')) continue;
                if ((target.level ?? 0) > (unit.level ?? 0)) continue;
                add({ kind: 'SUPPORT', moveTo, targetUnitId: target.id, targetPos: target.pos });
            }
        }

        const tile = tileAt(state, moveTo);
        if (tile) {
            const owner = tile.ownerId;
            const hostile = owner === null || areEnemyPlayers(state, owner, unit.ownerId);
            if (hostile && apkIsCapturable(state, moveTo)) {
                if ((apkTerrainKind(state, moveTo) === 3 && hasAbility(unit, 'castle_capturer'))
                    || (apkTerrainKind(state, moveTo) === 4 && hasAbility(unit, 'village_capturer'))) {
                    add({ kind: 'OCCUPY', moveTo });
                }
            }
            if (apkIsRepairableTile(state, moveTo) && hasAbility(unit, 'repairer')) {
                add({ kind: 'REPAIR', moveTo });
            }
        }
    }

    return candidates;
}

function canHealTarget(state: GameState, healer: Unit, target: Unit, from: Position): boolean {
    if (getDistance(from, target.pos) > 1) return false;
    const stats = apkAttackRange(healer);
    if (healer.id !== target.id && !inRange(from, target.pos, stats.min, stats.max)) return false;
    if (hasAbility(target, 'undead')) return true;
    if (target.status?.type === 'poisoned') return false;
    return areAlliedPlayers(state, healer.ownerId, target.ownerId)
        && target.hp <= getEffectiveStats(target).maxHp;
}

function scoreCandidates(
    ctx: ApkScoringContext,
    unit: Unit,
    candidates: ApkActionCandidate[],
    objective: Position | null,
): ScoredCandidate[] {
    const state = ctx.state;
    const hasRealAction = candidates.some(candidate => candidate.kind !== 'STANDBY' && !candidate.isSelfHeal);
    const costs = getMovementCosts(state, unit.id);
    const move = apkMoveRange(unit);
    const assault = hasAbility(unit, 'assault_troop');

    return candidates.map(candidate => {
        const target = candidate.targetUnitId
            ? state.units.find(other => other.id === candidate.targetUnitId)
            : undefined;
        let score = apkActionScore(ctx, unit, candidate, target);
        const cost = costs.get(posKey(candidate.moveTo)) ?? 0;
        const skipPosition = assault && cost >= Math.trunc(move / 2);
        if (!skipPosition) {
            score += apkPositionScore(ctx, unit, candidate.moveTo, objective, hasRealAction);
        }
        return { candidate, target, score };
    });
}

/** APK `m2370a` 突击部队攻击后移动。 */
function applyPostAttackMove(
    ctx: ApkScoringContext,
    unit: Unit,
    candidate: ApkActionCandidate,
    objective: Position | null,
): void {
    if (candidate.kind !== 'ATTACK' || !hasAbility(unit, 'assault_troop')) return;
    if (!candidate.targetUnitId) return;

    const target = ctx.state.units.find(other => other.id === candidate.targetUnitId);
    if (!target) return;
    // 攻击者会被反击打死时，APK m2333m 不追加二次移动。
    const attack = apkAttackScore(ctx, unit, candidate.moveTo, target);
    if (attack.attackerDies) return;

    const costs = getMovementCosts(ctx.state, unit.id);
    const cost = costs.get(posKey(candidate.moveTo)) ?? 0;
    const remaining = apkMoveRange(unit) - cost;
    if (remaining <= 0) return;

    const projectedState: GameState = {
        ...ctx.state,
        units: ctx.state.units.map(other => (
            other.id === unit.id
                ? { ...other, pos: { ...candidate.moveTo }, movementRemaining: remaining }
                : other
        )),
    };
    const projectedCtx = buildApkScoringContext(projectedState, ctx.playerId);
    const positions = getReachablePositions(projectedState, unit.id, remaining);
    let best: Position | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    const projectedUnit = projectedState.units.find(other => other.id === unit.id)!;
    for (const pos of positions) {
        const score = apkPositionScore(projectedCtx, projectedUnit, pos, objective, false);
        if (score > bestScore) {
            best = pos;
            bestScore = score;
        }
    }
    if (best) candidate.postMoveTo = best;
}

/** 把 APK 复合动作拆成项目原子动作序列。 */
function buildSequence(unit: Unit, candidate: ApkActionCandidate): Action[] {
    const actions: Action[] = [];
    if (!samePos(unit.pos, candidate.moveTo)) {
        actions.push({ type: 'move', unitId: unit.id, to: candidate.moveTo });
    }

    switch (candidate.kind) {
        case 'STANDBY':
            actions.push({ type: 'wait', unitId: unit.id });
            break;
        case 'ATTACK':
            if (candidate.targetUnitId) {
                actions.push({ type: 'attack', attackerId: unit.id, targetId: candidate.targetUnitId });
            } else {
                actions.push({ type: 'wait', unitId: unit.id });
            }
            break;
        case 'HEAL':
            if (candidate.targetUnitId) {
                actions.push({ type: 'heal', healerId: unit.id, targetId: candidate.targetUnitId });
            } else {
                actions.push({ type: 'wait', unitId: unit.id });
            }
            break;
        case 'SUMMON':
            if (candidate.graveId && candidate.spawnPos) {
                actions.push({
                    type: 'summon',
                    summonerId: unit.id,
                    graveId: candidate.graveId,
                    spawnPos: candidate.spawnPos,
                });
            } else {
                actions.push({ type: 'wait', unitId: unit.id });
            }
            break;
        case 'SUPPORT':
            if (candidate.targetUnitId) {
                actions.push({ type: 'support', supporterId: unit.id, targetId: candidate.targetUnitId });
            } else {
                actions.push({ type: 'wait', unitId: unit.id });
            }
            break;
        case 'OCCUPY':
            actions.push({ type: 'capture', unitId: unit.id });
            break;
        case 'REPAIR':
            actions.push({ type: 'repair', unitId: unit.id });
            break;
        case 'DESTROY':
            actions.push({
                type: 'destroy_town',
                unitId: unit.id,
                ...(candidate.targetPos ? { target: candidate.targetPos } : {}),
            });
            break;
        default:
            actions.push({ type: 'wait', unitId: unit.id });
            break;
    }

    if (candidate.postMoveTo) {
        actions.push({ type: 'post_attack_move', unitId: unit.id, to: candidate.postMoveTo });
    }
    return actions;
}

/** APK `m2347h()` + `m2344i()` 招募兵种选择。 */
function chooseRecruitType(ctx: ApkScoringContext, playerId: number, rng: () => number): number {
    const state = ctx.state;
    const own = state.units.filter(unit => unit.ownerId === playerId && unit.hp > 0);
    const countOf = (typeId: number) => own.filter(unit => apkUnitTypeId(unit) === typeId).length;
    const population = getCurrentPopulation(state, playerId);
    const perTurnCap = apkPerTurnRecruitCap(ctx, population);

    // APK `m2357d`：金币、人口/单位上限、可招募列表；不含 `m2361c` 兵种上限。
    const canRecruit = (typeId: number): boolean => {
        const unitClass = unitClassForApkType(typeId);
        if (!unitClass) return false;
        if (!getRecruitableUnits(state, playerId).includes(unitClass)) return false;
        return canRecruitUnitClass(state, playerId, unitClass);
    };
    // `m2347h` 默认分支和 `m2344i` 清零使用 `m2361c` + `m2341j` 上限。
    const withinLimit = (typeId: number): boolean => (
        canRecruit(typeId)
        && countOf(typeId) < apkRecruitCap(typeId, ctx)
        && countOf(typeId) < perTurnCap
    );

    let preferred = ctx.waterRatio >= 0.3 && withinLimit(19) ? 19 : 0;
    if (!withinLimit(preferred)) preferred = 0;
    if (withinLimit(preferred)) return preferred;

    if (state.turn <= 3) {
        let early = -1;
        // 早期分支只要求 `m2357d` 与 count<1，不检查 m2361c。
        for (const typeId of APK_EARLY_RECRUIT_TYPES) {
            if (canRecruit(typeId) && countOf(typeId) < 1) early = typeId;
        }
        if (early >= 0) return early;
    }

    if (population >= 10 && countOf(3) < 1 && canRecruit(3)) return 3;
    if (population >= 15 && countOf(20) < 1 && canRecruit(20)) return 20;

    const desire = new Array<number>(MAX_RECRUIT_TYPE + 1).fill(0);
    // APK `m2344i` 第一轮遍历 `m4414a()`，即不同联盟的敌方单位：按敌方阵容反推
    // 需要补充的兵种；第二轮才遍历 `f3101l` 己方单位修正需求。
    const enemies = state.units.filter(unit => (
        unit.hp > 0 && areEnemyPlayers(state, unit.ownerId, playerId)
    ));
    for (const unit of enemies) {
        const typeId = apkUnitTypeId(unit);
        if (typeId === 6) {
            desire[15] += 0.5;
            desire[4] += 0.5;
            desire[8] += 0.5;
            desire[17] += 0.5;
        } else if (typeId === 17) {
            desire[2] += 1;
            desire[19] += 1;
        } else if (typeId === 18) {
            desire[14] += 0.5;
            desire[18] += 1;
            desire[15] += 0.5;
            desire[17] += 0.3;
        }
        desire[1] += 1;
        desire[16] += 0.25;
    }
    for (const unit of own) {
        const typeId = apkUnitTypeId(unit);
        if (typeId === 6) desire[14] += 2;
        else if (typeId === 12) {
            desire[5] += 1;
            desire[8] += 1;
        } else if (typeId === 15) desire[14] += 1;
    }
    for (let typeId = 0; typeId <= MAX_RECRUIT_TYPE; typeId += 1) {
        // APK `m2344i` 只按 `m2357d` 与 `m2361c` 清零，不检查 `m2341j`。
        if (!canRecruit(typeId) || countOf(typeId) >= apkRecruitCap(typeId, ctx)) desire[typeId] = 0;
    }

    let bestType = -1;
    let bestDesire = 0;
    for (let typeId = 0; typeId <= MAX_RECRUIT_TYPE; typeId += 1) {
        if (desire[typeId] > bestDesire) {
            bestDesire = desire[typeId];
            bestType = typeId;
        }
    }
    if (bestType >= 0 && bestDesire >= 1) return bestType;

    const player = state.players.find(entry => entry.id === playerId);
    if (player && player.gold >= ctx.avgCost) {
        const pool = APK_PREFERRED_RECRUIT_TYPES.filter(typeId => canRecruit(typeId));
        const anyAvailable = Array.from({ length: MAX_RECRUIT_TYPE + 1 }, (_, typeId) => typeId)
            .filter(typeId => canRecruit(typeId));
        const source = pool.length > 0 ? pool : anyAvailable;
        if (source.length > 0) return source[Math.floor(rng() * source.length)];
    }
    return -1;
}

/** APK `m2330p()` 招募/结束回合。 */
function selectRecruitAction(
    state: GameState,
    playerId: number,
    legal: Action[],
    rng: () => number,
): Action {
    const recruits = legal.filter(action => action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy');
    if (recruits.length === 0) return fallbackEndTurn(legal);

    const ctx = buildApkScoringContext(state, playerId);
    const commander = state.units.find(unit => unit.ownerId === playerId && isCommanderUnit(state, unit, playerId));
    if (!commander) {
        const commanderAction = recruits.find(action => action.unitClass === 'commander');
        if (commanderAction) return preferCastleAction(commanderAction, recruits, state);
    }

    const typeId = chooseRecruitType(ctx, playerId, rng);
    if (typeId < 0) {
        // APK `m2330p`：无常规招募兵种时，若城堡正被威胁，改用 `m2342i` 的防守招募。
        // 这里从合法招募动作中选取被威胁城堡上的动作，作为该分支的近似。
        const threatened = recruits.find(action => (
            (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
            && ctx.threatenedTiles.has(posKey(action.castlePos))
        ));
        if (threatened) return preferCastleAction(threatened, recruits, state);
        return fallbackEndTurn(legal);
    }
    const unitClass = unitClassForApkType(typeId);
    if (!unitClass) return fallbackEndTurn(legal);

    const matching = recruits.filter(action => action.unitClass === unitClass);
    if (matching.length === 0) return fallbackEndTurn(legal);
    return preferCastleAction(matching[0], matching, state);
}

function preferCastleAction(action: Action, pool: Action[], state: GameState): Action {
    if (action.type !== 'recruit_to_castle' && action.type !== 'recruit_and_deploy') return action;
    const ownCastles = pool.filter(candidate => (
        (candidate.type === 'recruit_to_castle' || candidate.type === 'recruit_and_deploy')
        && candidate.unitClass === action.unitClass
    )).sort((left, right) => {
        const leftPos = (left as Extract<Action, { type: 'recruit_to_castle' | 'recruit_and_deploy' }>).castlePos;
        const rightPos = (right as Extract<Action, { type: 'recruit_to_castle' | 'recruit_and_deploy' }>).castlePos;
        const leftOccupied = state.units.some(unit => samePos(unit.pos, leftPos));
        const rightOccupied = state.units.some(unit => samePos(unit.pos, rightPos));
        if (leftOccupied !== rightOccupied) return leftOccupied ? 1 : -1;
        if (leftPos.y !== rightPos.y) return leftPos.y - rightPos.y;
        return leftPos.x - rightPos.x;
    });
    return ownCastles[0] ?? action;
}

export { buildApkScoringContext };
