import { describe, expect, it } from 'vitest';
import {
    migrateLegacyFeatureSample,
    resolveRootFamilyKey,
    validateDatasetSampleVNext,
    auditPartitionAssignment,
    type DatasetSampleVNext,
    type MigrationContext
} from './skirmish_dataset_vnext';
import type { SkirmishFeatureSample } from './skirmish_bc_train';

// ── 最小合法旧样本（T04 契约迁移输入） ─────────────────────────────
function legacySample(overrides: Partial<SkirmishFeatureSample> = {}): SkirmishFeatureSample {
    return {
        kind: 'skirmish_feature_sample',
        version: 1,
        featureExtractor: 'hashed-action-v4',
        featureDim: 4096,
        source: { inputFile: 'training_runs/pvp_navigation_20260918/ai-episodes/77.json', episodeIndex: 77, stepIndex: 3 },
        scenario: { id: 'SDPLAN:sd-normal:(2) Liberty Port.aem', mode: 'SD', mapName: '(2) Liberty Port.aem' } as never,
        seed: 2026073505,
        step: 4,
        turn: 1,
        playerId: 1,
        policy: 'heuristic',
        label: { fixedActionIndex: 1, actionCode: 'move:u_1:2,3' },
        candidates: [
            { actionCode: 'wait:u_1', features: [[1, 1]] },
            { actionCode: 'move:u_1:2,3', features: [[2, 1]] }
        ],
        ...overrides
    };
}

const ctx: MigrationContext = {
    rulesVersion: 'mock-commit-0123456789abcdef',
    families: new Map([
        ['sd_episode:SDPLAN:sd-normal:(2) Liberty Port.aem:2026073505', { partition: 'train' }],
        ['sd_episode:SDPLAN:sd-normal:(2) Duel.aem:9101821', { partition: 'dev-regression' }],
        ['derived_snapshot:diagnostic-39', { partition: 'dev-regression' }]
    ])
};

describe('resolveRootFamilyKey（根来源族定位）', () => {
    it('episode 来源 → sd_episode:scenarioId:seed', () => {
        expect(resolveRootFamilyKey(legacySample(), ctx)).toBe('sd_episode:SDPLAN:sd-normal:(2) Liberty Port.aem:2026073505');
    });
    it('diagnostic 快照来源 → derived_snapshot 族（纠错续局不独立于根快照）', () => {
        const s = legacySample({ source: { inputFile: 'diagnostic-states/39.json', episodeIndex: 39, stepIndex: 0 } });
        expect(resolveRootFamilyKey(s, ctx)).toBe('derived_snapshot:diagnostic-39');
    });
    it('manifest 未登记的族 → null 且样本标记 familyRegistered=false', () => {
        const s = legacySample({ seed: 999999999 });
        expect(resolveRootFamilyKey(s, ctx)).toBeNull();
        const v = migrateLegacyFeatureSample(s, ctx);
        expect(v.provenance.familyRegistered).toBe(false);
    });
});

describe('migrateLegacyFeatureSample（实际行为 vs 教师反事实）', () => {
    it('无 relabel：标签即实际执行行为，teacher 为 null', () => {
        const v = migrateLegacyFeatureSample(legacySample(), ctx);
        expect(v.behavior.actionCode).toBe('move:u_1:2,3');
        expect(v.behavior.executed).toBe(true);
        expect(v.teacher).toBeNull();
    });
    it('relabel：行为取 originalActionCode，教师建议标记为未执行的 counterfactual-advice', () => {
        const s = legacySample({
            label: {
                fixedActionIndex: 1, actionCode: 'move:u_1:2,3',
                originalActionCode: 'wait:u_1',
                relabel: { method: 'fast-rollout', scoreMargin: 12, rolloutDepth: 6 }
            }
        });
        const v = migrateLegacyFeatureSample(s, ctx);
        expect(v.behavior.actionCode).toBe('wait:u_1');
        expect(v.teacher).toMatchObject({ actionCode: 'move:u_1:2,3', executed: false, evidence: 'counterfactual-advice', method: 'fast-rollout' });
    });
    it('仅含不可逆哈希特征 → usableFor 降级为 historical-baseline', () => {
        const v = migrateLegacyFeatureSample(legacySample(), ctx);
        expect(v.provenance.stateReconstruction).toBe('irreversible-hashed-features');
        expect(v.usableFor).toBe('historical-baseline');
    });
    it('sampleId 对对象键序稳定', () => {
        const a = migrateLegacyFeatureSample(legacySample(), ctx).sampleId;
        const shuffled = JSON.parse(JSON.stringify({ seed: 2026073505, kind: 'skirmish_feature_sample', label: { actionCode: 'move:u_1:2,3', fixedActionIndex: 1 }, version: 1, candidates: [], scenario: { mode: 'SD', id: 'SDPLAN:sd-normal:(2) Liberty Port.aem', mapName: '(2) Liberty Port.aem' }, source: { stepIndex: 3, episodeIndex: 77, inputFile: 'training_runs/pvp_navigation_20260918/ai-episodes/77.json' }, featureDim: 4096, featureExtractor: 'hashed-action-v4', playerId: 1, policy: 'heuristic', step: 4, turn: 1 }));
        expect(migrateLegacyFeatureSample(shuffled, ctx).sampleId).toBe(a);
    });
});

