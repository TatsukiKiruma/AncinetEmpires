import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../env';
import { createApkHardRuntime, type ApkHardSnapshot } from './apk_hard_runtime';

function snapshot(): ApkHardSnapshot {
    const ids = ['blue', 'red', 'green', 'black', 'purple', 'orange'];
    return {
        map: { rows: 5, cols: 5 },
        terrain: Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => (
            (row === 0 && col === 0) || (row === 4 && col === 4) ? 'castle' : 'plain'
        ))),
        terrainOwners: [{ r: 1, c: 1, owner: 'blue' }, { r: 5, c: 5, owner: 'red' }],
        units: [
            { r: 1, c: 1, type: 'commander', team: 'blue', hp: 100, level: 0, exp: 0, standby: false, registeredCommander: true },
            { r: 2, c: 1, type: 'infantry', team: 'blue', hp: 100, level: 0, exp: 0, standby: false },
            { r: 5, c: 5, type: 'commander', team: 'red', hp: 100, level: 0, exp: 0, standby: false, registeredCommander: true },
            { r: 4, c: 5, type: 'infantry', team: 'red', hp: 100, level: 0, exp: 0, standby: false },
        ],
        tombstones: [],
        teams: ids.map((id, index) => ({ id, alliance: index + 1, playerType: index === 0 ? 3 : index === 1 ? 2 : 0, gold: 400, commanderPrice: 400, commanderLevel: 0, commanderExp: 0 })),
        moveMode: { currentTeam: 'blue', round: 1 }, turnNumber: 1, matchKey: 'runtime-test', previousActionAccepted: true,
    };
}

describe('APK 困难 AI 无界面运行环境', () => {
    it('直接运行 APK 单步入口并生成单位决策', () => {
        const runtime = createApkHardRuntime(mulberry32(19));
        const input = snapshot();
        const frozen = JSON.stringify(input);
        const result = runtime.decide(input);
        expect(result.kind, result.reason).toBe('unit');
        expect(result.row).toBeGreaterThanOrEqual(0);
        expect(result.col).toBeGreaterThanOrEqual(0);
        expect(JSON.stringify(input)).toBe(frozen);
    });

    it('独立实例在相同随机流下产生相同结果，且不污染全局随机函数', () => {
        const originalRandom = Math.random;
        const first = createApkHardRuntime(mulberry32(37));
        const second = createApkHardRuntime(mulberry32(37));
        const firstResult = first.decide(snapshot());
        const changed = snapshot();
        changed.units = changed.units.map(unit => ({ ...unit, standby: true }));
        changed.teams = changed.teams.map(team => ({ ...team, gold: 0 }));
        first.decide(changed);
        expect(second.decide(snapshot())).toEqual(firstResult);
        const third = createApkHardRuntime(mulberry32(37));
        expect(third.decide(snapshot())).toEqual(firstResult);
        expect(Math.random).toBe(originalRandom);
    });

    it('没有可行动单位且不能招募时正常结束回合', () => {
        const input = snapshot();
        input.units = input.units.map(unit => ({ ...unit, standby: true }));
        input.teams = input.teams.map(team => ({ ...team, gold: 0 }));
        expect(createApkHardRuntime(() => 0.5).decide(input).kind).toBe('end');
    });
});
