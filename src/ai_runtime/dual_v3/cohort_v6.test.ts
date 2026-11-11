import { afterEach, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDemoState } from '../../game/demo_map';
import { encodeAction } from '../../game/env';
import { ReachabilityContext } from '../dual_v2/reachability';
import { tacticalActionPriors } from '../dual_v2/tactical_prior';
import { softPriors, tacticalPriorBundle } from './search_policy';
import { BatchedNeuralBeamSearchAI } from './batched_beam_search';
import { searchTeacher } from './search_teacher';

afterEach(() => vi.restoreAllMocks());

function army(count = 30) {
    const state = createDemoState();
    state.map.tiles = state.map.tiles.map((row, y) => row.map((_, x) => ({ terrainId: (x === 0 && y === 0 || x === 7 && y === 7 ? 10 : 6) as any, ownerId: x === 0 && y === 0 ? 0 : x === 7 && y === 7 ? 1 : null })));
    const commander = state.units[0], enemy = state.units[1];
    state.units = [...Array.from({ length: count }, (_, i) => ({ ...commander, id: `own-${i}`, unitClass: i ? 'soldier' as const : 'commander' as const, pos: { x: i % 8, y: Math.floor(i / 8) } })), enemy];
    state.players.forEach(p => { p.gold = 0; });
    return new GameEngine(state);
}

it('单次先验及禁手与旧表达式逐位一致，不请求时不分配禁手数组', () => {
    for (const engine of [new GameEngine(createDemoState()), army()]) {
        const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer), context = new ReachabilityContext(state);
        const reference = tacticalActionPriors(state, legal, context);
        const expected = Float32Array.from(reference, (p, i) => p.forbidden && legal[i].type === 'wait' ? -4 : p.forbidden && legal[i].type === 'end_turn' ? -8 : Math.max(-40, Math.min(120, p.prior)));
        const bundled = tacticalPriorBundle(state, legal, context, true);
        expect(bundled.priors).toEqual(expected);
        expect(bundled.priors).toEqual(softPriors(state, legal, context));
        expect([...bundled.forbidden!]).toEqual(reference.map(p => Number(p.forbidden)));
        expect(tacticalPriorBundle(state, legal, context).forbidden).toBeUndefined();
    }
});

async function rollout(options: { cohort: number; cost: number; cap?: number; count?: number; shedding?: boolean }) {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const engine = army(options.count), initial = engine.getState();
    const ai: any = new BatchedNeuralBeamSearchAI({ forwardBatch: async () => [] }, { modelVersion: 'V6虚拟时钟', ownTurnRollout: true, responseCohortSize: options.cohort, responseLightUnitThreshold: 1, responseVariants: 1, responseUnits: 128, ownRolloutMaxChains: options.cap, maxNodes: 5000 });
    ai.self = 0; ai.deadline = 3000; ai.activeEnd = 2975;
    const realRoom = ai.room.bind(ai);
    if (options.shedding === false) ai.room = (reserve = 0) => reserve === 450 || realRoom(reserve);
    ai.evaluateBatch = async (engines: GameEngine[]) => {
        clock += engines.length * options.cost;
        return engines.map(e => realRoom() ? { value: .2, ranked: e.getLegalActions(e.getState().currentPlayer).filter(a => a.type === 'wait' || a.type === 'end_turn').map(action => ({ action, code: encodeAction(action), score: action.type === 'wait' ? 1 : 0, prior: 0 })) } : undefined);
    };
    const roots = initial.units.filter(u => u.ownerId === 0).slice(0, 8).map(u => ({ type: 'wait' as const, unitId: u.id }));
    const branches = roots.map(action => {
        const copy = engine.clone(); copy.step(action);
        return { engine: copy, steps: [{ state: initial, action }], ends: [1], score: 0, value: .1, prior: 0 };
    });
    const groups = await ai.responseLeavesBatch(branches);
    const candidates = groups.map((g: any[], i: number) => ({ rootAction: encodeAction(roots[i]), responseComplete: g.every(t => t.complete), value: .2 }));
    return { ai, groups, candidates, teacher: searchTeacher(roots.map(encodeAction), candidates) };
}

it('虚拟固定成本下8轨迹锁步全超时，4+4保送前四且后四没有教师概率', async () => {
    const old = await rollout({ cohort: 8, cost: 14, shedding: false });
    expect(old.candidates.filter((c: any) => c.responseComplete)).toHaveLength(0);
    vi.restoreAllMocks();
    const fixed = await rollout({ cohort: 4, cost: 14 });
    expect(fixed.candidates.slice(0, 4).every((c: any) => c.responseComplete)).toBe(true);
    expect(fixed.teacher.available).toBe(true);
    expect(fixed.teacher.evaluatedMask.slice(4)).toEqual([false, false, false, false]);
    expect(fixed.teacher.probabilities.slice(4)).toEqual([0, 0, 0, 0]);
    expect(fixed.groups.slice(4).every((g: any[]) => g.every(t => t.reason === 'cohort_deferred'))).toBe(true);
});

it('尾段舍弃尾部轨迹时仍保留前二完成，舍弃项严格不生成标签', async () => {
    const result = await rollout({ cohort: 8, cost: 14 });
    expect(result.candidates.slice(0, 2).every((c: any) => c.responseComplete)).toBe(true);
    expect(result.groups.slice(2).every((g: any[]) => g.every(t => t.reason === 'budget_shed_for_top2' && !t.complete))).toBe(true);
    expect(result.teacher.evaluatedMask.slice(2).some(Boolean)).toBe(false);
});

it('超过24链的己方回合在默认64上限下正常闭合，旧24上限诚实截断', async () => {
    const old = await rollout({ cohort: 4, cost: 0, cap: 24, count: 35 });
    expect(old.groups.flat().some((t: any) => t.reason === 'own_rollout_cap')).toBe(true);
    vi.restoreAllMocks();
    const fixed = await rollout({ cohort: 4, cost: 0, count: 35 });
    expect(fixed.groups.flat().every((t: any) => t.complete && t.ownChains > 24)).toBe(true);
});
