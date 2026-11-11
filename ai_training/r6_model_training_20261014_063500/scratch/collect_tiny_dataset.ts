import fs from 'fs';
import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { DeterministicPRNG } from '../research/prng';
import { encodeAction } from '../../../src/game/env';
import {
    encodeGameStateSpatial,
    encodeCandidateActionsSpatialForSchema,
    ENCODER_SCHEMA_ID_V19,
    SPATIAL_TENSOR_CHANNELS_V19
} from '../../../src/game/ai/spatial_tensor_encoder';

interface TinySample {
    sampleId: number;
    spatial: number[]; // Flattened [34, 20, 20]
    global: number[];  // [20]
    candidateCount: number;
    candidateActorCoords: [number, number][];
    candidateLandingCoords: [number, number][];
    candidateTargetCoords: [number, number][];
    candidateSemantics: number[][]; // [A, 53]
    targetActionIndex: number;
}

function collectTinyDataset(targetCount = 128) {
    console.log(`=== Collecting ${targetCount} Clean Tiny-Fit Samples from r4 Engine ===`);
    const prng = new DeterministicPRNG(42);
    const ai = new HeuristicAI(() => prng.next());

    const samples: TinySample[] = [];
    let sampleId = 0;

    for (const mapName of ['(2) Duel.aem', '(2) Liberty Port.aem', '(2) Swamplands.aem']) {
        if (samples.length >= targetCount) break;

        const state = createAppApkSkirmishGameState(mapName, 'SD');
        const engine = new GameEngine(state);

        while (!engine.isTerminal() && samples.length < targetCount) {
            const curPlayer = engine.getState().currentPlayer;
            const legalActions = engine.getLegalActions(curPlayer);
            if (legalActions.length === 0) break;

            const bestAction = ai.getAction(engine, curPlayer, legalActions);
            const targetIndex = legalActions.findIndex(a => encodeAction(a) === encodeAction(bestAction));

            if (targetIndex >= 0) {
                // Encode 34-channel spatial state using official v19 spatial encoder
                const encState = encodeGameStateSpatial(engine.getState(), curPlayer, 'v2', {
                    channels: SPATIAL_TENSOR_CHANNELS_V19
                });
                const actionFeats = encodeCandidateActionsSpatialForSchema(
                    engine.getState(),
                    curPlayer,
                    legalActions,
                    'v2',
                    ENCODER_SCHEMA_ID_V19
                );

                const candCoordsActor: [number, number][] = [];
                const candCoordsLanding: [number, number][] = [];
                const candCoordsTarget: [number, number][] = [];
                const candSemantics: number[][] = [];

                for (const feat of actionFeats) {
                    candCoordsActor.push([feat.actorCoord?.x ?? -1, feat.actorCoord?.y ?? -1]);
                    candCoordsLanding.push([feat.landingCoord?.x ?? -1, feat.landingCoord?.y ?? -1]);
                    candCoordsTarget.push([feat.targetCoord?.x ?? -1, feat.targetCoord?.y ?? -1]);
                    candSemantics.push(Array.from(feat.semantics));
                }

                samples.push({
                    sampleId: sampleId++,
                    spatial: Array.from(encState.spatialTensor),
                    global: Array.from(encState.globalFeatures),
                    candidateCount: legalActions.length,
                    candidateActorCoords: candCoordsActor,
                    candidateLandingCoords: candCoordsLanding,
                    candidateTargetCoords: candCoordsTarget,
                    candidateSemantics: candSemantics,
                    targetActionIndex: targetIndex
                });
            }

            engine.step(bestAction);
        }
    }

    console.log(`Collected ${samples.length} clean samples.`);
    const outPath = 'ai_training/r6_model_training_20261014_063500/scratch/tiny_128_samples.json';
    fs.writeFileSync(outPath, JSON.stringify(samples, null, 2), 'utf8');
    console.log(`Saved to ${outPath}`);
}

collectTinyDataset(128);