describe('validateDatasetSampleVNext（schema+语义）', () => {
    const ok = (): DatasetSampleVNext => migrateLegacyFeatureSample(legacySample(), ctx);
    it('合法样本零错误', () => expect(validateDatasetSampleVNext(ok())).toEqual([]));
    it('拒绝篡改 kind/schemaVersion', () => {
        const v = ok();
        expect(validateDatasetSampleVNext({ ...v, kind: 'other' }).length).toBeGreaterThan(0);
        expect(validateDatasetSampleVNext({ ...v, schemaVersion: 99 }).length).toBeGreaterThan(0);
    });
    it('拒绝教师建议标 executed=true（反事实不得伪装成实际行为）', () => {
        const v: DatasetSampleVNext = {
            ...migrateLegacyFeatureSample(legacySample({ label: { fixedActionIndex: 1, actionCode: 'move:u_1:2,3', originalActionCode: 'wait:u_1', relabel: { method: 'heuristic', scoreMargin: 1, rolloutDepth: 0 } } }), ctx),
            teacher: { actionCode: 'move:u_1:2,3', executed: true, evidence: 'counterfactual-advice', method: 'heuristic', scoreMargin: 1, rolloutDepth: 0 } as unknown as DatasetSampleVNext['teacher']
        };
        expect(validateDatasetSampleVNext(v).some(e => /counterfactual|反事实|executed/.test(e))).toBe(true);
    });
    it('拒绝 fabricated 终局证据挂到未执行教师动作', () => {
        const v = ok();
        const tampered = { ...v, outcome: { ...v.outcome, outcomeSource: 'teacher-counterfactual' } };
        expect(validateDatasetSampleVNext(tampered).some(e => /outcomeSource/.test(e))).toBe(true);
    });
    it('拒绝非法 outcome 枚举', () => {
        const v = ok();
        expect(validateDatasetSampleVNext({ ...v, outcome: { ...v.outcome, termination: 'won-something' } }).length).toBeGreaterThan(0);
    });
    it('label 与候选数组不一致 → 合法性检查报错', () => {
        const s = legacySample({ label: { fixedActionIndex: 1, actionCode: 'attack:u_9:u_8' } });
        const v = migrateLegacyFeatureSample(s, ctx);
        expect(v.legality.errors.some(e => /不一致|missing/.test(e))).toBe(true);
        expect(v.usableFor).toBe('quarantine');
    });
    it('真实数据形态：fixedActionIndex 为全局动作空间索引（远超采样子集长度）且 label 在候选内 → 合法', () => {
        // T04 迁移实测：corrections/pvp 样本 idx 可达 33821 而 candidates 仅 64 项，
        // 旧实现把全局下标与子集位置互推导致 327/328 误隔离。
        const s = legacySample({ label: { fixedActionIndex: 33821, actionCode: 'move:u_1:2,3' } });
        const v = migrateLegacyFeatureSample(s, ctx);
        expect(v.legality.errors).toEqual([]);
        expect(v.usableFor).toBe('historical-baseline');
        expect(validateDatasetSampleVNext(v)).toEqual([]);
    });
});

describe('auditPartitionAssignment（跨分区污染）', () => {
    it('train 分区样本合法', () => {
        const v = migrateLegacyFeatureSample(legacySample(), ctx);
        expect(auditPartitionAssignment([{ sample: v, split: 'train' }], ctx)).toEqual([]);
    });
    it('dev-regression 族混入 train → 报错', () => {
        const s = legacySample({ source: { inputFile: 'diagnostic-states/39.json', episodeIndex: 39, stepIndex: 0 } });
        const v = migrateLegacyFeatureSample(s, ctx);
        expect(auditPartitionAssignment([{ sample: v, split: 'train' }], ctx).length).toBeGreaterThan(0);
    });
    it('未登记族进任何正式 split 都报错', () => {
        const v = migrateLegacyFeatureSample(legacySample({ seed: 999999999 }), ctx);
        expect(auditPartitionAssignment([{ sample: v, split: 'validation' }], ctx).length).toBeGreaterThan(0);
    });
});
