import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { DIR, read, save, sha, corpus, restore } from './common';
import { evaluationExclusions } from './exclusions';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';

// 实际消费ID先冻结，再用新增评测索引审核；不得反向重抽训练集。
const folder = 'generations/gen_04', training = read(folder + '/training-complete.json'), identity = read(folder + '/training-input-identity.json');
const consumedPath = path.join(DIR, training.consumedIds.path);
assert.equal(sha(fs.readFileSync(consumedPath)), training.consumedIds.sha256);
const ids = JSON.parse(gunzipSync(fs.readFileSync(consumedPath)).toString());
const supervised = JSON.parse(gunzipSync(fs.readFileSync(path.join(DIR, training.supervised.consumedIds.path))).toString());
for (const kind of ['base', 'expert']) assert.deepEqual(ids[kind], supervised[kind]);
const requested = Object.fromEntries(Object.entries(ids).map(([kind, values]) => [kind, new Set(values as string[])]));
for (const id of requested.constraint) assert.ok(requested.base.has(id as string));
const expected = identity.dataIdentity['evaluation-exclusions.txt.gz'];
let index = path.join(DIR, 'evaluation-exclusions.txt.gz');
if (sha(fs.readFileSync(index)) !== expected) index = path.join(DIR, 'evaluation-index-history', expected + '.txt.gz');
assert.equal(sha(fs.readFileSync(index)), expected);
const frozen = new Set(gunzipSync(fs.readFileSync(index)).toString().trim().split('\n'));
const evaluated = await evaluationExclusions();
const counts = { base: 0, expert: 0, constraint: 0 }, overlaps = { base: 0, expert: 0, constraint: 0 };
for await (const row of corpus('train')) {
    if (!requested.base.has(row.id)) continue;
    const full = row.label.currentBeforeHash, canonical = ruleStateHash(row.state);
    assert.ok(!frozen.has(full) && !frozen.has(row.label.sourceBeforeHash) && !frozen.has(canonical));
    assert.ok(Number.parseInt(sha(full).slice(0, 8), 16) / 4294967296 < read('phase53-audit/gen4-protocol.json').baseRate);
    counts.base++;
    const overlap = evaluated.has(full) || evaluated.has(row.label.sourceBeforeHash) || evaluated.has(canonical);
    overlaps.base += Number(overlap);
    if (requested.constraint.has(row.id)) { counts.constraint++; overlaps.constraint += Number(overlap); }
}
const plan = read(folder + '/league-plan.json');
for (const slot of plan.slots) {
    const initial = read(slot.initialPath), prefix = `${folder}/games/${slot.id}`;
    for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'samples.jsonl.gz')))) {
        if (!requested.expert.has(row.id)) continue;
        assert.equal(row.correction, true);
        const state = restore(row.state, initial.map, row.patches, row.mapIndex), canonical = ruleStateHash(state);
        assert.equal(stateHash(state), row.beforeHash);
        assert.ok(!frozen.has(row.beforeHash) && !frozen.has(canonical));
        counts.expert++; overlaps.expert += Number(evaluated.has(row.beforeHash) || evaluated.has(canonical));
    }
}
for (const kind of ['base', 'expert', 'constraint'] as const) assert.equal(counts[kind], requested[kind].size);
assert.equal(counts.base, training.supervised.baseSamples); assert.equal(counts.expert, training.supervised.expertSamples);
const result = { passed: Object.values(overlaps).every(n => n === 0), counts, overlaps, trainingIndexSha256: expected, actualConsumedIdsSha256: training.consumedIds.sha256, postEvaluationReceipt: read('evaluation-exclusion-receipt.json'), scope: '实际基础、专家、待机约束输入与当前及历史已消费评测轨迹的完整SHA及权威等价态隔离；反扑见证另行strict复核' };
save(folder + '/post-evaluation-isolation.json', result); console.log(JSON.stringify({ passed: result.passed, counts, overlaps })); assert.ok(result.passed);
