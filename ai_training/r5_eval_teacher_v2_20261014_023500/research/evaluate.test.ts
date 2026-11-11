import { describe, it, expect } from 'vitest';
import {
    computeStratifiedBootstrapCI,
    computeTrajectoryHash,
    StratifiedClusterSample
} from './statistics';
import { generateRealHandoffOpening } from './openings';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy } from './match_runner';

describe('T07: 评测协议与分层统计单元测试', () => {
    it('1. 轨迹 SHA-256 哈希计算确定且唯一', () => {
        const hash1 = computeTrajectoryHash('init_1', ['move:u1:2,3', 'attack:u1:u2']);
        const hash2 = computeTrajectoryHash('init_1', ['move:u1:2,3', 'attack:u1:u2']);
        const hash3 = computeTrajectoryHash('init_1', ['move:u1:2,3', 'attack:u1:u3']);

        expect(hash1).toBe(hash2);
        expect(hash1).not.toBe(hash3);
        expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('2. 分层 Bootstrap 计算：全胜数据 95% CI 下界收敛于 1.0', () => {
        const samples: StratifiedClusterSample[] = [
            { pairId: 'p1', mapName: 'mapA', openingFamily: '0_handoff', pairScoreA: 1.0 },
            { pairId: 'p2', mapName: 'mapA', openingFamily: '4_handoff', pairScoreA: 1.0 },
            { pairId: 'p3', mapName: 'mapB', openingFamily: '0_handoff', pairScoreA: 1.0 },
            { pairId: 'p4', mapName: 'mapB', openingFamily: '8_handoff', pairScoreA: 1.0 }
        ];

        const ci = computeStratifiedBootstrapCI(samples, 500, 42);
        expect(ci.mean).toBe(1.0);
        expect(ci.ci95Lower).toBe(1.0);
        expect(ci.ci95Upper).toBe(1.0);
        expect(Object.keys(ci.mapBreakdown)).toHaveLength(2);
    });

    it('3. 分层 Bootstrap 计算：混合得分按地图分层抽样稳定', () => {
        const samples: StratifiedClusterSample[] = [
            { pairId: 'p1', mapName: 'mapA', openingFamily: '0_handoff', pairScoreA: 1.0 },
            { pairId: 'p2', mapName: 'mapA', openingFamily: '4_handoff', pairScoreA: 0.5 },
            { pairId: 'p3', mapName: 'mapB', openingFamily: '0_handoff', pairScoreA: 0.0 },
            { pairId: 'p4', mapName: 'mapB', openingFamily: '8_handoff', pairScoreA: 0.5 }
        ];

        const ci = computeStratifiedBootstrapCI(samples, 500, 42);
        expect(ci.mean).toBe(0.5);
        expect(ci.ci95Lower).toBeLessThan(0.5);
        expect(ci.ci95Upper).toBeGreaterThan(0.5);
    });

    it('4. 真实换手开局生成器：4_handoff 确切执行 4 次换手且不静默回退', () => {
        const hAI = new HeuristicAI();
        const policyH: Policy = {
            id: 'test_h',
            chooseAction: (ctx) => {
                const act = hAI.getAction(ctx.engineClone, ctx.observerPlayerId);
                return act ? encodeAction(act) : ctx.candidateCodes[0];
            }
        };

        const res0 = generateRealHandoffOpening('(2) Duel.aem', '0_handoff', policyH, 42);
        expect(res0.actualHandoffs).toBe(0);
        expect(res0.openingActionCodes).toHaveLength(0);

        const res4 = generateRealHandoffOpening('(2) Duel.aem', '4_handoff', policyH, 42);
        expect(res4.actualHandoffs).toBe(4);
        expect(res4.openingActionCodes.length).toBeGreaterThanOrEqual(4); // 真实换手下原子动作数通常远多于 4
        expect(res4.openingStateHash).not.toBe(res4.initialBoardHash);
    });

    it('5. 真实换手开局生成器：非法动作显式抛错，不静默回退', () => {
        const illegalPolicy: Policy = {
            id: 'illegal',
            chooseAction: () => 'illegal_action_code_xyz'
        };

        expect(() => {
            generateRealHandoffOpening('(2) Duel.aem', '4_handoff', illegalPolicy, 42);
        }).toThrow(/Illegal action chosen by baseline policy/);
    });
});
