import { describe, it, expect } from 'vitest';
import { createDemoState } from '../demo_map';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { explainCommanderRecruitment } from './commander_diagnostics';
import { GameEngine } from '../engine';

describe('explainCommanderRecruitment', () => {
    it('correctly diagnoses bare demo state without SD rules (MODE_DISABLED)', () => {
        const state = createDemoState(); // no rules -> commanderRecruitBaseCost is null
        // Kill commander of P0
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 1000;

        const explanation = explainCommanderRecruitment(state, 0);
        expect(explanation.reasons).toContain('MODE_DISABLED');
        expect(explanation.commanderRecruitPrice).toBeNull();
        expect(explanation.canRecruitByRule).toBe(false);
    });

    it('correctly diagnoses SD state when commander died and gold is sufficient', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        // P0 commander killed
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 500; // price is 400 + 100 * 1 = 500

        const explanation = explainCommanderRecruitment(state, 0);
        expect(explanation.commanderRecruitPrice).toBe(500);
        expect(explanation.canRecruitByRule).toBe(true);
        expect(explanation.reasons).toEqual([]);
        expect(explanation.legalCommanderActionCodes.length).toBeGreaterThan(0);
    });

    it('correctly diagnoses castle occupied by friendly soldier', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 600;
        // Place soldier on castle (0,0)
        state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!.pos = { x: 0, y: 0 };

        const explanation = explainCommanderRecruitment(state, 0);
        expect(explanation.reasons).toContain('CASTLE_OCCUPIED');
        expect(explanation.canRecruitByRule).toBe(false);
    });

    it('correctly diagnoses insufficient gold', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 499; // 1 less than 500

        const explanation = explainCommanderRecruitment(state, 0);
        expect(explanation.reasons).toContain('INSUFFICIENT_GOLD');
        expect(explanation.goldGap).toBe(1);
        expect(explanation.canRecruitByRule).toBe(false);
    });
});
