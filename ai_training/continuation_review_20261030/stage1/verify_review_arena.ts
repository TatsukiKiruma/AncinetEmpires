/** 非零行动玩家、颜色/手序和旧稳定argmax等价的轻量夹具，无新实战。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../../src/ai_runtime/dual_v3/search_policy';
import { playerIdentity, naturalCoverage } from './arena_contract';
import { modelAction } from './arena_policy';
import { HERE, read, save } from './io';

const synthetic = { currentPlayer: 3, players: [{ id: 1, isAlive: true }, { id: 3, isAlive: true }] };
assert.deepEqual(playerIdentity(synthetic, 0), { seat: 0, modelPlayer: 1, firstToActPlayer: 3, actualHand: 'second' });
assert.equal(playerIdentity(synthetic, 1).actualHand, 'first');
assert.throws(() => playerIdentity({ ...synthetic, currentPlayer: 7 }, 0));
assert.equal(naturalCoverage([{ natural: true, winner: 1, classification: 'natural_win', error: null, timeForfeit: null }, { natural: false, winner: null, classification: 'runtime_error', error: 'fixture' }]), 1);
assert.equal(naturalCoverage([{ natural: true, winner: 1, classification: 'natural_win', error: 'fixture' }]), 0);
const panel = read(path.join(HERE, 'ARENA_PANEL.json'));
let checked = 0;
for (const slot of panel.slots.slice(0, 3)) {
    const state = read(path.join(HERE, slot.file)), engine = new GameEngine(state, { applyInitialTurnStart: false });
    const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
    const context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context), prior = softPriors(state, legal, context);
    for (const tied of [true, false]) {
        const logits = Array.from(observation.actions.sourceIndices, (_, i) => tied ? 0 : Math.sin(i));
        let best = 0, score = -Infinity;
        logits.forEach((v, i) => { const value = v + prior[observation.actions.sourceIndices[i]]; if (value > score) { score = value; best = i; } });
        const action = await modelAction(state, legal, { forward: async () => [{ logits }] } as any);
        assert.equal(encodeAction(action), encodeAction(legal[observation.actions.sourceIndices[best]])); checked++;
    }
}
save(path.join(HERE, 'REVIEW_ARENA_CONTRACTS.json'), { passed: true, nonzeroCurrentPlayer: true, explicitColorAndActualHand: true, stableArgmaxEquivalenceCases: checked, realGpuForwardCalls: 0, optimizerUpdates: 0, newGames: 0 });
console.log(JSON.stringify({ passed: true, cases: checked, newGames: 0 }));
