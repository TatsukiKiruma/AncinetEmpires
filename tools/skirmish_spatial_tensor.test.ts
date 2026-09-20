import { describe, it, expect } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { GameEngine } from '../src/game/engine';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
    GLOBAL_FEATURE_DIM,
    ACTION_SEMANTIC_DIM
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
});
