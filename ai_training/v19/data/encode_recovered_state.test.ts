import { describe, expect, it } from 'vitest';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import { encodeRecoveredState } from './encode_recovered_state';

function fixtureState(seed = 7) {
    const state = createAppApkSkirmishGameState('(2) Duel.aem');
    state.metadata = { ...state.metadata };
    (state.metadata as unknown as Record<string, unknown>).sdTrainingSeed = seed;
    return state;
}

describe('恢复状态的 V19 重编码', () => {
    it('生成维度完整、标签合法且禁用价值损失的训练行', () => {
        const state = fixtureState();
        const before = canonicalStateJson(state);
        const row = encodeRecoveredState(state);

        expect(row.encoderSchemaId).toBe('spatial34_global20_actionSemantics53_v19');
        expect(row.spatialTensor).toHaveLength(34 * 20 * 20);
        expect(row.globalFeatures).toHaveLength(20);
        expect(row.candidateActions.length).toBeGreaterThan(0);
        expect(row.candidateActions.every((candidate) => candidate.semantics.length === 53)).toBe(true);
        expect(row.orderedActionCodes).toEqual(row.candidateActions.map((candidate) => candidate.actionCode));
        expect(row.targetActionIndex).toBeGreaterThanOrEqual(0);
        expect(row.targetActionIndex).toBeLessThan(row.candidateActions.length);
        expect(row.teacher.targetActionCode).toBe(row.orderedActionCodes[row.targetActionIndex]);
        expect(row.policyLossMask).toBe(true);
        expect(row.valueLossMask).toBe(false);
        expect(row.valueTarget).toBeNull();
        expect(canonicalStateJson(state)).toBe(before);
    });

    it('教师分数只在 teacher 字段，不能改变模型输入身份', () => {
        const row = encodeRecoveredState(fixtureState());
        const identity = row.inputIdentity;
        row.teacher.rawScores[0] += 123456;

        expect(row.inputIdentity).toBe(identity);
        expect(JSON.stringify({
            spatialTensor: row.spatialTensor,
            globalFeatures: row.globalFeatures,
            candidateActions: row.candidateActions,
        })).not.toContain('teacherScore');
    });

    it('归档 seed 元数据不同，不改变数值输入、教师状态与标签', () => {
        const left = encodeRecoveredState(fixtureState(11));
        const right = encodeRecoveredState(fixtureState(99));

        expect(right.spatialTensor).toEqual(left.spatialTensor);
        expect(right.globalFeatures).toEqual(left.globalFeatures);
        expect(right.candidateActions.map((item) => ({
            actionCode: item.actionCode,
            actorCoord: item.actorCoord,
            landingCoord: item.landingCoord,
            targetCoord: item.targetCoord,
            semantics: item.semantics,
        }))).toEqual(left.candidateActions.map((item) => ({
            actionCode: item.actionCode,
            actorCoord: item.actorCoord,
            landingCoord: item.landingCoord,
            targetCoord: item.targetCoord,
            semantics: item.semantics,
        })));
        expect(right.inputIdentity).toBe(left.inputIdentity);
        expect(right.teacherStateHash).toBe(left.teacherStateHash);
        expect(right.targetActionIndex).toBe(left.targetActionIndex);
        expect(right.teacher.rawScores).toEqual(left.teacher.rawScores);
    });

    it('终局状态显式失败，不伪造标签', () => {
        const state = fixtureState();
        state.winner = 0;
        expect(() => encodeRecoveredState(state)).toThrow('终局');
    });
});
