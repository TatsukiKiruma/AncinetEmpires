/** 冻结权威规则、对手与编码器，准备独立手机评测包，不运行对战。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const old = path.join(root, 'ai_training/phone_2m_continue414_20261027');
const completed = path.join(old, 'completion/job');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const receipt = JSON.parse(fs.readFileSync(path.join(old, 'SYNC_2414.json'), 'utf8'));
assert.ok(receipt.allFileHashesVerified);
assert.equal(receipt.complete.cumulativeParents, 2414);
assert.ok(!fs.existsSync(path.join(here, 'IDENTITY.json')), '已有冻结身份，不覆盖');
for (const [source, name] of [['output/final.json', 'final.json'], ['output/final.bin', 'final.bin'], ['model.py', 'model.py'], ['accurate_ops.py', 'accurate_ops.py'], ['batch_model.py', 'batch_model.py']]) {
    const sourceFile = path.join(completed, source);
    const expected = receipt.files.find(item => item.relativePath === 'job/' + source);
    assert.equal(sha(sourceFile), expected.sha256); fs.copyFileSync(sourceFile, path.join(here, name));
}
const built = await build({ entryPoints: [path.join(here, 'arena.ts')], outfile: path.join(here, 'arena.bundle.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'es2022', metafile: true });
const sources = [];
for (const file of Object.keys(built.metafile.inputs).sort()) {
    const source = path.resolve(file), rel = path.relative(root, source);
    assert.ok(!rel.startsWith('..'));
    const target = path.join(here, 'source-freeze', rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
    sources.push({ path: rel.replaceAll('\\', '/'), sha256: sha(source), bytes: fs.statSync(source).size });
}
fs.writeFileSync(path.join(here, 'SOURCE_MANIFEST.json'), JSON.stringify({ files: sources }, null, 2) + '\n');
const child = spawnSync(process.execPath, [path.join(here, 'arena.bundle.mjs'), '--prepare'], { cwd: root,
    env: { ...process.env, AEII_ARENA_WORK: here }, encoding: 'utf8' });
assert.equal(child.status, 0, child.stdout + child.stderr);
const runtimeFiles = {};
for (const name of ['final.json', 'final.bin', 'model.py', 'batch_model.py', 'accurate_ops.py', 'infer.py', 'sync_inference.ts', 'arena.bundle.mjs', 'PLAN.json']) runtimeFiles[name] = sha(path.join(here, name));
const identity = { modelBinarySha256: runtimeFiles['final.bin'], modelMetadataSha256: runtimeFiles['final.json'],
    completedCheckpointSha256: receipt.finalCheckpointSha256, cumulativeParents: 2414, runtimeFiles,
    sourceManifestSha256: sha(path.join(here, 'SOURCE_MANIFEST.json')), optimizerUpdates: 0, replayValidation: false };
fs.writeFileSync(path.join(here, 'IDENTITY.json'), JSON.stringify(identity, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, games: 20, sourceFiles: sources.length, modelBinarySha256: identity.modelBinarySha256 }));
