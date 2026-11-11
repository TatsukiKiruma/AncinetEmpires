import { expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { encodeAction } from '../../game/env';
import { getTileTerrainKey } from '../../game/terrain_rules';
import type { Action } from '../../game/types';
import type { DualStreamModel } from './model_runtime';
import { DualStreamTurnSearchAI } from './turn_search_ai';

it('三单位接管只兑现首单位，下个单位必须基于新局面重搜', () => {
    const state = createDefaultAppGameState(), self = state.currentPlayer;
    const town = state.map.tiles.flat().find(t => getTileTerrainKey(t) === 'town')!;
    const template = state.units.find(u => u.ownerId === self)!;
    for (let i = 0; i < 3; i++) {
        const pos = { x: 1 + i * 2, y: 1 };
        state.map.tiles[pos.y][pos.x] = { ...town, ownerId: null };
        state.units = state.units.filter(u => u.pos.x !== pos.x || u.pos.y !== pos.y);
        state.units.push({ ...structuredClone(template), id: `占村步兵${i}`, unitClass: 'soldier', pos, hasMoved: false, hasActed: false });
    }
    const engine = new GameEngine(state);
    const plan = (capture: boolean) => {
        const clone = engine.clone(), queue: { state: typeof state; action: Action }[] = [];
        for (let i = 0; i < 3; i++) {
            const action = clone.getLegalActions(self).find(a => a.type === (capture ? 'capture' : 'wait') && 'unitId' in a && a.unitId === `占村步兵${i}`)!;
            expect(action).toBeDefined(); queue.push({ state: clone.getState(), action }); clone.step(action);
        }
        return { engine: clone, queue, unitEnds: [1, 2, 3], actors: ['占村步兵0', '占村步兵1', '占村步兵2'], prior: 0, score: 0 };
    };
    const primary = plan(false), challenge = plan(true);
    const model = { forward: () => ({ valueProbs: new Float32Array(6) }) } as unknown as DualStreamModel;
    const ai = new DualStreamTurnSearchAI(model) as any;
    vi.spyOn(ai, 'candidateRoots').mockReturnValue([primary, challenge].map(p => ({ action: p.queue[0].action, score: 0 })));
    vi.spyOn(ai, 'complete').mockImplementation((_b: unknown, action: Action) => [action.type === 'capture' ? challenge : primary]);
    vi.spyOn(ai, 'retaliation').mockReturnValue({ penalty: 0, commanders: new Map(), complete: true, staticComplete: true, lethalActors: 0, expandedChains: 2, staticCoveredUnits: 0 });
    const first = ai.getAction(engine, self); expect(ai.telemetry.takeover).toBe(true);
    engine.step(first);
    expect(ai.telemetry.selectedUnits).toBe(3);
    expect(ai.memory.queue).toHaveLength(0);
    expect(engine.getState().map.tiles[1][1].ownerId).toBe(self);
    expect([3, 5].map(x => engine.getState().map.tiles[1][x].ownerId)).toEqual([null, null]);
});
