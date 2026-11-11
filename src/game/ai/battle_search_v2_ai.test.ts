import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../engine';
import { getDistance, getReachablePositions } from '../map';
import { calculateDamage } from '../rules';
import { areEnemyPlayers, getAllianceId, getUnitCost, isCommanderUnit } from '../rule_config';
import { getEffectiveStats } from '../abilities';
import { UNIT_CONFIGS } from '../constants';
import { getTileTerrainKey } from '../terrain_rules';
import { encodeAction } from '../env';
import { createAppApkSkirmishGameState, parseAppApkSkirmishMap } from '../apk_skirmish_map_assets';
import { createApkSkirmishGameState } from '../apk_skirmish';
import type { Action, GameState, Unit, UnitClass } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { BattleSearchV2AI, BattleSearchV2, BattleSearchAI, createBattleSearchV2AI } from './battle_search_v2_ai';

afterEach(() => vi.restoreAllMocks());
const report = (label: string, data: unknown): void => { process.stdout.write(`${label} ${JSON.stringify(data)}\n`); };

function unit(id: string, ownerId: number, unitClass: UnitClass, x: number, y: number, hp = 100): Unit {
  return { id, ownerId, unitClass, pos: { x, y }, hp, maxHp: 100, hasMoved: false, hasActed: false };
}

function state(units: Unit[], width = 16, height = 9, players = 2): GameState {
  return {
    turn: 1, currentPlayer: 0, winner: null, units,
    map: { width, height, tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ terrainId: 6 as const, ownerId: null }))) },
    players: Array.from({ length: players }, (_, id) => ({ id, gold: 0, isAlive: true, commanderDeathCount: 0 })),
    rules: { recruitableUnits: ['soldier'], commanderRecruitBaseCost: null, incomeCommanderBase: 0 }
  };
}

function castle(s: GameState, x: number, y: number, ownerId: number | null): void {
  s.map.tiles[y][x] = { terrainId: 10, ownerId };
}

function focusState(): GameState {
  const s = state([
    unit('cmd', 0, 'commander', 1, 3, 60),
    unit('e1', 1, 'soldier', 8, 2), unit('e2', 1, 'soldier', 8, 4), unit('e3', 1, 'soldier', 9, 3),
    unit('enemy-cmd', 1, 'commander', 15, 8)
  ]);
  castle(s, 0, 0, 0);
  castle(s, 5, 3, 1);
  return s;
}

function nextTurnFocus(s: GameState, targetId: string): number {
  const target = s.units.find(u => u.id === targetId)!;
  return s.units.filter(e => areEnemyPlayers(s, target.ownerId, e.ownerId)).map(e => {
    let damage = 0;
    for (const pos of getReachablePositions(s, e.id)) {
      const d = getDistance(pos, target.pos);
      // 本组集火样本敌人均为近战单位，伤害仍走权威计算。
      if (d !== 1) continue;
      const projected = { ...s, units: s.units.map(u => u.id === e.id ? { ...u, pos } : u) };
      damage = Math.max(damage, calculateDamage(projected, e.id, targetId));
    }
    return damage;
  }).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
}

