import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { getEffectiveStats } from '../src/game/abilities';
import { createApkReplayRecord } from '../src/game/apk_replay';
import { createUnits, inferInitialCurrentPlayer } from './apk_game_get_validate';

describe('APK 真实回放初始状态导入', () => {
    it('按嵌入单位定义和初始等级创建生命值', () => {
        const units = createUnits([
            { apkUnitId: 4, teamId: 2, level: 4, x: 3, y: 0, unitClass: 'golem' },
            { apkUnitId: 0, teamId: 0, level: 0, x: 0, y: 0, unitClass: 'soldier' }
        ], [
            { apkUnitId: 4, baseMaxHp: 100, maxHpGrowth: 25 },
            { apkUnitId: 0, baseMaxHp: 120, maxHpGrowth: 0 }
        ]);
        expect(units.map(unit => [unit.hp, unit.maxHp])).toEqual([[200, 100], [120, 120]]);
        expect(getEffectiveStats(units[0]).maxHp).toBe(200);
        expect(units[0].exp).toBeGreaterThan(0);
    });

    function infer(events: ('NEXT_TURN' | 'SURRENDER')[], actor: number, disabled: number[] = []) {
        const state = createDemoState({ disabledTeams: disabled });
        state.players = Array.from({ length: 6 }, (_, id) => ({ id, gold: 300, isAlive: true, commanderDeathCount: 0 }));
        state.units = [{ ...state.units[0], ownerId: actor, pos: { x: 1, y: 1 } }];
        const records = [
            createApkReplayRecord({ eventType: 'GAME_START' }),
            ...events.map(eventType => createApkReplayRecord({ eventType })),
            createApkReplayRecord({ eventType: 'NONE', source: { x: 1, y: 1 } })
        ];
        return inferInitialCurrentPlayer(state, records);
    }

    it('投降自动换人后，独立 NEXT_TURN 再次换人', () => {
        expect(infer(['SURRENDER', 'NEXT_TURN'], 2)).toBe(0);
    });

    it('轮转跳过禁用队伍，并在跨圈时跳过此前投降的队伍', () => {
        expect(infer(['SURRENDER', 'NEXT_TURN'], 3, [1])).toBe(0);
        expect(infer(['SURRENDER', 'NEXT_TURN', 'NEXT_TURN', 'NEXT_TURN', 'NEXT_TURN', 'NEXT_TURN'], 1)).toBe(0);
        expect(infer(['SURRENDER', 'SURRENDER', 'NEXT_TURN'], 3)).toBe(0);
    });

    it('保留无投降回放的逆推和跨圈行为', () => {
        expect(infer([], 4)).toBe(4);
        expect(infer(['NEXT_TURN', 'NEXT_TURN'], 1)).toBe(5);
    });
});
