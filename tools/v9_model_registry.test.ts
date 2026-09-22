import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MODEL_REGISTRY, getPolicyRegistryEntry } from '../src/game/ai/models/model_registry';

function getFileSha256(filePath: string): string {
    const fileBuf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuf).digest('hex');
}

describe('V9-00: Model Registry and Identity Ledger Verification', () => {
    it('loads model registry with expected schema and version v9', () => {
        expect(MODEL_REGISTRY.registryVersion).toBe('v9');
        expect(MODEL_REGISTRY.defaultProductionPolicy).toBe('heuristic');
        expect(MODEL_REGISTRY.policies).toBeDefined();
    });

    it('asserts heuristic is the production default and not experimental', () => {
        const heuristic = getPolicyRegistryEntry('heuristic');
        expect(heuristic).toBeDefined();
        expect(heuristic?.isProductionDefault).toBe(true);
        expect(heuristic?.isExperimental).toBe(false);
        expect(heuristic?.checkpoint).toBeNull();
    });

    it('verifies frontend v1 model checkpoint path and exact SHA-256', () => {
        const v1 = getPolicyRegistryEntry('spatial_resnet_v1');
        expect(v1).toBeDefined();
        expect(v1?.checkpoint).toBeDefined();
        const fullPath = path.resolve(v1!.checkpoint!.relativePath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const actualSha = getFileSha256(fullPath);
        expect(actualSha).toBe(v1!.checkpoint!.sha256);
        expect(actualSha).toBe('a6a88b206924e64dead18900183bb09aa75ad9fa73e0421d5cbd885a19e9577f');
        expect(v1?.checkpoint?.encoderVersion).toBe('v1');
    });

    it('verifies qualified 7.8k large base v2 model exists and matches report SHA', () => {
        const v2 = getPolicyRegistryEntry('spatial_v2_experimental');
        expect(v2).toBeDefined();
        expect(v2?.isExperimental).toBe(true);
        expect(v2?.isProductionDefault).toBe(false);
        const fullPath = path.resolve(v2!.checkpoint!.relativePath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const actualSha = getFileSha256(fullPath);
        // Explicitly check against the historical report SHA
        expect(actualSha).toBe('1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92');
        expect(actualSha).toBe(v2!.checkpoint!.sha256);
        expect(v2?.checkpoint?.encoderVersion).toBe('v2');
        expect(v2?.training?.totalUniqueStates).toBe(7832);
    });

    it('verifies DAgger round 1 checkpoint exists and matches report SHA', () => {
        const dagger = getPolicyRegistryEntry('spatial_dagger_experimental');
        expect(dagger).toBeDefined();
        expect(dagger?.isExperimental).toBe(true);
        const fullPath = path.resolve(dagger!.checkpoint!.relativePath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const actualSha = getFileSha256(fullPath);
        expect(actualSha).toBe('efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b');
        expect(actualSha).toBe(dagger!.checkpoint!.sha256);
    });

    it('verifies smoke 100-state model is explicitly labeled SMOKE_CONTROL_ONLY', () => {
        const smoke = getPolicyRegistryEntry('spatial_v2_smoke_100');
        expect(smoke).toBeDefined();
        expect(smoke?.qualification).toBe('SMOKE_CONTROL_ONLY');
        const fullPath = path.resolve(smoke!.checkpoint!.relativePath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const actualSha = getFileSha256(fullPath);
        expect(actualSha).toBe('43c0d74841453b5ddf20f1cbcb8d6d56297bfff953a8240e37f8c21bebba876b');
    });

    it('verifies NET_A and NET_B checkpoints match their respective SHA-256', () => {
        const netA = getPolicyRegistryEntry('net_a');
        expect(netA).toBeDefined();
        const netAPath = path.resolve(netA!.checkpoint!.relativePath);
        expect(fs.existsSync(netAPath)).toBe(true);
        expect(getFileSha256(netAPath)).toBe('ededeb349a252d75c8dd66d40a29dcae8d0716669911285c39da870bebfc4edf');

        const netB = getPolicyRegistryEntry('net_b_s10');
        expect(netB).toBeDefined();
        const netBPath = path.resolve(netB!.checkpoint!.relativePath);
        expect(fs.existsSync(netBPath)).toBe(true);
        expect(getFileSha256(netBPath)).toBe('4839e4c79c861245bf8e50c4f1dd0fdc284a85f1e97a25a9f00c99c691a888b2');
    });

    it('verifies split manifest and consumed manifests for v8_final_01', () => {
        const v2 = getPolicyRegistryEntry('spatial_v2_experimental');
        const splitManifestPath = path.resolve('training_runs/agent_upgrade_20260921_v8_final_01/split_manifest.json');
        const consumedPath = path.resolve('training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet/consumed_samples_manifest.json');

        expect(fs.existsSync(splitManifestPath)).toBe(true);
        expect(fs.existsSync(consumedPath)).toBe(true);

        expect(getFileSha256(splitManifestPath)).toBe(v2!.training!.splitManifestSha256);
        expect(getFileSha256(consumedPath)).toBe(v2!.training!.consumedManifestSha256);
    });
});
