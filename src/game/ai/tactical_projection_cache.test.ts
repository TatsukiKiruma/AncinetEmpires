import { describe, expect, it, vi } from 'vitest';
import { createDemoState } from '../demo_map';
import { calculateDamage } from '../rules';
import type { GameState, Position, Unit } from '../types';
import { RuleTacticalEvaluator } from './tactical_evaluation';

type ProjectionProbe = { estimateDamageAt(attacker: Unit, attackerPos: Position, defender: Unit, defenderPos: Position): number; damageProjection?: GameState };

/** 保留原逐次JSON复制的公式，用来校验投影复用不会泄漏上一轮位置或虚拟单位。 */
function original(state: GameState, attacker: Unit, attackerPos: Position, defender: Unit, defenderPos: Position) {
    const clone = JSON.parse(JSON.stringify(state)) as GameState;
    const source = clone.units.find(u => u.id === attacker.id); let target = clone.units.find(u => u.id === defender.id);
    if (!source) return 0;
    if (!target) { target = { ...defender }; clone.units.push(target); }
    source.pos = { ...attackerPos }; target.pos = { ...defenderPos };
    return calculateDamage(clone, source.id, target.id);
}

describe('战术伤害投影复用', () => {
    it('交错真实、虚拟与同一单位投影后仍等同原JSON实现，且原态不变', () => {
        const state = createDemoState(), before = JSON.stringify(state), evaluator = new RuleTacticalEvaluator(state, state.currentPlayer) as unknown as ProjectionProbe;
        const attacker = state.units[0], defender = state.units[1], virtual = { ...defender, id: '__virtual_recruit__' };
        for (let i = 0; i < 12; i++) {
            const target = [defender, virtual, attacker][i % 3];
            const from = { x: i % state.map.width, y: 0 }, to = { x: (i + 1) % state.map.width, y: 1 };
            expect(evaluator.estimateDamageAt(attacker, from, target, to)).toBe(original(state, attacker, from, target, to));
            expect(JSON.stringify(state)).toBe(before);
            expect(JSON.stringify(evaluator.damageProjection)).toBe(before);
        }
        expect(evaluator.estimateDamageAt({ ...attacker, id: '不存在' }, attacker.pos, defender, defender.pos)).toBe(0);
    });

    it('一轮只复制一次基础状态，新的评分器重新建立隔离投影', () => {
        const state = createDemoState(), first = new RuleTacticalEvaluator(state, state.currentPlayer) as unknown as ProjectionProbe;
        const spy = vi.spyOn(JSON, 'stringify');
        try {
            for (let i = 0; i < 4; i++) first.estimateDamageAt(state.units[0], state.units[0].pos, state.units[1], state.units[1].pos);
            expect(spy.mock.calls.filter(args => args[0] === state)).toHaveLength(1);
            const second = new RuleTacticalEvaluator(state, state.currentPlayer) as unknown as ProjectionProbe;
            second.estimateDamageAt(state.units[0], state.units[0].pos, state.units[1], state.units[1].pos);
            expect(spy.mock.calls.filter(args => args[0] === state)).toHaveLength(2);
            expect(first.damageProjection).not.toBe(second.damageProjection);
        } finally { spy.mockRestore(); }
    });
});
