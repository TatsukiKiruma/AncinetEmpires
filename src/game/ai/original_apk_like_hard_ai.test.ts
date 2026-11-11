import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { createDefaultAppGameState } from '../default_state';
import { encodeAction, mulberry32 } from '../env';
import { OriginalApkLikeHardAI } from './original_apk_like_hard_ai';
import { apkHardTerrainName, buildApkHardSnapshot } from './original_apk_like_hard_snapshot';
import { getAiAction } from './neural_ai_adapter';

function play(seed: number, steps: number) {
    const engine = new GameEngine(createDefaultAppGameState());
    const ais = [0, 1].map(id => new OriginalApkLikeHardAI({ rng: mulberry32(seed + id) }));
    const trace: string[] = [];
    for (let index = 0; index < steps && !engine.isTerminal(); index += 1) {
        const playerId = engine.getState().currentPlayer;
        const legal = engine.getLegalActions(playerId).map(encodeAction);
        const before = JSON.stringify(engine.getState());
        const action = ais[playerId].getAction(engine, playerId);
        expect(JSON.stringify(engine.getState())).toBe(before);
        expect(legal).toContain(encodeAction(action));
        trace.push(encodeAction(action));
        engine.step(action);
    }
    return { trace, ais };
}

describe('Original-APKlikeAI-Hard 补丁 APK 移植', () => {
    it('在项目引擎上连续执行合法动作，不修改输入，固定随机流可复现', () => {
        const first = play(42, 80);
        const second = play(42, 80);
        expect(first.trace).toEqual(second.trace);
        expect(first.ais.reduce((sum, ai) => sum + ai.telemetry.runtimeDecisions, 0)).toBeGreaterThan(0);
        expect(first.ais.reduce((sum, ai) => sum + ai.telemetry.runtimeErrors, 0)).toBe(0);
    }, 30000);

    it('快照将一基坐标、累计经验、队伍编号和指挥官标记转换为 APK 协议', () => {
        const state = createDefaultAppGameState();
        const snapshot = buildApkHardSnapshot(state, state.currentPlayer, 'test-match', true);
        expect(snapshot.map).toEqual({ rows: state.map.height, cols: state.map.width });
        expect(snapshot.teams).toHaveLength(6);
        expect(snapshot.teams[state.currentPlayer].playerType).toBe(3);
        expect(snapshot.units[0].r).toBe(state.units[0].pos.y + 1);
        expect(snapshot.units[0].c).toBe(state.units[0].pos.x + 1);
        expect(snapshot.previousActionAccepted).toBe(true);
        expect(apkHardTerrainName({ terrainId: 9, ownerId: null, apkTerrainId: 36 })).toBe('house');
        expect(apkHardTerrainName({ terrainId: 10, ownerId: 0, apkTerrainId: 37 })).toBe('castle');
    });

    it('水晶按 APK 桥接限制显式使用 Java 困难回退，回退动作仍合法', () => {
        const state = createDefaultAppGameState();
        state.units[0].unitClass = 'crystal';
        const engine = new GameEngine(state);
        const ai = new OriginalApkLikeHardAI({ rng: mulberry32(5) });
        const legal = engine.getLegalActions(state.currentPlayer).map(encodeAction);
        expect(legal).toContain(encodeAction(ai.getAction(engine, state.currentPlayer)));
        expect(ai.telemetry.nativeFallbacks).toBe(1);
        expect(ai.telemetry.lastFallbackReason).toContain('crystal');
    });

    it('通过应用适配器可以选用困难版，且来源与回退信息透明', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const playerId = engine.getState().currentPlayer;
        const result = getAiAction('original_apk_like_hard', engine, playerId, { deadlineMs: 1000 });
        expect(result.status).toBe('OK');
        expect(result.source).toContain('Original-APKlikeAI-Hard');
        expect(engine.getLegalActions(playerId).map(encodeAction)).toContain(encodeAction(result.action));
    });

    it('完整状态签名使跨克隆计划可用，外部更改后重新计算', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const ai = new OriginalApkLikeHardAI({ rng: mulberry32(9) });
        const playerId = engine.getState().currentPlayer;
        engine.step(ai.getAction(engine, playerId));
        const clone = engine.clone();
        clone.getState().players[0].gold += 1;
        const current = clone.getState().currentPlayer;
        const action = ai.getAction(clone, current);
        expect(clone.getLegalActions(current).map(encodeAction)).toContain(encodeAction(action));
        ai.reset();
        expect(ai.telemetry.runtimeDecisions).toBe(0);
    });
});
