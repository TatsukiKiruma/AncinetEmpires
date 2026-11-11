import { scores } from '../stage4_v7/analysis';

export function healthy(result: any, expected: number) {
    const t = result.telemetry, games = result.games;
    return games.length === expected && new Set(games.map((g: any) => g.id)).size === expected && games.every((g: any) => g.natural && !g.error)
        && t.completeCoverage && t.timeForfeits === 0 && t.waitOverCaptureCount === 0 && t.allSavedWitnessesLegal === true && t.invalidTeacher === 0;
}

/** 按执行书逐项核验；另一指标使用原Stage5基线减0.015，不放宽人数分层。 */
export function strength(games: any[]) {
    const s = scores(games), wins = games.filter(g => g.firstPlace === 1).length;
    const overall = s.equalWin >= .6578 && s.equalRank >= .7134-.015 || s.equalRank >= .7134 && s.equalWin >= .6579-.015;
    return overall && wins >= 36 && s.byPlayers[2].attempted === 20 && s.byPlayers[3].attempted === 18 && s.byPlayers[4].attempted === 16
        && s.byPlayers[2].wins >= 15 && s.byPlayers[3].wins >= 11 && s.byPlayers[4].wins >= 9;
}
