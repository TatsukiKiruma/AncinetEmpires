import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { DualStreamPureAI } from './pure_ai';
import type { DualStreamModel } from './model_runtime';
import { multiplayerLedger } from './multiplayer_leaf';
import { calibrateValue } from './value_calibration';
import { decodeTacticalGroups } from './tactical_prior';
import { DualStreamTurnSearchAI } from './turn_search_ai';

describe('阶段4策略与账本边界', () => {
    it('队列只在完整前态身份和合法动作都相符时使用，外部变化后重新搜索', () => {
        const forward = vi.fn(o => ({ logits: new Float32Array(o.actions.pointers.length / 5), valueProbs: Float32Array.of(.5, .5, 0, 0, 0, 0) }));
        const ai = new DualStreamTurnSearchAI({ forward } as unknown as DualStreamModel);
        const engine = new GameEngine(createDefaultAppGameState()), player = engine.getState().currentPlayer;
        const a = ai.getAction(engine, player); engine.step(a);
        expect(ai.memory.queue.length).toBeGreaterThan(0);
        const calls = forward.mock.calls.length;
        const next = ai.getAction(engine, player); expect(ai.telemetry.queued).toBe(true); expect(forward).toHaveBeenCalledTimes(calls);
        engine.step(next);
        const altered = engine.getState(); altered.players.find(p => p.id === player)!.gold++;
        ai.getAction(new GameEngine(altered), player); expect(ai.telemetry.queued).toBe(false); expect(forward.mock.calls.length).toBeGreaterThan(calls);
    });
    it('移动战术策略只查询权威规则，不克隆或推进引擎', () => {
        const engine = new GameEngine(createDefaultAppGameState()), state = engine.getState();
        const forward = vi.fn(o => ({ logits: new Float32Array(o.actions.pointers.length / 5) }));
        vi.spyOn(engine, 'clone').mockImplementation(() => { throw Error('纯策略不能克隆'); });
        vi.spyOn(engine, 'step').mockImplementation(() => { throw Error('纯策略不能step'); });
        const ai = new DualStreamPureAI({ forward } as unknown as DualStreamModel, { tactical: true });
        expect(ai.getAction(engine, state.currentPlayer).type).not.toBe('end_turn');
        expect(engine.getState()).toEqual(state); expect(forward).toHaveBeenCalledTimes(1);
    });
    it('战斗账本不重复计算金币，己敌损失对称，治疗单列', () => {
        const before = createDefaultAppGameState(), after = structuredClone(before), self = before.currentPlayer;
        after.players[0].gold += 1000;
        expect(multiplayerLedger(before, after, self).net).toBe(0);
        const enemy = before.units.find(u => u.ownerId !== self)!;
        after.units = after.units.filter(u => u.id !== enemy.id);
        const forward = multiplayerLedger(before, after, self), reverse = multiplayerLedger(before, after, enemy.ownerId);
        expect(forward.net).toBeGreaterThan(0); expect(forward.net).toBe(-reverse.net);
        const wounded = structuredClone(before); wounded.units[0].hp = 30;
        const healed = structuredClone(wounded); healed.units[0].hp = 70;
        const l = multiplayerLedger(wounded, healed, healed.units[0].ownerId);
        expect(l.net).toBe(0); expect(l.healingNet).toBeGreaterThan(0);
    });
    it('组解码不因复制低分移动候选而改变最优语义', () => {
        const prior = () => ({ prior: 0, progress: 0, risk: 0, immediate: 0, forbidden: false });
        const one = decodeTacticalGroups([3, 2], Int32Array.of(0, 0, 0, -1, -1, 0, -1, 4, -1, -1), [prior(), prior()]);
        const many = decodeTacticalGroups([3, 2, 1, 1], Int32Array.of(0, 0, 0, -1, -1, 0, -1, 4, -1, -1, 0, 1, 0, -1, -1, 0, 2, 0, -1, -1), [prior(), prior(), prior(), prior()]);
        expect(one.index).toBe(0); expect(many.index).toBe(0);
    });
    it('九桶价值校准清零非活跃槽并保证归一化', () => {
        const config = { buckets: Array.from({ length: 9 }, () => ({ temperature: 1.5, army: 2, income: 1 })) };
        const p = calibrateValue([1, 2, 999, 999, 999, 999], [1, 1, 0, 0, 0, 0], { bucket: 8, army: [3, 1, 0, 0, 0, 0], income: [1, 2, 0, 0, 0, 0] }, config);
        expect([...p.slice(2)]).toEqual([0, 0, 0, 0]); expect(p[0] + p[1]).toBeCloseTo(1, 6);
    });
});
