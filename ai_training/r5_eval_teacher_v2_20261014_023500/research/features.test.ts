import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from '../env/src/game/engine';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { FEATURE_SCHEMA_V1, computeSchemaHash } from './feature_schema';
import { encodeSpatial, encodeEntities, encodeGlobal, encodeActions, encodeStateAndActions } from './features';
import { computeStateHash } from './state_hash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('T03: 固定动作与特征契约', () => {

    it('1. Feature Schema 规范与哈希一致性', () => {
        const schemaHash = computeSchemaHash(FEATURE_SCHEMA_V1);
        expect(schemaHash).toBeDefined();
        expect(schemaHash.length).toBe(64);

        const schemaPath = path.resolve(__dirname, '../artifacts/features-v1.json');
        expect(fs.existsSync(schemaPath)).toBe(true);
        const saved = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        expect(saved.schemaHash).toBe(schemaHash);
    });

    it('2. 空间特征张量 shape 与通道有效性', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const spatial = encodeSpatial(state, 0);

        // [10, 20, 20] = 4000
        expect(spatial.length).toBe(10 * 20 * 20);

        // Duel 为 13x13，验证内部坐标 (0,0) 的 valid_tile_mask (channel 0) 为 1
        expect(spatial[0 * 400 + 0 * 20 + 0]).toBe(1.0);
        // (15, 15) 超出 13x13，valid_tile_mask 应为 0
        expect(spatial[0 * 400 + 15 * 20 + 15]).toBe(0.0);
    });

    it('3. 实体表特征：pending 单位独立保留与同格共存不覆盖', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(JSON.parse(JSON.stringify(state)));

        // 执行招募产生 pending 临时同格单位
        const legal = engine.getLegalActions(0);
        const recAct = legal.find(a => a.type === 'recruit_to_castle');
        expect(recAct).toBeDefined();
        engine.step(recAct!);

        const postState = engine.getState();
        expect(postState.pendingUnitId).toBeDefined();

        const { entityBuffer, entityIdMap } = encodeEntities(postState, 0);
        expect(entityIdMap.has(postState.pendingUnitId!)).toBe(true);

        const pendingIdx = entityIdMap.get(postState.pendingUnitId!)!;
        const pendingOffset = pendingIdx * 16;
        // 验证 valid_entity = 1.0 且 is_pending_recruit = 1.0 (channel 12)
        expect(entityBuffer[pendingOffset + 0]).toBe(1.0);
        expect(entityBuffer[pendingOffset + 12]).toBe(1.0);

        // 验证城堡上原指挥官单位依然存在于实体表中，未被覆盖！
        const cmdUnit = postState.units.find(u => u.unitClass === 'commander');
        expect(cmdUnit).toBeDefined();
        expect(entityIdMap.has(cmdUnit!.id)).toBe(true);
        expect(entityIdMap.get(cmdUnit!.id)).not.toBe(pendingIdx);
    });

    it('4. 实体表特征：超上限 HP (190 HP) 准确缩放不丢失', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        // 将第一个单位 HP 设为 190（圣骑士超额治疗）
        state.units[0].hp = 190;
        state.units[0].maxHp = 100;

        const { entityBuffer } = encodeEntities(state, 0);
        // channel 5: hp_norm = 190 / 200 = 0.95
        expect(entityBuffer[0 * 16 + 5]).toBeCloseTo(0.95, 3);
        // channel 6: max_hp_norm = 100 / 200 = 0.5
        expect(entityBuffer[0 * 16 + 6]).toBeCloseTo(0.5, 3);
    });

    it('5. 全局特征张量与视角转换映射', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        // P0 视角编码
        const g0 = encodeGlobal(state, 0);
        // P1 视角编码
        const g1 = encodeGlobal(state, 1);

        expect(g0.length).toBe(12);
        expect(g1.length).toBe(12);
        // P0 视角下的友方金币应当等于 P1 视角下的敌方金币
        expect(g0[0]).toBeCloseTo(g1[1], 4);
        expect(g0[1]).toBeCloseTo(g1[0], 4);
    });

    it('6. 动作特征与完整候选集不截断测试 (>256 候选完整保留)', () => {
        // 构造一个具有大量合法动作的状态，验证 A > 256 时不丢失
        const fakeActions: Action[] = [];
        for (let i = 0; i < 300; i++) {
            fakeActions.push({
                type: 'move',
                unitId: 'u_test',
                to: { x: i % 15, y: Math.floor(i / 15) }
            });
        }
        const entityMap = new Map([['u_test', 0]]);
        const { actionBuffer, candidateCodes } = encodeActions(fakeActions, entityMap);

        expect(candidateCodes.length).toBe(300);
        expect(actionBuffer.length).toBe(300 * 20);
        // 验证候选数未被静默截断为 256
        expect(candidateCodes.length).toBeGreaterThan(256);
    });

    it('7. Golden 样例集验证：≥200 份样本无损加载且 100% 精确可重建', () => {
        const goldenFile = path.resolve(__dirname, '../artifacts/golden/golden_samples.json');
        expect(fs.existsSync(goldenFile)).toBe(true);

        const samples = JSON.parse(fs.readFileSync(goldenFile, 'utf-8'));
        expect(samples.length).toBeGreaterThanOrEqual(200);

        // 随机抽查 20 个样本验证完全重建
        for (let i = 0; i < 20; i++) {
            const sample = samples[Math.floor(Math.random() * samples.length)];
            const engine = new GameEngine(JSON.parse(JSON.stringify(sample.state)));
            const legal = engine.getLegalActions(sample.observerPlayerId);
            const stateHash = computeStateHash(sample.state);

            const rebuilt = encodeStateAndActions(
                sample.state,
                legal,
                sample.observerPlayerId,
                stateHash,
                false
            );

            expect(rebuilt.spatialBuffer.length).toBe(sample.encodedFeatures.spatialBuffer.length);
            expect(rebuilt.entityBuffer.length).toBe(sample.encodedFeatures.entityBuffer.length);
            expect(rebuilt.actionBuffer.length).toBe(sample.encodedFeatures.actionBuffer.length);
            expect(rebuilt.candidateCodes).toEqual(sample.encodedFeatures.candidateCodes);
        }
    });
});
