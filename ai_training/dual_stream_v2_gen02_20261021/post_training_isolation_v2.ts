import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { DIR, corpus, read, restore, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';

const folder = 'generations/gen_02', identity = read(folder + '/training-input-identity.json'), training = read(folder + '/training-complete.json');
const digest = Object.entries(identity.dataIdentity).find(([name]) => name.endsWith('evaluation-exclusions.txt.gz'))![1] as string;
let index = path.join(DIR, 'evaluation-exclusions.txt.gz');
if (sha(fs.readFileSync(index)) !== digest) index = path.join(DIR, 'evaluation-index-history', digest + '.txt.gz');
assert.equal(sha(fs.readFileSync(index)), digest);
const frozen = new Set(gunzipSync(fs.readFileSync(index)).toString().trim().split('\n'));
const evaluated = new Set<string>();
let games = 0;
for (const arena of ['champion-pure-arena', 'champion-search-arena', folder + '/arena']) {
    const plan = read(arena + '/plan.json');
    for (const slot of plan.slots) {
        const initial = read(plan.maps[slot.mapIndex].path), engine = new GameEngine(initial), file = path.join(DIR, arena, 'battles', slot.id, 'actions.jsonl.gz');
        for await (const row of gzipRows(fs.readFileSync(file))) {
            const before = engine.getState(); assert.equal(stateHash(before), row.beforeHash);
            evaluated.add(row.beforeHash); evaluated.add(ruleStateHash(before));
            const action = decodeAction(row.code); assert.ok(action);
            const result = engine.step(action); assert.ok(!result.info.includes('非法动作')); assert.equal(stateHash(result.state), row.afterHash);
            evaluated.add(row.afterHash); evaluated.add(ruleStateHash(result.state));
        }
        games++;
        if (games % 28 === 0) console.log(JSON.stringify({ isolationReplaySlots: games, total: 224, states: evaluated.size }));
    }
}
let baseCount = 0, expertCount = 0, baseOverlaps = 0, expertOverlaps = 0;
const examples: any[] = [];
for await (const row of corpus('train')) {
    const hash = row.label.currentBeforeHash;
    if (Number.parseInt(sha(hash).slice(0, 8), 16) / 4294967296 >= 20000 / 141381) continue;
    const rule = ruleStateHash(row.state);
    if (frozen.has(hash) || frozen.has(row.label.sourceBeforeHash) || frozen.has(rule)) continue;
    baseCount++;
    if (evaluated.has(hash) || evaluated.has(row.label.sourceBeforeHash) || evaluated.has(rule)) { baseOverlaps++; if (examples.length < 20) examples.push({ source: 'base', id: row.id, hash }); }
}
const plan = read(folder + '/league-plan.json');
for (const slot of plan.slots) {
    const initial = read(slot.initialPath);
    for await (const row of gzipRows(fs.readFileSync(path.join(DIR, folder, 'games', slot.id, 'samples.jsonl.gz')))) {
        const state = restore(row.state, initial.map, row.patches, row.mapIndex), rule = ruleStateHash(state);
        if (frozen.has(row.beforeHash) || frozen.has(rule)) continue;
        expertCount++;
        if (evaluated.has(row.beforeHash) || evaluated.has(rule)) { expertOverlaps++; if (examples.length < 20) examples.push({ source: 'expert', id: row.id, hash: row.beforeHash }); }
    }
}
assert.equal(baseCount, training.baseSamples); assert.equal(expertCount, training.expertSamples);
save('post-evaluation-isolation-v2.json', { passed: baseOverlaps + expertOverlaps === 0, baseCount, expertCount, games, baseOverlaps, expertOverlaps, examples, includesCanonicalRuleStates: true, frozenInputIndexSha256: digest, diagnosticSourceSha256: sha(fs.readFileSync(import.meta.filename)), scope: '本代实际消费样本与同运行时冠军/候选224槽的完整及规则等价态复核；采样前历史/开发隔离由冻结索引保证' });
console.log(JSON.stringify({ baseCount, expertCount, games, baseOverlaps, expertOverlaps }));
