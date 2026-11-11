import fs from 'fs';
import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { encodeAction } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';

function patchBenchmarkFile(filePath: string, candName: string) {
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    let winsA = 0;
    let winsB = 0;
    let draws = 0;
    let truncations = 0;
    let seat0WinsA = 0;
    let seat1WinsA = 0;

    for (const r of data.results) {
        if (r.isTruncated) {
            truncations++;
            continue;
        }

        const state = createAppApkSkirmishGameState(r.mapName, 'SD');
        const engine = new GameEngine(state);
        for (const code of r.actionCodes) {
            const legal = engine.getLegalActions(engine.getState().currentPlayer);
            const act = legal.find(a => encodeAction(a) === code);
            if (act) engine.step(act);
        }

        const winner = engine.getWinner();
        const alliance = winner !== null ? getAllianceId(engine.getState(), winner) : null;
        r.winnerAlliance = alliance;

        const candIsSeat0 = r.seat0PolicyId === candName;
        if (alliance !== null) {
            if ((candIsSeat0 && alliance === 0) || (!candIsSeat0 && alliance === 1)) {
                winsA++;
                if (candIsSeat0) seat0WinsA++;
                else seat1WinsA++;
            } else {
                winsB++;
            }
        } else {
            draws++;
        }
    }

    data.winsA = winsA;
    data.winsB = winsB;
    data.draws = draws;
    data.truncations = truncations;
    data.winRateA = data.totalGames > 0 ? winsA / data.totalGames : 0;
    data.seat0WinsA = seat0WinsA;
    data.seat1WinsA = seat1WinsA;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Patched ${candName}: Wins=${winsA}, Losses=${winsB}, Truncations=${truncations}, WinRate=${(data.winRateA * 100).toFixed(1)}%`);
}

patchBenchmarkFile('ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/B100-Q_vs_heuristic.json', 'B100-Q');
patchBenchmarkFile('ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/B100-R_vs_heuristic.json', 'B100-R');
