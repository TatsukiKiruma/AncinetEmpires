/**
 * 空间残差网络数据集导出器 (Path B - Spatial Dataset Exporter)
 *
 * 功能：
 * 1. 运行自对弈或专家对局，抽取高保真 24x20x20 空间张量与 16 维全局特征；
 * 2. 逐步记录所有合法候选动作的空间落点坐标与攻防语义；
 * 3. 记录自然终局价值标签 (胜者 +1，败者 -1，平局 0，未决截断为 null)；
 * 4. 导出为自包含的 JSONL 数据集，支持 Python / PyTorch 与 Node.js 训练消费。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState } from '../src/game/types';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    SpatialEncodedState,
    SpatialActionFeatures
} from '../src/game/ai/spatial_tensor_encoder';

export interface SpatialDatasetSample {
    sampleId: string;
    episodeId: string;
    rootFamilyId: string;
    step: number;
    turn: number;
    playerId: number;
    /** 24x20x20 扁平化浮点数数组 (9600 维) */
    spatialTensor: number[];
    /** 16 维全局特征标量 */
    globalFeatures: number[];
    /** 专家选择的动作索引 */
    targetActionIndex: number;
    /** 全部候选动作及其特征 */
    candidateActions: Array<{
        action: Action;
        actorCoord: { x: number; y: number } | null;
        landingCoord: { x: number; y: number } | null;
        targetCoord: { x: number; y: number } | null;
        semantics: number[];
    }>;
    /** 自然对局终局价值标签：+1.0 (胜), -1.0 (负), 0.0 (自然平), null (截断未决) */
    valueTarget: number | null;
}

export interface ExportSpatialDatasetOptions {
    episodes?: number;
    maxStepsPerEpisode?: number;
    seedStart?: number;
    outFile?: string;
    dryRun?: boolean;
}

export function generateSpatialEpisodeSamples(
    episodeIndex: number,
    seed: number,
    maxSteps: number = 80
): { samples: SpatialDatasetSample[]; naturalWinner: number | null; isTruncated: boolean } {
    const state = createDemoState();
    const engine = new GameEngine(state);
    const heuristicAi = new HeuristicAI();

    const rootSignature = `demo_seed_${seed}`;
    const rootFamilyId = createHash('sha256').update(rootSignature).digest('hex').substring(0, 16);
    const episodeId = `spatial_ep_${episodeIndex}_seed_${seed}`;

    interface StepSnapshot {
        step: number;
        turn: number;
        playerId: number;
        encodedState: SpatialEncodedState;
        candidates: Array<{ action: Action; features: SpatialActionFeatures }>;
        chosenIndex: number;
    }

    const snapshots: StepSnapshot[] = [];
    let stepCount = 0;

    while (engine.getState().winner === null && stepCount < maxSteps) {
        const curState = engine.getState();
        const curPlayer = curState.currentPlayer;

        const legalActions = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
        if (legalActions.length === 0) break;

        // 专家动作选择
        const expertAction = heuristicAi.getAction(engine, curPlayer);
        let chosenIndex = legalActions.findIndex(a => JSON.stringify(a) === JSON.stringify(expertAction));
        if (chosenIndex === -1) chosenIndex = 0;

        // 编码
        const encodedState = encodeGameStateSpatial(curState, curPlayer);
        const candidates = legalActions.map(a => ({
            action: a,
            features: encodeCandidateActionSpatial(curState, curPlayer, a)
        }));

        snapshots.push({
            step: stepCount,
            turn: curState.turn,
            playerId: curPlayer,
            encodedState,
            candidates,
            chosenIndex
        });

        engine.step(legalActions[chosenIndex]);
        stepCount += 1;
    }

    const finalState = engine.getState();
    const naturalWinner = finalState.winner;
    const isTruncated = naturalWinner === null && stepCount >= maxSteps;

    // 回填自然终局价值
    const samples: SpatialDatasetSample[] = snapshots.map(s => {
        let valueTarget: number | null = null;
        if (naturalWinner !== null) {
            if (naturalWinner === -1) {
                valueTarget = 0.0; // 自然平局
            } else if (naturalWinner === s.playerId) {
                valueTarget = 1.0; // 获胜
            } else {
                valueTarget = -1.0; // 失败
            }
        }

        return {
            sampleId: `${episodeId}_s${s.step}`,
            episodeId,
            rootFamilyId,
            step: s.step,
            turn: s.turn,
            playerId: s.playerId,
            spatialTensor: Array.from(s.encodedState.spatialTensor),
            globalFeatures: Array.from(s.encodedState.globalFeatures),
            targetActionIndex: s.chosenIndex,
            candidateActions: s.candidates.map(c => ({
                action: c.action,
                actorCoord: c.features.actorCoord ? { x: c.features.actorCoord.x, y: c.features.actorCoord.y } : null,
                landingCoord: c.features.landingCoord ? { x: c.features.landingCoord.x, y: c.features.landingCoord.y } : null,
                targetCoord: c.features.targetCoord ? { x: c.features.targetCoord.x, y: c.features.targetCoord.y } : null,
                semantics: Array.from(c.features.semantics)
            })),
            valueTarget
        };
    });

    return {
        samples,
        naturalWinner,
        isTruncated
    };
}

export function exportSpatialDataset(options: ExportSpatialDatasetOptions = {}): {
    totalSamples: number;
    totalEpisodes: number;
    outPath?: string;
} {
    const episodes = options.episodes ?? 10;
    const seedStart = options.seedStart ?? 5000;
    const maxSteps = options.maxStepsPerEpisode ?? 60;
    const allSamples: SpatialDatasetSample[] = [];

    for (let ep = 0; ep < episodes; ep += 1) {
        const res = generateSpatialEpisodeSamples(ep, seedStart + ep, maxSteps);
        allSamples.push(...res.samples);
    }

    if (!options.dryRun && options.outFile) {
        const outDir = path.dirname(options.outFile);
        mkdirSync(outDir, { recursive: true });
        const lines = allSamples.map(s => JSON.stringify(s));
        writeFileSync(options.outFile, lines.join('\n') + '\n', 'utf8');
    }

    return {
        totalSamples: allSamples.length,
        totalEpisodes: episodes,
        outPath: options.outFile
    };
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_spatial_dataset_export.ts')) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Usage: npx tsx tools/skirmish_spatial_dataset_export.ts [options]');
        console.log('Options:');
        console.log('  --episodes <n>   Number of self-play episodes (default: 5)');
        console.log('  --out <path>     Output file path (.jsonl)');
        console.log('  --help, -h       Show help');
        process.exit(0);
    }

    const epIdx = process.argv.indexOf('--episodes');
    const episodes = epIdx !== -1 ? parseInt(process.argv[epIdx + 1], 10) : 5;

    const outIdx = process.argv.indexOf('--out');
    const outFile = outIdx !== -1 ? process.argv[outIdx + 1] : 'training_runs/spatial_dataset/spatial_pilot_01.jsonl';

    console.log(`Generating spatial dataset (${episodes} episodes)...`);
    const res = exportSpatialDataset({ episodes, outFile });
    console.log(`Export complete: ${res.totalSamples} samples from ${res.totalEpisodes} episodes saved to ${res.outPath}`);
}
