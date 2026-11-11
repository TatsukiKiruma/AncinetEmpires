import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { createDefaultAppGameState } from '../default_state';
import { getEffectiveStats } from '../abilities';
import { mulberry32 } from '../env';
import type { GameState, Unit } from '../types';
import { OriginalApkLikeHardNativeAI, apkHardSupportActionScore } from './original_apk_like_hard_native_ai';
import {
    apkAttackScore,
    apkHardAttackDamageScore,
    apkHardDistanceDifference,
    apkHardHasRealAction,
    apkHardMoveDistanceScore,
    apkPositionScore,
    buildApkScoringContext,
} from './original_apk_like_hard_native_scoring';
import {
    apkCombatValue,
    apkPositionScore as ordinaryPositionScore,
    buildApkScoringContext as ordinaryContext,
} from './original_apk_like_scoring';

function fixture(): GameState {
    const state = createDefaultAppGameState();
    state.map = {
        ...state.map,
        width: 7,
        height: 5,
        tiles: Array.from({ length: 5 }, () => Array.from({ length: 7 }, () => ({ terrainId: 1, ownerId: null }))),
    };
    state.currentPlayer = 0;
    state.winner = null;
    state.pendingUnitId = undefined;
    state.units = [];
    state.graves = [];
    return state;
}

function soldier(id: string, ownerId: number, x: number, y: number, extra: Partial<Unit> = {}): Unit {
    return {
        id, ownerId, unitClass: 'soldier', pos: { x, y }, hp: 100, maxHp: 100,
        level: 0, exp: 0, hasActed: false, hasMoved: false, ...extra,
    };
}

describe('补丁困难 AI Java 回退', () => {
    it('真实动作阈值使用绝对生命五十且排除致盲和自治疗', () => {
        const actor = soldier('a', 0, 1, 1);
        const attack = [{ kind: 'ATTACK' as const, moveTo: actor.pos }];
        expect(apkHardHasRealAction({ ...actor, hp: 50 }, attack)).toBe(false);
        expect(apkHardHasRealAction({ ...actor, hp: 51 }, attack)).toBe(true);
        expect(apkHardHasRealAction({ ...actor, status: { type: 'blinded' } }, attack)).toBe(false);
        expect(apkHardHasRealAction(actor, [{ kind: 'HEAL', moveTo: actor.pos, isSelfHeal: true }])).toBe(false);
    });

    it('距离因子按敌方平均距离减盟友平均距离，伤害分只取整一次', () => {
        const state = fixture();
        const actor = soldier('a', 0, 1, 1);
        const target = soldier('b', 1, 4, 1, { hp: 50 });
        state.units = [actor, target];
        const ctx = buildApkScoringContext(state, 0);
        expect(apkHardDistanceDifference(ctx, target.pos)).toBe(-3);
        // 100 × 0.8 × 1.5 × (1 + (5 单位防御 + 5 地形防御) / 100)。
        expect(apkHardAttackDamageScore(ctx, actor, target, 100)).toBe(132);
        expect(apkHardAttackDamageScore(ctx, actor, { ...target, hp: 150 }, 100)).toBe(44);
    });

    it('距离修正只对待机按四格截断，动作候选使用固定一格', () => {
        const state = fixture();
        const actor = soldier('a', 0, 1, 1);
        state.units = [actor, soldier('b', 1, 6, 4)];
        const ctx = buildApkScoringContext(state, 0);
        expect(apkHardMoveDistanceScore(ctx, actor, { kind: 'STANDBY', moveTo: actor.pos })).toBe(37);
        expect(apkHardMoveDistanceScore(ctx, actor, { kind: 'ATTACK', moveTo: actor.pos })).toBe(15);
    });

    it('移除普通版在敌近友远位置的孤军惩罚', () => {
        const state = fixture();
        const actor = soldier('a', 0, 0, 0);
        state.units = [actor, soldier('b', 1, 5, 3)];
        const position = { x: 5, y: 2 };
        const hard = buildApkScoringContext(state, 0);
        const normal = ordinaryContext(state, 0);
        expect(apkPositionScore(hard, actor, position, null, false))
            .toBe(ordinaryPositionScore(normal, actor, position, null, false) + apkCombatValue(normal, actor));
    });

    it('召唤师没有击杀时保留伤害估值，再减去二百分', () => {
        const state = fixture();
        const actor = soldier('witch', 0, 1, 1, { unitClass: 'witch' });
        state.units = [actor, soldier('target', 1, 3, 1)];
        const result = apkAttackScore(buildApkScoringContext(state, 0), actor, actor.pos, state.units[1]);
        expect(result.targetDies).toBe(false);
        expect(result.score).toBeGreaterThan(-1000);
    });

    it('支援评估计算目标重新行动后的分数且不改写真正状态', () => {
        const state = fixture();
        const target = soldier('target', 0, 1, 1, { hasActed: true, hasMoved: true });
        state.units = [target, soldier('enemy', 1, 2, 1, { hp: 20 })];
        const before = JSON.stringify(state);
        const value = apkHardSupportActionScore(buildApkScoringContext(state, 0), target);
        expect(value).toBeGreaterThan(0);
        expect(JSON.stringify(state)).toBe(before);
        expect(getEffectiveStats(target).move).toBe(4);
    });

    it('连续八十步全部通过权威引擎合法动作集合', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const ai = new OriginalApkLikeHardNativeAI({ rng: mulberry32(108) });
        for (let step = 0; step < 80 && !engine.isTerminal(); step += 1) {
            const player = engine.getState().currentPlayer;
            const legal = engine.getLegalActions(player);
            const action = ai.getAction(engine, player);
            expect(legal).toContainEqual(action);
            engine.step(action);
        }
    });
});
