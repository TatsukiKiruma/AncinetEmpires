import fs from 'node:fs';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { encode, fields, parameterCount } from './model';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
const root = 'ai_training/sd_300_parent_pilot_20261016/';
const json = (n: string) => JSON.parse(fs.readFileSync(root + n, 'utf8'));
const s = json('selection.json'), schema = json('schema.json'), audit = json('data-audit.json');
const source = fs.readFileSync('ai_training/data_acceptance_20261016/phone/release-2026-10-15T21-05-00-859Z/release-index.jsonl', 'utf8').trim().split('\n').map(x => JSON.parse(x));
assert.equal(new Set(source.map(e => e.parentId)).size, 3000);
assert.equal(s.parents.length, 300); assert.equal(new Set(s.parents.map(p => p.parentId)).size, 300);
assert.equal(s.parents.filter(p => p.split === 'train').length, 240); assert.equal(s.parents.filter(p => p.split === 'validation').length, 60);
for (const p of s.parents) {
  assert.deepEqual(p.segments.map(e => e.segmentId).sort(), source.filter(e => e.parentId === p.parentId).map(e => e.segmentId).sort());
  for (const e of p.segments) { assert.equal(e.actualBucket.configMode, 'SD'); assert.equal(e.actualBucket.configuredPlayerCount, 2); }
}
assert.equal(audit.overlaps.train.rows, 88998); assert.equal(audit.overlaps.validation.rows, 16071);
assert.equal(audit.receipts.reduce((n, r) => n + r.atoms, 0), 105069);
const rows = gunzipSync(fs.readFileSync(root + 'witnesses.jsonl.gz')).toString().trim().split('\n').map(x => JSON.parse(x));
const first = rows[0], unknown = structuredClone(first.packet); unknown.tokens[0].__unknown_pilot_field = 1;
assert.throws(() => encode(unknown, schema), /schema拒绝未知特征/);
const state = structuredClone(first.state); state.rules.__unknown_pilot_rule = true;
assert.throws(() => observe(state, []), /未知规则字段/);
assert.equal(json('initial.json').length, parameterCount(schema));
assert.equal(schema.version, 'sd-entities-pilot-v2');
const oldSchema = JSON.parse(fs.readFileSync('ai_training/sd_adapter_trial_20261016/schema.json', 'utf8'));
assert.deepEqual(schema.token.keys, oldSchema.token.keys); assert.deepEqual(schema.candidate.keys, oldSchema.candidate.keys);
fs.writeFileSync(root + 'schema-review.json', JSON.stringify({ passed: true, approvedAddedTokenKeys: [], approvedAddedCandidateKeys: [], dictionaryUnchanged: true, schemaIdentityIsolated: true, unknownFieldsExplicitlyRejected: true }, null, 2));
const result = { passed: true, checks: ['300父局唯一分组', '240/60固定分区', '父局全续段无遗漏', '实际双人SD', '105069原子完整计数', '未知模型字段拒绝', '未知规则字段拒绝', '独立schema版本与权重长度'] };
fs.writeFileSync(root + 'contract-tests.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
