import fs from 'fs';
import path from 'path';
import { EvaluationRunner, PolicyConfig } from '../research/eval_runner';

const devMaps = [
    '(2) Duel.aem',
    '(2) Liberty Port.aem',
    '(2) Swamplands.aem',
    '(2) Icy Paths.aem',
    '(2) The Crossing.aem'
];

async function main() {
    const runner = new EvaluationRunner();
    const heuristicCfg: PolicyConfig = { type: 'heuristic', id: 'frozen_heuristic' };

    const candidates: PolicyConfig[] = [
        { type: 'b100_q', id: 'B100-Q' },
        { type: 'b100_r', id: 'B100-R' },
        { type: 'p1', id: 'P1_champion' },
        { type: 'theta1', id: 'theta1_v19' }
    ];

    const outDir = 'ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks';
    fs.mkdirSync(outDir, { recursive: true });

    console.log("=== R6 DEV Benchmarks vs HeuristicAI ===");
    console.log(`Maps (${devMaps.length}):`, devMaps);
    console.log(`Each candidate will play ${devMaps.length * 2} games (paired seat swap).`);

    for (const cand of candidates) {
        console.log(`\n--- Evaluating ${cand.id} vs frozen_heuristic ---`);
        const startTime = performance.now();
        const report = runner.runPairPanel(cand, heuristicCfg, devMaps, 20261014, {
            maxSteps: 3000,
            maxWallSeconds: 300
        });
        const elapsed = (performance.now() - startTime) / 1000;

        console.log(`Result for ${cand.id}:`);
        console.log(`  Wins: ${report.winsA} / ${report.totalGames} (${(report.winRateA * 100).toFixed(1)}%)`);
        console.log(`  Losses: ${report.winsB}, Draws: ${report.draws}, Truncations: ${report.truncations}, Errors: ${report.errors}`);
        console.log(`  Seat0 Wins: ${report.seat0WinsA}, Seat1 Wins: ${report.seat1WinsA}`);
        console.log(`  Elapsed Time: ${elapsed.toFixed(1)}s`);

        const outFile = path.join(outDir, `${cand.id}_vs_heuristic.json`);
        fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
        console.log(`  Report saved to: ${outFile}`);
    }
}

main().catch(console.error);
