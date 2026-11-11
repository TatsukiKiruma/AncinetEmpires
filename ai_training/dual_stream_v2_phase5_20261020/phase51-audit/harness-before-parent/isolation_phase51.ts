import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { DIR, read, save, sha, corpus, restore } from './common';
import { evaluationExclusions } from './exclusions';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';

// 新评测加入索引前先按训练输入SHA恢复旧索引，不能用新索引反向改变实际训练样本数。
const folder = 'generations/gen_02', identity = read(folder + '/training-input-identity.json');
const expected = identity.dataIdentity['evaluation-exclusions.txt.gz'];
let index = path.join(DIR, 'evaluation-exclusions.txt.gz');
if (sha(fs.readFileSync(index)) !== expected) index = path.join(DIR, 'evaluation-index-history', expected + '.txt.gz');
assert.equal(sha(fs.readFileSync(index)), expected);
const frozen = new Set(gunzipSync(fs.readFileSync(index)).toString().trim().split('\n'));
const evaluated = await evaluationExclusions();
let baseSamples = 0, expertSamples = 0, baseOverlaps = 0, expertOverlaps = 0;
for await (const row of corpus('train')) {
    const full = row.label.currentBeforeHash, canonical = ruleStateHash(row.state);
    if (Number.parseInt(sha(full).slice(0, 8), 16) / 4294967296 >= 20000 / 141381) continue;
    if (frozen.has(full) || frozen.has(row.label.sourceBeforeHash) || frozen.has(canonical)) continue;
    baseSamples++;
    if (evaluated.has(full) || evaluated.has(row.label.sourceBeforeHash) || evaluated.has(canonical)) baseOverlaps++;
}
for (const entry of identity.replayBufferManifest) {
    const plan = read(entry.manifest);
    for (const slot of plan.slots) {
        const initial = read(slot.initialPath);
        const prefix = `generations/gen_${String(entry.generation).padStart(2, '0')}/games/${slot.id}`;
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'samples.jsonl.gz')))) {
            const state = restore(row.state, initial.map, row.patches, row.mapIndex), canonical = ruleStateHash(state);
            assert.equal(stateHash(state), row.beforeHash);
            if (frozen.has(row.beforeHash) || frozen.has(canonical)) continue;
            expertSamples++;
            if (evaluated.has(row.beforeHash) || evaluated.has(canonical)) expertOverlaps++;
        }
    }
}
const training = read(folder + '/training-complete.json');
assert.equal(baseSamples * training.epoch, training.baseSamples);
assert.equal(expertSamples * training.epoch, training.expertSamples);
const result = { passed: baseOverlaps === 0 && expertOverlaps === 0, baseSamples, expertSamples, baseOverlaps, expertOverlaps, indexSha256: expected, postEvaluationReceipt: read('evaluation-exclusion-receipt.json'), scope: '基础/专家实际准入状态与当前及历史评测完整SHA、权威规则等价态排重核对；旧未持久尾部不可补造' };
save('phase51-audit/post-evaluation-isolation.json', result);
console.log(JSON.stringify({ passed: result.passed, baseSamples, expertSamples, baseOverlaps, expertOverlaps }));
assert.ok(result.passed);
