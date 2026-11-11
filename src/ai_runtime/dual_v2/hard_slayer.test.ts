import { describe, expect, it } from 'vitest';
import { createDefaultAppGameState } from '../../game/default_state';
import { GameEngine } from '../../game/engine';
import { getTileTerrainKey } from '../../game/terrain_rules';
import { encodeAction } from '../../game/env';
import type { Unit } from '../../game/types';
import { hardTacticalContext, positionKey } from './hard_tactics';
import { ReachabilityContext } from './reachability';
import { tacticalActionPriors } from './tactical_prior';
import { canStillRecruitAtCastle } from './hard_recruitment';
import { hardAttackValue, hardHealValue, hardSupportValue } from './hard_combat';
import { takeoverDecision, type BranchEvidence } from './takeover_guard';
import { multiplayerLedger } from './multiplayer_leaf';
import { retaliationFirst } from './retaliation_order';
import historicalGarrison from './fixtures/duel-last-garrison.json';
import type { GameState } from '../../game/types';

function fixture() {
    const state = createDefaultAppGameState();
    const castle = state.map.tiles.flat().find(t => getTileTerrainKey(t) === 'castle')!;
    state.map = { width: 9, height: 9, tiles: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({ terrainId: 6, ownerId: null }))) };
    state.currentPlayer = 0; state.players.forEach(p => { p.gold = 0; }); state.pendingUnitId = undefined;
    const unit = (id: string, ownerId: number, unitClass: Unit['unitClass'], x: number, y: number): Unit => ({ id, ownerId, unitClass, pos: { x, y }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false });
    state.units = [unit('己王', 0, 'commander', 0, 0), unit('敌王', 1, 'commander', 5, 7), unit('守军', 0, 'soldier', 8, 8)];
    state.map.tiles[8][8] = { ...castle, ownerId: 0 };
    return { state, unit };
}

