import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { DIR, save } from './common';
import { persistEvaluationIndex } from './evaluation_index';

const root = path.resolve(DIR, 'phase51-audit');
const fixture = fs.mkdtempSync(path.join(root, 'quota-fixture-'));
try {
    const packed = gzipSync('独立磁盘配额夹具\n');
    const result = persistEvaluationIndex(fixture, packed, 300_000_000);
    assert.ok(result.changed);
    assert.throws(() => persistEvaluationIndex(fixture, gzipSync('下一版\n'), 650_000_000), /磁盘门禁/);
    assert.deepEqual(fs.readFileSync(path.join(fixture, 'evaluation-exclusions.txt.gz')), packed);
    save('phase51-audit/quota-regression.json', { passed: true, defaultDirectoryLimit: 650_000_000, aboveOldLimitAccepted: true, atNewLimitRejectedWithoutMutation: true, systemFreeLimitGiB: 12 });
} finally {
    // 只清理本脚本在指定审计根内创建的夹具。
    assert.equal(path.dirname(path.resolve(fixture)), root);
    assert.ok(path.basename(fixture).startsWith('quota-fixture-'));
    fs.rmSync(fixture, { recursive: true });
}
