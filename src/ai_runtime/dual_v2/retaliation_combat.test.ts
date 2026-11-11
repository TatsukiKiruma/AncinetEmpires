import { expect, it } from 'vitest';
import { createDemoState } from '../../game/demo_map';
import { estimateCounterDamage } from '../../game/rules';
import type { UnitClass, UnitStatus, Unit } from '../../game/types';
import { retaliationCounterDamage } from './retaliation_combat';

it('稀疏双单位输入保持权威反击预测，包括升级、状态附加、反击风暴和远程', () => {
    for (const attackerClass of ['soldier', 'wolf_archer', 'dark_mage', 'dragon', 'commander']) for (const defenderClass of ['soldier', 'golem', 'commander', 'archer']) for (const distance of [1, 2, 3]) for (const hp of [20, 100]) {
        const state = createDemoState(), attacker = { ...state.units[0], unitClass: attackerClass as UnitClass, pos: { x: 0, y: 0 }, exp: 90 }, defender: Unit = { ...state.units[1], unitClass: defenderClass as UnitClass, pos: { x: distance, y: 0 }, hp };
        for (const status of [undefined, { type: 'weakened', remainingTurns: 1 }, { type: 'blinded', remainingTurns: 1 }] as (UnitStatus | undefined)[]) {
            defender.status = status; state.units = [attacker, defender, ...state.units.slice(2)];
            const before = structuredClone(state);
            expect(retaliationCounterDamage(state, attacker, defender)).toBe(estimateCounterDamage(state, attacker.id, defender.id));
            expect(state).toEqual(before);
        }
    }
});