describe('v6困难专项真实规则回归', () => {
    it('历史Duel后手第18步不再被迫移走末金守军，留守避免敌王立即空城占领', () => {
        const engine = new GameEngine(historicalGarrison as GameState), state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer);
        const scores = tacticalActionPriors(state, legal), wait = legal.findIndex(a => a.type === 'wait' && a.unitId === 'u_6');
        // 历史文件实际余金为50，仍不足以招募150金币步兵；不改写快照迎合描述。
        expect(state.players.find(p => p.id === state.currentPlayer)!.gold).toBe(50);
        expect(wait).toBeGreaterThanOrEqual(0); expect(scores[wait].forbidden).toBe(false);
        for (const [i, a] of legal.entries()) if (a.type === 'move' && a.unitId === 'u_6') expect(scores[i].prior).toBeLessThan(scores[wait].prior);
        engine.step(legal[wait]);
        expect(engine.getLegalActions(engine.getState().currentPlayer).some(a => a.type === 'move' && a.unitId === 'apk_u1' && a.to.x === 8 && a.to.y === 8)).toBe(false);
    });
    it('末金招兵后敌王一回合可达主城，保留驻守且重罚空城移动', () => {
        const { state } = fixture(), engine = new GameEngine(state), current = engine.getState(), legal = engine.getLegalActions(0);
        const hard = hardTacticalContext(current, new ReachabilityContext(current));
        expect(hard.immediateCastles.has('8,8')).toBe(true); expect(hard.threatSourcePositions.has('5,7')).toBe(true);
        expect(canStillRecruitAtCastle(current, { x: 8, y: 8 }, legal)).toBe(false);
        const scores = tacticalActionPriors(current, legal), wait = legal.findIndex(a => a.type === 'wait' && a.unitId === '守军');
        expect(wait).toBeGreaterThanOrEqual(0); expect(scores[wait].forbidden).toBe(false); expect(scores[wait].prior).toBeGreaterThan(20);
        for (const [i, action] of legal.entries()) if (action.type === 'move' && action.unitId === '守军') expect(scores[i].prior).toBeLessThan(scores[wait].prior);
        const replay = engine.clone(); replay.step(legal[wait]); expect(replay.getState().units.find(u => u.id === '守军')!.pos).toEqual({ x: 8, y: 8 });
    });
    it('可继续合法招募时仍保留威胁城堡上的驻守候选，二回合逼近也被识别', () => {
        const { state } = fixture(); state.players[0].gold = 150; state.units.find(u => u.id === '敌王')!.pos = { x: 1, y: 8 };
        const engine = new GameEngine(state), current = engine.getState(), legal = engine.getLegalActions(0), hard = hardTacticalContext(current, new ReachabilityContext(current));
        expect(hard.threatenedOwnCastles.has('8,8')).toBe(true); expect(hard.immediateCastles.has('8,8')).toBe(false);
        expect(canStillRecruitAtCastle(current, { x: 8, y: 8 }, legal)).toBe(true);
        // 有钱且只是二回合威胁时允许先扩张；一回合威胁仍保留驻守。
        current.units.find(u => u.id === '敌王')!.pos = { x: 5, y: 7 };
        const threatenedEngine = new GameEngine(current), threatened = threatenedEngine.getState(), actions = threatenedEngine.getLegalActions(0);
        expect(tacticalActionPriors(threatened, actions)[actions.findIndex(a => a.type === 'wait' && a.unitId === '守军')].forbidden).toBe(false);
    });
    it('有另一名驻军的堆叠新兵不能冒充末金唯一守军而滞留', () => {
        const { state, unit } = fixture(); state.units.push(unit('堆叠步兵', 0, 'soldier', 8, 8));
        const engine = new GameEngine(state), legal = engine.getLegalActions(0), scores = tacticalActionPriors(engine.getState(), legal);
        const wait = legal.findIndex(a => a.type === 'wait' && a.unitId === '堆叠步兵');
        expect(wait).toBeGreaterThanOrEqual(0); expect(scores[wait].prior).toBeLessThan(20);
        expect(scores[wait].forbidden).toBe(true);
    });
    it('多个占领者分配不同建筑，并为本回合可占村庄保留通路', () => {
        const { state, unit } = fixture(); const town = createDefaultAppGameState().map.tiles.flat().find(t => getTileTerrainKey(t) === 'town')!;
        state.map.tiles[2][2] = { ...town, ownerId: null }; state.map.tiles[2][6] = { ...town, ownerId: null };
        state.units.filter(u => u.ownerId === 0).forEach(u => { u.hasActed = true; });
        state.units.push(unit('占领甲', 0, 'soldier', 2, 3), unit('占领乙', 0, 'soldier', 6, 3), unit('史莱姆', 0, 'slime', 3, 2));
        const hard = hardTacticalContext(state, new ReachabilityContext(state)), a = hard.assignments.get('占领甲'), b = hard.assignments.get('占领乙');
        expect(a).toBeDefined(); expect(b).toBeDefined(); expect(positionKey(a!)).not.toBe(positionKey(b!)); expect(hard.reservedVillages.has('2,2')).toBe(true);
        const legal = new GameEngine(state).getLegalActions(0), scores = tacticalActionPriors(state, legal);
        const blocked = legal.findIndex(a => a.type === 'move' && a.unitId === '史莱姆' && a.to.x === 2 && a.to.y === 2);
        expect(blocked).toBeGreaterThanOrEqual(0); expect(scores[blocked].prior).toBeLessThan(-15);
    });
    it('陆地招募压制美人鱼且保留步兵扩张，新兵可执行真实完整行动', () => {
        const { state } = fixture(); state.units = state.units.filter(u => u.id !== '守军'); state.players[0].gold = 400;
        const engine = new GameEngine(state), legal = engine.getLegalActions(0), scores = tacticalActionPriors(engine.getState(), legal);
        const score = (name: string) => Math.max(...legal.flatMap((a, i) => 'unitClass' in a && a.unitClass === name ? [scores[i].prior] : []));
        expect(score('soldier')).toBeGreaterThan(score('mermaid') + 25);
        const recruit = legal.find(a => a.type === 'recruit_to_castle' && a.unitClass === 'soldier')!;
        expect(recruit).toBeDefined(); engine.step(recruit); expect(engine.getState().units.some(u => u.ownerId === 0 && u.unitClass === 'soldier' && !u.hasActed)).toBe(true);
    });
    it('保城否决优先于高物资分与普通单位损失，不能以指挥官死亡换取', () => {
        const { state } = fixture(), ledger = multiplayerLedger(state, state, 0);
        const primary: BranchEvidence = { ledger, score: 100, ledgerScore: 100, health: new Map([['己王', 100]]), lethalActors: 0, supports: 0, complete: true, allyCastlesLost: 1 };
        const safe = { ...primary, score: -100, health: new Map([['己王', 80]]), lethalActors: 2, allyCastlesLost: 0 };
        expect(takeoverDecision(primary, safe)).toBe('veto'); expect(takeoverDecision(safe, primary)).toBeNull();
        expect(takeoverDecision(primary, { ...safe, health: new Map([['己王', 0]]) })).toBeNull();
    });
    it('威胁源攻击乘数、关键守军治疗和支援斩杀收益使用动态估值', () => {
        const { state, unit } = fixture(); state.units.push(unit('弓', 0, 'archer', 5, 5));
        const archer = state.units.at(-1)!; archer.hasActed = true; archer.hasMoved = true;
        const enemy = state.units.find(u => u.id === '敌王')!; enemy.hp = 20;
        const hard = hardTacticalContext(state, new ReachabilityContext(state));
        const normal = hardAttackValue(state, archer, enemy, { ...hard, threatSourcePositions: new Set() });
        expect(hardAttackValue(state, archer, enemy, hard)).toBeCloseTo(normal * 1.9);
        expect(hardSupportValue(state, archer, hard)).toBeGreaterThan(20);
        const king = state.units[0]; expect(hardHealValue(state, { ...king, hp: 20 }, hard)).toBeGreaterThan(hardHealValue(state, { ...king, hp: 80 }, hard));
    });
    it('反扑允许空城招兵攻击，并保持权威strict合法与前态不变', () => {
        const { state, unit } = fixture(); state.currentPlayer = 1; state.players[1].gold = 300;
        state.map.tiles[4][4] = { ...state.map.tiles[8][8], ownerId: 1 };
        state.units.find(u => u.id === '敌王')!.apkStatic = true;
        state.units.push({ ...unit('残兵', 0, 'soldier', 4, 5), hp: 10 });
        const engine = new GameEngine(state), before = engine.getState(), chosen = retaliationFirst(engine)!;
        expect(chosen.action.type.startsWith('recruit_')).toBe(true);
        expect(engine.getLegalActions(1).some(a => encodeAction(a) === encodeAction(chosen.action))).toBe(true);
        expect(engine.getState()).toEqual(before); engine.step(chosen.action);
    });
    it('高等级高血量单位按有效上限估值治疗，不能把130/175误当作满血', () => {
        const { state, unit } = fixture(), golem = { ...unit('石像', 0, 'golem', 3, 3), level: 3 as const, hp: 130 };
        state.units.push(golem); const hard = hardTacticalContext(state, new ReachabilityContext(state));
        expect(hardHealValue(state, golem, hard)).toBeGreaterThan(0);
        expect(hardHealValue(state, { ...golem, hp: 175 }, hard)).toBe(0);
    });
});
