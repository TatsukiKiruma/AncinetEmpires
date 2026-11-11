import { describe, it, expect } from 'vitest';
import { createDemoState } from '../demo_map';
import { TacticalPathfinder } from './tactical_pathfinding';

describe('反向目标距离保持既有路径评分', () => {
    it.each(['soldier', 'ghost', 'mermaid'] as const)('%s逐格匹配正向查询，覆盖敌占终点、起点和不可穿行格', unitClass => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass };
        state.units[0] = unit;
        const paths = new TacticalPathfinder(state);
        for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
            const from = { x, y };
            for (const target of [...state.units.map(u => u.pos), { x: 0, y: 0 }, { x: state.map.width - 1, y: state.map.height - 1 }]) {
                expect(paths.costToTarget(unit, from, target), `${x},${y}至${target.x},${target.y}`).toBe(paths.cost(unit, from, target));
            }
        }
    });
});
