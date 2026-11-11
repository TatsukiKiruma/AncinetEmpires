import { describe, expect, it } from 'vitest';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { estimateCounterDamage } from '../rules';
import { ATTACK_EXP, projectExpOutcome } from '../abilities';
import type { UnitClass } from '../types';

function freezeDeep(value: object) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') freezeDeep(child);
    Object.freeze(value);
}

describe('反击投影的局部复制与权威结算一致', () => {
    it.each<[UnitClass, number]>([['soldier', 1], ['wolf_archer', 1], ['dark_mage', 1], ['catapult', 3]])('%s保留升级、致盲和远程反击边界，且不修改共享状态', (unitClass, distance) => {
        const state = createDemoState();
        const attacker = { ...state.units[2], unitClass, pos: { x: 0, y: 1 }, hp: 65, exp: 90, level: 0 as const };
        const defender = { ...state.units[3], pos: { x: distance, y: 1 } };
        state.units = [attacker, defender, { ...state.units[0], pos: { x: 0, y: 0 } }, state.units[1]];
        const engine = new GameEngine(state, { applyInitialTurnStart: false });
        const before = engine.getState(), serialized = JSON.stringify(before);
        freezeDeep(before);
        const predicted = estimateCounterDamage(before, attacker.id, defender.id);
        expect(JSON.stringify(before)).toBe(serialized);
        const hpAfterExperience = projectExpOutcome(attacker, ATTACK_EXP, 3)?.hp ?? attacker.hp;
        const action = { type: 'attack' as const, attackerId: attacker.id, targetId: defender.id };
        expect(engine.hasLegalAction(0, action)).toBe(true);
        engine.step(action);
        const actual = engine.getState().units.find(u => u.id === attacker.id)!;
        expect(actual.hp).toBe(hpAfterExperience - predicted);
        if (unitClass === 'wolf_archer' || unitClass === 'dark_mage' || distance > 1) expect(predicted).toBe(0);
    });
});