describe('BattleSearchV2AI 定向战术与隔离契约', () => {
  it('导出兼容别名、工厂、非法动作估值和只读诊断', () => {
    expect(BattleSearchV2).toBe(BattleSearchV2AI);
    expect(BattleSearchAI).toBe(BattleSearchV2AI);
    const ai = createBattleSearchV2AI(1);
    const engine = new GameEngine(focusState());
    expect(ai.evaluateCandidate(engine, 0, { type: 'capture', unitId: '不存在' })).toBe(-100000);
    expect(ai.actionCode({ type: 'end_turn' })).toBe(encodeAction({ type: 'end_turn' }));
    expect(Object.isFrozen(ai.telemetry)).toBe(true);
  });

  it('红绿回归：单次最大伤害安全，移动后 Top-3 集火致死，V2 否决冒进', () => {
    const engine = new GameEngine(focusState());
    const root = engine.getState();
    const naive = new HeuristicAI(() => 0).getAction(engine, 0);
    expect(naive.type).toBe('move');
    const blind = engine.clone();
    blind.step(naive);
    expect(root.units.filter(u => u.ownerId === 1).every(e => getDistance(e.pos, root.units[0].pos) > 1)).toBe(true);
    expect(nextTurnFocus(blind.getState(), 'cmd')).toBeGreaterThanOrEqual(60);
    const ai = new BattleSearchV2AI(() => 0);
    const chosen = ai.getAction(engine, 0);
    const safer = engine.clone();
    safer.step(chosen);
    expect(nextTurnFocus(safer.getState(), 'cmd')).toBeLessThan(60);
    expect(ai.telemetry.veto).toBe(true);
    expect(ai.telemetry.worstThreatPenalty).toBeGreaterThanOrEqual(65000);
    expect(engine.getState()).toEqual(root);
    report('集火规避', { naive, chosen, telemetry: ai.telemetry });
  });

  it('完整展开移动占城，下一步队列命中小于 1ms，只在根部打分', () => {
    const s = state([unit('cmd', 0, 'commander', 1, 1), unit('enemy', 1, 'commander', 15, 8)]);
    castle(s, 0, 0, 0); castle(s, 4, 1, 1);
    const engine = new GameEngine(s);
    const ai = new BattleSearchV2AI(() => 0, { maxExtraUnits: 0 });
    const scoring = vi.spyOn(HeuristicAI.prototype, 'scoreCandidateActions');
    const queries = vi.spyOn(GameEngine.prototype, 'getLegalActions');
    const first = ai.getAction(engine, 0);
    expect(first).toEqual({ type: 'move', unitId: 'cmd', to: { x: 4, y: 1 } });
    const rootScoringCalls = scoring.mock.calls.length;
    expect(rootScoringCalls).toBeGreaterThan(0);
    expect(scoring.mock.calls.every(call => call[0] === engine)).toBe(true);
    const fullQueries = queries.mock.calls.filter(call => call[1] === undefined).length;
    expect(fullQueries).toBe(1);
    engine.step(first);
    const second = ai.getAction(engine, 0);
    expect(second).toEqual({ type: 'capture', unitId: 'cmd' });
    expect(ai.telemetry.queued).toBe(true);
    expect(ai.telemetry.elapsedMs).toBeLessThan(1);
    expect(scoring).toHaveBeenCalledTimes(rootScoringCalls);
    report('占城队列延迟', ai.telemetry.elapsedMs);
    scoring.mockRestore(); queries.mockRestore();
  });

  it('移动攻击和突击撤离链不会跳到无关单位', () => {
    const s = state([unit('wolf', 0, 'wolf', 1, 2), unit('ally', 0, 'soldier', 0, 0),
      unit('victim', 1, 'soldier', 4, 2, 5), unit('enemy', 1, 'commander', 15, 8)]);
    const engine = new GameEngine(s);
    const ai = new BattleSearchV2AI(() => 0, { maxExtraUnits: 0 });
    const first: Action = { type: 'move', unitId: 'wolf', to: { x: 3, y: 2 } };
    expect(ai.getAction(engine, 0, [first, { type: 'wait', unitId: 'wolf' }])).toEqual(first);
    engine.step(first);
    const attack = ai.getAction(engine, 0);
    expect(attack).toEqual({ type: 'attack', attackerId: 'wolf', targetId: 'victim' });
    expect(ai.telemetry.queued).toBe(true);
    engine.step(attack);
    const retreat = ai.getAction(engine, 0);
    expect(retreat.type).toBe('post_attack_move');
    expect('unitId' in retreat && retreat.unitId).toBe('wolf');
    expect(ai.telemetry.queued).toBe(true);
  });

  it('空城招募按军力计价，展开新兵移出城堡，不能提前结束回合', () => {
    const s = state([unit('cmd', 0, 'commander', 1, 0), unit('enemy', 1, 'commander', 15, 8)]);
    s.units[0].hasMoved = true; s.units[0].hasActed = true;
    s.players[0].gold = 300;
    castle(s, 0, 1, 0); castle(s, 15, 8, 1);
    const engine = new GameEngine(s);
    const ai = new BattleSearchV2AI(() => 0, { maxExtraUnits: 0 });
    const recruit: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 1 } };
    expect(ai.evaluateCandidate(engine, 0, recruit)).toBeGreaterThan(ai.evaluateCandidate(engine, 0, { type: 'end_turn' }));
    const first = ai.getAction(engine, 0);
    expect(first.type).toBe('recruit_to_castle');
    engine.step(first);
    const id = engine.getState().pendingUnitId;
    const deploy = ai.getAction(engine, 0);
    expect(deploy.type).toBe('move');
    expect('unitId' in deploy && deploy.unitId).toBe(id);
    expect(deploy.type === 'move' && deploy.to).not.toEqual({ x: 0, y: 1 });
    expect(ai.telemetry.queued).toBe(true);
  });

  it('招募驻防的城堡仍受移动占城威胁时，新兵不能盲目离城', () => {
    const s = state([unit('cmd', 0, 'commander', 0, 8), unit('enemy', 1, 'commander', 7, 2)]);
    castle(s, 4, 2, 0); castle(s, 15, 8, 1);
    s.players[0].gold = 150;
    const engine = new GameEngine(s), ai = new BattleSearchV2AI(() => 0, { maxExtraUnits: 0 });
    const recruit: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 4, y: 2 } };
    expect(ai.getAction(engine, 0, [recruit, { type: 'end_turn' }])).toEqual(recruit);
    engine.step(recruit);
    const id = engine.getState().pendingUnitId!;
    expect(ai.getAction(engine, 0)).toEqual({ type: 'wait', unitId: id });
    expect(ai.telemetry.queued).toBe(true);
  });

  it('安全分支占村收益触发 takeover；规则必胜分支优先返回', () => {
    const s = state([unit('a', 0, 'soldier', 1, 1), unit('cmd', 0, 'commander', 0, 0), unit('enemy', 1, 'commander', 15, 8)]);
    s.units[1].hasMoved = true;
    s.map.tiles[1][4] = { terrainId: 9, ownerId: null };
    const hold: Action = { type: 'wait', unitId: 'cmd' }, move: Action = { type: 'move', unitId: 'a', to: { x: 4, y: 1 } };
    vi.spyOn(HeuristicAI.prototype, 'scoreCandidateActions').mockImplementation((_e, _p, actions) =>
      actions.map(action => ({ action, score: action.type === 'wait' ? 1000 : 900 })));
    const ai = new BattleSearchV2AI(1, { maxExtraUnits: 0 });
    expect(ai.getAction(new GameEngine(s), 0, [hold, move])).toEqual(move);
    expect(ai.telemetry.takeover).toBe(true);
    vi.restoreAllMocks();
    const win = state([unit('cmd', 0, 'commander', 1, 1), unit('enemy', 1, 'commander', 15, 8)]);
    castle(win, 0, 0, 0); castle(win, 4, 1, 1);
    win.rules!.defeatOnNoCastles = true;
    const engine = new GameEngine(win), winningAi = new BattleSearchV2AI(2);
    expect(winningAi.getAction(engine, 0)).toEqual({ type: 'move', unitId: 'cmd', to: { x: 4, y: 1 } });
    engine.step({ type: 'move', unitId: 'cmd', to: { x: 4, y: 1 } });
    engine.step(winningAi.getAction(engine, 0));
    expect(engine.getWinner()).toBe(0);
  });

  it('状态、规则或引擎变化使缓存失效；关闭缓存时每步重新评估', () => {
    const s = state([unit('cmd', 0, 'commander', 1, 1), unit('enemy', 1, 'commander', 15, 8)]);
    castle(s, 4, 1, 1);
    const engine = new GameEngine(s), ai = new BattleSearchV2AI(() => 0);
    engine.step(ai.getAction(engine, 0));
    const changed = engine.getState();
    changed.players[1].gold += 1;
    engine.reset(changed);
    ai.getAction(engine, 0);
    expect(ai.telemetry.queued).toBe(false);
    const other = new GameEngine(changed);
    ai.getAction(other, 0);
    expect(ai.telemetry.queued).toBe(false);
    const uncached = new BattleSearchV2AI(1, { enableQueue: false });
    uncached.getAction(other, 0);
    expect(uncached.telemetry.queued).toBe(false);
  });

  it('非占城步兵不得堵住近处指挥官要占领的敌城', () => {
    const s = state([unit('cmd', 0, 'commander', 1, 2), unit('soldier', 0, 'soldier', 3, 1), unit('enemy', 1, 'commander', 15, 8)]);
    castle(s, 4, 2, 1);
    const engine = new GameEngine(s), ai = new BattleSearchV2AI(() => 0);
    const chosen = ai.getAction(engine, 0);
    expect(chosen).not.toEqual({ type: 'move', unitId: 'soldier', to: { x: 4, y: 2 } });
    expect(chosen).toEqual({ type: 'move', unitId: 'cmd', to: { x: 4, y: 2 } });
  });

  it('敌方下一回合移动占城时紧急回防；真实寻路阻隔不误报', () => {
    const s = state([unit('guard', 0, 'soldier', 2, 2), unit('cmd', 0, 'commander', 0, 8), unit('enemy', 1, 'commander', 7, 2)]);
    castle(s, 4, 2, 0); castle(s, 15, 8, 1);
    const engine = new GameEngine(s), ai = new BattleSearchV2AI(() => 0);
    expect(ai.getAction(engine, 0)).toEqual({ type: 'move', unitId: 'guard', to: { x: 4, y: 2 } });
    expect(ai.telemetry.urgent).toBe(true);
    const blocked = state([unit('guard', 0, 'soldier', 2, 2), unit('cmd', 0, 'commander', 0, 8), unit('enemy', 1, 'commander', 7, 2)]);
    castle(blocked, 4, 2, 0);
    for (let y = 0; y < blocked.map.height; y++) blocked.map.tiles[y][5] = { terrainId: 3, ownerId: null, apkMoveCost: 99 };
    expect(getReachablePositions(blocked, 'enemy')).not.toContainEqual({ x: 4, y: 2 });
    const blockedAi = new BattleSearchV2AI(() => 0);
    blockedAi.getAction(new GameEngine(blocked), 0);
    expect(blockedAi.telemetry.urgent).toBe(false);
  });

  it('双单位补刀使用权威伤害，追加单位数量受配置限制', () => {
    const s = state([unit('a', 0, 'soldier', 2, 2), unit('b', 0, 'soldier', 3, 3),
      unit('victim', 1, 'soldier', 3, 2, 65), unit('enemy', 1, 'commander', 15, 8)]);
    const engine = new GameEngine(s);
    const attack: Action = { type: 'attack', attackerId: 'a', targetId: 'victim' };
    const solo = new BattleSearchV2AI(1, { maxExtraUnits: 0 });
    const duo = new BattleSearchV2AI(1, { maxExtraUnits: 1 });
    expect(duo.evaluateCandidate(engine, 0, attack)).toBeGreaterThan(solo.evaluateCandidate(engine, 0, attack) + 1000);
    expect(engine.getState()).toEqual(s);
  });

  it('3FFA 扫描所有敌方顺位，2v2 排除盟友但保护盟友指挥官', () => {
    const s = focusState();
    s.players.push({ id: 2, gold: 0, isAlive: true, commanderDeathCount: 0 });
    s.units.find(u => u.id === 'e2')!.ownerId = 2;
    s.units.find(u => u.id === 'e3')!.ownerId = 2;
    const ffa = new GameEngine(s), ai = new BattleSearchV2AI(() => 0);
    ai.getAction(ffa, 0);
    expect(ai.telemetry.veto).toBe(true);
    s.players.push({ id: 3, gold: 0, isAlive: true, commanderDeathCount: 0 });
    s.rules!.alliances = { 0: 0, 1: 0, 2: 2, 3: 2 };
    const action: Action = { type: 'move', unitId: 'cmd', to: { x: 5, y: 3 } };
    const allies = new GameEngine(s);
    const alliedScore = ai.evaluateCandidate(allies, 0, action);
    const enemyVersion = structuredClone(s);
    enemyVersion.rules!.alliances = { 0: 0, 1: 1, 2: 2, 3: 2 };
    expect(alliedScore).toBeGreaterThan(ai.evaluateCandidate(new GameEngine(enemyVersion), 0, action));
    const protectedAlly = state([unit('own', 0, 'soldier', 0, 0), unit('ally-cmd', 1, 'commander', 5, 3, 40),
      unit('foe', 2, 'soldier', 9, 3), unit('foe2', 3, 'soldier', 9, 4)], 16, 9, 4);
    protectedAlly.rules!.alliances = { 0: 0, 1: 0, 2: 2, 3: 2 };
    const alliedAi = new BattleSearchV2AI(1);
    alliedAi.getAction(new GameEngine(protectedAlly), 0);
    expect(alliedAi.telemetry.worstThreatPenalty).toBeGreaterThan(65000);
  });

  it('指挥官逐个比较风险，收益再高也不能把另一位盟友指挥官换掉', () => {
    const s = state([unit('cmd', 0, 'commander', 0, 0), unit('ally', 1, 'commander', 5, 3, 40),
      unit('guard', 0, 'soldier', 6, 3), unit('enemy', 2, 'soldier', 10, 3)], 16, 9, 3);
    s.rules!.alliances = { 0: 0, 1: 0, 2: 2 };
    s.map.tiles[4][6] = { terrainId: 9, ownerId: null };
    const ai = new BattleSearchV2AI(1, { maxExtraUnits: 0 });
    const hold: Action = { type: 'wait', unitId: 'guard' };
    const abandon: Action = { type: 'move', unitId: 'guard', to: { x: 6, y: 4 } };
    // 固定根排序以单独验证接管守卫；分支移动、占领和敌方伤害仍为真实规则。
    vi.spyOn(HeuristicAI.prototype, 'scoreCandidateActions').mockImplementation((_engine, _id, actions) =>
      actions.map(action => ({ action, score: action.type === 'wait' ? 1000 : 900 })));
    const engine = new GameEngine(s), before = engine.getState();
    expect(ai.evaluateCandidate(engine, 0, abandon)).toBeGreaterThan(ai.evaluateCandidate(engine, 0, hold) + 900);
    const action = ai.getAction(engine, 0, [hold, abandon]);
    expect(action).toEqual(hold);
    expect(ai.telemetry.takeover).toBe(false);
    expect(engine.getLegalActions(0).map(encodeAction)).toContain(encodeAction(action));
    expect(engine.getState()).toEqual(before);
  });

  it('24 单位中盘决策低于 200ms，低预算仍返回合法动作', () => {
    const units = [unit('cmd', 0, 'commander', 0, 0), unit('enemy-cmd', 1, 'commander', 13, 11)];
    for (let i = 0; i < 11; i++) {
      units.push(unit(`a${i}`, 0, i % 3 === 0 ? 'archer' : 'soldier', 1 + i % 4, 2 + Math.floor(i / 4)));
      units.push(unit(`b${i}`, 1, i % 3 === 0 ? 'archer' : 'soldier', 8 + i % 4, 5 + Math.floor(i / 4)));
    }
    const s = state(units, 14, 12); castle(s, 0, 0, 0); castle(s, 13, 11, 1);
    for (const mode of ['1v1', '3FFA', '2v2'] as const) {
      const setup = structuredClone(s);
      if (mode !== '1v1') {
        setup.players.push({ id: 2, gold: 0, isAlive: true, commanderDeathCount: 0 });
        setup.units.filter(u => u.ownerId === 1).forEach((u, i) => { if (i % 2) u.ownerId = 2; });
      }
      if (mode === '2v2') {
        setup.players.push({ id: 3, gold: 0, isAlive: true, commanderDeathCount: 0 });
        setup.units.filter(u => u.ownerId === 0 && u.id !== 'cmd').forEach((u, i) => { if (i % 2) u.ownerId = 3; });
        setup.rules!.alliances = { 0: 0, 3: 0, 1: 1, 2: 1 };
      }
      const engine = new GameEngine(setup), ai = new BattleSearchV2AI(7);
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        const action = ai.getAction(engine, 0);
        expect(engine.getLegalActions(0).map(encodeAction)).toContain(encodeAction(action));
        samples.push(ai.telemetry.elapsedMs);
      }
      report('24 单位延迟', { mode, samples, max: Math.max(...samples), nodes: ai.telemetry.nodes });
      expect(Math.max(...samples)).toBeLessThan(200);
    }
    const engine = new GameEngine(s);
    const tiny = new BattleSearchV2AI(1, { budgetMs: 1 });
    expect(engine.getLegalActions(0).map(encodeAction)).toContain(encodeAction(tiny.getAction(engine, 0)));
  });
});

