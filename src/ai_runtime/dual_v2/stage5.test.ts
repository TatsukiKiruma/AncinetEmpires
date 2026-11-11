import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { ledgerScore, multiplayerLedger } from './multiplayer_leaf';
import { takeoverDecision, type BranchEvidence } from './takeover_guard';
import { DualStreamTurnSearchAI } from './turn_search_ai';
import type { DualStreamModel } from './model_runtime';

describe('阶段5招募与默认接管回归', () => {
    it('合法满血招募不倒扣，外移新兵增加产能分，受损及阵亡扣留存差额', () => {
        const engine = new GameEngine(createDefaultAppGameState()), before = engine.getState(), self = before.currentPlayer;
        const recruit = engine.getLegalActions(self).find(a => a.type === 'recruit_to_castle' && a.unitClass === 'soldier')!;
        expect(recruit).toBeDefined(); engine.step(recruit);
        const recruited = engine.getState(), ids = new Set(before.units.map(u => u.id));
        const added = recruited.units.find(u => !ids.has(u.id))!;
        expect(multiplayerLedger(before, recruited, self).recruitSurplus).toBe(0);
        const move = engine.getLegalActions(self).find(a => a.type === 'move' && a.unitId === added.id)!;
        expect(move).toBeDefined(); engine.step(move);
        const deployed = engine.getState(), ledger = multiplayerLedger(before, deployed, self);
        expect(ledger.validRecruits).toBe(1); expect(ledgerScore(ledger)).toBeGreaterThanOrEqual(.25);
        const hurt = structuredClone(deployed); hurt.units.find(u => u.id === added.id)!.hp = 20;
        expect(multiplayerLedger(before, hurt, self).recruitSurplus).toBeLessThan(0);
        hurt.units = hurt.units.filter(u => u.id !== added.id);
        expect(multiplayerLedger(before, hurt, self).recruitSurplus).toBeCloseTo(-ledger.recruitCost / 1024);
        // 自动换手收入可能覆盖招募扣费；执行轨迹仍须保留真实支出和新兵身份。
        const income = structuredClone(deployed); income.players.find(p => p.id === self)!.gold += 1000;
        const trace = { cost: ledger.recruitCost, unitIds: [added.id] };
        expect(multiplayerLedger(before, income, self, trace).validRecruits).toBe(1);
        income.units = income.units.filter(u => u.id !== added.id);
        expect(multiplayerLedger(before, income, self, trace).recruitSurplus).toBeCloseTo(-ledger.recruitCost / 1024);
    });
    const evidence = (): BranchEvidence => ({ ledger: multiplayerLedger(createDefaultAppGameState(), createDefaultAppGameState(), 0), score: 0, ledgerScore: 0, health: new Map([['commander', 100]]), lethalActors: 0, supports: 0, complete: true });
    it('和平无事件的价值扰动不能改变默认方向；真实收益须达到接管门槛', () => {
        const p = evidence(), c = evidence(); c.score = 10;
        expect(takeoverDecision(p, c)).toBeNull();
        c.ledgerScore = .19; expect(takeoverDecision(p, c)).toBeNull();
        c.ledgerScore = .20; expect(takeoverDecision(p, c)).toBe('takeover');
        c.score = .34; expect(takeoverDecision(p, c)).toBeNull();
    });
    it('指挥官退化和参战单位致死允许安全备选否决，未完成反扑不能接管', () => {
        const p = evidence(), c = evidence(); p.health.set('commander', 30);
        expect(takeoverDecision(p, c)).toBe('veto');
        c.complete = false; expect(takeoverDecision(p, c)).toBeNull();
        c.complete = true; p.health.set('commander', 100); p.lethalActors = 1;
        expect(takeoverDecision(p, c)).toBe('veto');
        c.health.set('commander', 99); expect(takeoverDecision(p, c)).toBeNull();
    });
    it.each([[3, false, false], [4, false, false], [4, true, false], [4, false, true]])('多人反扑覆盖人数%s、联盟%s、预算耗尽%s且不调用网络', (players, allied, expired) => {
        const state = createDefaultAppGameState();
        state.players.push({ ...state.players[1], id: 2 });
        state.units.push({ ...structuredClone(state.units[1]), id: 'third', ownerId: 2, pos: { x: 3, y: 3 } });
        if (players === 4) {
            state.players.push({ ...state.players[1], id: 3 });
            state.units.push({ ...structuredClone(state.units[1]), id: 'fourth', ownerId: 3, pos: { x: 9, y: 9 } });
        }
        state.rules = { ...state.rules, alliances: { 0: 0, 1: 1, 2: allied ? 0 : 2, 3: allied ? 1 : 3 } };
        const forward = vi.fn(() => { throw Error('反扑禁止神经前向'); });
        const ai = new DualStreamTurnSearchAI({ forward } as unknown as DualStreamModel);
        const probe = ai as unknown as { deadline: number; retaliation: (branch: unknown, self: number, rollout: boolean) => { complete: boolean } };
        probe.deadline = performance.now() + (expired ? -1 : 10000);
        const result = probe.retaliation({ engine: new GameEngine(state), queue: [], actors: [], prior: 0, score: 0 }, state.currentPlayer, true);
        expect(result.complete).toBe(!expired); expect(forward).not.toHaveBeenCalled();
    });
});
