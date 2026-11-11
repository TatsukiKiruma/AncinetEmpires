import { describe, expect, it } from 'vitest';
import { createAppSkirmishGameState, getAppSkirmishMapOptions } from '../app_skirmish_maps';
import { getAppApkSkirmishMapOptions } from '../apk_skirmish_map_assets';
import { createCustomSkirmishState, CUSTOM_SKIRMISH_MAPS } from '../custom_skirmish/catalog';
import { frostBridges } from '../custom_skirmish/frost-bridges';
import { mirrorBay } from '../custom_skirmish/mirror-bay';
import { ridgeOutposts } from '../custom_skirmish/ridge-outposts';
import { GameEngine } from '../engine';
import { getReachablePositions } from '../map';
import type { Action } from '../types';

function step(engine: GameEngine, action: Action) {
    expect(engine.hasLegalAction(engine.getState().currentPlayer, action)).toBe(true);
    return engine.step(action).state;
}

describe('沙盒试作地图', () => {
    it('保留原有 APK 地图列表，九张试作可从沙盒入口创建独立新局', () => {
        const official = getAppApkSkirmishMapOptions();
        const all = getAppSkirmishMapOptions();
        expect(all.slice(0, official.length)).toEqual(official);
        expect(all.slice(official.length).map(option => option.playerCount)).toEqual([2, 2, 2, 3, 3, 3, 4, 4, 4]);
        for (const { name, width, height, playerCount } of all.slice(official.length)) {
            const state = createAppSkirmishGameState(name);
            expect(state.metadata?.customSkirmishMapId).toBe(name);
            expect(state.map).toMatchObject({ width, height });
            expect(state.winner).toBeNull();
            expect(state.units.map(unit => unit.ownerId)).toEqual(Array.from({ length: playerCount }, (_, i) => i));
        }
    });

    it.each([
        ['three-forks', 450, 4], ['tide-harbors', 450, 7], ['outer-keeps', 450, 6],
        ['crossroads-four', 450, 5], ['lake-gates', 450, 5], ['double-passes', 400, 7]
    ] as const)('%s 每个座位有相同的开局资金与最近争夺点距离', (mapId, gold, cost) => {
        const map = CUSTOM_SKIRMISH_MAPS.find(map => map.id === mapId)!;
        for (const [team] of map.commanders) {
            const state = createCustomSkirmishState(map, team);
            const unit = state.units.find(unit => unit.ownerId === team)!;
            const reaches = (budget: number) => getReachablePositions(state, unit.id, budget)
                .some(pos => map.objectives.some(([x, y]) => pos.x === x && pos.y === y));
            expect(state.players.find(player => player.id === team)?.gold).toBe(gold);
            expect(reaches(cost - 1)).toBe(false);
            expect(reaches(cost)).toBe(true);
            expect(new GameEngine(state).getLegalActions(team)).toContainEqual({
                type: 'recruit_to_castle', unitClass: 'soldier', castlePos: unit.pos
            });
        }
    });

    it('霜桥双线的后手多 50 金，能首回合招募精灵，先手不能', () => {
        const engine = new GameEngine(createCustomSkirmishState(frostBridges));
        const canRecruitElf = (playerId: number) => engine.getLegalActions(playerId).some(
            action => action.type === 'recruit_to_castle' && action.unitClass === 'elf'
        );
        expect(engine.getState().players[0].gold).toBe(450);
        expect(canRecruitElf(0)).toBe(false);
        step(engine, { type: 'end_turn' });
        expect(engine.getState().players[1].gold).toBe(500);
        expect(canRecruitElf(1)).toBe(true);
    });

    it('双岭旧驿的废墟首轮修、次轮占、第三轮到账，对侧完好村庄提前一轮到账', () => {
        const engine = new GameEngine(createCustomSkirmishState(ridgeOutposts), {
            disableAutoAdvanceWhenNoMeaningfulAction: true
        });
        const [red, blue] = engine.getState().units.map(unit => unit.id);
        expect(engine.getState().players[0].gold).toBe(400);
        step(engine, { type: 'move', unitId: red, to: { x: 3, y: 3 } });
        expect(step(engine, { type: 'repair', unitId: red }).map.tiles[3][3].ownerId).toBeNull();
        expect(step(engine, { type: 'end_turn' }).players[1].gold).toBe(400);
        step(engine, { type: 'move', unitId: blue, to: { x: 9, y: 9 } });
        step(engine, { type: 'capture', unitId: blue });
        expect(step(engine, { type: 'end_turn' }).players[0].gold).toBe(550);
        step(engine, { type: 'capture', unitId: red });
        expect(step(engine, { type: 'end_turn' }).players[1].gold).toBe(600);
        expect(step(engine, { type: 'end_turn' }).players[0].gold).toBe(750);
    });

    it.each([0, 1] as const)('镜湾争城的 %i 号位可在两次行动内占领北侧副城', playerId => {
        const engine = new GameEngine(createCustomSkirmishState(mirrorBay, playerId), {
            disableAutoAdvanceWhenNoMeaningfulAction: true
        });
        const commander = engine.getState().units.find(unit => unit.ownerId === playerId)!;
        const approach = { type: 'move', unitId: commander.id, to: { x: 7, y: 2 } } as const;
        expect(engine.getState().players[playerId].gold).toBe(400);
        expect(engine.hasLegalAction(playerId, approach)).toBe(false);
        step(engine, { type: 'move', unitId: commander.id, to: { x: commander.pos.x, y: 2 } });
        step(engine, { type: 'wait', unitId: commander.id });
        step(engine, { type: 'end_turn' });
        step(engine, { type: 'end_turn' });
        step(engine, approach);
        expect(step(engine, { type: 'capture', unitId: commander.id }).map.tiles[2][7].ownerId).toBe(playerId);
    });
});