const extendedArena = process.env.BATTLE_SEARCH_V2_EXTENDED === '1';

describe.skipIf(extendedArena)('固定种子四局快速实战（串行且每步让出 CPU）', () => {
  it('Duel 与 Crossed swords 交换先后手，区分自然胜负与 600 步截断', async () => {
    const results: { map: string; side: number; seed: number; winner: number | null; outcome: string; steps: number; meanMs: number; maxMs: number; queued: number }[] = [];
    for (const [map, side, seed] of [
      ['(2) Duel.aem', 0, 41], ['(2) Duel.aem', 1, 42],
      ['(2) Crossed swords.aem', 0, 43], ['(2) Crossed swords.aem', 1, 44]
    ] as const) {
      const initial = createAppApkSkirmishGameState(map);
      const engine = new GameEngine(initial);
      const v2 = new BattleSearchV2AI(seed);
      let rng = seed;
      const baseline = new HeuristicAI(() => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; });
      const times: number[] = [];
      let steps = 0, queued = 0;
      while (!engine.isTerminal() && steps < 600) {
        const before = engine.getState(), legal = engine.getLegalActions(before.currentPlayer);
        const action = before.currentPlayer === side ? v2.getAction(engine, side, legal) : baseline.getAction(engine, before.currentPlayer, legal);
        expect(legal.map(encodeAction)).toContain(encodeAction(action));
        if (before.currentPlayer === side) { times.push(v2.telemetry.elapsedMs); queued += Number(v2.telemetry.queued); }
        const result = engine.step(action);
        expect(result.info).not.toMatch(/Invalid|Illegal/i);
        steps++;
        // 只跑当前文件的一个工作线程，每个原子步主动让出调度机会。
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      const end = engine.getState(), winner = end.winner;
      const outcome = winner === null ? '步数截断' : winner === -1 ? '自然平局' : winner === getAllianceId(end, side) ? 'V2胜' : '启发式胜';
      const result = { map, side, seed, winner, outcome, steps, meanMs: times.reduce((a, b) => a + b, 0) / Math.max(1, times.length), maxMs: Math.max(0, ...times), queued };
      results.push(result);
      report('固定种子实战单局', result);
      expect(result.maxMs).toBeLessThan(200);
    }
    const wins = results.filter(r => r.outcome === 'V2胜').length;
    const losses = results.filter(r => r.outcome === '启发式胜').length;
    report('四局实战汇总', { wins, losses, truncated: results.filter(r => r.winner === null).length, results });
    expect(wins).toBeGreaterThan(losses);
    expect(wins).toBeGreaterThanOrEqual(2);
  }, 180000);
});

