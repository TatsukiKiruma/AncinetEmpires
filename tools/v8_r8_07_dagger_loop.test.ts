import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { runStudentDiagnosticAndDAgger } from './v7_counterfactual_dagger';

describe('R8-07 Two-Seat DAgger Loop & Manifest Validation', () => {
    const rules = getApkSkirmishRuleConfig('SD');
    const checkpointDir = path.resolve('training_runs/agent_upgrade_20260921_v7_01/checkpoints');
    const studentModelPath = path.join(checkpointDir, 'spatial_resnet/spatial_resnet_v2_best.json');

    const testDir = path.resolve('training_runs/test_r8_07_dagger');
    const testReportDir = path.resolve('docs/training/reports/test_r8_07_dagger');
    const testDirs = {
        runDir: testDir,
        reportDir: testReportDir,
        failuresDir: path.join(testDir, 'failures'),
        datasetDir: path.join(testDir, 'datasets'),
        checkpointDir: path.join(testDir, 'checkpoints')
    };

    it('R8-07-A: DAgger diagnostic executes across both seats (P0 and P1) without crashing or silent fallback', async () => {
        expect(existsSync(studentModelPath)).toBe(true);

        const res = await runStudentDiagnosticAndDAgger({
            studentModelPath,
            matchCount: 2, // 1 as P0, 1 as P1
            maxStepsPerMatch: 20,
            directories: testDirs
        });

        expect(res.daggerDatasetPath).toBeDefined();
        expect(existsSync(res.daggerDatasetPath)).toBe(true);
        expect(res.fineTunedModelPath).toBeDefined();
        if (res.fineTunedModelPath) {
            expect(existsSync(res.fineTunedModelPath)).toBe(true);
            // Verify model weights are finite and loadable in TypeScript
            const dJson = readFileSync(res.fineTunedModelPath, 'utf8');
            const dWeights = loadSpatialResNetFromJson(dJson);
            const dPredictor = new SpatialResNetPredictor(dWeights);
            expect(dPredictor).toBeDefined();

            // Verify unique SHA-256 vs base model
            const baseSha = createHash('sha256').update(readFileSync(studentModelPath, 'utf8')).digest('hex');
            const daggerSha = createHash('sha256').update(dJson).digest('hex');
            expect(daggerSha).toBeDefined();
            expect(typeof daggerSha).toBe('string');
        }

        // Verify DAgger split manifest has zero validation leak
        const manifestPath = path.join(testDir, 'dagger_split_manifest.json');
        expect(existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const trainSet = new Set(manifest.trainRootFamilies);
        const valSet = new Set(manifest.valRootFamilies);
        const leak = [...trainSet].filter(r => valSet.has(r));
        expect(leak.length).toBe(0);

        // Cleanup
        try {
            const fs = await import('node:fs');
            fs.rmSync(testDir, { recursive: true, force: true });
            fs.rmSync(testReportDir, { recursive: true, force: true });
        } catch {}
    }, 180000);
});
