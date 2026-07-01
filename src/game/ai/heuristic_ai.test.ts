import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { createDemoState } from '../demo_map';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { HeuristicAI } from './heuristic_ai';

describe('HeuristicAI', () => {
    it('优先占领可占领地块', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        soldier.pos = { x: 3, y: 1 };
        state.map.tiles[1][3].ownerId = null;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'capture', unitId: 'u3' });
    });

    it('优先攻击可击杀目标', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const attacker = state.units.find(unit => unit.id === 'u3')!;
        const defender = state.units.find(unit => unit.id === 'u4')!;
        attacker.pos = { x: 2, y: 2 };
        defender.pos = { x: 2, y: 3 };
        defender.hp = 5;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'attack', attackerId: 'u3', targetId: 'u4' });
    });

    it('没有己方指挥官且仍有敌方城堡时优先补指挥官', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.units = state.units.filter(unit => unit.id !== 'u1');
        state.players.find(player => player.id === 0)!.gold = 500;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'recruit_to_castle', unitClass: 'commander', castlePos: { x: 0, y: 0 } });
    });

    it('指挥官阵亡且钱不够时先攒钱', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.units = state.units.filter(unit => unit.id !== 'u1');
        state.players.find(player => player.id === 0)!.gold = 300;
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'end_turn' });
    });

    it('已有低价兵且金币充足时优先招募高级兵', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 2000;
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });

        for (let index = 0; index < 4; index += 1) {
            state.units.push({
                id: `extra_${index}`,
                ownerId: 0,
                unitClass: 'soldier',
                pos: { x: 1 + (index % 4), y: 1 + Math.floor(index / 4) },
                hp: 100,
                maxHp: 100,
                hasMoved: true,
                hasActed: true
            });
        }

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toMatchObject({ type: 'recruit_and_deploy', unitClass: 'dragon', castlePos: { x: 0, y: 0 } });
    });

    it('敌方指挥官下回合可到己方空城堡时优先移动占位', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.units = state.units.filter(unit => unit.id !== 'u1');
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units.find(unit => unit.id === 'u2')!.pos = { x: 3, y: 0 };
        state.units.find(unit => unit.id === 'u3')!.pos = { x: 1, y: 1 };

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'move', unitId: 'u3', to: { x: 0, y: 0 } });
    });

    it('敌方指挥官下回合可到己方空城堡且无人可移动时优先招募占位', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.units = state.units.filter(unit => unit.id !== 'u1');
        state.players.find(player => player.id === 0)!.gold = 150;
        state.units.find(unit => unit.id === 'u2')!.pos = { x: 3, y: 0 };
        state.units.find(unit => unit.id === 'u3')!.pos = { x: 1, y: 1 };
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 0 } });
    });
});
