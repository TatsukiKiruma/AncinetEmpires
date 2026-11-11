import { expect, it } from 'vitest';
import { createDemoState } from '../../game/demo_map';
import { TacticalPathfinder } from '../../game/ai/tactical_pathfinding';
import type { UnitClass } from '../../game/types';
import { RetaliationGoalPaths } from './retaliation_paths';

it.each([0, 1, 3, 1.5, 40, 999999])('反向距离在地形代价%s、敌占/堆叠/飞行/覆盖下与原正向全格对等价', cost => {
    for (const unitClass of ['soldier', 'dragon', 'mermaid', 'elf', 'golem'] as UnitClass[]) {
        const state = createDemoState();
        state.map = { width: 6, height: 4, tiles: Array.from({ length: 4 }, (_, y) => Array.from({ length: 6 }, (_, x) => ({ terrainId: 1, ownerId: null, apkMoveCost: (x + y) % 3 ? 1 : cost }))) };
        const unit = { ...state.units[0], unitClass, pos: { x: 0, y: 0 }, apkMoveOverrides: { 6: 0, 7: 4 } };
        state.units = [unit, { ...state.units[1], pos: { x: 3, y: 2 } }, { ...state.units[1], id: '堆叠', pos: { x: 3, y: 2 } }, { ...state.units[1], id: '飞行', unitClass: 'dragon', pos: { x: 4, y: 2 } }];
        const original = new TacticalPathfinder(state), reversed = new RetaliationGoalPaths(state);
        for (let start = 0; start < 24; start++) for (let end = 0; end < 24; end++) {
            const from = { x: start % 6, y: Math.floor(start / 6) }, target = { x: end % 6, y: Math.floor(end / 6) };
            expect(reversed.cost(unit, from, target)).toBe(original.cost(unit, from, target));
        }
    }
});
