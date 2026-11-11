/** 预筛与完整开发分别检查，缺失结果不能被视为健康覆盖。 */
export function healthGate(t: any): boolean {
    return t.completeCoverage === true && t.substantiveRate > .9 && t.substantiveByPlayers[4].rate >= .85 && t.timeForfeits === 0 && t.invalidTeacher === 0;
}
export function strengthGate(s: any): boolean {
    return (s.equalRank > .4903 || s.equalWin > .3468) && [2, 3, 4].every(n => s.byPlayers[n].wins >= ({ 2: 8, 3: 4, 4: 4 } as Record<number, number>)[n]);
}
