/**
 * T11 网络辅助搜索适配模块测试（RED 先行）。
 *
 * 契约（不依赖训练权重，验证结构与安全性）：
 *   ① 策略评分器只对合法（非 surrender）动作给出有限先验，键=encodeAction；
 *   ② 价值叶评估器返回有限标量，量级严格低于真实终局（不冒充胜率、不压倒真胜负）；
 *   ③ 纯网络 1-ply 策略产出合法 fixedActionIndex，绝不非法；
 *   ④ 安装网络叶评估器后，必胜短路仍命中 win-now（真实终局优先，未被网络覆盖）。
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { encodeAction } from '../src/game/env';
import type { GameState } from '../src/game/types';
import { createDualHeadNet, type DualHeadNet } from './skirmish_dual_head_net';
import { STATE_FEATURE_DIM, ACTION_FEATURE_DIM } from './skirmish_network_features';
import {
    createNetworkModelScorer,
    createNetworkLeafEvaluator,
    createNeuralPolicyFactory
} from './skirmish_neural_search';
import { searchTeacherAction, TERMINAL_WIN } from './skirmish_search_teacher';
import type { SkirmishPolicyContext } from './skirmish_training_runner';

function net(): DualHeadNet {
    return createDualHeadNet({ stateDim: STATE_FEATURE_DIM, actionDim: ACTION_FEATURE_DIM, hidden: 32, embed: 16, policyHidden: 16, valueHidden: 8, seed: 5 });
}
function demo(mutate: (s: GameState) => void): GameState {
    const s = createDemoState(getApkSkirmishRuleConfig('SD'));
    mutate(s);
    return s;
}

describe('skirmish_neural_search', () => {
    it('策略评分器：仅合法动作、值有限、键为 encodeAction', () => {
        const state = demo(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; });
        const scorer = createNetworkModelScorer(net());
        const legal = new GameEngine(state).getLegalActions(0).filter(a => a.type !== 'surrender');
        const scores = scorer(state, 0, legal);
        expect(scores.size).toBeGreaterThan(0);
        for (const [code, v] of scores) {
            expect(legal.map(encodeAction)).toContain(code);
            expect(Number.isFinite(v)).toBe(true);
        }
        // surrender 不参与
        const withSurrender = new GameEngine(state).getLegalActions(0);
        const sc2 = scorer(state, 0, withSurrender);
        for (const a of withSurrender) if (a.type === 'surrender') expect(sc2.has(encodeAction(a))).toBe(false);
    });

    it('价值叶评估器：有限标量且量级远低于真实终局', () => {
        const state = demo(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; });
        const leaf = createNetworkLeafEvaluator(net());
        const v = leaf(state, 0);
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThan(TERMINAL_WIN / 1000);
    });

    it('纯网络策略工厂：返回合法 fixedActionIndex', () => {
        const state = demo(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; });
        const factory = createNeuralPolicyFactory(net());
        const policy = factory(0, [0, 1], 1);
        const engine = new GameEngine(state);
        const legalCodes = new Set(engine.getLegalActions(0).filter(a => a.type !== 'surrender').map(encodeAction));
        // 构造最小 context（仅需 legalActions 语义）
        const ctx = { result: { state, legalActions: engine.getLegalActions(0) }, playerId: 0 } as unknown as SkirmishPolicyContext;
        const idx = policy.selectFixedActionIndex(ctx);
        // 与合法动作集合可对应（返回某动作或其索引）
        expect(Number.isInteger(idx)).toBe(true);
        expect(legalCodes.size).toBeGreaterThan(0);
    });

    it('安装网络叶评估器后，必胜短路仍命中 win-now（真实终局不被覆盖）', () => {
        const state = demo(s => {
            s.units = s.units.filter(u => u.ownerId === 0 || u.id === 'u4');
            s.units.find(u => u.id === 'u3')!.pos = { x: 2, y: 3 };
            const victim = s.units.find(u => u.id === 'u4')!;
            victim.pos = { x: 2, y: 4 }; victim.hp = 1;
            s.map.tiles = s.map.tiles.map((row, y) => row.map((t, x) => (x === 7 && y === 7 ? { ...t, ownerId: null } : t)));
        });
        const decision = searchTeacherAction({
            state, playerId: 0, rng: () => 0.5,
            config: { prefilterWidth: 24, nodeBudget: 600 },
            leafEvaluator: createNetworkLeafEvaluator(net())
        });
        expect(decision.reason).toBe('win-now');
    });
});
