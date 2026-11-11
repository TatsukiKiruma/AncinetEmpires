import { performance } from 'node:perf_hooks';
import { getLegalActions } from '../../src/game/rules';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { multiplayerFixture, standardFixture } from './fixtures';
for (const state of [standardFixture(), multiplayerFixture(4, 32, 25)]) {
    const legal = getLegalActions(state, state.currentPlayer), times: number[] = [];
    for (let i = 0; i < 30; i++) { const t = performance.now(); const x = encodeDualObservation(state, legal); if (i > 9) times.push(performance.now() - t); if (i === 0) console.log({ units: state.units.length, legal: legal.length, entities: x.entityIndexMap.entities.length }); }
    times.sort((a, b) => a - b); console.log({ p50: times[10], p95: times[18], max: times[19] });
}
