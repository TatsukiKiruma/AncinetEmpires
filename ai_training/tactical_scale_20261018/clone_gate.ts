import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { GameEngine as Reference } from './reference_engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { read, save, hash } from './io';

let steps = 0, cloneChecks = 0;
const traces = [];
for (let map = 0; map < 5; map++) for (const policy of ['random', 'heuristic']) {
    const initial = read(`../tactical_conditional_20261018/battles/initial/map-${map}.json`);
    let old = new Reference(initial), current = new GameEngine(initial);
    let seed = 20261018 + map, episodes = 1;
    const rng = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    const ai = new HeuristicAI(rng);
    for (let i = 0; i < 600; i++) {
        assert.equal(JSON.stringify(current.getState()), JSON.stringify(old.getState()), `前态${steps}`);
        if (current.isTerminal()) { current = new GameEngine(initial); old = new Reference(initial); episodes++; }
        const state = current.getState(), legal = current.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        assert.deepEqual(legal.map(encodeAction), old.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender').map(encodeAction));
        const action = policy === 'random' ? legal[Math.floor(rng() * legal.length)] : ai.getAction(current, state.currentPlayer, legal);
        const a = current.step(action), b = old.step(action);
        assert.equal(JSON.stringify(a), JSON.stringify(b), `结算${steps}`);
        if (i % 20 === 0) {
            assert.equal(JSON.stringify(current.clone().getState()), JSON.stringify(old.clone().getState())); cloneChecks++;
        }
        steps++;
    }
    traces.push({ map, policy, steps: 600, episodes, finalHash: hash(current.getState()) });
    console.log(JSON.stringify(traces.at(-1)));
}
const state = read('../tactical_conditional_20261018/battles/initial/map-4.json');
const old = new Reference(state), current = new GameEngine(state), timings: Record<string, number> = {};
for (const [name, engine] of [['old', old], ['new', current]] as const) {
    const start = performance.now();
    for (let i = 0; i < 2000; i++) { engine.getState(); engine.clone(); }
    timings[name] = performance.now() - start;
}
save('clone-trajectory-parity.json', { passed: true, steps, cloneChecks, byteEqual: true, traces, timingsMs: timings, speedup: timings.old / timings.new });
