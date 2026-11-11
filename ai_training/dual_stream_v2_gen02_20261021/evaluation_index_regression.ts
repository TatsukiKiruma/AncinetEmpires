import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DIR, sha, save } from './common';
import { persistEvaluationIndex } from './evaluation_index';

const folder = fs.mkdtempSync(path.join(DIR, 'index-regression-'));
const original = gzipSync('训练前排重\n'), revised = gzipSync('训练前排重\n新增设备与正式验收前态\n');
persistEvaluationIndex(folder, original, 0, 10000);
const file = path.join(folder, 'evaluation-exclusions.txt.gz');
// 峰值空间不足必须在任何索引变更之前拒绝，不能遗失原训练输入。
assert.throws(() => persistEvaluationIndex(folder, revised, original.length, original.length + revised.length), /磁盘门禁/);
assert.deepEqual(fs.readFileSync(file), original);
assert.ok(!fs.existsSync(path.join(folder, 'evaluation-index-history')));
const result = persistEvaluationIndex(folder, revised, original.length, 10000);
assert.equal(result.archivedSha256, sha(original));
const archived = path.join(folder, 'evaluation-index-history', sha(original) + '.txt.gz');
assert.deepEqual(fs.readFileSync(archived), original);
assert.equal(gunzipSync(fs.readFileSync(file)).toString(), '训练前排重\n新增设备与正式验收前态\n');
assert.equal(persistEvaluationIndex(folder, revised, 99999, 1).changed, false);
// 已存在但身份错误的历史副本须拒绝，不能以坏副本替代当前索引。
fs.writeFileSync(path.join(folder, 'evaluation-index-history', sha(revised) + '.txt.gz'), original);
assert.throws(() => persistEvaluationIndex(folder, gzipSync('下一代\n'), 200, 10000), /保全SHA不符/);
assert.deepEqual(fs.readFileSync(file), revised);
save('evaluation-index-regression.json', { passed: true, budgetRejectsBeforeMutation: true, archiveExactBytes: true, atomicReplacement: true, unchangedNoWrite: true, corruptArchiveRejected: true, fixture: path.relative(DIR, folder) });
console.log('排重索引空间、原子替换、历史字节保全与坏副本拒绝回归通过');
