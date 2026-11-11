import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
import { classifyGameOutcome } from './skirmish_evaluation_core';
import { assignNaturalValueLabel, shuffleArrayWithSeed } from './skirmish_value_labeling';
import { saveImmutableCheckpoint } from './skirmish_model_registry';

export interface DualHeadTrainingOptions {
    runId?: string;
    targetCount?: number;
    epochs?: number;
    batchSize?: number;
    seed?: number;
    dryRun?: boolean;
}

export async function loadDatasetWithValues(
    targetCount = 2000,
    seed = 42
): Promise<{ train: DualHeadSample[]; dev: DualHeadSample[] }> {
    console.log('Loading episode terminal map...');
    const epMap = new Map<number, Record<number, number | null>>();
    const srcStream = readline.createInterface({
        input: createReadStream('training_runs/agent_upgrade_20260919_01/baseline_dataset/src_head_00.jsonl', { encoding: 'utf8' })
    });

    let epIdx = 0;
    for await (const line of srcStream) {
        if (!line.trim()) continue;
        const ep = JSON.parse(line);
        const valByPlayer: Record<number, number | null> = {};

        for (const p of ep.players) {
            const outcome = classifyGameOutcome({
                episodeId: `ep_${epIdx}`,
                seed: ep.seed ?? epIdx,
                candidateSeat: p.id,
                candidateAllianceId: p.allianceId ?? p.id,
                stepCount: ep.summary?.stepCount ?? 150,
                maxSteps: 150,
                engineTerminal: ep.summary?.winnerAlliance !== null && ep.summary?.winnerAlliance !== undefined,
                winnerAlliance: ep.summary?.winnerAlliance,
                adjudicatedWinnerAlliance: ep.summary?.adjudicatedWinnerAlliance
            });

            // 严格基于自然终局赋标签：未解决/截断/裁定均 mask
            const valLabel = assignNaturalValueLabel({
                engineTerminal: outcome.engineTerminal,
                terminationCause: outcome.terminationCause,
                winnerAlliance: outcome.winnerAlliance,
                subjectAllianceId: p.allianceId ?? p.id,
                adjudicatedWinnerAlliance: outcome.adjudicatedWinnerAlliance
            });

            valByPlayer[p.id] = valLabel.valueTarget;
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
            // 动作编码统一为 45 维无碰撞编码
            const candVec = Array.from(encodeGameActionV2(state, s.playerId, act));
            candidates.push(candVec);
            if (code === s.label.actionCode) labelIndex = candidates.length - 1;
        }

        if (labelIndex === -1 || candidates.length === 0) continue;

        const epVals = epMap.get(s.source?.episodeIndex);
        const valueTarget = epVals && epVals[s.playerId] !== undefined ? epVals[s.playerId] : null;

        samples.push({
            state: stateVec,
            candidates,
            labelIndex,
            valueTarget
        });

        if (samples.length >= targetCount) break;
    }

    // 分区：75% 训练集，25% 验证集
    const trainCount = Math.floor(samples.length * 0.75);
    const rawTrain = samples.slice(0, trainCount);
    const dev = samples.slice(trainCount);

    // 仅在训练集内部进行确定性带 Seed 洗牌，杜绝跨分区泄漏
    const train = shuffleArrayWithSeed(rawTrain, seed);

    return { train, dev };
}

