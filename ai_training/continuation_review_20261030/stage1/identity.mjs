/** 保存训练源码闭包、所有交付证据和原件位置身份；不改协调状态。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex'), read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const save = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + '\n');
const entries = fs.readdirSync(here).filter(f => f.endsWith('.ts')).map(f => path.join(here, f));
const bundled = await build({ absWorkingDir: root, entryPoints: entries, bundle: true, write: false, outdir: 'unused-stage1-source-closure', platform: 'node', format: 'esm', packages: 'external', metafile: true, logLevel: 'silent' });
const files = new Set(Object.keys(bundled.metafile.inputs).map(p => path.resolve(root, p)));
for (const d of [here, path.join(root, 'ai_training/gpu')]) for (const f of fs.readdirSync(d)) if (/\.(py|mjs)$/.test(f)) files.add(path.join(d, f));
for (const p of ['ai_training/expert_iteration_2m_20261022/model.py', 'ai_training/dual_stream_v2_phase2_20261020/accurate_ops.py']) files.add(path.join(root, p));
save(path.join(here, 'SOURCE_MANIFEST.json'), { sources: [...files].sort().map(file => ({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: sha(fs.readFileSync(file)) })), snapshotsAreIdentityOnly: true });
const parts = read(path.join(here, 'PARTITIONS.json'));
const store = 'D:/AncientEmpiresData/continuation_stage1_20261030_v1/raw-store';
let total = 0, blocks = 0; const storeRows = [];
for (const p of parts.parents) {
    const file = path.join(store, p.parentId + '.json'), index = read(file), original = p.files[index.sourceFile], expected = typeof original === 'string' ? original : original.sha256;
    if (index.records !== p.actions || index.sourceSha256 !== expected || fs.statSync(index.path).size !== index.bytes) throw Error('副本索引/源/长度不符：' + p.parentId);
    total += index.bytes; blocks += index.blocks.length; storeRows.push({ parentId: p.parentId, path: index.path, sha256: index.sha256, sourceSha256: index.sourceSha256, indexSha256: sha(fs.readFileSync(file)), bytes: index.bytes, records: index.records });
}
save(path.join(here, 'STORE_INVENTORY.json'), { directory: store, parents: storeRows.length, bytes: total, blocks, rows: storeRows, verifiedScope: '创建时完整源文件和副本摘要，当前逐父局身份/记录数/文件长度核对；消费时逐块SHA；96个独立前态与原件直读全部张量逐位比较', interruptedBlocksPreserved: fs.readdirSync(store).filter(f => f.endsWith('.blocks')).length - storeRows.length });
const config = read(path.join(here, 'STAGE2_CONFIG.json'));
fs.mkdirSync(path.join(here, 'stage2-configs'), { recursive: true });
for (const [name, lr] of [['lr-5e-5', .00005], ['lr-1e-4', .0001], ['lr-2.4495e-4', .00024495]]) save(path.join(here, 'stage2-configs', name + '.json'), { ...config, peakLearningRate: lr });
const evidence = [];
function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name); if (item.isDirectory()) { if (!['__pycache__', 'miopen-db-r2', 'miopen-cache-r2'].includes(item.name)) walk(file); }
    else if (item.isFile() && file !== path.join(here, 'EVIDENCE_MANIFEST.json')) evidence.push({ path: path.relative(here, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size, sha256: sha(fs.readFileSync(file)) });
} }
walk(here); save(path.join(here, 'EVIDENCE_MANIFEST.json'), { files: evidence, total: evidence.length, noHistoricalWholeGameReplay: true, finalTestPredictions: 0, temporaryCurrentModelUpdates: 8, formalContinuationUpdates: 0 });
console.log(JSON.stringify({ sources: files.size, evidence: evidence.length, rawCacheBytes: total, parents: storeRows.length }));
