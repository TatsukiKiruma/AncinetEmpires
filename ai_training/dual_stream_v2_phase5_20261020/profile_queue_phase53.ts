import fs from 'node:fs';
import path from 'node:path';
import { DIR, read } from './common';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { queueStateKey } from '../../src/ai_runtime/dual_v2/queue_state';

const plan = read('champion-search-arena/plan.json');
const slot = plan.slots.find((s: any) => s.id.includes('apk_like') && s.id.includes('-m1-s0-'));
const engine = new GameEngine(read(plan.maps[slot.mapIndex].path));
for await (const row of gzipRows(fs.readFileSync(path.join(DIR, 'champion-search-arena/battles', slot.id, 'actions.jsonl.gz')))) {
    if (row.i >= 466) break;
    engine.step(engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code)!);
}
const state = engine.getState(), buckets = { clone: [] as number[], key: [] as number[], legal: [] as number[], compare: [] as number[] };
for (let i = 0; i < 1000; i++) {
    const t0 = performance.now(), snapshot = engine.getState(), t1 = performance.now();
    queueStateKey(snapshot); const t2 = performance.now();
    engine.getLegalActions(state.currentPlayer, { unitId: 'u_26', skipRecruitment: true });
    const t3 = performance.now();
    engine.matchesState(state); const t4 = performance.now();
    if (i >= 100) { buckets.clone.push(t1 - t0); buckets.key.push(t2 - t1); buckets.legal.push(t3 - t2); buckets.compare.push(t4 - t3); }
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(buckets).map(([k, values]) => { values.sort((a, b) => a - b); return [k, { p50: values[450], p95: values[855], max: values.at(-1) }]; }))));
