import { describe, expect, it } from 'vitest';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';

describe('skirmish candidate sampling', () => {
    const scoredActions = [
        { actionCode: 'move:u1:1,1', teacherScore: 99 },
        { actionCode: 'move:u1:1,2', teacherScore: 98 },
        { actionCode: 'wait:u1', teacherScore: 1 },
        { actionCode: 'attack:u1:u2', teacherScore: 80 },
        { actionCode: 'capture:u1', teacherScore: 70 },
        { actionCode: 'end_turn', teacherScore: 0 }
    ];

    it('始终保留标签，并混合 hard negative 与动作类型分层候选', () => {
        const selected = selectStratifiedHardNegativeCandidates(
            scoredActions,
            'wait:u1',
            {
                maxCandidates: 4,
                hardNegativeRatio: 1 / 3,
                deterministicKey: 'episode-1:step-2'
            }
        );

        expect(selected).toHaveLength(4);
        // R04 修复后候选按规范序输出，标签不再固定首位；只断言标签被保留且理由正确
        expect(selected).toContainEqual(expect.objectContaining({
            actionCode: 'wait:u1',
            selectionReason: 'label'
        }));
        expect(selected).toContainEqual(expect.objectContaining({
            actionCode: 'move:u1:1,1',
            selectionReason: 'hard_negative',
            teacherRank: 1
        }));
        expect(new Set(selected.map(item => item.actionCode.split(':')[0])).size).toBeGreaterThanOrEqual(3);
    });

    it('候选数不限时保留全部动作及教师排名', () => {
        const selected = selectStratifiedHardNegativeCandidates(
            scoredActions,
            'wait:u1',
            { maxCandidates: null }
        );

        expect(selected).toHaveLength(scoredActions.length);
        expect(selected.find(item => item.actionCode === 'move:u1:1,1')?.teacherRank).toBe(1);
        expect(selected.find(item => item.actionCode === 'wait:u1')?.teacherRank).toBe(5);
    });

    it('日志标签不在合法候选中时拒绝生成样本', () => {
        expect(selectStratifiedHardNegativeCandidates(
            scoredActions,
            'heal:missing:target',
            { maxCandidates: 4 }
        )).toEqual([]);
    });
});
