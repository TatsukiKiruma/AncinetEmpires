/**
 * T09 round02 纠错数据契约模块测试（RED 先行）。
 *
 * 覆盖 dataset_vnext 双轨语义在 DAgger 采集流水线上的映射：
 *   behavior=学生实际执行（executed:true），teacher=轻量搜索教师反事实建议（executed:false、
 *   counterfactual-advice、fast-rollout），全量状态快照可重放（full-observation → 可 trainable），
 *   分区隔离（未登记/非训练分区族必须隔离），outcome 只有核验的自然终局才能 verified，
 *   sampleId 防篡改（改教师动作必须重算失配）。
 */
import { describe, expect, it } from 'vitest';
import { validateDatasetSampleVNext } from './skirmish_dataset_vnext';
import {
    buildDaggerVNextSample,
    type DaggerCaptureRecord,
    type DaggerVnextMigrationContext,
} from './skirmish_dagger_vnext';

const FAMILIES = new Map<string, { partition: 'train' | 'dev-regression' }>([
    ['sd_episode:SDPLAN:sd-normal:(2) Duel.aem:111', { partition: 'train' }],
    ['sd_episode:SDPLAN:sd-normal:(2) Duel.aem:999', { partition: 'dev-regression' }],
]);
const CTX: DaggerVnextMigrationContext = { families: FAMILIES as never, rulesVersion: 'abc123' };

function record(overrides: Partial<DaggerCaptureRecord> = {}): DaggerCaptureRecord {
    return {
        rootFamilyKey: 'sd_episode:SDPLAN:sd-normal:(2) Duel.aem:111',
        episodeIndex: 3,
        step: 12,
        turn: 4,
        playerId: 0,
        stateHash: 'deadbeefdeadbeef',
        behaviorActionCode: 'move:u3:3,4',
        behaviorPolicy: 'dagger-student-R5-mlp-v5',
        fixedActionIndex: 77,
        legalActionCodes: ['move:u3:3,4', 'attack:u3:u4', 'capture:u3', 'end_turn'],
        teacherActionCode: 'attack:u3:u4',
        teacherScoreMargin: 1234.5,
        teacherRolloutDepth: 1,
        snapshotSourceFile: 'dagger_round02/states/0000003.json',
        outcome: { termination: 'natural', winnerAllianceId: 0, subjectAllianceId: 0 },
        ...overrides,
    };
}

