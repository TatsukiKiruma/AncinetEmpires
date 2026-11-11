import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { createAppApkSkirmishGameState, getAppApkSkirmishMapOptions } from '../apk_skirmish_map_assets';
import { getTileTerrainKey } from '../terrain_rules';
import { MODEL_REGISTRY, isValueHeadQualified } from './models/model_registry';
import { CHAMPION_SHA256, createDualV3Stage7K1SearchAI, preloadDualV3ChampionModel } from './dual_v3_champion_adapter';
import { getAiAction } from './neural_ai_adapter';
import { runCancellableAiAction } from './cancellable_ai_runner';
import type { Action } from '../types';

describe('Stage 7 K1 应用正式部署', () => {
    it('注册表绑定正式冠军身份并复用已验证的权重', async () => {
        expect(MODEL_REGISTRY.defaultProductionPolicy).toBe('dual_v3_stage7_k1');
        expect(isValueHeadQualified('dual_v3_stage7_k1')).toBe(true);
        expect(MODEL_REGISTRY.policies.dual_v3_stage7_k1.checkpoint?.sha256).toBe(CHAMPION_SHA256);
        expect(Object.values(MODEL_REGISTRY.policies).filter(entry => entry.isProductionDefault)).toHaveLength(1);
        expect(await preloadDualV3ChampionModel()).toBe(await preloadDualV3ChampionModel());
    });
    for (const players of [2, 3, 4]) {
        it(`${players} 人官方地图同步及可取消入口返回真实合法模型动作`, async () => {
            const map = getAppApkSkirmishMapOptions().find(map => map.playerCount === players)!;
            expect(map).toBeDefined();
            const engine = new GameEngine(createAppApkSkirmishGameState(map.name));
            const playerId = engine.getState().currentPlayer;
            const before = structuredClone(engine.getState());
            const sync = getAiAction('dual_v3_stage7_k1', engine, playerId);
            const asyncResult = await runCancellableAiAction({ policy: 'dual_v3_stage7_k1', engine, playerId });
            for (const result of [sync, asyncResult]) {
                console.log(JSON.stringify({ players, map: map.name, ...result }));
                expect(result.status).toBe('OK');
                expect(result.fallbackUsed).toBe(false);
                expect(result.checkpointSha256).toBe(CHAMPION_SHA256);
                expect(result.encoderVersion).toBe('dual-v2-schema');
                expect(result.deadlineMiss).toBe(false);
                expect(result.action.type).not.toBe('surrender');
                expect(engine.hasLegalAction(playerId, result.action)).toBe(true);
            }
            expect(engine.getState()).toEqual(before);
        }, 15000);
    }
});

describe('Stage 7 K1 禁手过滤与战术占领回归', () => {
    it('在有充足金币可招兵时，绝不输出提前 end_turn', () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Icy Paths.aem'));
        const playerId = engine.getState().currentPlayer;
        const player = engine.getState().players.find(p => p.id === playerId)!;
        player.gold = 1000;
        const ai = createDualV3Stage7K1SearchAI();
        const action = ai.getAction(engine, playerId);
        expect(action.type).not.toBe('end_turn');
        expect(action.type).not.toBe('wait');
    });

    it('在有未行动单位（即使零金币不可招兵）时，绝不输出提前 end_turn', () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Icy Paths.aem'));
        const playerId = engine.getState().currentPlayer;
        const player = engine.getState().players.find(p => p.id === playerId)!;
        player.gold = 0; // 清空金币，禁止招兵
        const ai = createDualV3Stage7K1SearchAI();
        const action = ai.getAction(engine, playerId);
        expect(action.type).not.toBe('end_turn');
        expect(action.type).not.toBe('wait');
        expect(action.type).toBe('move');
    });

    it('单位站在中立或敌方建筑上可 capture 占领时，绝不输出放弃占领的 wait', () => {
        const state = createAppApkSkirmishGameState('(2) Icy Paths.aem');
        const playerId = state.currentPlayer;
        // 将单位移动到中立城镇 (6, 13) 上（模拟移动完成后的捕获状态）
        const unit = state.units.find(u => u.ownerId === playerId)!;
        unit.pos = { x: 6, y: 13 };
        unit.hasMoved = true;
        state.pendingUnitId = unit.id;
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(playerId);
        const captureAction = legal.find(a => a.type === 'capture');
        expect(captureAction).toBeDefined();

        const ai = createDualV3Stage7K1SearchAI();
        const action = ai.getAction(engine, playerId);
        expect(action.type).toBe('capture');
        expect(action.type).not.toBe('wait');
        expect(action.type).not.toBe('end_turn');
    });
});
