import { describe, expect, it, vi } from 'vitest';
import { getMoveCostForUnit, isFlying } from '../abilities';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { areAlliedPlayers } from '../rule_config';
import type { GameState, Position, Unit, UnitClass } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { TacticalPathfinder } from './tactical_pathfinding';

/** 保留优化前逐目标搜索作为独立对照，验证数据集教师评分兼容性。 */
function referenceCost(state: GameState, unit: Unit, from: Position, target: Position): number | null {
    const key = (pos: Position) => `${pos.x},${pos.y}`;
    const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
    const queue = [{ pos: from, cost: 0 }];
    const costs = new Map([[key(from), 0]]);
    while (queue.length) {
        queue.sort((a, b) => a.cost - b.cost);
        const current = queue.shift()!;
        if (same(current.pos, target)) return current.cost;
        if (current.cost > (costs.get(key(current.pos)) ?? Infinity)) continue;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const next = { x: current.pos.x + dx, y: current.pos.y + dy };
            if (next.x < 0 || next.y < 0 || next.x >= state.map.width || next.y >= state.map.height) continue;
            const occupying = state.units.find(candidate => candidate.hp > 0 && same(candidate.pos, next));
            if (!same(next, target) && occupying && !areAlliedPlayers(state, unit.ownerId, occupying.ownerId)
                && !(isFlying(unit) && !isFlying(occupying))) continue;
            const stepCost = getMoveCostForUnit(state, { ...unit, pos: current.pos }, state.map.tiles[next.y][next.x]);
            if (!Number.isFinite(stepCost) || stepCost >= 999999) continue;
            const nextCost = current.cost + stepCost;
            if (nextCost < (costs.get(key(next)) ?? Infinity)) {
                costs.set(key(next), nextCost);
                queue.push({ pos: next, cost: nextCost });
            }
        }
    }
    return null;
}

describe('战术寻路等价优化', () => {
    it.each<UnitClass>(['soldier', 'dragon', 'mermaid', 'elf', 'golem'])('保持 %s 所有目标的距离，包括移动覆盖和堆叠占位', unitClass => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass, apkMoveOverrides: { 6: 0, 7: 4 } };
        state.units[0] = unit;
        state.units.push({ ...state.units[1], id: 'enemy', pos: { x: 3, y: 3 } });
        state.units.push({ ...state.units[0], id: 'stacked', pos: { x: 3, y: 3 } });
        state.units.push({ ...state.units[1], id: 'flying', unitClass: 'dragon', pos: { x: 3, y: 4 } });
        state.map.tiles[4][4].apkMoveCost = 999999;
        const finder = new TacticalPathfinder(state);
        for (const from of [unit.pos, { x: 3, y: 3 }, { x: 4, y: 4 }]) {
            for (let y = 0; y < state.map.height; y += 1) {
                for (let x = 0; x < state.map.width; x += 1) {
                    expect(finder.cost(unit, from, { x, y })).toBe(referenceCost(state, unit, from, { x, y }));
                }
            }
        }
    });

    it('允许到达阻挡终点，但不能借此穿过敌军；同盟可以穿过', () => {
        const state = createDemoState();
        state.map = { width: 4, height: 1, tiles: [[0, 1, 2, 3].map(() => ({ terrainId: 6, ownerId: null }))] };
        state.units = [{ ...state.units[0], pos: { x: 0, y: 0 } }, { ...state.units[1], pos: { x: 1, y: 0 } }];
        const finder = new TacticalPathfinder(state);
        expect(finder.cost(state.units[0], state.units[0].pos, { x: 1, y: 0 })).toBe(1);
        expect(finder.cost(state.units[0], state.units[0].pos, { x: 2, y: 0 })).toBeNull();
        state.units[1].ownerId = 0;
        expect(new TacticalPathfinder(state).cost(state.units[0], state.units[0].pos, { x: 3, y: 0 })).toBe(3);
    });

    it('连续对局中所有候选教师评分和所选动作均与旧搜索一致', () => {
        const engine = new GameEngine(createDemoState());
        const teacher = new HeuristicAI(() => 0);
        for (let step = 0; step < 12 && !engine.isTerminal(); step += 1) {
            const state = engine.getState();
            const actions = engine.getLegalActions(state.currentPlayer);
            const optimized = teacher.scoreCandidateActions(engine, state.currentPlayer, actions);
            const action = teacher.getAction(engine, state.currentPlayer, actions);
            const cache = new WeakMap<TacticalPathfinder, Map<string, number | null>>();
            const spy = vi.spyOn(TacticalPathfinder.prototype, 'cost').mockImplementation(function(unit, from, target) {
                let values = cache.get(this);
                if (!values) { values = new Map(); cache.set(this, values); }
                const key = `${unit.id}:${from.x},${from.y}:${target.x},${target.y}`;
                if (!values.has(key)) values.set(key, referenceCost((this as unknown as { state: GameState }).state, unit, from, target));
                return values.get(key)!;
            });
            try {
                expect(teacher.scoreCandidateActions(engine, state.currentPlayer, actions)).toEqual(optimized);
                expect(teacher.getAction(engine, state.currentPlayer, actions)).toEqual(action);
            } finally { spy.mockRestore(); }
            engine.step(action);
        }
    }, 30000);
});