export function evaluateDualHead(net: DualHeadNet, samples: DualHeadSample[]) {
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

export async function runDualHeadTraining(options: DualHeadTrainingOptions = {}) {
    const runId = options.runId ?? 'agent_upgrade_20260920_v4_01';
    const targetCount = options.targetCount ?? 2000;
    const epochs = options.epochs ?? 3;
    const batchSize = options.batchSize ?? 64;
    const seed = options.seed ?? 42;

    console.log(`=======================================================`);
    console.log(`[R03/R09] Dual-Head Value Training (Safe Masked Pipeline)`);
    console.log(`Run ID: ${runId}`);
    console.log(`=======================================================\n`);

    const { train, dev } = await loadDatasetWithValues(targetCount, seed);
    console.log(`Train samples: ${train.length}, Dev samples: ${dev.length}`);

    // Dummy constant baseline MSE
    const trainTargets = train.filter(s => s.valueTarget !== null).map(s => s.valueTarget!);
    const meanTarget = trainTargets.length > 0 ? trainTargets.reduce((a, b) => a + b, 0) / trainTargets.length : 0;
    const devTargets = dev.filter(s => s.valueTarget !== null).map(s => s.valueTarget!);
    const baselineMse = devTargets.length > 0 
        ? devTargets.reduce((acc, y) => acc + (meanTarget - y) ** 2, 0) / devTargets.length 
        : null;

    console.log(`Natural Value Targets: Train=${trainTargets.length}/${train.length}, Dev=${devTargets.length}/${dev.length}`);
    if (baselineMse !== null) {
        console.log(`Dummy Baseline (mean=${meanTarget.toFixed(3)}) Dev MSE: ${baselineMse.toFixed(4)}`);
    }

    const net = createDualHeadNet({
        stateDim: 356,
        actionDim: 45,
        trunkHidden: [256, 256, 128],
        policyHidden: [64, 64],
        valueHidden: [64],
        seed,
        architectureId: 'NET_B'
    });

    const initEval = evaluateDualHead(net, dev);
    console.log(`Initial Dev: Policy Acc=${(initEval.accuracy * 100).toFixed(1)}%, Policy Loss=${initEval.policyLoss.toFixed(4)}, Value MSE=${initEval.valueMse?.toFixed(4) ?? 'N/A'}`);

    let finalDevEval = initEval;
    for (let epoch = 1; epoch <= epochs; epoch++) {
        for (let i = 0; i < train.length; i += batchSize) {
            const batch = train.slice(i, i + batchSize);
            trainStep(net, batch, {
                learningRate: 0.005,
                momentum: 0.9,
                valueWeight: 0.2
            });
        }
        finalDevEval = evaluateDualHead(net, dev);
        console.log(`Epoch ${epoch}: Dev Policy Acc=${(finalDevEval.accuracy * 100).toFixed(1)}%, Policy Loss=${finalDevEval.policyLoss.toFixed(4)}, Value MSE=${finalDevEval.valueMse?.toFixed(4) ?? 'N/A'}`);
    }

    if (!options.dryRun) {
        const savedJson = saveDualHeadModel(net, {
            trainedAt: new Date().toISOString(),
            epochs,
            devPolicyAccuracy: finalDevEval.accuracy,
            devValueMse: finalDevEval.valueMse,
            architectureId: 'NET_B'
        });

        // 严禁直接覆盖公共路径，使用不可变 Checkpoint 注册器
        const artifact = saveImmutableCheckpoint({
            runId,
            modelId: 'net_b_dual_head_v4',
            modelJson: savedJson,
            metadata: {
                architectureId: 'NET_B',
                seed,
                epochs,
                trainingDataHash: 'baseline_dataset_part_00',
                splitManifestHash: 'split-manifest-v4',
                featureDimensions: { state: 356, action: 45 },
                parameterCount: 213762,
                trainMetrics: { meanTarget },
                devMetrics: {
                    policyAccuracy: finalDevEval.accuracy,
                    policyLoss: finalDevEval.policyLoss,
                    valueMse: finalDevEval.valueMse,
                    baselineMse
                },
                status: 'VALUE_HOLD'
            }
        });

        console.log(`Safely saved immutable checkpoint to ${artifact.modelJsonPath}`);
    }

    return finalDevEval;
}

if (process.argv[1] && process.argv[1].endsWith('test_dual_head_value_training.ts')) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`Usage: npx tsx tools/test_dual_head_value_training.ts [options]`);
        console.log(`Options:`);
        console.log(`  --run-id <id>      Target run ID (default: agent_upgrade_20260920_v4_01)`);
        console.log(`  --count <samples>  Target samples count (default: 2000)`);
        console.log(`  --epochs <count>   Epochs (default: 3)`);
        console.log(`  --help, -h         Show help and exit`);
        process.exit(0);
    }

    const runIdArgIdx = process.argv.indexOf('--run-id');
    const runId = runIdArgIdx !== -1 ? process.argv[runIdArgIdx + 1] : undefined;

    runDualHeadTraining({ runId }).catch(err => {
        console.error(`Dual head value training execution failed:`, err);
        process.exit(1);
    });
}
