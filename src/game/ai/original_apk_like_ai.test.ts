import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { createDefaultAppGameState } from '../default_state';
import { mulberry32 } from '../env';
import { OriginalApkLikeAI } from './original_apk_like_ai';
import { getAiAction } from './neural_ai_adapter';
import {
    apkCombatValue,
    apkPositionValue,
    apkRecruitCap,
    apkUnitTypeId,
    apkUnitValue,
    buildApkScoringContext,
} from './original_apk_like_scoring';

function play(seed: number, maxSteps: number): string[] {
    const engine = new GameEngine(createDefaultAppGameState());
    const ai = new OriginalApkLikeAI({ rng: mulberry32(seed) });
    const trace: string[] = [];
    for (let step = 0; step < maxSteps && !engine.isTerminal(); step += 1) {
        const playerId = engine.getState().currentPlayer;
        const legal = engine.getLegalActions(playerId);
        if (legal.length === 0) break;
        const action = ai.getAction(engine, playerId);
        expect(legal).toContainEqual(action);
        trace.push(JSON.stringify(action));
        engine.step(action);
    }
    return trace;
}

describe('OriginalApkLikeAI（C1275a 源码级移植）', () => {
    it('固定随机流下决策可复现，且每一步都落在合法动作集合内', () => {
        const first = play(42, 80);
        const second = play(42, 80);
        expect(first.length).toBeGreaterThan(0);
        expect(second).toEqual(first);
    });

    it('连续对局不会产生非法动作或异常', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const ai = new OriginalApkLikeAI({ rng: mulberry32(7) });
        for (let step = 0; step < 160 && !engine.isTerminal(); step += 1) {
            const playerId = engine.getState().currentPlayer;
            const legal = engine.getLegalActions(playerId);
            if (legal.length === 0) break;
            const action = ai.getAction(engine, playerId);
            expect(legal).toContainEqual(action);
            const result = engine.step(action);
            expect(result.info).not.toContain('非法动作');
        }
    });

    it('APK 单位价值 / 战斗价值 / 位置价值与源码公式一致', () => {
        const state = createDefaultAppGameState();
        // 默认 Duel 图不一定有士兵；构造一个只含 0 级士兵的确定状态，避免地图差异。
        const template = state.units[0];
        const soldier = {
            ...template,
            id: 'soldier_test',
            ownerId: 0,
            unitClass: 'soldier' as const,
            pos: { x: 0, y: 0 },
            hp: 100,
            maxHp: 100,
            level: 0 as const,
            exp: 0,
            status: undefined,
            apkUnitId: undefined,
            apkStatic: undefined,
            hasMoved: false,
            hasActed: false,
        };
        state.units = [soldier];
        const ctx = buildApkScoringContext(state, 0);
        expect(apkUnitTypeId(soldier)).toBe(0);
        expect(apkUnitValue(ctx, soldier)).toBe(150);
        expect(apkCombatValue(ctx, soldier)).toBe(35);
        // APK m2346h：(move 4 - 2) + maxRange 1 = 3。
        expect(apkPositionValue(soldier)).toBe(3);
    });

    it('策略适配器 original_apk_like 返回合法动作并标注来源', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const playerId = engine.getState().currentPlayer;
        const legal = engine.getLegalActions(playerId);
        const result = getAiAction('original_apk_like', engine, playerId, { deadlineMs: 1000 });
        expect(result.status).toBe('OK');
        expect(result.source).toContain('OriginalApkLikeAI');
        expect(legal).toContainEqual(result.action);
    });

    it('APK 招募上限表与特殊能力顺序保持源码常量', () => {
        const state = createDefaultAppGameState();
        const ctx = buildApkScoringContext(state, 0);
        expect(apkRecruitCap(0, ctx)).toBe(999);
        expect(apkRecruitCap(1, ctx)).toBe(4);
        expect(apkRecruitCap(3, ctx)).toBe(1);
        expect(apkRecruitCap(8, ctx)).toBe(5);
    });
});
