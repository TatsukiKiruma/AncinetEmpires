import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';
import {
    createDualHeadNet,
    trainStep,
    predictDecision,
    saveDualHeadModel,
    type DualHeadSample,
    type DualHeadNet
} from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { decodeAction } from '../src/game/env';
import type { GameState } from '../src/game/types';
import type { Tile } from '../src/game/terrain';

async function loadDatasetWithValues(targetCount = 2000): Promise<{ train: DualHeadSample[]; dev: DualHeadSample[] }> {
    console.log('Loading episode terminal map...');
    const epMap = new Map<number, Record<number, number>>();
    const srcStream = readline.createInterface({
        input: createReadStream('training_runs/agent_upgrade_20260919_01/baseline_dataset/src_head_00.jsonl', { encoding: 'utf8' })
    });
    let epIdx = 0;
    for await (const line of srcStream) {
        if (!line.trim()) continue;
        const ep = JSON.parse(line);
        const winAlliance = ep.summary?.winnerAlliance ?? ep.summary?.adjudicatedWinnerAlliance;
        const valByPlayer: Record<number, number> = {};
        for (const p of ep.players) {
            if (winAlliance === null || winAlliance === undefined || winAlliance === -1) {
                valByPlayer[p.id] = 0.0;
            } else if (p.allianceId === winAlliance) {
                valByPlayer[p.id] = 1.0;
            } else {
                valByPlayer[p.id] = -1.0;
            }
        }
        epMap.set(epIdx, valByPlayer);
        epIdx++;
    }

    console.log(`Loaded ${epMap.size} episode outcomes. Now loading and parsing samples...`);
    const datasetStream = readline.createInterface({
        input: createReadStream('training_runs/agent_upgrade_20260919_01/baseline_dataset/dataset_part_00.jsonl', { encoding: 'utf8' })
    });

    const samples: DualHeadSample[] = [];
    for await (const line of datasetStream) {
        if (!line.trim()) continue;
        const s = JSON.parse(line);
        if (!s.observation || !s.label || !s.label.actionCode || !s.legalActionCodes) continue;
        const obs = s.observation;
        const tiles: Tile[][] = Array.from({ length: obs.mapHeight }, () => new Array(obs.mapWidth));
        for (const t of obs.tiles) tiles[t.y][t.x] = t;
        const units = obs.units.map((u: any) => ({ ...u, pos: u.pos ?? { x: u.x, y: u.y } }));
        const state: GameState = {
            turn: obs.turn,
            currentPlayer: obs.currentPlayer,
            map: { width: obs.mapWidth, height: obs.mapHeight, tiles },
            units,
            players: obs.players,
            rules: obs.rules,
            metadata: obs.metadata,
            winner: null
        };

        const stateVec = Array.from(encodeGameState(state, s.playerId));
        const candidates: number[][] = [];
        let labelIndex = -1;

        for (let i = 0; i < s.legalActionCodes.length; i += 1) {
            const code = s.legalActionCodes[i];
            const act = decodeAction(code);
            if (!act) continue;
            const candVec = Array.from(encodeGameActionV2(state, s.playerId, act));
            candidates.push(candVec);
            if (code === s.label.actionCode) labelIndex = candidates.length - 1;
        }

        if (labelIndex === -1 || candidates.length === 0) continue;

        const epVals = epMap.get(s.source.episodeIndex);
        const valueTarget = epVals && epVals[s.playerId] !== undefined ? epVals[s.playerId] : null;

        samples.push({
            state: stateVec,
            candidates,
            labelIndex,
            valueTarget
        });

        if (samples.length >= targetCount) break;
    }

    // Shuffle samples to break autocorrelation of sequential steps in the same episode
    for (let i = samples.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [samples[i], samples[j]] = [samples[j], samples[i]];
    }

    const trainCount = Math.floor(samples.length * 0.75);
    return {
        train: samples.slice(0, trainCount),
        dev: samples.slice(trainCount)
    };
}

