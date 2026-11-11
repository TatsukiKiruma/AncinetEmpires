import fs from 'fs';
import path from 'path';
import { collectTrainingPool } from '../research/data_collector';

async function main() {
    const maps = ['(2) Duel.aem', '(2) Liberty Port.aem', '(2) Swamplands.aem'];
    const { trainSamples, valSamples } = collectTrainingPool(maps, 10, 20261014, 2500);

    const outDir = 'ai_training/r6_model_training_20261014_063500/scratch/data';
    fs.mkdirSync(outDir, { recursive: true });

    const trainPath = path.join(outDir, 'train_pool.json');
    const valPath = path.join(outDir, 'val_pool.json');

    fs.writeFileSync(trainPath, JSON.stringify(trainSamples), 'utf8');
    fs.writeFileSync(valPath, JSON.stringify(valSamples), 'utf8');

    console.log(`Saved ${trainSamples.length} train samples to ${trainPath}`);
    console.log(`Saved ${valSamples.length} val samples to ${valPath}`);
}

main().catch(console.error);
