import fs from 'fs';
import path from 'path';
import { runPanelEvaluation, PolicyConfig, PanelReport } from '../research/eval_runner';

const DEV_MANIFEST_PATH = 'ai_training/r7_training_stage_20261014_083500/configs/dev_manifest.json';
const OUT_DIR = 'ai_training/r7_training_stage_20261014_083500/artifacts/dev_eval';

fs.mkdirSync(OUT_DIR, { recursive: true });

const opponentCfg: PolicyConfig = {
    type: 'heuristic',
    id: 'frozen_heuristic'
};

const candidatesToTest: PolicyConfig[] = [
    {
        type: 'neural_model',
        id: 'old_p1',
        modelJsonPath: 'ai_training/v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'
    },
    {
        type: 'neural_model',
        id: 'old_theta1',
        modelJsonPath: 'ai_training/r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json'
    },
    {
        type: 'neural_model',
        id: 'r6_arm_a',
        modelJsonPath: 'ai_training/r6_model_training_20261014_063500/artifacts/models/arm_a_warm_start.json'
    },
    {
        type: 'neural_model',
        id: 'r6_arm_b',
        modelJsonPath: 'ai_training/r6_model_training_20261014_063500/artifacts/models/arm_b_scratch.json'
    },
    {
        type: 'b100_q',
        id: 'old_b100_q',
        b100Variant: 'B100-Q'
    },
    {
        type: 'b100_r',
        id: 'old_b100_r',
        b100Variant: 'B100-R'
    }
];

function main() {
    const targetId = process.argv[2];
    const filtered = targetId
        ? candidatesToTest.filter(c => c.id === targetId)
        : candidatesToTest;

    if (filtered.length === 0) {
        console.error(`No candidate matched targetId: ${targetId}`);
        process.exit(1);
    }

    for (const cand of filtered) {
        console.log(`\n======================================================`);
        console.log(`Running DEV Panel (20 Games) for Candidate: ${cand.id} (${cand.type})`);
        console.log(`Opponent: ${opponentCfg.id}`);
        console.log(`======================================================`);

        const t0 = Date.now();
        const report = runPanelEvaluation(DEV_MANIFEST_PATH, cand, opponentCfg, (curr, total, res) => {
            console.log(`  [${curr}/${total}] Game ${res.gameIndex} (${res.mapName}, Slot ${res.slotIndex}) [Seat ${res.candidateSeat}]: Outcome=${res.outcomeCategory}, Winner=${res.winner}, Steps=${res.totalSteps}, Wall=${res.elapsedWallSeconds.toFixed(1)}s`);
        });

        const totalElapsed = (Date.now() - t0) / 1000;
        console.log(`\n--- Summary for ${cand.id} ---`);
        console.log(`  Natural Wins: ${report.wins} / ${report.totalGames} (${(report.naturalWinRate * 100).toFixed(1)}%)`);
        console.log(`  Losses: ${report.losses}`);
        console.log(`  Draws: ${report.draws}`);
        console.log(`  Truncations: ${report.totalTruncations} (Step: ${report.stepTruncations}, Cycle: ${report.cycleTruncations}, Timeout: ${report.timeoutTruncations})`);
        console.log(`  Errors: ${report.errors}`);
        console.log(`  Seat0 Wins: ${report.seat0Wins}, Seat1 Wins: ${report.seat1Wins}`);
        console.log(`  Total Wall Time: ${totalElapsed.toFixed(1)}s`);

        const outPath = path.join(OUT_DIR, `${cand.id}_dev_report.json`);
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`Saved report to ${outPath}`);
    }
}

main();