type ArenaMode = '1v1' | '1v1v1' | '2v2';
interface ArenaCase {
  id: string;
  mode: ArenaMode;
  map: string;
  seed: number;
  seat: number;
  maxSteps: number;
  maxRounds: number;
}

function arenaCases(): ArenaCase[] {
  const maps = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Mourningstar.aem', '(2) Liberty Port.aem', '(2) The Crossing.aem'];
  const result: ArenaCase[] = [];
  // 五图轮换两轮，同地图同种子交换先后手，不根据实验结果筛选地图或种子。
  for (let seat = 0; seat < 2; seat++) maps.forEach((map, i) => result.push({
    id: `单挑-${seat * 5 + i + 1}`, mode: '1v1', map, seed: 20261020 + i, seat, maxSteps: 1200, maxRounds: 80
  }));
  ['(3) Frozen fields.aem', '(3) Midway.aem', '(3) Glu.aem', '(3) classic 2.aem', '(3) Frozen fields.aem'].forEach((map, i) => result.push({
    id: `混战-${i + 1}`, mode: '1v1v1', map, seed: 20261120 + i, seat: i % 3, maxSteps: 3600, maxRounds: 140
  }));
  ['(4) Crossroads.aem', '(4) Solitude.aem', '(4) Waterways.aem', '(4) Winterstorm.aem', '(4) Critical mass.aem'].forEach((map, i) => result.push({
    id: `组队-${i + 1}`, mode: '2v2', map, seed: 20261220 + i, seat: i % 2, maxSteps: 4800, maxRounds: 160
  }));
  return result;
}

function arenaRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

function armySnapshot(s: GameState, v2Players: readonly number[]) {
  return s.players.map(player => {
    const units = s.units.filter(u => u.ownerId === player.id && u.hp > 0);
    const composition: Record<string, number> = {};
    for (const u of units) composition[UNIT_CONFIGS[u.unitClass].name] = (composition[UNIT_CONFIGS[u.unitClass].name] ?? 0) + 1;
    let castles = 0, villages = 0;
    for (const row of s.map.tiles) for (const tile of row) if (tile.ownerId === player.id) {
      const key = getTileTerrainKey(tile);
      if (key === 'castle') castles++;
      else if (key === 'town') villages++;
    }
    return {
      player: player.id, policy: v2Players.includes(player.id) ? 'V2' : '启发式', alliance: getAllianceId(s, player.id), alive: player.isAlive,
      units: units.length, hp: units.reduce((sum, u) => sum + u.hp, 0),
      material: Math.round(units.reduce((sum, u) => sum + (getUnitCost(s, player.id, u.unitClass) ?? UNIT_CONFIGS[u.unitClass].cost ?? 0)
        * u.hp / Math.max(1, getEffectiveStats(u).maxHp), 0) * 10) / 10,
      gold: player.gold, castles, villages, composition,
      commanders: units.filter(u => isCommanderUnit(s, u)).map(u => ({ hp: u.hp, maxHp: getEffectiveStats(u).maxHp, level: u.level ?? 0 }))
    };
  });
}

