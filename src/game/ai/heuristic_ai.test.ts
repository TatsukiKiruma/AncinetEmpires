import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { createDemoState } from '../demo_map';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { HeuristicAI } from './heuristic_ai';
import type { Tile } from '../terrain';
import type { Action, GameState, UnitClass } from '../types';

const highTierRecruitClasses: UnitClass[] = ['elf', 'berserker', 'wolf', 'golem', 'ice_elemental', 'druid', 'catapult', 'wolf_archer', 'dragon'];
const earlyRoleRecruitClasses: UnitClass[] = ['archer', 'dark_mage', 'witch', 'paladin', 'elf'];
const magicCounterRecruitClasses: UnitClass[] = ['dark_mage', 'witch', 'elf', 'ice_elemental', 'dragon'];
const dragonCounterRecruitClasses: UnitClass[] = ['archer', 'mermaid', 'wolf_archer'];
const undeadCounterRecruitClasses: UnitClass[] = ['paladin', 'elf'];
const waterMapRecruitClasses: UnitClass[] = ['mermaid', 'water_elemental', 'ice_elemental', 'elf', 'dragon'];

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function expectRecruitUnitClass(action: Action, expectedClasses: readonly UnitClass[]) {
    if (action.type !== 'recruit_to_castle' && action.type !== 'recruit_and_deploy') {
        throw new Error(`预期招募动作，实际为 ${action.type}`);
    }
    expect(expectedClasses).toContain(action.unitClass);
}

