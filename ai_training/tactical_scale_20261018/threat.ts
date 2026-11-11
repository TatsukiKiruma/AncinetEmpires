import { GameEngine } from '../../src/game/engine';
import { calculateDamage, getLegalActions } from '../../src/game/rules';
import { getEffectiveStats, hasAbility, isUndead, getMoveCostForUnit } from '../../src/game/abilities';
import { areEnemyPlayers } from '../../src/game/rule_config';
import type { Unit, Action, GameState } from '../../src/game/types';

export interface Exposure { damage: number; lethal: number; immediate: number; witness: unknown; }
export const THREAT_AUDIT = { calls: 0, exhaustiveFallbacks: 0, auraFallbacks: 0, settlementFallbacks: 0 };

let moveCache = new Map<string, Action[]>();
let positiveCosts = new Map<string, boolean>();
let geometries = new Map<string, number>();
let stateGeometry = new WeakMap<GameState, number>();
export function beginThreatScope() { moveCache = new Map(); positiveCosts = new Map(); geometries = new Map(); stateGeometry = new WeakMap(); }

/** 仅缓存权威移动集合；只有步价至少为1，才省略移动半径以外的占位。 */
function cachedMoves(engine: GameEngine, state: GameState, enemy: Unit): Action[] {
    let geometry = stateGeometry.get(state);
    if (geometry === undefined) {
        const encoded = JSON.stringify([state.map, state.rules]);
        geometry = geometries.get(encoded);
        if (geometry === undefined) { geometry = geometries.size; geometries.set(encoded, geometry); }
        stateGeometry.set(state, geometry);
    }
    const costKey = JSON.stringify([geometry, enemy.unitClass, enemy.apkMoveOverrides]);
    let positive = positiveCosts.get(costKey);
    if (positive === undefined) {
        positive = state.map.tiles.every(row => row.every(tile => getMoveCostForUnit(state, enemy, tile) >= 1));
        positiveCosts.set(costKey, positive);
    }
    const distance = Math.max(getEffectiveStats(enemy).move, enemy.movementRemaining ?? 0);
    const occupants = state.units.filter(u => !positive || Math.abs(u.pos.x - enemy.pos.x) + Math.abs(u.pos.y - enemy.pos.y) <= distance)
        .map(u => [u.id, u.ownerId, u.pos, u.unitClass]);
    const key = JSON.stringify([geometry, state.currentPlayer, state.pendingUnitId,
        state.units.find(u => u.id === state.pendingUnitId), state.players.map(p => [p.id, p.isAlive]), enemy, occupants]);
    let actions = moveCache.get(key);
    if (!actions) {
        actions = engine.getLegalActions(state.currentPlayer, { unitId: enemy.id, skipRecruitment: true }).filter(a => a.type === 'move');
        moveCache.set(key, actions);
    }
    return actions;
}

/** 下一敌方回合单单位一次移动加一次攻击；候选和伤害均来自公共规则。 */
export function movingThreatExhaustive(engine: GameEngine, targets: readonly Unit[]): Map<string, Exposure> {
    const initial = engine.getState();
    const result = new Map(targets.map(t => [t.id, { damage: 0, lethal: 0, immediate: 0, witness: null } as Exposure]));
    if (engine.isTerminal() || !targets.length) return result;
    const affected = (attacker: Unit, x: number, y: number) => {
        const stats = getEffectiveStats(attacker);
        return targets.some(t => {
            const d = Math.abs(t.pos.x - x) + Math.abs(t.pos.y - y);
            return areEnemyPlayers(initial, attacker.ownerId, t.ownerId) && d >= stats.minRange && d <= stats.maxRange;
        });
    };
    const check = (branch: GameEngine, id: string, move: unknown = null) => {
        const state = branch.getState();
        if (state.currentPlayer !== initial.currentPlayer || branch.isTerminal()) return;
        for (const attack of branch.getLegalActions(state.currentPlayer, { unitId: id, onlyAttacks: true })) {
            if (attack.type !== 'attack') continue;
            const target = targets.find(t => t.id === attack.targetId);
            if (!target) continue;
            const value = result.get(target.id)!;
            const hit = branch.clone().step(attack);
            if (hit.info.includes('非法动作')) throw Error('穷举威胁攻击非法');
            const remaining = hit.state.units.find(u => u.id === target.id)?.hp ?? 0;
            const damage = Math.max(0, target.hp - remaining);
            if (!move) value.immediate = Math.max(value.immediate, damage);
            if (damage > value.damage) {
                value.damage = damage;
                value.lethal = Number(damage >= target.hp);
                value.witness = { move, attack };
            }
        }
    };
    for (const enemy of initial.units) {
        if (enemy.ownerId !== initial.currentPlayer || enemy.hasActed || enemy.apkStatic || !targets.some(t => areEnemyPlayers(initial, enemy.ownerId, t.ownerId))) continue;
        if (affected(enemy, enemy.pos.x, enemy.pos.y)) check(engine, enemy.id);
        if (enemy.hasMoved) continue;
        // 曼哈顿在这里只作射程必要条件剪枝，移动可达性始终由权威合法动作决定。
        const stats = getEffectiveStats(enemy);
        if (targets.every(t => Math.abs(t.pos.x - enemy.pos.x) + Math.abs(t.pos.y - enemy.pos.y) > stats.move + stats.maxRange)) continue;
        const moves = cachedMoves(engine, initial, enemy).filter(a => a.type === 'move' && affected(enemy, a.to.x, a.to.y));
        for (const move of moves) {
            const branch = engine.clone();
            if (branch.step(move).info.includes('非法动作')) throw Error('敌方移动威胁候选非法');
            check(branch, enemy.id, move);
        }
    }
    return result;
}