function latencySnapshot(times: number[]) {
  const ordered = [...times].sort((a, b) => a - b);
  const percentile = (p: number): number => ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)] ?? 0;
  const totalMs = times.reduce((sum, time) => sum + time, 0);
  return { decisions: times.length, totalMs, meanMs: totalMs / Math.max(1, times.length), medianMs: percentile(0.5),
    p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: ordered.at(-1) ?? 0, over200: times.filter(t => t >= 200).length };
}

async function playArena(spec: ArenaCase) {
  const map = parseAppApkSkirmishMap(spec.map);
  const ids = [...map.playerIds].sort((a, b) => a - b);
  const alliances = Object.fromEntries(ids.map((id, i) => [id, spec.mode === '2v2' ? i % 2 : id]));
  const initial = createApkSkirmishGameState(map, { mode: 'SD', mapName: spec.map, rules: { alliances } });
  expect(ids.length).toBe(spec.mode === '1v1' ? 2 : spec.mode === '1v1v1' ? 3 : 4);
  const v2Players = spec.mode === '2v2' ? ids.filter(id => alliances[id] === spec.seat) : [ids[spec.seat]];
  const v2Alliance = getAllianceId(initial, v2Players[0]);
  const policies = new Map(ids.map(id => [id, v2Players.includes(id)
    ? new BattleSearchV2AI(spec.seed + id * 1009)
    : new HeuristicAI(arenaRng(spec.seed + id * 1009))]));
  const engine = new GameEngine(initial), times: number[] = [];
  let current = engine.getState(), steps = 0, queued = 0, veto = 0, takeover = 0;
  const start = performance.now();
  let error: string | null = null;
  report('扩展实验开始', { ...spec, v2Players, alliances, initialArmies: armySnapshot(initial, v2Players) });
  try {
    while (current.winner === null && steps < spec.maxSteps && current.turn - initial.turn < spec.maxRounds) {
      const playerId = current.currentPlayer, policy = policies.get(playerId)!;
      const legal = engine.getLegalActions(playerId);
      const action = policy.getAction(engine, playerId, legal);
      if (!legal.some(a => encodeAction(a) === encodeAction(action))) throw new Error(`玩家 ${playerId} 返回非法动作 ${encodeAction(action)}`);
      if (policy instanceof BattleSearchV2AI) {
        times.push(policy.telemetry.elapsedMs);
        queued += Number(policy.telemetry.queued); veto += Number(policy.telemetry.veto); takeover += Number(policy.telemetry.takeover);
      }
      const next = engine.step(action);
      if (/Invalid|Illegal/i.test(next.info)) throw new Error(next.info);
      current = next.state;
      steps++;
      if (steps % 400 === 0) report('扩展实验进度', { id: spec.id, steps, round: current.turn, units: current.units.length,
        alive: current.players.filter(p => p.isAlive).map(p => p.id), elapsedSeconds: (performance.now() - start) / 1000 });
      // 全部比赛顺序执行，每个原子动作让出 CPU，不并行占用后台搜索算力。
      await new Promise(resolve => setTimeout(resolve, 2));
    }
  } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  const winner = current.winner;
  const truncated = winner === null && error === null;
  const outcome = error ? '运行错误' : truncated ? '截断' : winner === -1 ? '自然平局' : winner === v2Alliance ? 'V2胜' : '启发式胜';
  const players = armySnapshot(current, v2Players);
  const allianceArmies = [...new Set(players.map(p => p.alliance))].map(alliance => {
    const members = players.filter(p => p.alliance === alliance);
    return { alliance, players: members.map(p => p.player), policy: members[0].policy,
      units: members.reduce((sum, p) => sum + p.units, 0), hp: members.reduce((sum, p) => sum + p.hp, 0),
      material: Math.round(members.reduce((sum, p) => sum + p.material, 0) * 10) / 10,
      gold: members.reduce((sum, p) => sum + p.gold, 0), castles: members.reduce((sum, p) => sum + p.castles, 0),
      villages: members.reduce((sum, p) => sum + p.villages, 0) };
  });
  const result = { ...spec, v2Players, v2Alliance, winner, outcome, steps, endRound: current.turn,
    completedRounds: current.turn - initial.turn, cutoff: truncated ? steps >= spec.maxSteps ? '原子步上限' : '完整回合上限' : null,
    elapsedSeconds: (performance.now() - start) / 1000, error, latency: latencySnapshot(times), queued, veto, takeover, players, allianceArmies };
  report('扩展实验结果', result);
  return result;
}

