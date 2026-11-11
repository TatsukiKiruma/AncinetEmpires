import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { DIR, STAGE3, corpus, read, save, sha } from './common';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';
import { loadExclusions } from '../dual_stream_v2_phase3_20261020/source_loader';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';

const generation = Number(process.argv[2] ?? 1), folder = `generations/gen_${String(generation).padStart(2, '0')}`;
const identities = read(folder + '/training-input-identity.json');
let globalFile = path.join(DIR, 'evaluation-exclusions.txt.gz');
if (sha(fs.readFileSync(globalFile)) !== identities.dataIdentity['evaluation-exclusions.txt.gz']) globalFile = path.join(DIR, 'evaluation-index-history', identities.dataIdentity['evaluation-exclusions.txt.gz'] + '.txt.gz');
assert.equal(sha(fs.readFileSync(globalFile)), identities.dataIdentity['evaluation-exclusions.txt.gz'], '训练时排重索引已经变化，不能重建原始基础样本');
const frozen = loadExclusions(read(path.join(STAGE3, 'split-manifest-v2-stage3.json')));
for (const hash of gunzipSync(fs.readFileSync(globalFile)).toString().trim().split('\n')) frozen.add(hash);
const evaluated = new Set<string>(); let evaluationGames = 0;
async function walk(folderPath: string) {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const file = path.join(folderPath, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.name === 'actions.jsonl.gz' && !/[/\\]generations[/\\]gen_\d+[/\\]games[/\\]/.test(file)) {
            // 中断后已持久化的评测前缀也纳入隔离，不要求先有完整终局。
            for await (const row of gzipRows(fs.readFileSync(file))) { evaluated.add(row.beforeHash); evaluated.add(row.afterHash); }
            evaluationGames++;
        }
    }
}
await walk(DIR);
let foundationSamples = 0, expertSamples = 0, foundationOverlaps = 0, expertOverlaps = 0;
const examples: unknown[] = [];
for await (const row of corpus('train')) {
    const hash = row.label.currentBeforeHash;
    if (Number.parseInt(sha(hash).slice(0, 8), 16) / 4294967296 >= 20000 / 141381) continue;
    if (frozen.has(ruleStateHash(row.state)) || frozen.has(row.label.sourceBeforeHash) || frozen.has(hash)) continue;
    foundationSamples++;
    if (evaluated.has(hash) || evaluated.has(row.label.sourceBeforeHash)) {
        foundationOverlaps++; if (examples.length < 20) examples.push({ source: 'foundation', id: row.id, beforeHash: hash });
    }
}
for (const entry of identities.replayBufferManifest) {
    const plan = read(entry.manifest);
    for (const slot of plan.slots) {
        const file = path.join(DIR, `generations/gen_${String(entry.generation).padStart(2, '0')}/games/${slot.id}/samples.jsonl.gz`);
        for await (const row of gzipRows(fs.readFileSync(file))) {
            expertSamples++;
            if (evaluated.has(row.beforeHash)) { expertOverlaps++; if (examples.length < 20) examples.push({ source: 'expert', id: row.id, beforeHash: row.beforeHash }); }
        }
    }
}
const training = read(folder + '/training-complete.json');
assert.equal(foundationSamples, training.history.filter((h: any) => h.phase === 'base').reduce((n: number, h: any) => n + h.processedThisSegment, 0));
assert.equal(expertSamples, training.history.filter((h: any) => h.phase === 'expert').reduce((n: number, h: any) => n + h.processedThisSegment, 0));
const result = { passed: foundationOverlaps === 0 && expertOverlaps === 0, generation, foundationSamples, expertSamples, evaluationGames, evaluatedHashes: evaluated.size, foundationOverlaps, expertOverlaps, examples, scope: '实际使用训练样本对全部阶段5正式及失败评测轨迹前/后态完整SHA核对；历史及开发隔离由冻结索引保证；此追加核对不冒称新增轨迹的单位改名等价规则态全覆盖' };
save('post-evaluation-isolation.json', result); console.log(JSON.stringify(result));
