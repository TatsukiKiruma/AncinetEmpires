import { describe, expect, it } from 'vitest';
import {
    migrateLegacyFeatureSample,
    validateDatasetSampleVNext,
    type DatasetSampleVNext,
    type MigrationContext
} from './skirmish_dataset_vnext';
import {
    buildDaggerVNextSample,
    type DaggerCaptureRecord,
    type DaggerVnextMigrationContext
} from './skirmish_dagger_vnext';
import type { SkirmishFeatureSample } from './skirmish_bc_train';

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
        label: { fixedActionIndex: 15432, actionCode: 'move:u_1:2,3' },
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
        ['sd_episode:SDPLAN:sd-normal:(2) Duel.aem:9101821', { partition: 'dev-regression' }]
    ])
};

describe('N01 缺陷曝光反例与数据契约测试', () => {
    it('F02反例：重标注样本不应把 candidates.findIndex 充当全局 fixedActionIndex', () => {
        // 在 candidates 数组中，原行为动作 'wait:u_1' 处于下标 0
        // 但 0 绝非该动作在全局 40,000+ 维固定动作空间中的真实索引
        const s = legacySample({
            label: {
                fixedActionIndex: 15432, // 这是新标签的全局索引
                actionCode: 'move:u_1:2,3',
                originalActionCode: 'wait:u_1',
                relabel: { method: 'fast-rollout', scoreMargin: 12, rolloutDepth: 6 }
            }
        });
        const v = migrateLegacyFeatureSample(s, ctx);
        // 行为动作真实全局索引在旧特征中缺失，不能错误地赋值为 0 (findIndex)
        expect(v.behavior.fixedActionIndex).toBeNull();
    });

    it('F07反例：sampleIdSeed 与实际字段解耦篡改应被拒绝', () => {
        const v = migrateLegacyFeatureSample(legacySample(), ctx);
        // 篡改实际行为动作，但保持 sampleId 与 sampleIdSeed 未动
        const tampered: DatasetSampleVNext = {
            ...v,
            behavior: {
                ...v.behavior,
                actionCode: 'attack:u_1:u_2' // 被篡改
            }
        };
        const errors = validateDatasetSampleVNext(tampered);
        expect(errors.some(e => e.includes('sampleIdSeed') || e.includes('字段不一致'))).toBe(true);
    });

    it('门禁：非 train 分区样本严禁标记为 usableFor=trainable', () => {
        const v = migrateLegacyFeatureSample(legacySample(), ctx);
        const leaked: DatasetSampleVNext = {
            ...v,
            provenance: {
                ...v.provenance,
                partition: 'dev-regression'
            },
            usableFor: 'trainable'
        };
        const errors = validateDatasetSampleVNext(leaked);
        expect(errors.some(e => e.includes('trainable') && e.includes('partition'))).toBe(true);
    });

    it('结果视角：perspectivePlayerId 与 perspectiveAllianceId 必须拆分且正确对应', () => {
        // 构造 playerId !== allianceId 的场景（玩家2，所属联盟1）
        const daggerCtx: DaggerVnextMigrationContext = {
            families: new Map([['test_root', { partition: 'train' }]]),
            rulesVersion: 'rules-v1'
        };
        const record: DaggerCaptureRecord = {
            rootFamilyKey: 'test_root',
            episodeIndex: 1,
            step: 5,
            turn: 2,
            playerId: 2, // 玩家 ID 为 2
            stateHash: 'a'.repeat(64),
            behaviorActionCode: 'move:u_2:1,1',
            behaviorPolicy: 'student-mlp',
            fixedActionIndex: 500,
            legalActionCodes: ['move:u_2:1,1'],
            teacherActionCode: null,
            teacherScoreMargin: null,
            teacherRolloutDepth: 1,
            snapshotSourceFile: 'snapshots/1_5.json.gz',
            outcome: {
                termination: 'natural',
                winnerAllianceId: 1,
                subjectAllianceId: 1 // 联盟 ID 为 1
            }
        };
        const { sample } = buildDaggerVNextSample(record, daggerCtx);
        expect(sample.outcome.perspectivePlayerId).toBe(2);
        expect(sample.outcome.perspectiveAllianceId).toBe(1);
        expect(sample.outcome.result).toBe('naturalWin');
    });

    it('终局一致性校验：verified 样本不能包含 unknown 结果或非自然终局的自然胜负', () => {
        const v = migrateLegacyFeatureSample(legacySample(), ctx);
        const invalid1: DatasetSampleVNext = {
            ...v,
            outcome: {
                ...v.outcome,
                reliability: 'verified',
                result: 'unknown'
            }
        };
        expect(validateDatasetSampleVNext(invalid1).length).toBeGreaterThan(0);

        const invalid2: DatasetSampleVNext = {
            ...v,
            outcome: {
                ...v.outcome,
                termination: 'maxPlies',
                result: 'naturalWin',
                reliability: 'verified'
            }
        };
        expect(validateDatasetSampleVNext(invalid2).length).toBeGreaterThan(0);
    });
});
