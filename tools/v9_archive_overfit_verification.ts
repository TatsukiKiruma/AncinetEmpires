import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { resolveTorchPython } from './v8_python_env';

const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260922_v9_identity_02';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}/overfit_sanity`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}/overfit_sanity`);

async function main() {
    console.log(`\n===============================================================`);
    console.log(`[V9-07 Overfit Archival] Generating and archiving 64-sample overfit artifacts`);
    console.log(`Run ID: ${RUN_ID}`);
    console.log(`Destination: ${RUN_DIR} and ${REPORT_DIR}`);
    console.log(`===============================================================\n`);

    fs.mkdirSync(RUN_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const srcSpatial = path.resolve('training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl');
    if (!fs.existsSync(srcSpatial)) {
        throw new Error(`Reference dataset missing: ${srcSpatial}`);
    }

    const lines = fs.readFileSync(srcSpatial, 'utf8').split('\n').filter(l => l.trim().length > 0);
    const roots = new Map<string, { line: string; s: any }[]>();

    for (let i = 0; i < lines.length; i++) {
        const s = JSON.parse(lines[i]);
        const tgt = s.targetActionIndex;
        const act = s.candidateActions[tgt]?.action?.type;
        if (['move_and_attack', 'attack', 'move', 'capture_building', 'repair_building'].includes(act)) {
            const r = s.rootFamilyId || s.episodeId;
            if (!roots.has(r)) roots.set(r, []);
            roots.get(r)!.push({ line: lines[i], s });
        }
    }

    const selectedLines: string[] = [];
    const trainRoots: string[] = [];
    const valRoots: string[] = [];

    for (const [r, list] of roots.entries()) {
        if (list.length >= 8 && selectedLines.length < 64) {
            const take = list.slice(0, 8);
            for (const item of take) {
                selectedLines.push(item.line);
            }
            if (valRoots.length === 0) {
                valRoots.push(r);
            } else {
                trainRoots.push(r);
            }
        }
        if (selectedLines.length >= 64) break;
    }

    const overfitDatasetPath = path.join(RUN_DIR, 'overfit_64_dataset.jsonl');
    fs.writeFileSync(overfitDatasetPath, selectedLines.join('\n') + '\n', 'utf8');

    const splitManifest = {
        runId: RUN_ID,
        experiment: "overfit_sanity_64",
        generatedAt: new Date().toISOString(),
        totalSamples: selectedLines.length,
        trainRootFamilies: trainRoots,
        valRootFamilies: valRoots,
        trainSamplesCount: selectedLines.length - 8,
        valSamplesCount: 8
    };
    const splitManifestPath = path.join(RUN_DIR, 'overfit_split_manifest.json');
    fs.writeFileSync(splitManifestPath, JSON.stringify(splitManifest, null, 2), 'utf8');

    const outModelPath = path.join(RUN_DIR, 'overfit_model_best.json');
    const outLastModelPath = path.join(RUN_DIR, 'overfit_model_last.json');
    const outMetricsPath = path.join(RUN_DIR, 'overfit_metrics.json');
    const consumedManifestPath = path.join(RUN_DIR, 'overfit_consumed_manifest.json');

    const { pythonCommand, torchVersion } = resolveTorchPython();
    console.log(`Resolved Python: ${pythonCommand} (torch: ${torchVersion})`);

    const pyCmd = `${pythonCommand} python/train_spatial_resnet.py --dataset "${overfitDatasetPath}" --split-manifest "${splitManifestPath}" --epochs 20 --batch-size 16 --lr 0.005 --value-weight 0.0 --out-model "${outModelPath}" --out-last-model "${outLastModelPath}" --out-metrics "${outMetricsPath}" --consumed-manifest "${consumedManifestPath}" --model-version spatial-resnet-v2 --num-blocks 2`;

    console.log(`Executing: ${pyCmd}`);
    execSync(pyCmd, { stdio: 'inherit', cwd: process.cwd() });

    // Copy all deliverables to REPORT_DIR
    const filesToCopy = [
        'overfit_64_dataset.jsonl',
        'overfit_split_manifest.json',
        'overfit_model_best.json',
        'overfit_model_last.json',
        'overfit_metrics.json',
        'overfit_consumed_manifest.json'
    ];

    for (const f of filesToCopy) {
        const src = path.join(RUN_DIR, f);
        const dst = path.join(REPORT_DIR, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
        }
    }

    const metrics = JSON.parse(fs.readFileSync(outMetricsPath, 'utf8'));
    const finalTrainAcc = metrics.history[metrics.history.length - 1].train_acc;
    console.log(`\nOverfit verification completed! Final train accuracy: ${(finalTrainAcc * 100).toFixed(1)}%`);
    console.log(`Archived artifacts to ${RUN_DIR} and ${REPORT_DIR}`);
}

main().catch(err => {
    console.error('Overfit archival failed:', err);
    process.exit(1);
});
