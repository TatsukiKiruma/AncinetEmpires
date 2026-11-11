import fs from 'fs';
import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { getAllianceId } from '../../../src/game/rule_config';

function recheckB100Winners() {
    for (const name of ['B100-Q', 'B100-R']) {
        const p = `ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/${name}_vs_heuristic.json`;
        if (!fs.existsSync(p)) continue;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));

        console.log(`\n=== Rechecking ${name} matches ===`);
        let actualWins = 0;
        let actualLosses = 0;
        let actualTrunc = 0;

        for (const r of data.results) {
            // Replay actions to get the true winner from final state
            if (r.isTruncated) {
                actualTrunc++;
                console.log(`  Game ${r.gameIndex} (${r.mapName}) Truncated: ${r.truncationReason} steps=${r.totalSteps}`);
                continue;
            }

            const state = createAppApkSkirmishGameState(r.mapName, 'SD');
            const engine = new GameEngine(state);
            for (const code of r.actionCodes) {
                // Find matching action
                const legal = engine.getLegalActions(engine.getState().currentPlayer);
                const act = legal.find(a => (a as any).type === code || code.startsWith((a as any).type));
                if (act) engine.step(act);
            }

            const winner = engine.getWinner();
            const candIsSeat0 = r.seat0PolicyId === name;
            const candWon = (candIsSeat0 && winner === 0) || (!candIsSeat0 && winner === 1);
            const heurWon = (candIsSeat0 && winner === 1) || (!candIsSeat0 && winner === 0);

            if (candWon) actualWins++;
            else if (heurWon) actualLosses++;

            console.log(`  Game ${r.gameIndex} (${r.mapName}) [Seat${candIsSeat0 ? 0 : 1}]: WinnerPlayer=${winner}, CandWon=${candWon}, Steps=${r.totalSteps}, Wall=${r.elapsedWallSeconds.toFixed(1)}s`);
        }

        console.log(`Summary for ${name}: Wins=${actualWins}, Losses=${actualLosses}, Truncations=${actualTrunc}`);
    }
}

recheckB100Winners();
