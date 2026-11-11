import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadModelWeights } from '../../src/ai_runtime/dual_v2/model_weights';
import { spatialForward } from '../../src/ai_runtime/dual_v2/spatial_model';
import { entityForward } from '../../src/ai_runtime/dual_v2/entity_model';
import { policyForward } from '../../src/ai_runtime/dual_v2/policy_model';
import { valueForward } from '../../src/ai_runtime/dual_v2/value_model';
import { DIR, loadObservations, read, save } from './io';
const bytes = fs.readFileSync(path.join(DIR, 'initial.bin')), weights = loadModelWeights(read('initial.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const x = loadObservations().observations[70], times: number[][] = [];
for (let i = 0; i < 80; i++) {
    const start = performance.now(), spatial = spatialForward(x, weights), t1 = performance.now(), entity = entityForward(x, spatial.map, spatial.pooled, weights), t2 = performance.now();
    policyForward(x, entity.entities, spatial.map, entity.relations, weights); const t3 = performance.now(); valueForward(x, entity.entities, spatial.pooled, weights); const t4 = performance.now();
    if (i >= 30) times.push([t1 - start, t2 - t1, t3 - t2, t4 - t3]);
}
const result = { stages: ['spatial', 'entity', 'policy', 'value'], means: [0, 1, 2, 3].map(j => times.reduce((a, row) => a + row[j], 0) / times.length) };
save('profile.json', result); console.log(JSON.stringify(result));
