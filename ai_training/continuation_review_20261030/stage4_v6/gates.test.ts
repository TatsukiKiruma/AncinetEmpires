import { expect, it } from 'vitest';
import { healthGate, strengthGate } from './gates';
it('严格健康边界及逐人数一场容忍不能被总体成绩掩盖', () => {
    const t = { completeCoverage: true, substantiveRate: .90001, substantiveByPlayers: { 4: { rate: .85 } }, timeForfeits: 0, invalidTeacher: 0 };
    expect(healthGate(t)).toBe(true); expect(healthGate({ ...t, substantiveRate: .9 })).toBe(false);
    expect(healthGate({ ...t, completeCoverage: false })).toBe(false);
    expect(healthGate({ ...t, substantiveByPlayers: { 4: { rate: .8499 } } })).toBe(false);
    const s = { equalRank: .49031, equalWin: .3, byPlayers: { 2: { wins: 8 }, 3: { wins: 4 }, 4: { wins: 4 } } };
    expect(strengthGate(s)).toBe(true); expect(strengthGate({ ...s, equalRank: .4903 })).toBe(false);
    expect(strengthGate({ ...s, equalWin: .6, byPlayers: { ...s.byPlayers, 4: { wins: 3 } } })).toBe(false);
});
