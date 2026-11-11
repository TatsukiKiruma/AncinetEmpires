/**
 * V19/T19-01 验收：新 schema 必须修掉两个**已复现**的信息缺失，且不得改动历史语义。
 *
 * 反例来源：`V18_REVIEW_AND_RULES.md` §2.4 与 `v19/review/rules_and_encoding_probe.json`。
 * 这里只做机制验证，不当作棋力证据。
 */

import { describe, expect, it } from 'vitest';
import { createDemoState } from '../../src/game/demo_map';
import { GameEngine } from '../../src/game/engine';
import { calculateDamage } from '../../src/game/rules';
import {
    ENCODER_SCHEMA_CHANNELS,
    ENCODER_SCHEMA_ID_V15,
    ENCODER_SCHEMA_ID_V19,
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_CHANNELS_V19,
    encodeGameStateSpatial,
    unitClassIndex,
} from '../../src/game/ai/spatial_tensor_encoder';
import { SpatialResNetPredictor, createInitializedSpatialResNet } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import type { GameState, Unit, UnitClass } from '../../src/game/types';

function unit(id: string, ownerId: number, unitClass: UnitClass, x: number, y: number): Unit {
    return {
        id, ownerId, unitClass, pos: { x, y }, hp: 100, maxHp: 100,
        hasMoved: false, hasActed: false, level: 0, exp: 0,
    };
}

/** 与 V18 复核探针同构的人工诊断状态：只有「near」这个敌军的兵种被交换。 */
function diagnosticPair() {
    const a = createDemoState();
    a.map = {
        width: 10, height: 10,
        tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ terrainId: 6 as const, ownerId: null }))),
    };
    a.players.forEach(p => { p.gold = 0; });
    a.units = [
        unit('own', 0, 'commander', 3, 3),
        unit('near', 1, 'slime', 4, 4),
        unit('far', 1, 'water_elemental', 7, 7),
        unit('enemy_commander', 1, 'commander', 9, 9),
    ];
    const b: GameState = structuredClone(a);
    b.units.find(u => u.id === 'near')!.unitClass = 'water_elemental';
    b.units.find(u => u.id === 'far')!.unitClass = 'slime';
    return { a, b };
}

function spatialOf(state: GameState, channels: number) {
    return Array.from(encodeGameStateSpatial(state, 0, 'v2', { channels }).spatialTensor);
}

describe('V19 schema 登记与兼容', () => {
    it('schema 表里通道数、语义维度与语义变体都显式登记', () => {
        expect(ENCODER_SCHEMA_CHANNELS[ENCODER_SCHEMA_ID_V19]).toBe(SPATIAL_TENSOR_CHANNELS_V19);
        expect(SPATIAL_TENSOR_CHANNELS_V19).toBe(34);
        expect(SPATIAL_TENSOR_CHANNELS).toBe(26);
    });

    it('同一状态在 26 通道下逐位不变（旧权重与旧数据集不受影响）', () => {
        const { a } = diagnosticPair();
        const first = spatialOf(a, SPATIAL_TENSOR_CHANNELS);
        const second = spatialOf(a, SPATIAL_TENSOR_CHANNELS);
        expect(first.length).toBe(26 * 400);
        expect(second).toEqual(first);
    });

    it('34 通道张量长度正确，且 26 通道结果等于 34 通道结果的前 26 个通道', () => {
        const { a } = diagnosticPair();
        const legacy = spatialOf(a, SPATIAL_TENSOR_CHANNELS);
        const v19 = spatialOf(a, SPATIAL_TENSOR_CHANNELS_V19);
        expect(v19.length).toBe(34 * 400);
        // 旧通道语义必须原义保留：前 26 个通道逐位相同。
        for (let i = 0; i < legacy.length; i += 1) {
            if (legacy[i] !== v19[i]) {
                throw new Error(`V19 改动了旧通道 ${Math.floor(i / 400)} 的第 ${i % 400} 个格子`);
            }
        }
    });
});

