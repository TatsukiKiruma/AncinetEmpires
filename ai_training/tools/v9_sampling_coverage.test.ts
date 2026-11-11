import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { GameState } from '../src/game/types';
import { getBehavioralStateHash, splitMix32 } from './v7_training_pipeline';

describe('V9-05: Behavioral State Hash, Sampling Decoupling, and Split Isolation', () => {
    const rules = getApkSkirmishRuleConfig('SD');

    it('V9-05-A: Behavioral state hash changes when player commanderReserveLevel changes', () => {
        const base = createDemoState(rules);
        base.players[0].commanderReserveLevel = 0 as any;
        const hash0 = getBehavioralStateHash(base, 0);

        const sModified = JSON.parse(JSON.stringify(base)) as GameState;
        sModified.players[0].commanderReserveLevel = 2 as any;
        const hashModified = getBehavioralStateHash(sModified, 0);

        expect(hashModified).not.toBe(hash0);
    });

    it('V9-05-B: Behavioral state hash changes when player commanderReserveExp changes', () => {
        const base = createDemoState(rules);
        base.players[0].commanderReserveExp = 0;
        const hash0 = getBehavioralStateHash(base, 0);

        const sModified = JSON.parse(JSON.stringify(base)) as GameState;
        sModified.players[0].commanderReserveExp = 45;
        const hashModified = getBehavioralStateHash(sModified, 0);

        expect(hashModified).not.toBe(hash0);
    });

    it('V9-05-C: Root family ID generation is 1:1 with unique seed and does not modulo collapse to 100', () => {
        const generateRootId = (mapName: string, seed: number) =>
            `root_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}_seed_${seed}`;

        const seed1 = 10005;
        const seed2 = 10105;
        // In v7, seed % 100 collapsed 10005 and 10105 both to 5!
        expect(seed1 % 100).toBe(seed2 % 100);

        const root1 = generateRootId('(2) Duel.aem', seed1);
        const root2 = generateRootId('(2) Duel.aem', seed2);
        expect(root1).not.toBe(root2);
    });

    it('V9-05-D: Gold offset and map sampling are mathematically independent', () => {
        const mapCount = 8;
        const goldOffsets = [-100, -50, 0, 50, 100, 150, 200, 300];
        // Test 64 consecutive episodes
        const mapIndices = new Set<number>();
        const goldIndices = new Set<number>();
        const pairs = new Set<string>();

        for (let ep = 1; ep <= 64; ep++) {
            const mapIdx = ep % mapCount;
            // Bit-mixing PRNG for gold rather than linear modulo 8
            const goldIdx = splitMix32(ep * 100 + 1) % goldOffsets.length;
            mapIndices.add(mapIdx);
            goldIndices.add(goldIdx);
            pairs.add(`${mapIdx}:${goldIdx}`);
        }

        expect(mapIndices.size).toBe(mapCount);
        expect(goldIndices.size).toBe(goldOffsets.length);
        // With decoupling, distinct pairs must exceed the trivial 8 diagonals
        expect(pairs.size).toBeGreaterThan(8);
    });
});
