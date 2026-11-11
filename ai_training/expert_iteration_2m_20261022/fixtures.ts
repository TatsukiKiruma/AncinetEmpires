/** 真实开中残局与大实体/奇数边长工程夹具分别保留，不混称真实对局。 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { softPriors } from '../../src/ai_runtime/dual_v3/search_policy';
import { ReachabilityContext } from '../../src/ai_runtime/dual_v2/reachability';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';
import { architectureFixtures } from '../dual_stream_v2_phase2_20261020/fixture_states';
import type { GameState } from '../../src/game/types';
const dir = path.dirname(fileURLToPath(import.meta.url));
const real: GameState[] = JSON.parse(gunzipSync(fs.readFileSync(path.join(dir, '../dual_stream_v2_phase2_20261020/real-states.json.gz'))).toString());
const late: { state: GameState }[] = JSON.parse(fs.readFileSync(path.join(dir, '../dual_stream_v2_phase6_20261022/corpus/parity-states.json'), 'utf8'));
const cases = [...real.map((state, i) => ({ name: `real-${i}`, state, kind: 'real' })), ...late.map((r, i) => ({ name: `late-${i}`, state: r.state, kind: 'real' })), ...architectureFixtures().map(r => ({ ...r, kind: 'engineering' }))];
const frames: Buffer[] = [], descriptions = [];
for (const row of cases) {
    const engine = new GameEngine(row.state, { applyInitialTurnStart: false }), state = engine.getState();
    if (engine.isTerminal()) continue;
    const legal = engine.getLegalActions(state.currentPlayer), context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context);
    const valueTarget = new Float32Array(6); valueTarget[0] = 1;
    const pack = packTensorBatch([observation], [{ target: 0, policyMask: true, valueMask: false, valueTarget, weight: 1 }]);
    const prior = softPriors(state, legal, context);
    const metadata = Buffer.from(JSON.stringify({ ...pack.metadata, sources: [{ id: row.name, kind: row.kind, prior: Array.from(observation.actions.sourceIndices, i => prior[i]) }] }));
    const header = Buffer.alloc(8); header.writeUInt32LE(metadata.length); header.writeUInt32LE(pack.bytes.length, 4);
    frames.push(header, metadata, pack.bytes); descriptions.push({ id: row.name, kind: row.kind, turn: state.turn, width: state.map.width, height: state.map.height, entities: observation.entityIndexMap.entities.length, actions: observation.actions.sourceIndices.length });
}
for (const name of ['fixtures.frames', 'fixtures.json', 'probe-states.json']) if (fs.existsSync(path.join(dir, name))) throw Error('拒绝覆盖夹具');
fs.writeFileSync(path.join(dir, 'fixtures.frames'), Buffer.concat(frames)); fs.writeFileSync(path.join(dir, 'fixtures.json'), JSON.stringify(descriptions, null, 2));
fs.writeFileSync(path.join(dir, 'probe-states.json'), JSON.stringify(cases.filter(r => r.kind === 'real').filter((_, i) => i % 12 === 0)));
console.log(JSON.stringify({ fixtures: descriptions.length }));
