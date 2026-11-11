/** 用户修订的开发集晋级口径，D和E入口共同复核，回退次数只作诊断。 */
export function promotionThresholds(baseline: any) {
    return { total: Math.max(36, baseline.B), screen: Math.max(12, baseline.B18.wins - 2),
        2: Math.max(15, baseline.byPlayers[2].wins - 1), 3: 11,
        4: Math.max(9, baseline.byPlayers[4].wins - 1) };
}

export function passesPromotion(full: any, baseline: any): boolean {
    const min = promotionThresholds(baseline);
    return full.passed && full.natural === 54 && full.timeForfeits === 0 && full.wins >= min.total
        && [2, 4].every(n => full.byPlayers[n].wins >= min[n as 2 | 4])
        && (full.byPlayers[3].wins >= min[3] || full.wins >= Math.max(36, baseline.B + 1));
}
