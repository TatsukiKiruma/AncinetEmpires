import path from 'path';
import { collectMultiMapDatasetStreaming, ALL_CONFIRMED_MAPS } from '../research/data_collector';

const OUT_DIR = 'ai_training/r7_training_stage_20261014_083500/artifacts/data';

function main() {
    const config = {
        targetUniqueSamples: 20000,
        maps: ALL_CONFIRMED_MAPS,
        gamesPerMap: 8, // 7 张地图 * 8 局 = 56 局
        baseSeed: 800000,
        maxStepsPerGame: 600,
        outDir: OUT_DIR
    };

    const result = collectMultiMapDatasetStreaming(config);
    console.log(`\nDataset production fully succeeded!`);
    console.log(`Train count: ${result.trainCount}, Val count: ${result.valCount}`);
}

main();
