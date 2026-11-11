import { runDAggerCollection } from '../research/dagger_collector';
import { ALL_CONFIRMED_MAPS } from '../research/data_collector';

function main() {
    const config = {
        studentModelJsonPath: 'ai_training/r7_training_stage_20261014_083500/artifacts/models/round1_arm_a_best.json',
        studentModelId: 'round1_arm_a_best',
        maps: ALL_CONFIRMED_MAPS,
        gamesPerMap: 6, // 7 张图 * 6 局 = 42 局
        baseSeed: 900000,
        maxSteps: 500,
        outJsonlPath: 'ai_training/r7_training_stage_20261014_083500/artifacts/data/dagger_samples.jsonl'
    };

    const res = runDAggerCollection(config);
    console.log(`\nDAgger sampling successfully completed!`);
    console.log(`Generated ${res.daggerSampleCount} corrective samples.`);
}

main();
