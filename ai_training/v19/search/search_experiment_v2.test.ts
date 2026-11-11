import { describe, expect, it } from 'vitest';
import type { SearchBudget } from './rollout_search';
import { hashState } from './search_window';
import {
    deriveStreamSeeds,
    searchBudgetSha256,
    sourceIdentity,
    validateFreshManifest,
    type Manifest,
    type ManifestEntry,
} from './search_experiment_v2';

const POLICY_SHA = 'a'.repeat(64);

function freshManifest(): Manifest {
    const entries: ManifestEntry[] = [];
    for (let mapIndex = 0; mapIndex < 5; mapIndex += 1) {
        for (let slot = 0; slot < 8; slot += 1) {
            const ownSeat = slot % 2;
            const root = { currentPlayer: ownSeat, marker: `${mapIndex}-${slot}` } as never;
            const familyId = `fresh-${mapIndex}-${slot}-seat${ownSeat}`;
            entries.push({
                windowId: `${familyId}-w0`,
                familyId,
                mapIndex,
                mapName: `map-${mapIndex}`,
                seed: 2610200000 + mapIndex * 10 + slot,
                ownSeat,
                group: slot < 4 ? 'dev' : 'sealed',
                engineStepIndex: 10 + slot,
                rootStateHash: hashState(root),
                rootStateJson: JSON.stringify(root),
                policySha256: POLICY_SHA,
            });
        }
    }
    return {
        schema: 'v19_fresh_window_manifest_1',
        policy: { id: 'theta1', path: 'model.json', sha256: POLICY_SHA },
        counts: {
            total: 40,
            dev: 20,
            sealed: 20,
            perMapDev: [4, 4, 4, 4, 4],
            perMapSealed: [4, 4, 4, 4, 4],
        },
        entries,
    };
}

describe('搜索复验 v2 驱动身份', () => {
    it('接受严格的40家族结构，且不因跨组同根而拒绝清单', () => {
        const manifest = freshManifest();
        const sharedRoot = { currentPlayer: 0, marker: 'shared' } as never;
        for (const index of [0, 4]) {
            manifest.entries[index].ownSeat = 0;
            manifest.entries[index].rootStateJson = JSON.stringify(sharedRoot);
            manifest.entries[index].rootStateHash = hashState(sharedRoot);
        }
        expect(() => validateFreshManifest(manifest)).not.toThrow();
    });

    it('拒绝错误schema、缺失策略SHA及错误分组计数', () => {
        const schema = freshManifest();
        schema.schema = 'old';
        expect(() => validateFreshManifest(schema)).toThrow(/schema/);

        const policy = freshManifest();
        delete policy.policy!.sha256;
        expect(() => validateFreshManifest(policy)).toThrow(/policy\.sha256/);

        const counts = freshManifest();
        counts.entries[3].group = 'sealed';
        expect(() => validateFreshManifest(counts)).toThrow(/dev=20、sealed=20|地图0/);

        const perMap = freshManifest();
        perMap.entries[3].group = 'sealed';
        perMap.entries[12].group = 'dev';
        expect(() => validateFreshManifest(perMap)).toThrow(/地图0/);

        const entryPolicy = freshManifest();
        delete entryPolicy.entries[0].policySha256;
        expect(() => validateFreshManifest(entryPolicy)).toThrow(/policySha256/);
    });

    it.each(['windowId', 'familyId', 'seed'] as const)('拒绝重复%s', (key) => {
        const manifest = freshManifest();
        (manifest.entries[1] as unknown as Record<string, unknown>)[key] = manifest.entries[0][key];
        expect(() => validateFreshManifest(manifest)).toThrow(new RegExp(`重复 ${key}`));
    });

    it('拒绝非法座位、分组、根JSON、根行动方和根哈希', () => {
        const seat = freshManifest();
        seat.entries[0].ownSeat = 2;
        expect(() => validateFreshManifest(seat)).toThrow(/ownSeat/);

        const group = freshManifest();
        group.entries[0].group = 'other' as never;
        expect(() => validateFreshManifest(group)).toThrow(/group/);

        const json = freshManifest();
        json.entries[0].rootStateJson = '{';
        expect(() => validateFreshManifest(json)).toThrow(/合法JSON/);

        const player = freshManifest();
        player.entries[0].rootStateJson = JSON.stringify({ currentPlayer: 1 });
        expect(() => validateFreshManifest(player)).toThrow(/currentPlayer/);

        const hash = freshManifest();
        hash.entries[0].rootStateHash = '00000000';
        expect(() => validateFreshManifest(hash)).toThrow(/rootStateHash 不符/);
    });

    it('流种子只由清单 seed 派生且搜索、验证命名空间分离', () => {
        expect(deriveStreamSeeds(2610200034)).toEqual({
            searchSeed: 2630200034,
            validationSeed: 2640200034,
        });
        expect(deriveStreamSeeds(2610200035).searchSeed - deriveStreamSeeds(2610200034).searchSeed).toBe(1);
    });

    it('预算 SHA 不受对象键插入顺序影响', () => {
        const budget: SearchBudget = {
            maxOwnDepth: 2,
            maxBranchPerLevel: 5,
            policyTopK: 4,
            maxBranchesPerWindow: 16,
            wallMsPerWindow: 600000,
            maxStepsPerContinuation: 12000,
        };
        const reordered = Object.fromEntries(Object.entries(budget).reverse()) as unknown as SearchBudget;
        expect(searchBudgetSha256(reordered)).toBe(searchBudgetSha256(budget));
    });

    it('源码身份覆盖搜索、引擎、共享推理、H0及运行器依赖，并去重排序', () => {
        const identity = sourceIdentity();
        const paths = identity.sourceFiles.map((file) => file.path);
        expect(paths).toEqual([...new Set(paths)].sort());
        expect(paths).toEqual(expect.arrayContaining([
            'v19/search/search_window.ts',
            'v19/search/local_skill_gate.ts',
            'v19/search/result_integrity.ts',
            'src/game/engine.ts',
            'src/game/ai/shared_spatial_policy.ts',
            'src/game/ai/heuristic_ai.ts',
            'src/game/ai/action_ordering.ts',
            'src/game/units.ts',
            'v13/tools/eval_v3_core.ts',
            'v12/tools/run-tool.mjs',
        ]));
        expect(identity.sourceFiles.every((file) => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
    });
});

