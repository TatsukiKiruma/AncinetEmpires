import { describe, expect, it } from 'vitest';
import { createDefaultAppGameState } from '../default_state';
import { getAllianceId, getCommanderUnit, getRuleConfig, getTeamRuleConfig, isCommanderUnit, isTeamEnabled } from '../rule_config';

describe('规则字段热路径与完整解析一致', () => {
    it('配置缺省、覆盖和脚本原位修改均立即生效', () => {
        const state = createDefaultAppGameState();
        for (let i = 0; i < 100; i++) {
            state.rules = { alliances: { 0: i % 3, 1: (i + 1) % 3 }, disabledTeams: i % 2 ? [1] : [],
                commanderUnitIds: i % 2 ? { 0: state.units[0].id } : {}, teams: { 0: { populationLimit: i } } };
            const parsed = getRuleConfig(state);
            for (const player of state.players) {
                expect(getAllianceId(state, player.id)).toBe(parsed.alliances[player.id] ?? player.id);
                expect(isTeamEnabled(state, player.id)).toBe(!parsed.disabledTeams.includes(player.id));
                expect(getTeamRuleConfig(state, player.id)).toEqual(parsed.teams[player.id] ?? {});
                const id = parsed.commanderUnitIds[player.id];
                const expected = state.units.find(u => u.ownerId === player.id && u.hp > 0 && (id !== undefined ? u.id === id : u.unitClass === 'commander')) ?? null;
                expect(getCommanderUnit(state, player.id)).toEqual(expected);
                for (const unit of state.units) expect(isCommanderUnit(state, unit, player.id)).toBe(unit.ownerId === player.id && (id !== undefined ? unit.id === id : unit.unitClass === 'commander'));
            }
            state.rules.alliances![0] = 99;
            expect(getAllianceId(state, 0)).toBe(99);
        }
        delete state.rules;
        expect(getAllianceId(state, 1)).toBe(1);
        expect(isTeamEnabled(state, 1)).toBe(true);
    });
});
