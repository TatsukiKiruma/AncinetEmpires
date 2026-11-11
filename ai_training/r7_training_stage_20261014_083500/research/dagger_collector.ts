import fs from 'fs';
import path from 'path';
import { GameEngine } from '../env/src_game_frozen/engine';
import { createSkirmishMatchState, buildPolicy, PolicyConfig } from './eval_runner';
import { HeuristicAI } from '../env/src_game_frozen/ai/heuristic_ai';
import { Mulberry32PRNG } from './prng';
import { computeNetworkInputHash } from './state_hash';
import { encodeAction } from '../env/src_game_frozen/env';
import {
    encodeGameStateSpatial,
    encodeCandidateActionsSpatialForSchema,
    SPATIAL_TENSOR_CHANNELS_V19,
    ENCODER_SCHEMA_ID_V19
} from '../env/src_game_frozen/ai/spatial_tensor_encoder';
import { ALL_CONFIRMED_MAPS, CollectedSample } from './data_collector';
import type { Action, GameState } from '../env/src_game_frozen/types';

export interface DAggerConfig {
    studentModelJsonPath: string;
    studentModelId: string;
    maps: string[];
    gamesPerMap: number;
    baseSeed: number;
    maxSteps: number;
    outJsonlPath: string;
}

/**
 * DAgger 纠错采集：
 * 由学生模型（Student Policy）在实战中执行动作探索真实对弈轨迹，
 * 在学生访问的每个决策点，由专家教师（Expert Teacher）对当前真实局面打分并给出纠错真值标签！
 */
export function runDAggerCollection(config: DAggerConfig): {
    daggerSampleCount: number;
    actionTypeDistribution: Record<string, number>;
} {
    const { studentModelJsonPath, studentModelId, maps, gamesPerMap, baseSeed, maxSteps, outJsonlPath } = config;
    fs.mkdirSync(path.dirname(outJsonlPath), { recursive: true });

    const studentCfg: PolicyConfig = {
        type: 'neural_model',
        id: studentModelId,
        modelJsonPath: studentModelJsonPath
    };

    const fd = fs.openSync(outJsonlPath, 'w');
    const seenHashes = new Set<string>();
    const actionDist: Record<string, number> = {};

    let globalSampleId = 100000;
    let totalSamples = 0;
    const t0 = Date.now();

    console.log(`======================================================`);
    console.log(`Starting Round 2 DAgger Corrective Sampling`);
    console.log(`Student Model: ${studentModelId} (${studentModelJsonPath})`);
    console.log(`Maps (${maps.length}):`, maps);
    console.log(`Games per map: ${gamesPerMap}`);
    console.log(`======================================================\n`);

    for (let mIdx = 0; mIdx < maps.length; mIdx++) {
        const mapName = maps[mIdx];
        console.log(`--- DAgger sampling on [${mIdx + 1}/${maps.length}]: ${mapName} ---`);

        for (let g = 0; g < gamesPerMap; g++) {
            // 双方轮流担任学生，覆盖 Seat 0 与 Seat 1
            const studentSeat = g % 2;
            const gameSeed = baseSeed + mIdx * 2000 + g * 20;
            const gameId = `dagger_${mapName}_g${g}_s${gameSeed}`;

            const studentPrng = new Mulberry32PRNG(gameSeed + 1);
            const expertPrng = new Mulberry32PRNG(gameSeed + 2);
            const studentPolicy = buildPolicy(studentCfg, gameSeed + 1);

            const expertAI = new HeuristicAI(() => expertPrng.next());
            const opponentAI = new HeuristicAI(() => expertPrng.next());

            const state = createSkirmishMatchState(mapName);
            const engine = new GameEngine(state);

            let step = 0;
            while (!engine.isTerminal() && step < maxSteps) {
                const curPlayer = engine.getState().currentPlayer;
                const legal = engine.getLegalActions(curPlayer);
                if (legal.length === 0) break;

                // 专家教师针对当前真实状态给出专家动作
                const expertAction = expertAI.getAction(engine, curPlayer, legal);

                if (curPlayer === studentSeat) {
                    // 当处于学生轮次时，提取学生当前面对的真实局面特征并记录专家纠错标签
                    const chosenEncoded = encodeAction(expertAction);
                    const targetIdx = legal.findIndex(a => encodeAction(a) === chosenEncoded);

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

                        const inputHash = computeNetworkInputHash({
                            spatial: encState.spatialTensor,
                            global: encState.globalFeatures,
                            candidateActorCoords: candActor,
                            candidateLandingCoords: candLanding,
                            candidateTargetCoords: candTarget,
                            candidateSemantics: candSem
                        });

                        if (!seenHashes.has(inputHash)) {
                            seenHashes.add(inputHash);
                            const sample: CollectedSample = {
                                sampleId: globalSampleId++,
                                gameId,
                                mapName,
                                stepIndex: step,
                                playerId: curPlayer,
                                inputHash,
                                spatial: Array.from(encState.spatialTensor),
                                global: Array.from(encState.globalFeatures),
                                candidateActorCoords: candActor,
                                candidateLandingCoords: candLanding,
                                candidateTargetCoords: candTarget,
                                candidateSemantics: candSem,
                                targetActionIndex: targetIdx,
                                labelSource: 'dagger_expert_correction'
                            };
                            fs.writeSync(fd, JSON.stringify(sample) + '\n');
                            totalSamples++;
                            actionDist[expertAction.type] = (actionDist[expertAction.type] ?? 0) + 1;
                        }
                    }

                    // 推进策略：学生在环境中执行自己的动作探索（DAgger 核心）
                    const isolatedState = JSON.parse(JSON.stringify(engine.getState()));
                    const studentAction = studentPolicy(isolatedState, legal, curPlayer, studentPrng);
                    engine.step(studentAction);
                } else {
                    // 对手行动
                    const oppAction = opponentAI.getAction(engine, curPlayer, legal);
                    engine.step(oppAction);
                }

                step++;
            }

            console.log(`  Map ${mapName} Game ${g} (Student Seat ${studentSeat}) finished in ${step} steps, total DAgger samples: ${totalSamples}`);
        }
    }

    fs.closeSync(fd);
    const elapsed = (Date.now() - t0) / 1000;
    console.log(`\nDAgger collection finished in ${elapsed.toFixed(1)}s, total corrective samples: ${totalSamples}`);
    console.log(`Action type distribution:`, actionDist);

    return {
        daggerSampleCount: totalSamples,
        actionTypeDistribution: actionDist
    };
}