describe('buildDaggerVNextSample：双轨标签契约', () => {
    it('教师分歧样本：behavior 执行、teacher 反事实建议、通过 vnext 校验且 trainable', () => {
        const { sample, quarantineReasons } = buildDaggerVNextSample(record(), CTX);
        expect(quarantineReasons).toEqual([]);
        expect(sample.kind).toBe('skirmish_dataset_sample_vnext');
        expect(sample.schemaVersion).toBe(2);
        expect(sample.behavior).toMatchObject({ actionCode: 'move:u3:3,4', executed: true, policy: 'dagger-student-R5-mlp-v5' });
        expect(sample.teacher).toMatchObject({
            actionCode: 'attack:u3:u4', executed: false,
            evidence: 'counterfactual-advice', method: 'fast-rollout', rolloutDepth: 1,
        });
        expect(sample.teacher!.scoreMargin).toBeCloseTo(1234.5, 1);
        expect(sample.provenance).toMatchObject({ partition: 'train', familyRegistered: true, stateReconstruction: 'full-observation' });
        expect(sample.usableFor).toBe('trainable');
        expect(validateDatasetSampleVNext(sample)).toEqual([]);
    });

    it('教师与学生一致（或无教师结论）时 teacher 轨为 null，不产出矛盾标记', () => {
        const same = buildDaggerVNextSample(record({ teacherActionCode: 'move:u3:3,4', teacherScoreMargin: 0 }), CTX).sample;
        expect(same.teacher).toBeNull();
        const none = buildDaggerVNextSample(record({ teacherActionCode: null, teacherScoreMargin: null }), CTX).sample;
        expect(none.teacher).toBeNull();
        expect(validateDatasetSampleVNext(same)).toEqual([]);
        expect(validateDatasetSampleVNext(none)).toEqual([]);
    });

    it('未登记家族 / 非训练分区族：隔离，不得 trainable', () => {
        const unregistered = buildDaggerVNextSample(record({ rootFamilyKey: 'sd_episode:SDPLAN:sd-normal:(2) X.aem:7' }), CTX);
        expect(unregistered.quarantineReasons.join(' ')).toContain('未登记');
        expect(unregistered.sample.usableFor).toBe('quarantine');
        expect(unregistered.sample.provenance.partition).toBe('unregistered');

        const devRoot = buildDaggerVNextSample(record({ rootFamilyKey: 'sd_episode:SDPLAN:sd-normal:(2) Duel.aem:999' }), CTX);
        expect(devRoot.quarantineReasons.join(' ')).toContain('分区');
        expect(devRoot.sample.usableFor).toBe('quarantine');
    });

    it('动作合法性：behavior 或 teacher 不在合法集 → 隔离并记录原因', () => {
        const badBehavior = buildDaggerVNextSample(record({ behaviorActionCode: 'move:u9:9,9' }), CTX);
        expect(badBehavior.quarantineReasons.join(' ')).toContain('行为动作');
        expect(badBehavior.sample.usableFor).toBe('quarantine');
        expect(badBehavior.sample.legality.errors.length).toBeGreaterThan(0);

        const badTeacher = buildDaggerVNextSample(record({ teacherActionCode: 'attack:u9:u8' }), CTX);
        expect(badTeacher.quarantineReasons.join(' ')).toContain('教师');
        expect(badTeacher.sample.usableFor).toBe('quarantine');
    });

    it('终局映射：仅核验的自然终局 verified；截断/未结束保持 unknown 且不得 verified', () => {
        const win = buildDaggerVNextSample(record(), CTX).sample;
        expect(win.outcome).toMatchObject({ termination: 'natural', result: 'naturalWin', reliability: 'verified', outcomeSource: 'recorded-episode' });

        const loss = buildDaggerVNextSample(record({ outcome: { termination: 'natural', winnerAllianceId: 1, subjectAllianceId: 0 } }), CTX).sample;
        expect(loss.outcome).toMatchObject({ termination: 'natural', result: 'naturalLoss', reliability: 'verified' });

        const draw = buildDaggerVNextSample(record({ outcome: { termination: 'natural', winnerAllianceId: -1, subjectAllianceId: 0 } }), CTX).sample;
        expect(draw.outcome).toMatchObject({ termination: 'natural', result: 'draw', reliability: 'verified' });

        const truncated = buildDaggerVNextSample(record({ outcome: { termination: 'maxPlies', winnerAllianceId: null, subjectAllianceId: 0 } }), CTX).sample;
        expect(truncated.outcome).toMatchObject({ termination: 'maxPlies', result: 'unknown', reliability: 'unverified' });
        expect(truncated.outcome.truncated).toBe(true);

        const missing = buildDaggerVNextSample(record({ outcome: null }), CTX).sample;
        expect(missing.outcome).toMatchObject({ termination: 'unknown', result: 'unknown', reliability: 'unverified' });
    });

    it('sampleId 防篡改：改 seed 中动作字段后重算失配；teacher 轨与 seed 一致', async () => {
        const { sample } = buildDaggerVNextSample(record(), CTX);
        expect(validateDatasetSampleVNext(sample)).toEqual([]);
        // 双轨一致性：教师动作同时落入 sampleIdSeed，篡改任一侧都会破坏可审计性
        expect(sample.sampleIdSeed.teacherActionCode).toBe(sample.teacher!.actionCode);
        const tampered = structuredClone(sample);
        (tampered.sampleIdSeed as { behaviorActionCode: string }).behaviorActionCode = 'capture:u3';
        const errs = validateDatasetSampleVNext(tampered);
        expect(errs.join(' ')).toContain('sampleId');
    });
});
