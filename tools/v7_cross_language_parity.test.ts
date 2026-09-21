import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { runParityCheckOnModel } from './v7_cross_language_parity';

describe('R7-03: Cross-Language Inference Parity Tests', () => {
    it('verifies 2-block Spatial ResNet parity between Python and TypeScript to < 1e-4', () => {
        const ckptPath = path.resolve('training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_checkpoint.json');
        if (!existsSync(ckptPath)) return;
        const res = runParityCheckOnModel(ckptPath);
        expect(res.passed).toBe(true);
        expect(res.maxTrunkZDiff).toBeLessThan(1e-4);
        expect(res.maxActionLogitsDiff).toBeLessThan(1e-4);
        expect(res.bestIndexMatch).toBe(true);
    }, 30000);

    it('verifies 4-block Spatial ResNet parity between Python and TypeScript to < 1e-4', () => {
        const ckptPath = path.resolve('training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_4block_checkpoint.json');
        if (!existsSync(ckptPath)) return;
        const res = runParityCheckOnModel(ckptPath);
        expect(res.passed).toBe(true);
        expect(res.maxTrunkZDiff).toBeLessThan(1e-4);
        expect(res.maxActionLogitsDiff).toBeLessThan(1e-4);
        expect(res.bestIndexMatch).toBe(true);
    }, 30000);
});
