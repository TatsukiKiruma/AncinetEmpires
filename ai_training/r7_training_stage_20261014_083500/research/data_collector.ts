import fs from 'fs';
import path from 'path';
import { GameEngine } from '../env/src_game_frozen/engine';
import { createSkirmishMatchState } from './eval_runner';
import { HeuristicAI } from '../env/src_game_frozen/ai/heuristic_ai';
import { Mulberry32PRNG } from './prng';
import { computeNetworkInputHash, computeStateHash } from './state_hash';
import { encodeAction } from '../env/src_game_frozen/env';
import {
    encodeGameStateSpatial,
    encodeCandidateActionsSpatialForSchema,
    SPATIAL_TENSOR_CHANNELS_V19,
    ENCODER_SCHEMA_ID_V19
} from '../env/src_game_frozen/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../env/src_game_frozen/types';

export interface CollectedSample {
    sampleId: number;
    gameId: string;
    mapName: string;
    stepIndex: number;
    playerId: number;
    inputHash: string;
    spatial: number[];
    global: number[];
    candidateActorCoords: [number, number][];
    candidateLandingCoords: [number, number][];
    candidateTargetCoords: [number, number][];
    candidateSemantics: number[][];
    targetActionIndex: number;
    labelSource: string;
}

export const ALL_CONFIRMED_MAPS = [
    '(2) Duel.aem',
    '(2) Liberty Port.aem',
    '(2) Swamplands.aem',
    '(2) The Crossing.aem',
    '(2) Icy Paths.aem',
    '(2) Peak Island.aem',
    '(2) Crossed swords.aem'
];

export interface CollectionConfig {
    targetUniqueSamples: number;
    maps: string[];
    gamesPerMap: number;
    baseSeed: number;
    maxStepsPerGame: number;
    outDir: string;
}

/**
 * 流式多地图数据采集：边采边写磁盘，严防 V8 堆内存溢出
 */
