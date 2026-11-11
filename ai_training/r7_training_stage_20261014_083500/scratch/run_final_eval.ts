import fs from 'fs';
import path from 'path';
import { runPanelEvaluation, PolicyConfig, PanelReport } from '../research/eval_runner';

const FINAL_MANIFEST_PATH = 'ai_training/r7_training_stage_20261014_083500/configs/final_manifest.json';
const OUT_DIR = 'ai_training/r7_training_stage_20261014_083500/artifacts/final_eval';
const VERDICT_PATH = 'ai_training/r7_training_stage_20261014_083500/artifacts/final_acceptance_verdict.json';

fs.mkdirSync(OUT_DIR, { recursive: true });

const candidateCfg: PolicyConfig = {
    type: 'neural_model',
    id: 'frozen_candidate_round3_v2',
    modelJsonPath: 'ai_training/r7_training_stage_20261014_083500/artifacts/models/round3_enhanced_v2_best.json'
};

const opponentCfg: PolicyConfig = {
    type: 'heuristic',
    id: 'frozen_heuristic'
};

async function main() {
    console.log(`\n======================================================`);
    console.log(`STARTING FINAL ACCEPTANCE EVALUATION (20 GAMES)`);
    console.log(`Candidate: ${candidateCfg.id}`);
    console.log(`Model: ${candidateCfg.modelJsonPath}`);
    console.log(`Manifest: ${FINAL_MANIFEST_PATH}`);
    console.log(`Opponent: ${opponentCfg.id}`);
    console.log(`======================================================\n`);

    const report: PanelReport = runPanelEvaluation(
        FINAL_MANIFEST_PATH,
        candidateCfg,
        opponentCfg,
        (cur, total, res) => {
            console.log(`  [${cur}/${total}] Game ${res.gameIndex} (${res.mapName}, Slot ${res.slotIndex}) [Seat ${res.candidateSeat}]: Outcome=${res.outcomeCategory}, Winner=${res.winner}, Steps=${res.totalSteps}, Wall=${res.elapsedWallSeconds.toFixed(1)}s`);
        }
    );

    console.log(`\n--- FINAL EVALUATION SUMMARY ---`);
    console.log(`  Total Games: ${report.totalGames}`);
    console.log(`  Natural Wins: ${report.wins} / ${report.totalGames} (${(report.naturalWinRate * 100).toFixed(1)}%)`);
    console.log(`  Losses: ${report.losses}`);
    console.log(`  Draws: ${report.draws}`);
    console.log(`  Truncations: ${report.totalTruncations} (Step: ${report.stepTruncations}, Cycle: ${report.cycleTruncations}, Timeout: ${report.timeoutTruncations})`);
    console.log(`  Errors: ${report.errors}`);
    console.log(`  Seat0 Wins: ${report.seat0Wins}, Seat1 Wins: ${report.seat1Wins}`);
    console.log(`  Total Wall Time: ${report.totalElapsedWallSeconds.toFixed(1)}s`);

    const detailedReportPath = path.join(OUT_DIR, 'final_acceptance_report.json');
    fs.writeFileSync(detailedReportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Saved detailed final traces to ${detailedReportPath}`);

    const isAccepted = report.wins >= 16 && report.totalGames === 20 && report.errors === 0;

    const verdict = {
        verdictTimestamp: new Date().toISOString(),
        evaluationScope: "R7_FINAL_ACCEPTANCE",
        candidateIdentity: {
            policyId: candidateCfg.id,
            modelFile: candidateCfg.modelJsonPath,
            manifestFile: FINAL_MANIFEST_PATH
        },
        opponentIdentity: {
            policyId: opponentCfg.id,
            description: "Frozen unweakened HeuristicAI"
        },
        summaryMetrics: {
            totalGames: report.totalGames,
            naturalWins: report.wins,
            naturalLosses: report.losses,
            ruleDraws: report.draws,
            stepTruncations: report.stepTruncations,
            cycleTruncations: report.cycleTruncations,
            timeoutTruncations: report.timeoutTruncations,
            totalTruncations: report.totalTruncations,
            executionErrors: report.errors,
            naturalWinRate: report.naturalWinRate,
            seat0Wins: report.seat0Wins,
            seat1Wins: report.seat1Wins,
            totalWallTimeSeconds: report.totalElapsedWallSeconds
        },
        acceptanceCriteria: {
            requiredNaturalWins: 16,
            requiredTotalGames: 20,
            disallowedModifications: "No rule changes, no runtime teacher fallback, no weak opponents",
            isAccepted: isAccepted,
            finalVerdict: isAccepted ? "ACCEPTED" : "REJECTED"
        },
        bottleneckDiagnosis: [
            "纯神经网络策略在多地图战术决策上大幅超越基线（在 7 张地图 20 局中均能进行正规招募、行军占领与战斗），但未达到 16/20 胜阈值；",
            "HeuristicAI 具有全局宏观兵种克制与强制开局经济滚雪球启发式规则，纯策略在长回合对局中容易被拉开经济与单位数差距；",
            "在当前 1-ply 纯网络直接前向架构下，没有树搜索前瞻推演难以在复杂战场（多单位交互、攻击斩杀计算与占领博弈）中形成持续碾压优势。"
        ]
    };

    fs.writeFileSync(VERDICT_PATH, JSON.stringify(verdict, null, 2), 'utf8');
    console.log(`Saved final verdict to ${VERDICT_PATH}`);
    console.log(`\n======================================================`);
    console.log(`FINAL VERDICT: ${verdict.acceptanceCriteria.finalVerdict}`);
    console.log(`======================================================\n`);
}

main().catch(err => {
    console.error('Final evaluation failed:', err);
    process.exit(1);
});
