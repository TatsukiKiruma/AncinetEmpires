/** 中文：用历史开发根和真实θ1权重验证整条搜索调用，历史快照只作回归。 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { searchWindow, hashState } from './search_window';

describe('真实网络搜索集成', () => {
    it('保留基线和argmax，从原根复核，并且不污染历史状态', () => {
        const manifest = JSON.parse(fs.readFileSync('v19/out/s0s1_20260930/search/window_manifest.json', 'utf8'));
        const entry = manifest.entries.find((row: { group: string }) => row.group === 'dev');
        const root = JSON.parse(entry.rootStateJson);
        const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(manifest.policy.path, 'utf8')));
        const result = searchWindow({
            windowId: 'integration-only', familyId: entry.familyId, mapName: entry.mapName,
            seed: entry.seed, ownSeat: entry.ownSeat, group: 'dev', engineStepIndex: entry.engineStepIndex,
            rootState: root, policyId: 'theta1-regression-only',
            opponentStreamSeed: 2650000000, validationStreamSeed: 2660000000,
            budget: { maxOwnDepth: 1, maxBranchPerLevel: 4, policyTopK: 3, maxBranchesPerWindow: 5,
                wallMsPerWindow: 10000, searchWallMs: 3000, validationWallMsPerArm: 2000,
                maxStepsPerContinuation: 100 },
        }, predictor);
        expect(result.baseline.ownActions).toEqual([]);
        expect(result.baseline.error).toBeNull();
        expect(result.branches.every(branch => branch.error === null)).toBe(true);
        expect(result.candidateDiagnostics.length).toBeGreaterThan(0);
        expect(result.candidateDiagnostics.every(row => (row.diagnostics as { argmaxRetained: boolean }).argmaxRetained)).toBe(true);
        expect(result.validation?.fromRoot).toBe(true);
        expect(result.validation?.rootStateHash).toBe(entry.rootStateHash);
        expect(result.validation?.budgetFair).toBe(true);
        expect(result.validation?.baseline.steps).toBeGreaterThan(0);
        if (result.selected) {
            expect(result.validation?.selected?.appliedPrefix).toEqual(result.selected.ownActions);
            expect(result.validation?.allottedWallMs.selected).toBe(result.validation?.allottedWallMs.baseline);
        }
        expect(hashState(root)).toBe(entry.rootStateHash);
        expect(JSON.stringify(root)).toBe(entry.rootStateJson);
    });
});