export function collectMultiMapDatasetStreaming(config: CollectionConfig): {
    trainCount: number;
    valCount: number;
    manifest: any;
} {
    const { targetUniqueSamples, maps, gamesPerMap, baseSeed, maxStepsPerGame, outDir } = config;
    fs.mkdirSync(outDir, { recursive: true });

    const rawJsonlPath = path.join(outDir, 'raw_samples.jsonl');
    if (fs.existsSync(rawJsonlPath)) fs.unlinkSync(rawJsonlPath);

    const fd = fs.openSync(rawJsonlPath, 'w');

    const seenInputHashes = new Set<string>();
    const gameMetaList: { gameId: string; mapName: string; sampleCount: number }[] = [];

    let totalRawSteps = 0;
    let globalSampleId = 0;
    const t0 = Date.now();

    console.log(`======================================================`);
    console.log(`Starting Streaming Multi-Map Data Production`);
    console.log(`Target Unique Samples: >= ${targetUniqueSamples}`);
    console.log(`Maps (${maps.length}):`, maps);
    console.log(`Games Per Map: ${gamesPerMap}, Base Seed: ${baseSeed}`);
    console.log(`======================================================\n`);

    for (let mIdx = 0; mIdx < maps.length; mIdx++) {
        const mapName = maps[mIdx];
        console.log(`--- Collecting on map [${mIdx + 1}/${maps.length}]: ${mapName} ---`);

        for (let g = 0; g < gamesPerMap; g++) {
            const gameSeed = baseSeed + mIdx * 1000 + g * 10;
            const gameId = `${mapName}_g${g}_s${gameSeed}`;
            let gameSampleCount = 0;

            const state = createSkirmishMatchState(mapName);
            const engine = new GameEngine(state);
            const prng = new Mulberry32PRNG(gameSeed);
            const aiH0 = new HeuristicAI(() => prng.next());
            const aiH1 = new HeuristicAI(() => prng.next());

            let step = 0;
            while (!engine.isTerminal() && step < maxStepsPerGame) {
                const curPlayer = engine.getState().currentPlayer;
                const legal = engine.getLegalActions(curPlayer);
                if (legal.length === 0) break;

                const chosenAction = curPlayer === 0
                    ? aiH0.getAction(engine, 0, legal)
                    : aiH1.getAction(engine, 1, legal);

                const chosenEncoded = encodeAction(chosenAction);
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

                    totalRawSteps++;

                    if (!seenInputHashes.has(inputHash)) {
                        seenInputHashes.add(inputHash);
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
                            labelSource: 'heuristic_teacher'
                        };
                        fs.writeSync(fd, JSON.stringify(sample) + '\n');
                        gameSampleCount++;
                    }
                }

                engine.step(chosenAction);
                step++;
            }

            gameMetaList.push({ gameId, mapName, sampleCount: gameSampleCount });
            console.log(`  Map ${mapName} Game ${g} finished: steps=${step}, unique added=${gameSampleCount}, total pool=${seenInputHashes.size}`);
        }
    }

    fs.closeSync(fd);
    const elapsedSec = (Date.now() - t0) / 1000;
    console.log(`\nStreaming raw collection completed in ${elapsedSec.toFixed(1)}s.`);
    console.log(`Raw steps: ${totalRawSteps}, Total unique pool: ${seenInputHashes.size}`);

    // 按对局家族分层划分 Train / Val
    const mapGamesMap = new Map<string, typeof gameMetaList>();
    for (const gm of gameMetaList) {
        if (!mapGamesMap.has(gm.mapName)) mapGamesMap.set(gm.mapName, []);
        mapGamesMap.get(gm.mapName)!.push(gm);
    }

    const trainGameSet = new Set<string>();
    const valGameSet = new Set<string>();

    for (const [_, gList] of mapGamesMap.entries()) {
        const valCount = Math.max(1, Math.floor(gList.length * 0.2));
        const trainCount = gList.length - valCount;
        for (let i = 0; i < trainCount; i++) trainGameSet.add(gList[i].gameId);
        for (let i = trainCount; i < gList.length; i++) valGameSet.add(gList[i].gameId);
    }

    // 分流写出 train_samples.json 和 val_samples.json
    console.log(`Splitting raw stream into Train and Val datasets...`);
    const trainFd = fs.openSync(path.join(outDir, 'train_samples.json'), 'w');
    const valFd = fs.openSync(path.join(outDir, 'val_samples.json'), 'w');

    fs.writeSync(trainFd, '[\n');
    fs.writeSync(valFd, '[\n');

    let trainCount = 0;
    let valCount = 0;

    const readline = require('readline');
    const fileStream = fs.createReadStream(rawJsonlPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const trainHashes = new Set<string>();
    let leakCount = 0;

    // 同步等待逐行分流
    const decompressAndSplit = async () => {
        for await (const line of rl) {
            if (!line.trim()) continue;
            const s = JSON.parse(line) as CollectedSample;
            if (trainGameSet.has(s.gameId)) {
                if (trainCount > 0) fs.writeSync(trainFd, ',\n');
                fs.writeSync(trainFd, line);
                trainHashes.add(s.inputHash);
                trainCount++;
            } else if (valGameSet.has(s.gameId)) {
                if (valCount > 0) fs.writeSync(valFd, ',\n');
                fs.writeSync(valFd, line);
                if (trainHashes.has(s.inputHash)) {
                    leakCount++;
                }
                valCount++;
            }
        }
        fs.writeSync(trainFd, '\n]');
        fs.writeSync(valFd, '\n]');
        fs.closeSync(trainFd);
        fs.closeSync(valFd);
    };

    // 使用 deasync 或同步 Promise
    return require('child_process').execSync ? (() => {
        // 使用同步分流逻辑
        const buf = fs.readFileSync(rawJsonlPath, 'utf8');
        const lines = buf.split('\n');
        let tFirst = true;
        let vFirst = true;
        for (const line of lines) {
            if (!line.trim()) continue;
            const s = JSON.parse(line) as CollectedSample;
            if (trainGameSet.has(s.gameId)) {
                if (!tFirst) fs.writeSync(trainFd, ',\n');
                else tFirst = false;
                fs.writeSync(trainFd, line);
                trainHashes.add(s.inputHash);
                trainCount++;
            } else if (valGameSet.has(s.gameId)) {
                if (!vFirst) fs.writeSync(valFd, ',\n');
                else vFirst = false;
                fs.writeSync(valFd, line);
                if (trainHashes.has(s.inputHash)) {
                    leakCount++;
                }
                valCount++;
            }
        }
        fs.writeSync(trainFd, '\n]');
        fs.writeSync(valFd, '\n]');
        fs.closeSync(trainFd);
        fs.closeSync(valFd);

        const leakRate = valCount > 0 ? (leakCount / valCount) * 100 : 0;
        console.log(`\n--- Stratified Split Summary ---`);
        console.log(`Train Samples: ${trainCount} across ${trainGameSet.size} games`);
        console.log(`Val Samples: ${valCount} across ${valGameSet.size} games`);
        console.log(`Input Leakage: ${leakCount} / ${valCount} (${leakRate.toFixed(2)}%)`);

        const manifest = {
            timestamp: new Date().toISOString(),
            totalUniqueSamples: seenInputHashes.size,
            totalRawSteps,
            trainSamplesCount: trainCount,
            valSamplesCount: valCount,
            trainGamesCount: trainGameSet.size,
            valGamesCount: valGameSet.size,
            leakCount,
            leakRatePercent: leakRate,
            mapsCovered: maps,
            mapsCount: maps.length,
            collectionWallSeconds: elapsedSec
        };

        fs.writeFileSync(path.join(outDir, 'data_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
        return { trainCount, valCount, manifest };
    })() : {} as any;
}