function createBridgeDetourState(): GameState {
    const width = 10;
    const height = 5;
    const road = (ownerId: number | null = null): Tile => ({ terrainId: 6, ownerId });
    const water = (): Tile => ({ terrainId: 2, ownerId: null });
    const bridge = (): Tile => ({ terrainId: 17, ownerId: null });
    const tiles: Tile[][] = Array.from({ length: height }, () => (
        Array.from({ length: width }, () => water())
    ));

    for (let y = 0; y < height; y += 1) {
        tiles[y][0] = road();
        tiles[y][width - 1] = road();
    }
    for (let x = 1; x < width - 1; x += 1) {
        tiles[height - 1][x] = bridge();
    }
    tiles[0][0] = { terrainId: 10, ownerId: 0 };
    tiles[0][width - 1] = { terrainId: 10, ownerId: 1 };

    return {
        turn: 1,
        currentPlayer: 0,
        map: { width, height, tiles },
        units: [
            { id: 's', ownerId: 0, unitClass: 'soldier', pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'e', ownerId: 1, unitClass: 'commander', pos: { x: width - 1, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
        ],
        players: [
            { id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 }
        ],
        winner: null,
        rules: getApkSkirmishRuleConfig('SD')
    };
}

function createWaterRecruitState(): GameState {
    const width = 7;
    const height = 5;
    const water = (): Tile => ({ terrainId: 2, ownerId: null });
    const bridge = (): Tile => ({ terrainId: 17, ownerId: null });
    const tiles: Tile[][] = Array.from({ length: height }, () => (
        Array.from({ length: width }, () => water())
    ));

    tiles[0][0] = { terrainId: 10, ownerId: 0 };
    tiles[4][6] = { terrainId: 10, ownerId: 1 };
    tiles[0][1] = bridge();
    tiles[1][0] = bridge();

    return {
        turn: 1,
        currentPlayer: 0,
        map: { width, height, tiles },
        units: [
            { id: 'cmd', ownerId: 0, unitClass: 'commander', pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: true, hasActed: true },
            { id: 'enemy', ownerId: 1, unitClass: 'commander', pos: { x: 6, y: 4 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
        ],
        players: [
            { id: 0, gold: 300, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 }
        ],
        winner: null,
        rules: getApkSkirmishRuleConfig('SD')
    };
}

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

    it('已有低价兵且金币充足时优先招募高阶功能兵', () => {
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

        expect(action).toMatchObject({ type: 'recruit_and_deploy', castlePos: { x: 0, y: 0 } });
        expectRecruitUnitClass(action, highTierRecruitClasses);
    });

    it('早期大量空位和金币时不直接龙起手', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 3000;
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toMatchObject({ type: 'recruit_and_deploy', castlePos: { x: 0, y: 0 } });
        expectRecruitUnitClass(action, earlyRoleRecruitClasses);
        if (action.type === 'recruit_and_deploy') {
            expect(action.unitClass).not.toBe('dragon');
        }
    });

    it('有真实单位动作时不先普通招募', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 2000;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action.type).not.toMatch(/^recruit/);
    });

    it('收官时指挥官优先向敌方城堡推进', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.units = state.units.filter(unit => unit.id !== 'u3' && unit.id !== 'u4');
        state.players.find(player => player.id === 0)!.gold = 2000;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toMatchObject({ type: 'move', unitId: 'u1' });
    });

    it('残血单位优先撤到可恢复建筑', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units.find(unit => unit.id === 'u1')!.hasMoved = true;
        state.units.find(unit => unit.id === 'u1')!.hasActed = true;
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        soldier.pos = { x: 2, y: 1 };
        soldier.hp = 25;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'move', unitId: 'u3', to: { x: 3, y: 1 } });
    });

    it('移动按真实路径选择桥梁路线而不是直线涉水', () => {
        const state = createBridgeDetourState();

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'move', unitId: 's', to: { x: 0, y: 4 } });
    });

    it('敌方史莱姆较多时优先招募魔法单位克制', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 800;
        state.units = state.units.filter(unit => unit.ownerId === 0);
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });
        for (let index = 0; index < 4; index += 1) {
            state.units.push({
                id: `slime_${index}`,
                ownerId: 1,
                unitClass: 'slime',
                pos: { x: 6 - (index % 2), y: 7 - Math.floor(index / 2) },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            });
        }

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expectRecruitUnitClass(action, magicCounterRecruitClasses);
    });

    it('敌方巨龙较多时优先招募防空克制单位', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 800;
        state.units = state.units.filter(unit => unit.ownerId === 0);
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });
        for (let index = 0; index < 2; index += 1) {
            state.units.push({
                id: `dragon_${index}`,
                ownerId: 1,
                unitClass: 'dragon',
                pos: { x: 6 - index, y: 7 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            });
        }

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expectRecruitUnitClass(action, dragonCounterRecruitClasses);
    });

    it('敌方亡灵较多时优先招募圣骑士或精灵', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 500;
        state.units = state.units.filter(unit => unit.ownerId === 0);
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });
        for (let index = 0; index < 3; index += 1) {
            state.units.push({
                id: `skeleton_${index}`,
                ownerId: 1,
                unitClass: 'skeleton',
                pos: { x: 6 - index, y: 7 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            });
        }

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expectRecruitUnitClass(action, undeadCounterRecruitClasses);
    });

    it('敌方物理近战较多时优先招募史莱姆抗线', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 600;
        state.units = state.units.filter(unit => unit.ownerId === 0);
        state.units
            .filter(unit => unit.ownerId === 0)
            .forEach(unit => {
                unit.hasMoved = true;
                unit.hasActed = true;
            });
        for (let index = 0; index < 4; index += 1) {
            state.units.push({
                id: `soldier_${index}`,
                ownerId: 1,
                unitClass: 'soldier',
                pos: { x: 6 - (index % 2), y: 7 - Math.floor(index / 2) },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            });
        }

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expectRecruitUnitClass(action, ['slime']);
    });

    it('水域较多时优先招募水系或飞行单位', () => {
        const state = createWaterRecruitState();

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toMatchObject({ type: 'recruit_and_deploy', castlePos: { x: 0, y: 0 } });
        expectRecruitUnitClass(action, waterMapRecruitClasses);
    });

    it('治疗可救残血友军时优先治疗', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push(
            { id: 'pal', ownerId: 0, unitClass: 'paladin', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'hurt', ownerId: 0, unitClass: 'soldier', pos: { x: 2, y: 3 }, hp: 20, maxHp: 100, hasMoved: true, hasActed: true }
        );

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'heal', healerId: 'pal', targetId: 'hurt' });
    });

    it('圣骑士无攻击目标时会给满血友军叠加治疗', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push(
            { id: 'pal', ownerId: 0, unitClass: 'paladin', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'ally', ownerId: 0, unitClass: 'soldier', pos: { x: 2, y: 3 }, hp: 100, maxHp: 100, hasMoved: true, hasActed: true }
        );

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'heal', healerId: 'pal', targetId: 'ally' });
    });

    it('圣骑士移动后身边无人可治疗时治疗自己', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push({ id: 'pal', ownerId: 0, unitClass: 'paladin', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: true, hasActed: false });

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'heal', healerId: 'pal', targetId: 'pal' });
    });

    it('圣骑士优先用治疗击杀敌方骷髅避免反击', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push(
            { id: 'pal', ownerId: 0, unitClass: 'paladin', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'sk', ownerId: 1, unitClass: 'skeleton', pos: { x: 2, y: 3 }, hp: 50, maxHp: 100, hasMoved: false, hasActed: false }
        );

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'heal', healerId: 'pal', targetId: 'sk' });
    });

    it('女巫站在墓碑旁时优先召唤骷髅', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push({ id: 'witch', ownerId: 0, unitClass: 'witch', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false });
        state.graves = [{ id: 'g1', pos: { x: 3, y: 2 }, remainingTurns: 3 }];

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'summon', summonerId: 'witch', graveId: 'g1', spawnPos: { x: 3, y: 2 } });
    });

    it('投石车站在敌方城镇上时优先拆城', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push({ id: 'cat', ownerId: 0, unitClass: 'catapult', pos: { x: 3, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false });
        state.map.tiles[1][3].ownerId = 1;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'destroy_town', unitId: 'cat' });
    });

    it('己方本回合可占城镇时投石车不摧毁该城镇', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push(
            { id: 'cat', ownerId: 0, unitClass: 'catapult', pos: { x: 3, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'sold', ownerId: 0, unitClass: 'soldier', pos: { x: 2, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
        );
        state.map.tiles[1][3].ownerId = 1;

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).not.toEqual({ type: 'destroy_town', unitId: 'cat' });
    });

    it('德鲁伊能让已行动远程单位再攻击时优先支援', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push(
            { id: 'druid', ownerId: 0, unitClass: 'druid', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'arch', ownerId: 0, unitClass: 'archer', pos: { x: 3, y: 2 }, hp: 100, maxHp: 100, hasMoved: true, hasActed: true },
            { id: 'enemy', ownerId: 1, unitClass: 'soldier', pos: { x: 5, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
        );

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'support', supporterId: 'druid', targetId: 'arch' });
    });

    it('精灵移动时保持受伤异常友军在净化光环范围内', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push(
            { id: 'elf', ownerId: 0, unitClass: 'elf', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            {
                id: 'hurt',
                ownerId: 0,
                unitClass: 'soldier',
                pos: { x: 3, y: 3 },
                hp: 40,
                maxHp: 100,
                hasMoved: true,
                hasActed: true,
                status: { type: 'poisoned' }
            }
        );

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toMatchObject({ type: 'move', unitId: 'elf' });
        if (action.type === 'move') {
            expect(distance(action.to, { x: 3, y: 3 })).toBeLessThanOrEqual(2);
        }
    });

    it('石头人优先站上山地并覆盖敌军虚弱光环', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.players.find(player => player.id === 0)!.gold = 0;
        state.units = state.units.filter(unit => unit.ownerId === 1);
        state.units.push(
            { id: 'golem', ownerId: 0, unitClass: 'golem', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'e1', ownerId: 1, unitClass: 'soldier', pos: { x: 6, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'e2', ownerId: 1, unitClass: 'archer', pos: { x: 5, y: 3 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
        );

        const action = new HeuristicAI(() => 0).getAction(new GameEngine(state), 0);

        expect(action).toEqual({ type: 'move', unitId: 'golem', to: { x: 5, y: 2 } });
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
