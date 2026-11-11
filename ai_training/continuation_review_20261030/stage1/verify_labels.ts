/** 合成联盟变换和真实2/3/4人前态的候选、掩码与赢家槽合同。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, decodeAction } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { trainingValueTarget } from '../../../src/ai_runtime/dual_v3/value_target';
import { HERE, INDEX, read, save, initialState, stateKey } from './io';
const source = read(INDEX), results: any[] = [];
for (const players of [2, 3, 4]) {
    const parent = source.find((p: any) => p.players === players), state = initialState(parent);
    const engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    assert.equal(stateKey(engine.getState()), stateKey(state)); assert.equal(stateKey(engine.clone().getState()), stateKey(state));
    const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
    const codes = legal.map(encodeAction); assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) { const decoded = decodeAction(code); assert(decoded); assert.equal(encodeAction(decoded), code); }
    const observation = encodeDualObservation(state, legal, new ReachabilityContext(state));
    assert.equal(new Set(observation.actions.sourceIndices).size, observation.actions.sourceIndices.length);
    for (const i of observation.actions.sourceIndices) assert(i >= 0 && i < legal.length);
    const disabled = trainingValueTarget(state, observation.playerOrder, false, null); assert.equal(disabled.valueMask, false); assert.equal(disabled.target.reduce((a, b) => a + b), 0);
    for (const winner of state.players.filter(p => p.isAlive).map(p => getAllianceId(state, p.id))) {
        const value = trainingValueTarget(state, observation.playerOrder, true, winner); assert(value.valueMask); assert(Math.abs(value.target.reduce((a, b) => a + b) - 1) < 1e-6);
        observation.playerOrder.playerIds.forEach((id, slot) => { if (value.target[slot]) { assert(id !== null); assert.equal(getAllianceId(state, id), winner); assert(observation.playerOrder.active[slot]); } });
    }
    if (players >= 3) {
        const allied = structuredClone(state), alive = allied.players.filter(p => p.isAlive); allied.rules.alliances = Object.fromEntries(alive.map((p, i) => [p.id, i < 2 ? 77 : 88 + i]));
        const value = trainingValueTarget(allied, observation.playerOrder, true, 77);
        const targets = Array.from(value.target).filter(v => v > 0); assert.deepEqual(targets, [.5, .5]);
        const draw = trainingValueTarget(allied, observation.playerOrder, true, -1); assert(Math.abs(draw.target.reduce((a, b) => a + b) - 1) < 1e-6);
    }
    results.push({ parentId: parent.parentId, players, candidates: legal.length, factored: observation.actions.sourceIndices.length, cloningNoSecondIncome: true, candidateRoundtrip: true, activeAllianceAndDrawTarget: true });
}
save(path.join(HERE, 'LABEL_CONTRACTS.json'), { passed: true, cases: results, syntheticAllianceCases: 2, wholeGameReplay: false, updates: 0 });
console.log(JSON.stringify({ passed: true, cases: results.length }));
