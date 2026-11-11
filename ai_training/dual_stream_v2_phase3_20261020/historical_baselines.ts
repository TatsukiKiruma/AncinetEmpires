import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, '../..');
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const plan = read(path.join(dir, 'battle-plan.json'));
const summaryPath = path.join(root, 'ai_training/tactical_exit_20261019/teacher-r6-battle-summary.json'), summary = read(summaryPath);
const evidence = path.join(root, 'ai_training/tactical_exit_20261019', summary.evidenceFolder, 'slots');
const expectedPureHash = stateHash(read(path.join(root, 'ai_training/tactical_value_search_20261018/model-final.json')));
const entries: any[] = [];
for (const slot of plan.slots.filter((s: any) => s.historicalId)) for (const model of ['hierarchical', 'pure']) {
    const id = slot.historicalId.replace('pure', model), location = path.join(evidence, id);
    const result = read(path.join(location, 'result.json')), started = read(path.join(location, 'started.json'));
    assert.equal(started.initialHash, plan.maps[slot.mapIndex].sha256);
    assert.equal(result.slot.opponentSeed, slot.opponentSeed); assert.equal(result.slot.seat, slot.seat);
    if (model === 'pure') assert.equal(result.modelHash, expectedPureHash);
    entries.push({ id, model: model === 'pure' ? 'stage4_pure' : 'stage3_hierarchical', classification: result.classification,
        modelHash: result.modelHash, initialHash: started.initialHash, resultPath: path.relative(root, path.join(location, 'result.json')).replaceAll('\\', '/'),
        resultSha256: sha(fs.readFileSync(path.join(location, 'result.json'))), startedSha256: sha(fs.readFileSync(path.join(location, 'started.json'))) });
}
assert.equal(entries.length, 80);
fs.writeFileSync(path.join(dir, 'historical-baseline-identities.json'), JSON.stringify({ passed: true, entries, summarySha256: sha(fs.readFileSync(summaryPath)), expectedStage4PureModelHash: expectedPureHash,
    groups: summary.groups.filter((g: any) => ['hierarchical', 'pure'].includes(g.model) && g.opponent !== 'random') }, null, 2));