describe.skipIf(!extendedArena)('五图单挑、五局三方混战、五局组队扩展实验（显式启用）', () => {
  const results: Awaited<ReturnType<typeof playArena>>[] = [];
  afterAll(() => {
    for (const mode of ['1v1', '1v1v1', '2v2'] as const) {
      const group = results.filter(r => r.mode === mode);
      const decisions = group.reduce((sum, r) => sum + r.latency.decisions, 0);
      report('扩展实验汇总', { mode, games: group.length, wins: group.filter(r => r.outcome === 'V2胜').length,
        losses: group.filter(r => r.outcome === '启发式胜').length, draws: group.filter(r => r.outcome === '自然平局').length,
        truncated: group.filter(r => r.outcome === '截断').length, errors: group.filter(r => r.error !== null).length,
        decisions, meanMs: group.reduce((sum, r) => sum + r.latency.totalMs, 0) / Math.max(1, decisions),
        maxMs: Math.max(0, ...group.map(r => r.latency.maxMs)), over200: group.reduce((sum, r) => sum + r.latency.over200, 0) });
    }
  });
  for (const spec of arenaCases()) it(`${spec.id} ${spec.map} V2席位/联盟${spec.seat}`, async () => {
    const result = await playArena(spec);
    results.push(result);
    // 扩展实验只断言执行正确性，棋力结果和超时如实记录，不能反过来筛选有利样本。
    expect(result.error).toBeNull();
    expect(result.steps).toBeGreaterThan(0);
  }, 600000);
});
