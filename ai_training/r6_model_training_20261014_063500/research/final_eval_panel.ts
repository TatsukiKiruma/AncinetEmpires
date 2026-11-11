import fs from 'fs';
import path from 'path';
import { EvaluationRunner, PolicyConfig, PanelEvaluationReport } from './eval_runner';

/**
 * 最终主验收面板地图配置 (方案 A：100% 确凿地形，剔除近似地块地图)
 * 7 张官方原生确凿双人地图 + 3 组代表性地图独立轮次配对换边，严格凑齐 10 组配对 = 20 局
 */
export const FROZEN_ACCEPTANCE_MAPS = [
    '(2) Duel.aem',            // Slot 0 (Games 0, 1)
    '(2) Liberty Port.aem',    // Slot 1 (Games 2, 3)
    '(2) Swamplands.aem',      // Slot 2 (Games 4, 5)
    '(2) The Crossing.aem',    // Slot 3 (Games 6, 7)
    '(2) Icy Paths.aem',       // Slot 4 (Games 8, 9)
    '(2) Peak Island.aem',     // Slot 5 (Games 10, 11)
    '(2) Crossed swords.aem',  // Slot 6 (Games 12, 13)
    '(2) Duel.aem',            // Slot 7 (Games 14, 15) [Round 2]
    '(2) The Crossing.aem',    // Slot 8 (Games 16, 17) [Round 2]
    '(2) Swamplands.aem'       // Slot 9 (Games 18, 19) [Round 2]
];

export const ACCEPTANCE_BASE_SEED = 20261014;

export interface AcceptanceVerdict {
    timestamp: string;
    targetModelId: string;
    targetModelSha256: string;
    mapsCount: number;
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    truncations: number;
    errors: number;
    naturalWinRate: number;
    targetThresholdRate: number; // 0.80 (16/20)
    targetThresholdWins: number; // 16
    isAccepted: boolean;
    verdictMessage: string;
    report: PanelEvaluationReport;
}

export function runFormalAcceptance(
    targetModelCfg: PolicyConfig,
    targetModelSha256: string,
    outDir: string
): AcceptanceVerdict {
    const runner = new EvaluationRunner();
    const heuristicCfg: PolicyConfig = { type: 'heuristic', id: 'frozen_heuristic' };

    console.log(`\n======================================================`);
    console.log(`Starting R6 Formal Acceptance Evaluation`);
    console.log(`Target Candidate: ${targetModelCfg.id} (${targetModelCfg.type})`);
    console.log(`SHA-256: ${targetModelSha256}`);
    console.log(`Opponent: ${heuristicCfg.id}`);
    console.log(`Maps (10 slots = 20 paired games):`);
    FROZEN_ACCEPTANCE_MAPS.forEach((m, i) => console.log(`  Slot ${i}: ${m}`));
    console.log(`Success Threshold: >= 16 wins / 20 games (80.0%)`);
    console.log(`======================================================\n`);

    const startTime = performance.now();
    const report = runner.runPairPanel(targetModelCfg, heuristicCfg, FROZEN_ACCEPTANCE_MAPS, ACCEPTANCE_BASE_SEED, {
        maxSteps: 3000,
        maxWallSeconds: 300
    });
    const elapsedSeconds = (performance.now() - startTime) / 1000;

    const wins = report.winsA;
    const losses = report.winsB;
    const draws = report.draws;
    const truncations = report.truncations;
    const errors = report.errors;
    const winRate = report.winRateA;
    const isAccepted = wins >= 16 && errors === 0;

    let verdictMsg = '';
    if (isAccepted) {
        verdictMsg = `SUCCESS: 模型 ${targetModelCfg.id} 在 20 局主验收中获得 ${wins} 胜 (${(winRate * 100).toFixed(1)}%)，达到 >= 16 胜 (80%) 目标！`;
    } else {
        verdictMsg = `NOT_MET: 模型 ${targetModelCfg.id} 在 20 局主验收中获得 ${wins} 胜 (${(winRate * 100).toFixed(1)}%)，未达到 16 胜 (80%) 目标 (负: ${losses}, 截断: ${truncations}, 错误: ${errors})。如实报告事实，绝不虚报完成。`;
    }

    console.log(`\n--- Acceptance Evaluation Completed in ${elapsedSeconds.toFixed(1)}s ---`);
    console.log(verdictMsg);

    for (const r of report.results) {
        console.log(`  Game ${r.gameIndex} (${r.mapName}) [Seat${r.seat0PolicyId === targetModelCfg.id ? 0 : 1}]: WinnerAlliance=${r.winnerAlliance}, Steps=${r.totalSteps}, Trunc=${r.isTruncated} (${r.truncationReason}), Wall=${r.elapsedWallSeconds.toFixed(1)}s`);
    }

    const verdict: AcceptanceVerdict = {
        timestamp: new Date().toISOString(),
        targetModelId: targetModelCfg.id,
        targetModelSha256,
        mapsCount: FROZEN_ACCEPTANCE_MAPS.length,
        totalGames: report.totalGames,
        wins,
        losses,
        draws,
        truncations,
        errors,
        naturalWinRate: winRate,
        targetThresholdRate: 0.8,
        targetThresholdWins: 16,
        isAccepted,
        verdictMessage: verdictMsg,
        report
    };

    fs.mkdirSync(outDir, { recursive: true });
    const verdictFile = path.join(outDir, 'final_acceptance_verdict.json');
    fs.writeFileSync(verdictFile, JSON.stringify(verdict, null, 2), 'utf8');
    console.log(`Saved verdict to: ${verdictFile}`);

    return verdict;
}
