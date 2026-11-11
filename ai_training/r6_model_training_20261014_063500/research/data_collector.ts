import fs from 'fs';
import path from 'path';
import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { createB100Policy } from '../../v17/teachers/b100_policy';
import { DeterministicPRNG, deriveSeed } from './prng';
import {
    encodeGameStateSpatial,
    encodeCandidateActionsSpatialForSchema,
    ENCODER_SCHEMA_ID_V19,
    SPATIAL_TENSOR_CHANNELS_V19
} from '../../../src/game/ai/spatial_tensor_encoder';
import { encodeAction } from '../../../src/game/env';
import { computeStateHash } from './state_hash';

export interface TrainingSample {
    sampleId: number;
    gameId: string;
    mapName: string;
    stepIndex: number;
    playerId: number;
    inputHash: string; // Hash of spatial + global + action features for exact deduplication
    spatial: number[];
    global: number[];
    candidateActorCoords: [number, number][];
    candidateLandingCoords: [number, number][];
    candidateTargetCoords: [number, number][];
    candidateSemantics: number[][];
    targetActionIndex: number;
    labelSource: 'heuristic' | 'b100_q';
}

export function collectTrainingPool(
    maps: string[],
    gamesPerMap: number,
    baseSeed: number,
    targetUniqueInputs = 5000
): { trainSamples: TrainingSample[]; valSamples: TrainingSample[] } {
    console.log(`=== Collecting Training Data on r4 Rules (Target: ~${targetUniqueInputs} unique inputs) ===`);

    const allSamples: TrainingSample[] = [];
    const seenInputHashes = new Set<string>();
    let globalSampleId = 0;

    let gameCounter = 0;
    for (const mapName of maps) {
        for (let g = 0; g < gamesPerMap; g++) {
            if (seenInputHashes.size >= targetUniqueInputs) break;

            const gameId = `${mapName}_g${g}_s${baseSeed + gameCounter}`;
            const gameSeed = baseSeed + gameCounter++;
            const prng = new DeterministicPRNG(gameSeed);

            // 混合策略对战：产生多样化的访问状态
            // 偶数局用 Heuristic vs Heuristic，奇数局用 B100-Q vs Heuristic
            const state = createAppApkSkirmishGameState(mapName, 'SD');
            const engine = new GameEngine(state);

            const aiH0 = new HeuristicAI(() => prng.next());
            const aiH1 = new HeuristicAI(() => prng.next());
            const b100Handle = createB100Policy({
                variant: 'B100-Q',
                rootSeed: gameSeed,
                seat: 0,
                querySeed: 0
            });

            let step = 0;
            const maxGameSteps = 600;

            while (!engine.isTerminal() && step < maxGameSteps) {
                const curPlayer = engine.getState().currentPlayer;
                const legal = engine.getLegalActions(curPlayer);
                if (legal.length === 0) break;

                // 决定行动策略与标签
                let chosenAction: any;
                let labelSrc: 'heuristic' | 'b100_q' = 'heuristic';

                if (g % 2 === 1 && curPlayer === 0) {
                    chosenAction = b100Handle.policy({
                        state: engine.getState(),
                        playerId: 0,
                        allowed: legal,
                        seat: 0,
                        seed: gameSeed
                    });
                    labelSrc = 'b100_q';
                } else {
                    chosenAction = curPlayer === 0 ? aiH0.getAction(engine, 0, legal) : aiH1.getAction(engine, 1, legal);
                }

                const targetIdx = legal.findIndex(a => encodeAction(a) === encodeAction(chosenAction));
                if (targetIdx >= 0) {
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

                    // 计算输入特征去重哈希（前向网络真实看到的输入）
                    const stateHash = computeStateHash(engine.getState());
                    const inputHash = `${stateHash}_p${curPlayer}`;

                    if (!seenInputHashes.has(inputHash)) {
                        seenInputHashes.add(inputHash);
                        allSamples.push({
                            sampleId: globalSampleId++,
                            gameId,
                            mapName,
                            stepIndex: step,
                            playerId: curPlayer,
                            inputHash,
                            spatial: Array.from(encState.spatialTensor),
                            global: Array.from(encState.globalFeatures),
                            candidateActorCoords: candCoordsActor,
                            candidateLandingCoords: candCoordsLanding,
                            candidateTargetCoords: candCoordsTarget,
                            candidateSemantics: candSemantics,
                            targetActionIndex: targetIdx,
                            labelSource: labelSrc
                        });
                    }
                }

                engine.step(chosenAction);
                step++;
            }
        }
    }

    console.log(`Total unique samples collected: ${allSamples.length}`);

    // 按 gameId (对局家族) 严格隔离划分 Train (80%) 与 Val (20%)
    const uniqueGames = Array.from(new Set(allSamples.map(s => s.gameId)));
    const trainGameSet = new Set(uniqueGames.slice(0, Math.floor(uniqueGames.length * 0.8)));

    const trainSamples = allSamples.filter(s => trainGameSet.has(s.gameId));
    const valSamples = allSamples.filter(s => !trainGameSet.has(s.gameId));

    console.log(`Split by game家族: Train = ${trainSamples.length} rows, Val = ${valSamples.length} rows`);
    return { trainSamples, valSamples };
}