/** 批量几何投影只用于筛选；最大威胁的移动、攻击见证最终必须在完整引擎执行一致。 */
export function movingThreat(engine: GameEngine, targets: readonly Unit[]): Map<string, Exposure> {
    THREAT_AUDIT.calls++;
    const state = engine.getState();
    const result = new Map(targets.map(t => [t.id, { damage: 0, lethal: 0, immediate: 0, witness: null } as Exposure]));
    if (engine.isTerminal() || !targets.length) return result;
    const activeUnits = engine.getLegalActions(state.currentPlayer, { skipMovement: true, skipRecruitment: true }).filter(a => a.type === 'wait');
    if (activeUnits.length <= 1 || state.pendingUnitId) {
        THREAT_AUDIT.exhaustiveFallbacks++; THREAT_AUDIT.settlementFallbacks++;
        return movingThreatExhaustive(engine, targets);
    }
    // 净化对亡灵的额外行后伤害不能只用主动攻击公式筛选，直接完整穷举。
    if (targets.some(isUndead) && state.units.some(u => u.ownerId === state.currentPlayer && hasAbility(u, 'cleansing_aura'))) {
        THREAT_AUDIT.exhaustiveFallbacks++; THREAT_AUDIT.auraFallbacks++;
        return movingThreatExhaustive(engine, targets);
    }
    for (const enemy of state.units) {
        if (enemy.ownerId !== state.currentPlayer || enemy.hasActed || enemy.apkStatic) continue;
        const stats = getEffectiveStats(enemy);
        const relevant = targets.filter(t => areEnemyPlayers(state, enemy.ownerId, t.ownerId)
            && Math.abs(t.pos.x - enemy.pos.x) + Math.abs(t.pos.y - enemy.pos.y) <= Math.max(stats.move, enemy.movementRemaining ?? 0) + stats.maxRange);
        if (!relevant.length) continue;
        const legal = cachedMoves(engine, state, enemy);
        const moves = legal.filter(a => a.type === 'move');
        for (const move of [null, ...moves]) {
            const pos = move?.to ?? enemy.pos;
            if (!relevant.some(t => { const d = Math.abs(t.pos.x - pos.x) + Math.abs(t.pos.y - pos.y); return d >= stats.minRange && d <= stats.maxRange; })) continue;
            // move不触发行后光环；这里只投影合法移动终点，不计算自己的移动代价或攻击规则。
            const projected = move ? { ...state, units: state.units.map(u => u.id === enemy.id ? { ...u, pos, hasMoved: true } : u) } : state;
            for (const attack of getLegalActions(projected, state.currentPlayer, { unitId: enemy.id, onlyAttacks: true })) {
                if (attack.type !== 'attack') continue;
                const target = relevant.find(t => t.id === attack.targetId);
                if (!target) continue;
                const damage = Math.min(target.hp, calculateDamage(projected, enemy.id, target.id));
                const value = result.get(target.id)!;
                if (!move) value.immediate = Math.max(value.immediate, damage);
                if (damage > value.damage) Object.assign(value, { damage, lethal: Number(damage >= target.hp), witness: { move, attack } });
            }
        }
    }
    for (const target of targets) {
        const value = result.get(target.id)!;
        if (!value.witness) continue;
        const witness = value.witness as { move: Action | null; attack: Action };
        const branch = engine.clone();
        if (witness.move && branch.step(witness.move).info.includes('非法动作')) throw Error('最大威胁移动见证非法');
        const hit = branch.step(witness.attack);
        if (hit.info.includes('非法动作')) throw Error('最大威胁攻击见证非法');
        const remaining = hit.state.units.find(u => u.id === target.id)?.hp ?? 0;
        if (Math.abs(target.hp - remaining - value.damage) > 1e-9) {
            // 自动换手后的回复/城堡扣血等可能改变净损血，改用完整结算逐分支比较。
            THREAT_AUDIT.exhaustiveFallbacks++; THREAT_AUDIT.settlementFallbacks++;
            return movingThreatExhaustive(engine, targets);
        }
    }
    return result;
}

export function nextOpponent(engine: GameEngine, player: number) {
    const branch = engine.clone();
    let state = branch.getState();
    if (!branch.isTerminal() && state.currentPlayer === player) {
        const end = branch.getLegalActions(player, { skipMovement: true, skipRecruitment: true }).find(a => a.type === 'end_turn');
        if (!end) return { branch, known: false };
        branch.step(end);
        state = branch.getState();
    }
    return { branch, known: branch.isTerminal() || areEnemyPlayers(state, player, state.currentPlayer) };
}
