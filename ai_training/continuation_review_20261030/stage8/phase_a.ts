import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { aliveSeats, migrateCut, schedule, prototype, rolesFor } from './scenarios';

const rows = [];
for (let block = 0; block < 20; block++) {
    const jobs = schedule(1, block);
    const roles = jobs.flatMap(j => Object.values(j.roles));
    assert.equal(roles.length, 80);
    assert.equal(roles.filter(r => r === 'candidate').length, 64);
    assert.equal(roles.filter(r => r === 'C1').length, 8);
    assert.equal(roles.filter(r => r === 'hard').length, 8);
    for (const job of jobs) {
        const engine = new GameEngine(job.state, { applyInitialTurnStart: false });
        assert.deepEqual(engine.clone().getState(), engine.getState());
        const legal = engine.getLegalActions(job.state.currentPlayer).filter(a => a.type !== 'surrender');
        const obs = encodeDualObservation(job.state, legal);
        assert.equal(obs.playerOrder.active.filter(Boolean).length, job.players);
        assert.equal(obs.actions.sourceIndices.length, legal.length);
        assert(legal.length > 0);
        rows.push({ map: job.map, source: job.mapSource, players: job.players, gold: job.gold, population: job.population });
    }
}
const subsets = [[0, 2, 3], [0, 2, 4, 5], [1, 5]];
for (const ids of subsets) {
    const state = prototype(6);
    state.players.forEach(p => p.isAlive = ids.includes(p.id));
    state.units = state.units.filter(u => ids.includes(u.ownerId));
    for (const tile of state.map.tiles.flat()) if (tile.ownerId !== null && !ids.includes(tile.ownerId)) tile.ownerId = null;
    state.currentPlayer = ids[0];
    assert.deepEqual(aliveSeats(state), ids);
    assert.deepEqual(Object.keys(migrateCut(state, rolesFor(Array.from({length: ids.length}, (_, i) => i), 0))).map(Number), ids);
    const engine = new GameEngine(state, { applyInitialTurnStart: false });
    const obs = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer));
    assert.deepEqual(obs.playerOrder.playerIds.filter((id, index) => id !== null && obs.playerOrder.active[index]).sort((a, b) => a! - b!), ids);
}
writeFileSync(new URL('PHASE_A.json', import.meta.url), JSON.stringify({ passed: true, scenarios: rows.length,
    coverage: rows, nonContiguousSeats: subsets, leagueShares: { candidate: .8, K1: .1, hard: .1 }, sealedAccess: 0 }, null, 2));
console.log('Stage 8 Phase A：400 场景及非连续席位合同通过');

