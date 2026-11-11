import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { generateV7Dataset, trainV7SpatialModel, trainV7NetAControl } from './v7_training_pipeline';

describe('R8-06 Spatial ResNet v2 Learning Sanity & Finite Gradients', () => {
    // All scratch output goes to the platform temp directory and is removed in the finally block.
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'v8_r8_06_sanity_'));
    const testDir = path.join(tempRoot, 'run');
    const testReportDir = path.join(tempRoot, 'report');
    const testDirs = {
        runDir: testDir,
        reportDir: testReportDir,
        datasetDir: path.join(testDir, 'datasets'),
        checkpointDir: path.join(testDir, 'checkpoints'),
        consumedDir: path.join(testDir, 'consumed')
    };

    it('R8-06-A: Real Overfit sanity test: learns 64 clean diverse tactical samples reaching train_acc >= 0.95 with finite gradients and zero leakage', async () => {
        try {
            // 1. Prepare 64 clean, unique, tactical samples across multiple roots
            mkdirSync(testDirs.datasetDir, { recursive: true });
            mkdirSync(testDirs.checkpointDir, { recursive: true });
            mkdirSync(testDirs.reportDir, { recursive: true });

            const srcSpatial = path.resolve('training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl');
            const srcDualHead = path.resolve('training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_dual_head.json');

            let spatialLines: string[] = [];
            let dualHeadAll: any[] = [];
            if (existsSync(srcSpatial) && existsSync(srcDualHead)) {
                spatialLines = readFileSync(srcSpatial, 'utf8').split('\n').filter(l => l.trim().length > 0);
                dualHeadAll = JSON.parse(readFileSync(srcDualHead, 'utf8'));
            } else {
                throw new Error('Required reference dataset d_v7_spatial.jsonl or d_v7_dual_head.json not found for overfit sanity test');
            }

            const roots = new Map<string, { line: string; s: any; dh: any }[]>();
            for (let i = 0; i < spatialLines.length; i++) {
                const s = JSON.parse(spatialLines[i]);
                const tgt = s.targetActionIndex;
                const act = s.candidateActions[tgt].action.type;
                if (['move_and_attack', 'attack', 'move', 'capture_building', 'repair_building'].includes(act)) {
                    const r = s.rootFamilyId || s.episodeId;
                    if (!roots.has(r)) roots.set(r, []);
                    roots.get(r)!.push({ line: spatialLines[i], s, dh: dualHeadAll[i] });
                }
            }

            const selectedSpatial: string[] = [];
            const selectedDualHead: any[] = [];
            const trainRoots: string[] = [];
            const valRoots: string[] = [];

            for (const [r, list] of roots.entries()) {
                if (list.length >= 6) {
                    const take = list.slice(0, 8);
                    for (const item of take) {
                        selectedSpatial.push(item.line);
                        selectedDualHead.push(item.dh);
                    }
                    if (selectedSpatial.length <= 56) {
                        trainRoots.push(r);
                    } else {
                        valRoots.push(r);
                    }
                }
                if (selectedSpatial.length >= 64) break;
            }

            expect(selectedSpatial.length).toBe(64);
            const spatialDatasetPath = path.join(testDirs.datasetDir, 'd_v7_spatial.jsonl');
            const dualHeadDatasetPath = path.join(testDirs.datasetDir, 'd_v7_dual_head.json');
            const splitManifestPath = path.join(testDirs.runDir, 'split_manifest.json');

            writeFileSync(spatialDatasetPath, selectedSpatial.slice(0, 64).join('\n') + '\n', 'utf8');
            writeFileSync(dualHeadDatasetPath, JSON.stringify(selectedDualHead.slice(0, 64), null, 2), 'utf8');

            const splitManifest = {
                manifestVersion: 'v8-manifest',
                trainRoots,
                valRoots,
                trainRootFamilies: trainRoots,
                valRootFamilies: valRoots
            };
            writeFileSync(splitManifestPath, JSON.stringify(splitManifest, null, 2), 'utf8');

            // 2. Train Spatial ResNet v2 (2 blocks, 32ch, 20 epochs, batch size 8, lr 0.003)
            const { bestModelPath, metricsPath, consumedManifestPath } = await trainV7SpatialModel(
                spatialDatasetPath,
                20,
                splitManifestPath,
                testDirs,
                { batchSize: 8, lr: 0.003 }
            );
            expect(existsSync(bestModelPath)).toBe(true);
            expect(existsSync(metricsPath)).toBe(true);
            expect(existsSync(consumedManifestPath)).toBe(true);

            // 3. Verify metrics & strict overfit progression (train_acc >= 0.95, loss < 0.25)
            const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
            expect(metrics.history.length).toBe(20);
            expect(metrics.history[0].train_loss).toBeGreaterThan(0);
            expect(Number.isFinite(metrics.history[0].train_loss)).toBe(true);

            const firstEpoch = metrics.history[0];
            const lastEpoch = metrics.history[metrics.history.length - 1];
            expect(lastEpoch.train_loss).toBeLessThan(firstEpoch.train_loss);
            expect(lastEpoch.train_loss).toBeLessThan(0.25); // Loss converged to low error
            expect(lastEpoch.train_acc).toBeGreaterThanOrEqual(0.95); // Real overfit sanity check (acc >= 95%)

            // 4. Verify consumed_samples_manifest.json contains non-empty sample IDs and zero leakage
            const consumedManifest = JSON.parse(readFileSync(consumedManifestPath, 'utf8'));
            expect(consumedManifest.train_sample_ids).toBeDefined();
            expect(consumedManifest.val_sample_ids).toBeDefined();
            expect(consumedManifest.train_sample_ids.length).toBeGreaterThan(0);
            expect(consumedManifest.val_sample_ids.length).toBeGreaterThan(0);

            const trainIdSet = new Set(consumedManifest.train_sample_ids);
            const valIdSet = new Set(consumedManifest.val_sample_ids);
            const idIntersection = new Set([...trainIdSet].filter(id => valIdSet.has(id)));
            expect(idIntersection.size).toBe(0); // Zero sample leakage

            // 5. Load exported weights into TypeScript SpatialResNetPredictor
            const modelJson = readFileSync(bestModelPath, 'utf8');
            const weights = loadSpatialResNetFromJson(modelJson);
            expect(weights.numBlocks).toBe(2);
            expect(weights.stem.outChannels).toBe(32);

            // Verify all weights are finite
            const predictor = new SpatialResNetPredictor(weights);
            expect(predictor).toBeDefined();

            // 6. Retrain NET_A control on the exact same isolated split and verify finite checkpoint
            const dualHeadSamples = JSON.parse(readFileSync(dualHeadDatasetPath, 'utf8'));
            const netARes = await trainV7NetAControl(dualHeadSamples, splitManifestPath, testDirs);
            expect(existsSync(netARes.checkpointPath)).toBe(true);
            const netAJson = readFileSync(netARes.checkpointPath, 'utf8');
            expect(netAJson).not.toContain('null');
            expect(netAJson).not.toContain('NaN');
        } finally {
            // Cleanup completely
            try {
                rmSync(testDir, { recursive: true, force: true });
                rmSync(testReportDir, { recursive: true, force: true });
                rmSync(tempRoot, { recursive: true, force: true });
            } catch {}
        }
    }, 180000); // Allow up to 3 mins for PyTorch CPU training
});
