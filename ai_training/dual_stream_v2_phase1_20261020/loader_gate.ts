import assert from 'node:assert/strict';
import path from 'node:path';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { DIR, read, save } from './io';
import { createLoaderStats, encodeSample, loadExclusions, nativeEntries, streamNativeSegment } from './streaming_loader';

const manifest = read(path.join(DIR, 'split-manifest-v2.json')), exclusions = loadExclusions(manifest);
const groups = new Map<string, string>();
for (const parent of manifest.parents) {
    const key = `${parent.source}:${parent.group}`;
    if (groups.has(key)) assert.equal(groups.get(key), parent.split);
    groups.set(key, parent.split);
}
const entry = nativeEntries().find(e => e.policyLabelEligible && e.admittedAtoms > 0)!;
const first = (await streamNativeSegment(entry, new Set()).next()).value!;
const remapping = encodeSample(first);
assert.equal(remapping.observation.actions.sourceIndices[remapping.target], first.targetIndex);
const tests = [];
for (const hash of [first.sourceBeforeHash, first.currentBeforeHash, ruleStateHash(first.state)]) {
    const stats = createLoaderStats(), iterator = streamNativeSegment(entry, new Set([hash]), stats);
    const next = await iterator.next(); await iterator.return(undefined);
    assert.ok(stats.excluded > 0);
    if (!next.done) assert.notEqual(next.value.currentBeforeHash, first.currentBeforeHash);
    tests.push({ hash, excluded: stats.excluded });
}
await assert.rejects(async () => { for await (const _sample of streamNativeSegment({ ...entry, shardSha256: '0'.repeat(64) }, new Set())) void _sample; }, /SHA/);
assert.equal(exclusions.size, manifest.exclusion.uniqueStates);
save('streaming-loader-gate.json', { passed: true, groupLeakage: 0, exclusionPaths: tests, excludedEvaluationStates: exclusions.size, targetRemapping: true, corruptShaRejectedBeforeEmit: true, featureFilesWritten: 0 });
console.log('流式排重、父局分区、目标重映射和损坏输入回归通过');
