import { describe, expect, it } from 'vitest';
import type { Action, GameState, Unit } from '../../src/game/types';
import {
    ENDGAME_TURN_MIN,
    categoryPriority,
    identifyWindowFeatures,
    targetCategoryForFamily,
} from './window_features';

function unit(id: string, ownerId: number, unitClass: Unit['unitClass'], hp = 100, maxHp = 100): Unit {
    return {
        id,
        ownerId,
        unitClass,
        pos: { x: ownerId, y: 0 },
        hp,
        maxHp,
        hasMoved: false,
        hasActed: false,
    };
}

function state(units: Unit[], turn = 1): GameState {
    return {
        turn,
        currentPlayer: 0,
        map: { width: 2, height: 1, tiles: [[]] },
        units,
        players: [
            { id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        winner: null,
    };
}

describe('窗口特征识别', () => {
    it('识别同目标双攻击，并要求攻击者不同', () => {
        const root = state([unit('a', 0, 'soldier'), unit('b', 0, 'archer'), unit('t', 1, 'soldier')]);
        const actions: Action[] = [
            { type: 'attack', attackerId: 'a', targetId: 't' },
            { type: 'attack', attackerId: 'b', targetId: 't' },
        ];
        const features = identifyWindowFeatures(root, actions);
        expect(features.hasAttackCombo).toBe(true);
        expect(features.multiAttackerTargetCount).toBe(1);
        expect(features.categories).toContain('attack_combo');
    });

    it('同时识别两种真实招募动作与占城', () => {
        const root = state([unit('a', 0, 'soldier')]);
        const actions: Action[] = [
            { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 0 } },
            {
                type: 'recruit_and_deploy',
                unitClass: 'archer',
                castlePos: { x: 0, y: 0 },
                to: { x: 1, y: 0 },
            },
            { type: 'capture', unitId: 'a' },
        ];
        const features = identifyWindowFeatures(root, actions);
        expect(features.recruitToCastleCount).toBe(1);
        expect(features.recruitAndDeployCount).toBe(1);
        expect(features.captureCount).toBe(1);
        expect(features.hasEconomy).toBe(true);
    });

    it('按即时攻击保守识别指挥官风险', () => {
        const root = state([unit('a', 0, 'soldier'), unit('commander', 1, 'commander')]);
        const actions: Action[] = [
            { type: 'attack', attackerId: 'a', targetId: 'commander' },
            { type: 'wait', unitId: 'a' },
        ];
        const features = identifyWindowFeatures(root, actions);
        expect(features.hasCommanderRisk).toBe(true);
        expect(features.commanderAttackCount).toBe(1);
    });

    it('公开区分普通与第20回合收官状态', () => {
        const actions: Action[] = [
            { type: 'wait', unitId: 'a' },
            { type: 'end_turn' },
        ];
        const ordinary = identifyWindowFeatures(state([unit('a', 0, 'soldier')], ENDGAME_TURN_MIN - 1), actions);
        const endgame = identifyWindowFeatures(state([unit('a', 0, 'soldier')], ENDGAME_TURN_MIN), actions);
        expect(ordinary.isOrdinary).toBe(true);
        expect(ordinary.isEndgame).toBe(false);
        expect(endgame.isOrdinary).toBe(false);
        expect(endgame.isEndgame).toBe(true);
    });

    it('每组四家族目标及 fallback 顺序固定，并显式保留普通槽', () => {
        const targets = Array.from({ length: 5 }, (_, mapIndex) =>
            Array.from({ length: 8 }, (_, s) => targetCategoryForFamily(s, mapIndex)),
        ).flat();
        for (const inGroup of [(index: number) => index % 8 < 4, (index: number) => index % 8 >= 4]) {
            expect(targets.filter((target, index) => inGroup(index) && target === 'attack_combo')).toHaveLength(5);
            expect(targets.filter((target, index) => inGroup(index) && target === 'commander_risk')).toHaveLength(5);
            expect(targets.filter((target, index) => inGroup(index) && target === 'economy')).toHaveLength(5);
            expect(targets.filter((target, index) => inGroup(index) && target === 'endgame')).toHaveLength(3);
            expect(targets.filter((target, index) => inGroup(index) && target === 'ordinary')).toHaveLength(2);
        }
        expect(targetCategoryForFamily(3, 1)).toBe('ordinary');
        expect(targetCategoryForFamily(7, 3)).toBe('ordinary');
        expect(categoryPriority('endgame')).toEqual([
            'endgame', 'ordinary', 'economy', 'attack_combo', 'commander_risk',
        ]);
        expect(categoryPriority('ordinary')).toEqual([
            'ordinary', 'endgame', 'economy', 'attack_combo', 'commander_risk',
        ]);
    });
});
