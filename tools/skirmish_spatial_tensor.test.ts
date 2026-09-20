import { describe, it, expect } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { GameEngine } from '../src/game/engine';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { Action } from '../src/game/types';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
    GLOBAL_FEATURE_DIM,
    GLOBAL_FEATURE_DIM_V1,
    GLOBAL_FEATURE_DIM_V2,
    ACTION_SEMANTIC_DIM,
    ACTION_SEMANTIC_DIM_V1,
    ACTION_SEMANTIC_DIM_V2
} from '../src/game/ai/spatial_tensor_encoder';

describe('Spatial Tensor Encoder (Path B)', () => {
    it('精确提取 24 通道 20x20 空间张量与有效几何掩码', () => {
        const state = createDemoState();
        const encoded = encodeGameStateSpatial(state, 0);

        expect(encoded.spatialTensor.length).toBe(SPATIAL_TENSOR_CHANNELS * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W);
        expect(encoded.globalFeatures.length).toBe(GLOBAL_FEATURE_DIM);
        expect(encoded.mapWidth).toBe(8);
        expect(encoded.mapHeight).toBe(8);

        const H = SPATIAL_TENSOR_MAX_H;
        const W = SPATIAL_TENSOR_MAX_W;
        const getVal = (ch: number, y: number, x: number) =>
            encoded.spatialTensor[ch * (H * W) + y * W + x];

        // 1. 验证 Ch 23 (有效地图格掩码)
        for (let y = 0; y < H; y += 1) {
            for (let x = 0; x < W; x += 1) {
                const mask = getVal(23, y, x);
                if (y < 8 && x < 8) {
                    expect(mask).toBe(1.0);
                } else {
                    expect(mask).toBe(0.0);
                }
            }
        }

        // 2. 验证 Ch 4 (城堡): (0, 0) 为 P0 城堡，(7, 7) 为 P1 城堡
        expect(getVal(4, 0, 0)).toBe(1.0);
        expect(getVal(4, 7, 7)).toBe(1.0);
        expect(getVal(4, 1, 1)).toBe(0.0);

        // 3. 验证 Ch 8 (己方领地) 与 Ch 9 (敌方领地)
        expect(getVal(8, 0, 0)).toBe(1.0); // P0 拥有
        expect(getVal(9, 7, 7)).toBe(1.0); // P1 拥有，对 P0 为敌方

        // 4. 验证己方单位 (0, 0 指挥官, y=0, x=1 士兵)
        expect(getVal(11, 0, 0)).toBe(1.0); // 己方单位存在
        expect(getVal(12, 0, 0)).toBe(1.0); // HP 满血
        expect(getVal(17, 0, 0)).toBe(1.0); // 指挥官标志

        expect(getVal(11, 0, 1)).toBe(1.0); // 士兵 (y=0, x=1)
        expect(getVal(17, 0, 1)).toBe(0.0); // 非指挥官

        // 5. 验证敌方单位 (7, 7 指挥官, y=7, x=6 士兵)
        expect(getVal(18, 7, 7)).toBe(1.0); // 敌方单位存在
        expect(getVal(22, 7, 7)).toBe(1.0); // 敌方指挥官
        expect(getVal(18, 7, 6)).toBe(1.0); // 敌方士兵 (y=7, x=6)
        expect(getVal(22, 7, 6)).toBe(0.0); // 敌方非指挥官

        // 6. 验证全局特征
        expect(encoded.globalFeatures[0]).toBeCloseTo(1 / 50.0); // Turn 1
        expect(encoded.globalFeatures[1]).toBeCloseTo(500 / 1000.0); // P0 Gold
        expect(encoded.globalFeatures[4]).toBeCloseTo(2 / 10.0); // P0 2 units
        expect(encoded.globalFeatures[5]).toBeCloseTo(2 / 10.0); // P1 2 units
        expect(encoded.globalFeatures[11]).toBe(1.0); // 己方指挥官存活
        expect(encoded.globalFeatures[12]).toBe(1.0); // 敌方指挥官存活
    });

    it('准确提取候选动作的空间落点坐标与攻防语义', () => {
        const state = createDemoState();
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);

        expect(actions.length).toBeGreaterThan(0);

        // 查找移动动作
        const moveAction = actions.find(a => a.type === 'move');
        expect(moveAction).toBeDefined();
        if (moveAction && moveAction.type === 'move') {
            const feat = encodeCandidateActionSpatial(state, 0, moveAction);
            expect(feat.actorCoord).not.toBeNull();
            expect(feat.landingCoord).not.toBeNull();
            expect(feat.landingCoord?.x).toBe(moveAction.to.x);
            expect(feat.landingCoord?.y).toBe(moveAction.to.y);
            expect(feat.semantics.length).toBe(ACTION_SEMANTIC_DIM);
            expect(feat.semantics[0]).toBe(1.0); // move type
        }

        // 结束回合动作
        const endTurnAction = actions.find(a => a.type === 'end_turn');
        expect(endTurnAction).toBeDefined();
        if (endTurnAction) {
            const feat = encodeCandidateActionSpatial(state, 0, endTurnAction);
            expect(feat.actorCoord).toBeNull();
            expect(feat.landingCoord).toBeNull();
            expect(feat.targetCoord).toBeNull();
            expect(feat.semantics[13]).toBe(1.0); // end_turn type
        }
    });

    it('V1 vs V2 尺寸与向后兼容性验证', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const encV1 = encodeGameStateSpatial(state, 0, 'v1');
        const encV2 = encodeGameStateSpatial(state, 0, 'v2');

        expect(encV1.globalFeatures.length).toBe(GLOBAL_FEATURE_DIM_V1);
        expect(encV2.globalFeatures.length).toBe(GLOBAL_FEATURE_DIM_V2);

        // V1 与 V2 前 16 维全局特征严格一致
        for (let i = 0; i < 16; i++) {
            expect(encV1.globalFeatures[i]).toBeCloseTo(encV2.globalFeatures[i], 6);
        }

        const act: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 0 } };
        const featV1 = encodeCandidateActionSpatial(state, 0, act, 'v1');
        const featV2 = encodeCandidateActionSpatial(state, 0, act, 'v2');
        expect(featV1.semantics.length).toBe(ACTION_SEMANTIC_DIM_V1);
        expect(featV2.semantics.length).toBe(ACTION_SEMANTIC_DIM_V2);

        // 前 24 维语义严格一致
        for (let i = 0; i < 24; i++) {
            expect(featV1.semantics[i]).toBeCloseTo(featV2.semantics[i], 6);
        }
    });

    it('V2 彻底消除同城堡招募士兵 vs 招募指挥官的候选特征碰撞 (C63 核心验证)', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        // 模拟 P0 指挥官阵亡且拥有 1000 金币
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 1000;
        state.players[0].commanderDeathCount = 1;
        state.players[0].commanderReserveLevel = 2;
        state.players[0].commanderReserveExp = 45;

        const recruitSoldier: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 0 } };
        const recruitCommander: Action = { type: 'recruit_to_castle', unitClass: 'commander', castlePos: { x: 0, y: 0 } };

        // 1. 复现 V1 缺陷：特征完全碰撞！
        const featV1_soldier = encodeCandidateActionSpatial(state, 0, recruitSoldier, 'v1');
        const featV1_commander = encodeCandidateActionSpatial(state, 0, recruitCommander, 'v1');
        let v1_diff = 0;
        for (let i = 0; i < ACTION_SEMANTIC_DIM_V1; i++) {
            v1_diff += Math.abs(featV1_soldier.semantics[i] - featV1_commander.semantics[i]);
        }
        // V1 下两者语义差异为 0 (100% 碰撞缺陷)
        expect(v1_diff).toBe(0);

        // 2. 验证 V2 修复：特征完全分离！
        const featV2_soldier = encodeCandidateActionSpatial(state, 0, recruitSoldier, 'v2');
        const featV2_commander = encodeCandidateActionSpatial(state, 0, recruitCommander, 'v2');
        let v2_diff = 0;
        for (let i = 0; i < ACTION_SEMANTIC_DIM_V2; i++) {
            v2_diff += Math.abs(featV2_soldier.semantics[i] - featV2_commander.semantics[i]);
        }
        // V2 下两者语义具有显著差异
        expect(v2_diff).toBeGreaterThan(1.0);

        // 验证具体语义维度
        expect(featV2_soldier.semantics[25]).toBe(0.0); // isCommanderRecruit = false
        expect(featV2_commander.semantics[25]).toBe(1.0); // isCommanderRecruit = true

        expect(featV2_soldier.semantics[26]).toBeCloseTo(150 / 1000.0); // 士兵费用 150
        expect(featV2_commander.semantics[26]).toBeCloseTo(500 / 1000.0); // 指挥官阵亡1次费用 500

        expect(featV2_soldier.semantics[27]).toBeCloseTo((1000 - 150) / 1000.0); // 剩余金币
        expect(featV2_commander.semantics[27]).toBeCloseTo((1000 - 500) / 1000.0); // 剩余金币

        expect(featV2_commander.semantics[29]).toBeCloseTo(2.0 / 3.0); // reserveLevel 2
        expect(featV2_commander.semantics[30]).toBeCloseTo(45 / 100.0); // reserveExp 45
    });

    it('V2 全局特征准确反映指挥官阵亡计数、恢复价格与城堡占用状态', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        // 初始状态：指挥官存活，deathCount = 0, SD initialGold = 300, base price = 400, gap = 100
        const encInit = encodeGameStateSpatial(state, 0, 'v2');
        expect(encInit.globalFeatures[16]).toBe(0.0); // deathCount = 0
        expect(encInit.globalFeatures[17]).toBeCloseTo(400 / 1000.0); // base price 400
        expect(encInit.globalFeatures[18]).toBeCloseTo(100 / 1000.0); // gold 300 < 400, gap = 100
        expect(encInit.globalFeatures[19]).toBe(0.0); // castle (0,0) occupied by commander, unoccupied = 0

        // 移开指挥官并使金币为 500 (gap = max(0, 400 - 500) = 0)
        state.units[0].pos = { x: 1, y: 1 };
        state.players[0].gold = 500;
        const encVacant = encodeGameStateSpatial(state, 0, 'v2');
        expect(encVacant.globalFeatures[18]).toBe(0.0); // gap = 0
        expect(encVacant.globalFeatures[19]).toBeCloseTo(1 / 5.0); // 1 unoccupied castle!
    });
});
