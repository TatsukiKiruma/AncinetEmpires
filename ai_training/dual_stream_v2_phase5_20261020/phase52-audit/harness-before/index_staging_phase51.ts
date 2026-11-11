import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, save, sha } from './common';
import { persistEvaluationIndex } from './evaluation_index';

const parent = path.resolve(ROOT, '.runtime'); fs.mkdirSync(parent, { recursive: true });
const fixture = fs.mkdtempSync(path.join(parent, 'phase51-index-test-'));
try {
    const first = Buffer.alloc(6, 1), second = Buffer.alloc(7, 2), third = Buffer.alloc(8, 3);
    persistEvaluationIndex(fixture, first, 0, 65);
    const target = path.join(fixture, 'evaluation-exclusions.txt.gz');
    assert.throws(() => persistEvaluationIndex(fixture, second, 60, 65), /磁盘门禁/);
    assert.deepEqual(fs.readFileSync(target), first);
    assert.ok(!fs.existsSync(path.join(fixture, 'evaluation-index-history')));
    const result = persistEvaluationIndex(fixture, second, 54, 65);
    assert.equal(result.peakDirectoryBytes, 61);
    assert.deepEqual(fs.readFileSync(path.join(fixture, 'evaluation-index-history', sha(first) + '.txt.gz')), first);
    assert.deepEqual(fs.readFileSync(target), second);
    assert.equal(persistEvaluationIndex(fixture, second, 999, 1).changed, false);
    fs.writeFileSync(path.join(fixture, 'evaluation-index-history', sha(second) + '.txt.gz'), first);
    assert.throws(() => persistEvaluationIndex(fixture, third, 20, 65), /保全SHA不符/);
    assert.deepEqual(fs.readFileSync(target), second);
    save('phase51-audit/index-staging-regression.json', { passed: true, peakCountedBeforeMutation: true, outsideDirectoryStagingSameVolume: true, oldBytesPreserved: true, archiveCorruptionRejected: true, systemFreeGuardGiB: 12, directoryLimit: 650_000_000 });
} finally {
    assert.equal(path.dirname(path.resolve(fixture)), parent);
    assert.ok(path.basename(fixture).startsWith('phase51-index-test-'));
    fs.rmSync(fixture, { recursive: true });
}
