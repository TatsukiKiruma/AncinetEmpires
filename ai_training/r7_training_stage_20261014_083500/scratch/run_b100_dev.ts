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

const b100Candidates: PolicyConfig[] = [
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
        ? b100Candidates.filter(c => c.id === targetId)
        : b100Candidates;

    for (const cand of filtered) {
        console.log(`\n======================================================`);
        console.log(`Running DEV Panel for B100 Teacher: ${cand.id}`);
        console.log(`======================================================`);

        const t0 = Date.now();
        const report = runPanelEvaluation(DEV_MANIFEST_PATH, cand, opponentCfg, (curr, total, res) => {
            console.log(`  [${curr}/${total}] Game ${res.gameIndex} (${res.mapName}, Slot ${res.slotIndex}) [Seat ${res.candidateSeat}]: Outcome=${res.outcomeCategory}, Winner=${res.winner}, Steps=${res.totalSteps}, Wall=${res.elapsedWallSeconds.toFixed(1)}s`);
        });

        const elapsed = (Date.now() - t0) / 1000;
        console.log(`\n--- Summary for ${cand.id} ---`);
        console.log(`  Natural Wins: ${report.wins} / ${report.totalGames} (${(report.naturalWinRate * 100).toFixed(1)}%)`);
        console.log(`  Losses: ${report.losses}, Draws: ${report.draws}, Truncs: ${report.totalTruncations}, Errors: ${report.errors}`);
        console.log(`  Total Wall Time: ${elapsed.toFixed(1)}s`);

        const outPath = path.join(OUT_DIR, `${cand.id}_dev_report.json`);
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`Saved report to ${outPath}`);
    }
}

main();
