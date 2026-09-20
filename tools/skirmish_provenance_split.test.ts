import { describe, it, expect } from 'vitest';
import {
    formatProvenanceId,
    auditPartitionLeakage,
    reconstructGameStateFromObservation,
    validateStateActionParity,
    type SplitManifestV4,
    type ProvenanceIdentity
} from './skirmish_provenance_split';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { encodeAction } from '../src/game/env';

describe('R02: Provenance, Partitioning & State Reconstruction', () => {
    it('稳定来源身份：formatProvenanceId 生成确定性 ID', () => {
        const p: ProvenanceIdentity = {
            archiveHash: 'hash_abc123',
            sourceEpisodeId: 'ep_42',
            rootFamilyId: 'root_demo_sd',
            stepIndex: 5,
            subjectPlayerId: 1,
            subjectAllianceId: 1
        };
        const id = formatProvenanceId(p);
        expect(id).toBe('hash_abc123:ep_42:root_demo_sd:5:P1_A1');
    });

    it('根家族分区审计：严格检测 train/dev/final 交集泄漏', () => {
        // 构造有泄漏的分区
        const leakedManifest: SplitManifestV4 = {
            schemaVersion: 4,
            runId: 'test_run',
            generatedAt: new Date().toISOString(),
            partitions: {
                train: ['family_1', 'family_2', 'family_leak'],
                dev: ['family_3', 'family_leak'], // 与 train 泄漏
                final: ['family_4']
            },
            policies: {
                prohibitOverlap: true,
                augmentationInheritance: true,
                shuffleOnlyWithinTrain: true
            }
        };

        const leakedReport = auditPartitionLeakage(leakedManifest);
        expect(leakedReport.hasLeakage).toBe(true);
        expect(leakedReport.overlapTrainDev).toContain('family_leak');

        // 构造无泄漏的合法分区
        const cleanManifest: SplitManifestV4 = {
            schemaVersion: 4,
            runId: 'test_run',
            generatedAt: new Date().toISOString(),
            partitions: {
                train: ['family_1', 'family_2'],
                dev: ['family_3'],
                final: ['family_4', 'family_5']
            },
            policies: {
                prohibitOverlap: true,
                augmentationInheritance: true,
                shuffleOnlyWithinTrain: true
            }
        };

        const cleanReport = auditPartitionLeakage(cleanManifest);
        expect(cleanReport.hasLeakage).toBe(false);
        expect(cleanReport.overlapTrainDev.length).toBe(0);
        expect(cleanReport.overlapTrainFinal.length).toBe(0);
        expect(cleanReport.overlapDevFinal.length).toBe(0);
    });

    it('状态重建与对齐：真实观察重建后与游戏引擎动作合法性单步一致', () => {
        const demo = createDemoState(getApkSkirmishRuleConfig('SD'));
        const obs = {
            turn: demo.turn,
            currentPlayer: demo.currentPlayer,
            mapWidth: demo.map.width,
            mapHeight: demo.map.height,
            tiles: demo.map.tiles.flat(),
            units: demo.units,
            players: demo.players,
            rules: demo.rules,
            metadata: demo.metadata
        };

        const { state, error } = reconstructGameStateFromObservation(obs);
        expect(error).toBeUndefined();
        expect(state).not.toBeNull();

        // 验证合法动作
        const parityValid = validateStateActionParity(state!, demo.currentPlayer, 'end_turn');
        expect(parityValid.valid).toBe(true);
        expect(parityValid.stepSuccess).toBe(true);
        expect(parityValid.legalActionCount).toBeGreaterThan(0);

        // 验证非法动作被正确拦截并隔离
        const parityIllegal = validateStateActionParity(state!, demo.currentPlayer, 'attack:u_nonexistent:u_none');
        expect(parityIllegal.valid).toBe(false);
        expect(parityIllegal.reason).toContain('不在当前引擎合法动作列表中');
    });

    it('坏数据隔离：缺失关键字段的 Observation 正确返回错误', () => {
        const badObs = { mapWidth: 10 }; // 缺少 mapHeight, tiles, units
        const { state, error } = reconstructGameStateFromObservation(badObs);
        expect(state).toBeNull();
        expect(error).toContain('缺少');
    });
});
