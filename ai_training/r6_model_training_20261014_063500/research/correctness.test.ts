import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { computeGameplayStateKey, computeStateHash } from './state_hash';
import { encodeEntities } from './features';
import { selectRootCandidates } from './candidate_selector';
import { DeterministicPRNG } from './prng';

describe('R6 正确性与回归测试', () => {
    it('1. 状态恢复与 clone 绝不重复发放首次收入', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const initialGoldP0 = state.players[0].gold;
        const initialGoldP1 = state.players[1].gold;

        // 恢复状态并创建引擎
        const engine = new GameEngine(state);
        const engineState = engine.getState();

        expect(engineState.players[0].gold).toBe(initialGoldP0);
        expect(engineState.players[1].gold).toBe(initialGoldP1);

        // 克隆引擎
        const cloned = engine.clone();
        expect(cloned.getState().players[0].gold).toBe(initialGoldP0);
        expect(cloned.getState().players[1].gold).toBe(initialGoldP1);
    });

    it('2. 重复状态检测能敏感感知金币与所有权变化 (修复漏字段缺陷)', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const key1 = computeGameplayStateKey(state);

        // 改变金币
        const stateGoldModified = JSON.parse(JSON.stringify(state));
        stateGoldModified.players[0].gold += 50;
        const key2 = computeGameplayStateKey(stateGoldModified);

        expect(key1).not.toBe(key2);

        // 改变建筑归属
        const stateOwnerModified = JSON.parse(JSON.stringify(state));
        stateOwnerModified.map.tiles[0][0].ownerId = 1;
        const key3 = computeGameplayStateKey(stateOwnerModified);

        expect(key1).not.toBe(key3);
    });

    it('3. 实体容量溢出保护：超过 64 单位显式抛错，绝不静默丢弃', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        
        // 构造 65 个单位
        const fakeUnits = [];
        for (let i = 0; i < 65; i++) {
            fakeUnits.push({
                id: `u_${i}`,
                playerId: 0,
                ownerId: 0,
                unitClass: 'soldier',
                pos: { x: i % 10, y: Math.floor(i / 10) },
                hp: 100,
                maxHp: 100,
                level: 0,
                exp: 0,
                hasActed: false,
                hasMoved: false
            });
        }
        const overflowState = { ...state, units: fakeUnits as any };

        expect(() => {
            encodeEntities(overflowState, 0);
        }).toThrow(/EntityOverflowError/);
    });

    it('4. 探索配额在 K=3 与 K=4 时真正分配探索槽位 (修复向下取整为 0 缺陷)', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(0);

        // 测试 K=4
        const resK4 = selectRootCandidates(engine, 0, legalActions, {
            targetK: 4,
            nonTopPriorFraction: 0.20,
            seed: 42
        });
        expect(resK4.explorationSlotsAllocated).toBeGreaterThanOrEqual(1);

        // 测试 K=3
        const resK3 = selectRootCandidates(engine, 0, legalActions, {
            targetK: 3,
            nonTopPriorFraction: 0.20,
            seed: 42
        });
        expect(resK3.explorationSlotsAllocated).toBeGreaterThanOrEqual(1);
    });

    it('5. 纯净 PRNG 支持精确序列化与恢复重放', () => {
        const prng1 = new DeterministicPRNG(12345);
        const r1 = prng1.next();
        const savedState = prng1.getState();
        const r2 = prng1.next();
        const r3 = prng1.next();

        // 用 savedState 恢复
        const prng2 = new DeterministicPRNG(0);
        prng2.setState(savedState);
        expect(prng2.next()).toBe(r2);
        expect(prng2.next()).toBe(r3);
    });
});