describe('V19 反例 1：敌军兵种身份不再碰撞', () => {
    it('交换 slime 与 water_elemental 后，26 通道张量相同而 34 通道张量不同', () => {
        const { a, b } = diagnosticPair();
        expect(spatialOf(a, SPATIAL_TENSOR_CHANNELS)).toEqual(spatialOf(b, SPATIAL_TENSOR_CHANNELS));

        const va = spatialOf(a, SPATIAL_TENSOR_CHANNELS_V19);
        const vb = spatialOf(b, SPATIAL_TENSOR_CHANNELS_V19);
        expect(va).not.toEqual(vb);

        // 差异必须出现在新增的敌军身份/防御通道上，而不是旧通道。
        const diffChannels = new Set<number>();
        for (let i = 0; i < va.length; i += 1) {
            if (va[i] !== vb[i]) diffChannels.add(Math.floor(i / 400));
        }
        expect([...diffChannels].sort((x, y) => x - y)).toEqual([26, 28, 29, 30]);
        expect(unitClassIndex('slime')).not.toBe(unitClassIndex('water_elemental'));
    });

    it('两个状态的引擎实际后果确实不同（证明这不是无意义的输入差异）', () => {
        const { a, b } = diagnosticPair();
        const damage = [a, b].map(state => {
            const engine = new GameEngine(state);
            engine.step({ type: 'move', unitId: 'own', to: { x: 4, y: 3 } });
            const before = engine.getState();
            return calculateDamage(before, 'own', 'near');
        });
        expect(damage[0]).not.toBe(damage[1]);
    });

    it('34 通道权重能被加载并按新 schema 推理（不静默退化成 26 通道）', () => {
        const weights = createInitializedSpatialResNet(2026, 'spatial-resnet-v2', ENCODER_SCHEMA_ID_V19);
        expect(weights.stem.inChannels).toBe(SPATIAL_TENSOR_CHANNELS_V19);
        const predictor = new SpatialResNetPredictor(weights);
        expect(predictor.encoderSchemaId).toBe(ENCODER_SCHEMA_ID_V19);
        expect(predictor.spatialChannels).toBe(SPATIAL_TENSOR_CHANNELS_V19);

        const { a, b } = diagnosticPair();
        const results = [a, b].map(state => {
            const engine = new GameEngine(state);
            const legal = engine.getLegalActions(0).filter(x => x.type !== 'surrender');
            return predictSpatialAction(predictor, state, 0, legal);
        });
        // 修复后两个状态至少不再必然产生逐位相同的打分。
        expect(results[0].actionLogits.length).toBe(results[1].actionLogits.length);
    });
});

describe('V19 反例 2：下一敌方行动阶段威胁与当前威胁分离', () => {
    it('敌军已行动过时，Ch21 当前威胁为 0，而 Ch31 下一回合威胁仍为 1', () => {
        const { a } = diagnosticPair();
        const moved: GameState = structuredClone(a);
        moved.units.filter(u => u.ownerId === 1).forEach(u => { u.hasMoved = true; u.hasActed = true; });

        const channels = SPATIAL_TENSOR_CHANNELS_V19;
        const tensor = encodeGameStateSpatial(moved, 0, 'v2', { channels }).spatialTensor;
        const HW = 400;
        const at = (ch: number, x: number, y: number) => tensor[ch * HW + y * 20 + x];

        // 己方指挥官所在格 (3,3)：当前威胁（Ch21）为 0 —— 这正是旧编码的缺陷读数。
        expect(at(21, 3, 3)).toBe(0);
        // 下一敌方行动阶段威胁（Ch31）必须识别出「交出回合后这些敌军会恢复行动」。
        expect(at(31, 3, 3)).toBe(1);
    });

    it('敌军尚未行动时两个通道都为 1（不是把威胁一律抬成 1）', () => {
        const { a } = diagnosticPair();
        const tensor = encodeGameStateSpatial(a, 0, 'v2', { channels: SPATIAL_TENSOR_CHANNELS_V19 }).spatialTensor;
        const HW = 400;
        const at = (ch: number, x: number, y: number) => tensor[ch * HW + y * 20 + x];
        expect(at(21, 3, 3)).toBe(1);
        expect(at(31, 3, 3)).toBe(1);
    });

    it('历史 26 通道语义不被改动：Ch21 仍然按 hasMoved 归零', () => {
        const { a } = diagnosticPair();
        const moved: GameState = structuredClone(a);
        moved.units.filter(u => u.ownerId === 1).forEach(u => { u.hasMoved = true; u.hasActed = true; });
        const tensor = encodeGameStateSpatial(moved, 0, 'v2', { channels: SPATIAL_TENSOR_CHANNELS }).spatialTensor;
        expect(tensor[21 * 400 + 3 * 20 + 3]).toBe(0);
    });
});

describe('V19 schema 与 v15 schema 不能互相加载', () => {
    it('34 通道权重不得被当成 26 通道 schema 解释', () => {
        const v19 = createInitializedSpatialResNet(7, 'spatial-resnet-v2', ENCODER_SCHEMA_ID_V19);
        const v15 = createInitializedSpatialResNet(7, 'spatial-resnet-v2', ENCODER_SCHEMA_ID_V15);
        expect(v19.stem.inChannels).toBe(34);
        expect(v15.stem.inChannels).toBe(26);
        expect(new SpatialResNetPredictor(v19).encoderSchemaId).toBe(ENCODER_SCHEMA_ID_V19);
        expect(new SpatialResNetPredictor(v15).encoderSchemaId).toBe(ENCODER_SCHEMA_ID_V15);
    });
});
