import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import { DIR, read, save } from './common';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import type { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { queueStateKey } from '../../src/ai_runtime/dual_v2/queue_state';

const outlier = read('phase53-audit/v4r2-queue-outliers.json')[0], plan = read('champion-search-arena/plan.json');
const slot = plan.slots.find((s: any) => outlier.path.includes(s.id)), engine = new GameEngine(read(plan.maps[slot.mapIndex].path));
for await (const row of gzipRows(fs.readFileSync(path.join(DIR, 'champion-search-arena/battles', slot.id, 'actions.jsonl.gz')))) {
    if (row.i === outlier.row.i) break;
    const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code)!; engine.step(action);
}
const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer), action = legal.find(a => encodeAction(a) === outlier.row.code)!;
assert.ok(action);
const ai = new DualStreamTurnSearchAI({} as DualStreamModel), head = { state, action, expectedStateHash: queueStateKey(state) };
const samples: number[] = [], components: any[] = [], match = engine.matchesState.bind(engine), validate = engine.hasLegalAction.bind(engine);
let matchMs = 0, legalMs = 0;
engine.matchesState = s => { const start = performance.now(), result = match(s); matchMs = performance.now() - start; return result; };
engine.hasLegalAction = (p, a) => { const start = performance.now(), result = validate(p, a); legalMs = performance.now() - start; return result; };
for (let i = 0; i < 10000; i++) {
    ai.memory.queue[0] = head;
    const start = performance.now(); ai.getAction(engine, state.currentPlayer); const ms = performance.now() - start;
    if (i >= 100) { samples.push(ms); if (ms >= .5) components.push({ i, ms, matchMs, legalMs }); }
}
samples.sort((a, b) => a - b);
const receipt = { slot: slot.id, step: outlier.row.i, units: state.units.length, legalActions: legal.length, map: [state.map.width, state.map.height], samples: samples.length, p50: samples[Math.floor(samples.length * .5)], p95: samples[Math.floor(samples.length * .95)], max: samples.at(-1), outliers: components, logicalCpus: os.cpus().length, parallelism: os.availableParallelism(), freeMemory: os.freemem(), totalMemory: os.totalmem() };
save('phase53-audit/queue-tail-profile.json', receipt);
console.log(JSON.stringify(receipt));