function evaluateDualHead(net: DualHeadNet, samples: DualHeadSample[]) {
    let correct = 0;
    let totalPolicyLoss = 0;
    let totalValueLoss = 0;
    let valueCount = 0;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const dec = predictDecision(net, s.state, s.candidates);
        if (dec.topIndex === s.labelIndex) correct += 1;
        const prob = Math.max(1e-12, dec.probs[s.labelIndex] ?? 0);
        totalPolicyLoss += -Math.log(prob);

        if (s.valueTarget !== null) {
            totalValueLoss += (dec.value - s.valueTarget) ** 2;
            valueCount += 1;
            if (i < 5) {
                console.log(`    Sample ${i}: pred=${dec.value.toFixed(4)}, target=${s.valueTarget}`);
            }
        }
    }

    return {
        accuracy: correct / Math.max(1, samples.length),
        policyLoss: totalPolicyLoss / Math.max(1, samples.length),
        valueMse: valueCount > 0 ? totalValueLoss / valueCount : null,
        valueCount,
        sampleCount: samples.length
    };
}

async function runDualHeadTraining() {
    const { train, dev } = await loadDatasetWithValues(2000);
    console.log(`Train samples: ${train.length}, Dev samples: ${dev.length}`);

    // Dummy constant baseline MSE (predicting mean of train value targets)
    const trainTargets = train.filter(s => s.valueTarget !== null).map(s => s.valueTarget!);
    const meanTarget = trainTargets.reduce((a, b) => a + b, 0) / trainTargets.length;
    const devTargets = dev.filter(s => s.valueTarget !== null).map(s => s.valueTarget!);
    const baselineMse = devTargets.reduce((acc, y) => acc + (meanTarget - y) ** 2, 0) / devTargets.length;
    console.log(`Dummy Baseline (mean=${meanTarget.toFixed(3)}) Dev MSE: ${baselineMse.toFixed(4)}`);

    const net = createDualHeadNet({
        stateDim: 356,
        actionDim: 45,
        trunkHidden: [256, 256, 128],
        policyHidden: [64, 64],
        valueHidden: [64],
        seed: 42,
        architectureId: 'NET_B'
    });

    const initEval = evaluateDualHead(net, dev);
    console.log(`Initial Dev: Policy Acc=${(initEval.accuracy * 100).toFixed(1)}%, Policy Loss=${initEval.policyLoss.toFixed(4)}, Value MSE=${initEval.valueMse?.toFixed(4)}`);

    const epochs = 3;
    const batchSize = 64;
    for (let epoch = 1; epoch <= epochs; epoch++) {
        for (let i = 0; i < train.length; i += batchSize) {
            const batch = train.slice(i, i + batchSize);
            trainStep(net, batch, {
                learningRate: 0.005,
                momentum: 0.9,
                valueWeight: 0.2
            });
        }
        const devEval = evaluateDualHead(net, dev);
        console.log(`Epoch ${epoch}: Dev Policy Acc=${(devEval.accuracy * 100).toFixed(1)}%, Policy Loss=${devEval.policyLoss.toFixed(4)}, Value MSE=${devEval.valueMse?.toFixed(4)}`);
        if (epoch === epochs) {
            const savedJson = saveDualHeadModel(net, {
                trainedAt: new Date().toISOString(),
                epochs: 3,
                devPolicyAccuracy: devEval.accuracy,
                devValueMse: devEval.valueMse,
                architectureId: 'NET_B'
            });
            const modelOutPath1 = path.resolve('training_runs/models/net_b_checkpoint.json');
            const modelOutPath2 = path.resolve('src/game/ai/models/net_b_checkpoint.json');
            writeFileSync(modelOutPath1, savedJson, 'utf8');
            writeFileSync(modelOutPath2, savedJson, 'utf8');
            console.log(`Saved dual-head NET_B model to ${modelOutPath1} and ${modelOutPath2}`);
        }
    }
}

runDualHeadTraining();
