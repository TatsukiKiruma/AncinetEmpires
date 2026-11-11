import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = path.resolve(import.meta.dirname, '../../../src/ai_runtime/dual_v3');
let source = fs.readFileSync(path.join(base, 'batched_beam_search.ts'), 'utf8');
source = source.replace(/from '([^']+)'/g, (_, p) => `from '${path.relative(import.meta.dirname, path.resolve(base, p)).replaceAll('\\', '/')}'`);
function replaceOnce(from, to) {
    assert.equal(source.split(from).length, 2, '生成教师适配时必须精确命中：' + from);
    source = source.replace(from, to);
}
// 不改候选、节点配额或反扑逻辑；移除墙钟预测裁剪，保留60秒故障上限。
replaceOnce('private room(reserve = 0) { return performance.now() + reserve < Math.min(this.deadline - 75, this.activeEnd); }',
    "private room(_reserve = 0) { if (performance.now() >= this.deadline) throw Error('教师搜索超过60秒安全上限，拒绝产出部分标签'); return true; }");
replaceOnce('budget > 4000', 'budget > 60000');
source = source.replace('20至4000毫秒', '20至60000毫秒');
replaceOnce('    private key(s: GameState) {', '    private key(s: GameState) { return compactKey(this, s); }\n    private originalKey(s: GameState) {');
source = "import { compactKey } from '../speed_bench_20261107/search_support';\n" + source;
fs.writeFileSync(path.join(import.meta.dirname, 'teacher_search.ts'), source);
const config = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../stage5/config-C1.json')));
assert.equal(config.priorAnchor, .1);
fs.writeFileSync(path.join(import.meta.dirname, 'TEACHER_CONFIG.json'), JSON.stringify({ ...config, budgetMs: 60000, maxNodes: 2500, finalists: 8, auditHash: true }, null, 2));
