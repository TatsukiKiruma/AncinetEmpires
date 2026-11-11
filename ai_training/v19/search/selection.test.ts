import { describe, expect, it } from 'vitest';
import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';
import {
    selectSearchCandidates,
    tacticalCandidateCodes,
    tacticalScore,
    type SearchPolicyPrediction,
} from './selection';

const attackA: Action = { type: 'attack', attackerId: 'a', targetId: 'enemy' };
const attackB: Action = { type: 'attack', attackerId: 'b', targetId: 'enemy' };
const attackSolo: Action = { type: 'attack', attackerId: 'solo', targetId: 'other-enemy' };
const capture: Action = { type: 'capture', unitId: 'capturer' };
const recruitCastle: Action = {
    type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 1, y: 2 },
};
const recruitDeploy: Action = {
    type: 'recruit_and_deploy', unitClass: 'archer', castlePos: { x: 1, y: 2 }, to: { x: 2, y: 2 },
};
const move: Action = { type: 'move', unitId: 'mover', to: { x: 3, y: 4 } };
const wait: Action = { type: 'wait', unitId: 'waiter' };

function prediction(actions: readonly Action[], logits: readonly number[], bestIndex: number): SearchPolicyPrediction {
    return {
        orderedActionCodes: actions.map(encodeAction),
        actionLogits: logits,
        bestActionCode: encodeAction(actions[bestIndex]),
    };
}

describe('tacticalScore', () => {
    it('己方血量、单位和金币增加时分数单调上升', () => {
        const base = {
            ownCommanderHp: 50,
            enemyCommanderHp: 50,
            ownUnitCount: 3,
            enemyUnitCount: 3,
            ownGold: 100,
            enemyGold: 100,
        };
        expect(tacticalScore({ ...base, ownCommanderHp: 73 }) - tacticalScore(base)).toBe(23);
        expect(tacticalScore({ ...base, ownUnitCount: 4 }) - tacticalScore(base)).toBe(40);
        expect(tacticalScore({ ...base, ownGold: 110 }) - tacticalScore(base)).toBe(1);
        expect(tacticalScore({ ...base, enemyCommanderHp: 73 })).toBeLessThan(tacticalScore(base));
    });
});

describe('tacticalCandidateCodes', () => {
    it('识别两种真实招募动作以及攻击、占城和移动', () => {
        expect(tacticalCandidateCodes([
            wait, recruitCastle, attackA, recruitDeploy, capture, move,
        ])).toEqual([
            encodeAction(recruitCastle),
            encodeAction(attackA),
            encodeAction(recruitDeploy),
            encodeAction(capture),
            encodeAction(move),
        ]);
    });
});

describe('selectSearchCandidates', () => {
    it('不把动作码数组顺序误当成 logit 顺序', () => {
        const actions = [attackA, capture, wait, move];
        const result = selectSearchCandidates(actions, prediction(actions, [-3, 1, 9, 4], 2), {
            policyTopK: 2,
            maxBranchPerLevel: 2,
        });
        expect(result.diagnostics.selectedCodes[0]).toBe(encodeAction(wait));
        expect(result.diagnostics.argmaxCode).toBe(encodeAction(wait));
        expect(result.diagnostics.argmaxRetained).toBe(true);
    });

    it('在单分支紧预算下仍保留真实 argmax，并明确报告裁剪', () => {
        const actions = [attackA, capture, recruitCastle, wait];
        const result = selectSearchCandidates(actions, prediction(actions, [1, 2, 3, 20], 3), {
            policyTopK: 4,
            maxBranchPerLevel: 1,
        });
        expect(result.actions).toEqual([wait]);
        expect(result.diagnostics).toMatchObject({
            selectedCount: 1,
            clippedCount: 3,
            argmaxRetained: true,
            tacticalAvailable: { attack: 1, capture: 1, recruit: 1, move: 0 },
            tacticalSelected: { attack: 0, capture: 0, recruit: 0, move: 0 },
        });
    });

    it('预算允许时保留三类战术代表，并优先同目标的第二次攻击', () => {
        const actions = [wait, attackSolo, attackA, capture, recruitDeploy, attackB, move];
        const result = selectSearchCandidates(actions, prediction(actions, [10, 8, 5, 4, 3, 2, 1], 0), {
            policyTopK: 2,
            maxBranchPerLevel: 5,
        });
        expect(result.diagnostics.selectedCodes).toEqual([
            encodeAction(wait),
            encodeAction(attackA),
            encodeAction(attackB),
            encodeAction(capture),
            encodeAction(recruitDeploy),
        ]);
        expect(result.diagnostics.tacticalSelected).toEqual({ attack: 2, capture: 1, recruit: 1, move: 0 });
        expect(result.diagnostics.clippedCount).toBe(2);
    });

    it('三分支预算先保留 argmax 与完整双攻击组合', () => {
        const actions = [wait, attackSolo, attackA, capture, recruitCastle, attackB];
        const result = selectSearchCandidates(actions, prediction(actions, [10, 9, 5, 4, 3, 2], 0), {
            policyTopK: 3,
            maxBranchPerLevel: 3,
        });
        expect(result.diagnostics.selectedCodes).toEqual([
            encodeAction(wait),
            encodeAction(attackA),
            encodeAction(attackB),
        ]);
        expect(result.diagnostics.argmaxRetained).toBe(true);
    });

    it('同一输入的裁剪结果完全确定', () => {
        const actions = [move, recruitCastle, wait, capture, attackA, recruitDeploy, attackB];
        const pred = prediction(actions, [2, 4, 8, 3, 7, 1, 6], 2);
        const budget = { policyTopK: 3, maxBranchPerLevel: 4 };
        const first = selectSearchCandidates(actions, pred, budget);
        const second = selectSearchCandidates(actions, pred, budget);
        expect(second.diagnostics).toEqual(first.diagnostics);
        expect(second.actions).toEqual(first.actions);
        expect(first.diagnostics.selectedCount + first.diagnostics.clippedCount).toBe(actions.length);
    });
});
