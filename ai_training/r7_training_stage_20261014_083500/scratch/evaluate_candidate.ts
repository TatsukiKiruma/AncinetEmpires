import fs from 'fs';
import path from 'path';
import { runPanelEvaluation, PolicyConfig } from '../research/eval_runner';

const DEV_MANIFEST_PATH = 'ai_training/r7_training_stage_20261014_083500/configs/dev_manifest.json';
const OUT_DIR = 'ai_training/r7_training_stage_20261014_083500/artifacts/dev_eval';

fs.mkdirSync(OUT_DIR, { recursive: true });

const opponentCfg: PolicyConfig = {
    type: 'heuristic',
    id: 'frozen_heuristic'
};

function main() {
    const candidateId = process.argv[2] || 'round1_arm_a_best';
    const modelJsonPath = process.argv[3] || `ai_training/r7_training_stage_20261014_083500/artifacts/models/${candidateId}.json`;

    if (!fs.existsSync(modelJsonPath)) {
        console.error(`Model file not found: ${modelJsonPath}`);
        process.exit(1);
    }

    const candCfg: PolicyConfig = {
        type: 'neural_model',
        id: candidateId,
        modelJsonPath
    };

    console.log(`\n======================================================`);
    console.log(`Running DEV Panel (20 Games) for Candidate: ${candCfg.id}`);
    console.log(`Model Path: ${modelJsonPath}`);
    console.log(`Opponent: ${opponentCfg.id}`);
    console.log(`======================================================`);

    const t0 = Date.now();
    const report = runPanelEvaluation(DEV_MANIFEST_PATH, candCfg, opponentCfg, (curr, total, res) => {
        console.log(`  [${curr}/${total}] Game ${res.gameIndex} (${res.mapName}, Slot ${res.slotIndex}) [Seat ${res.candidateSeat}]: Outcome=${res.outcomeCategory}, Winner=${res.winner}, Steps=${res.totalSteps}, Wall=${res.elapsedWallSeconds.toFixed(1)}s`);
    });

    const elapsed = (Date.now() - t0) / 1000;
    console.log(`\n--- Summary for ${candCfg.id} ---`);
    console.log(`  Natural Wins: ${report.wins} / ${report.totalGames} (${(report.naturalWinRate * 100).toFixed(1)}%)`);
    console.log(`  Losses: ${report.losses}`);
    console.log(`  Draws: ${report.draws}`);
    console.log(`  Truncations: ${report.totalTruncations} (Step: ${report.stepTruncations}, Cycle: ${report.cycleTruncations}, Timeout: ${report.timeoutTruncations})`);
    console.log(`  Errors: ${report.errors}`);
    console.log(`  Seat0 Wins: ${report.seat0Wins}, Seat1 Wins: ${report.seat1Wins}`);
    console.log(`  Total Wall Time: ${elapsed.toFixed(1)}s`);

    const outPath = path.join(OUT_DIR, `${candidateId}_dev_report.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Saved report to ${outPath}`);
}

main();
