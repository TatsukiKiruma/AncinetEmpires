import fs from 'fs';
import path from 'path';
import { GameEngine } from '../env/src_game_frozen/engine';
import { createSkirmishMatchState } from '../research/eval_runner';
import { HeuristicAI } from '../env/src_game_frozen/ai/heuristic_ai';
import { Mulberry32PRNG } from '../research/prng';
import {
    encodeGameStateSpatial,
    encodeCandidateActionsSpatialForSchema,
    SPATIAL_TENSOR_CHANNELS_V19,
    ENCODER_SCHEMA_ID_V19
} from '../env/src_game_frozen/ai/spatial_tensor_encoder';

const MAPS = [
    '(2) Duel.aem',
    '(2) Liberty Port.aem',
    '(2) Swamplands.aem',
    '(2) The Crossing.aem',
    '(2) Icy Paths.aem',
    '(2) Peak Island.aem',
    '(2) Crossed swords.aem'
];

interface ParityFixtureSample {
    sampleId: number;
    mapName: string;
    stepIndex: number;
    playerId: number;
    spatial: number[];
    global: number[];
    candidateActorCoords: [number, number][];
    candidateLandingCoords: [number, number][];
    candidateTargetCoords: [number, number][];
    candidateSemantics: number[][];
}

function main() {
    const samples: ParityFixtureSample[] = [];
    let sampleId = 0;
    const targetCount = 100;

    for (let mapIdx = 0; mapIdx < MAPS.length && samples.length < targetCount; mapIdx++) {
        const mapName = MAPS[mapIdx];
        const state = createSkirmishMatchState(mapName);
        const engine = new GameEngine(state);
        const prng = new Mulberry32PRNG(777 + mapIdx);
        const ai0 = new HeuristicAI(() => prng.next());
        const ai1 = new HeuristicAI(() => prng.next());

        let step = 0;
        while (!engine.isTerminal() && step < 50 && samples.length < targetCount) {
            const curPlayer = engine.getState().currentPlayer;
            const legal = engine.getLegalActions(curPlayer);
            if (legal.length === 0) break;

            // 提取特征
            const encState = encodeGameStateSpatial(engine.getState(), curPlayer, 'v2', {
                channels: SPATIAL_TENSOR_CHANNELS_V19
            });
            const actionFeats = encodeCandidateActionsSpatialForSchema(
                engine.getState(),
                curPlayer,
                legal,
                'v2',
                ENCODER_SCHEMA_ID_V19
            );

            const candActor: [number, number][] = [];
            const candLanding: [number, number][] = [];
            const candTarget: [number, number][] = [];
            const candSem: number[][] = [];

            for (const act of actionFeats) {
                candActor.push(act.actorCoord ? [act.actorCoord.x, act.actorCoord.y] : [-1, -1]);
                candLanding.push(act.landingCoord ? [act.landingCoord.x, act.landingCoord.y] : [-1, -1]);
                candTarget.push(act.targetCoord ? [act.targetCoord.x, act.targetCoord.y] : [-1, -1]);
                candSem.push(Array.from(act.semantics));
            }

            samples.push({
                sampleId,
                mapName,
                stepIndex: step,
                playerId: curPlayer,
                spatial: Array.from(encState.spatialTensor),
                global: Array.from(encState.globalFeatures),
                candidateActorCoords: candActor,
                candidateLandingCoords: candLanding,
                candidateTargetCoords: candTarget,
                candidateSemantics: candSem
            });
            sampleId++;

            // 推进对局
            const chosen = curPlayer === 0
                ? ai0.getAction(engine, 0, legal)
                : ai1.getAction(engine, 1, legal);
            engine.step(chosen);
            step++;
        }
    }

    const outPath = 'ai_training/r7_training_stage_20261014_083500/artifacts/parity_fixture_100.json';
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(samples, null, 2), 'utf8');
    console.log(`Generated ${samples.length} parity fixture samples across 7 maps at ${outPath}`);
}

main();
