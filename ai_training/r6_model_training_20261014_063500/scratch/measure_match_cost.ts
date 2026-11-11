import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { DeterministicPRNG } from '../research/prng';
import { encodeAction } from '../../../src/game/env';
import { computeStateHash } from '../research/state_hash';

interface MatchCostResult {
    mapName: string;
    totalSteps: number;
    totalHandoffs: number;
    winnerAlliance: number | null;
    elapsedWallSeconds: number;
    p0StepTimeMsAvg: number;
    p1StepTimeMsAvg: number;
    initialStateHash: string;
    finalStateHash: string;
}

function runCostProbe(mapName: string, maxSteps = 4000, seed = 42): MatchCostResult {
    const prng0 = new DeterministicPRNG(seed * 1000 + 1);
    const prng1 = new DeterministicPRNG(seed * 1000 + 2);
    const ai0 = new HeuristicAI(() => prng0.next());
    const ai1 = new HeuristicAI(() => prng1.next());

    const state = createAppApkSkirmishGameState(mapName, 'SD');
    const initialStateHash = computeStateHash(state);
    const engine = new GameEngine(state);

    let step = 0;
    let handoffs = 0;
    let lastPlayer = engine.getState().currentPlayer;

    const p0Times: number[] = [];
    const p1Times: number[] = [];

    const startTime = performance.now();

    while (!engine.isTerminal() && step < maxSteps) {
        const curPlayer = engine.getState().currentPlayer;
        if (curPlayer !== lastPlayer) {
            handoffs++;
            lastPlayer = curPlayer;
        }

        const t0 = performance.now();
        const action = curPlayer === 0 ? ai0.getAction(engine, 0) : ai1.getAction(engine, 1);
        const dt = performance.now() - t0;

        if (curPlayer === 0) p0Times.push(dt);
        else p1Times.push(dt);

        engine.step(action);
        step++;
    }

    const elapsedWallSeconds = (performance.now() - startTime) / 1000;
    const finalState = engine.getState();
    const finalStateHash = computeStateHash(finalState);

    return {
        mapName,
        totalSteps: step,
        totalHandoffs: handoffs,
        winnerAlliance: finalState.winnerAlliance ?? null,
        elapsedWallSeconds,
        p0StepTimeMsAvg: p0Times.length > 0 ? p0Times.reduce((a, b) => a + b, 0) / p0Times.length : 0,
        p1StepTimeMsAvg: p1Times.length > 0 ? p1Times.reduce((a, b) => a + b, 0) / p1Times.length : 0,
        initialStateHash,
        finalStateHash
    };
}

console.log("=== Running Cost Probes (Heuristic vs Heuristic) ===");
for (const mapName of ['(2) Duel.aem', '(2) Liberty Port.aem']) {
    const res = runCostProbe(mapName, 4000, 42);
    console.log(`Map: ${res.mapName}`);
    console.log(`  Steps: ${res.totalSteps}, Handoffs: ${res.totalHandoffs}, WinnerAlliance: ${res.winnerAlliance}`);
    console.log(`  WallClock: ${res.elapsedWallSeconds.toFixed(2)}s`);
    console.log(`  Avg Step Time: P0=${res.p0StepTimeMsAvg.toFixed(2)}ms, P1=${res.p1StepTimeMsAvg.toFixed(2)}ms`);
}
