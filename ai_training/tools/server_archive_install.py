"""使用本机校验回执启用独立归档续跑入口，并仅清理已验证分片。"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path('/home/ubuntu/ancientempires-training-20260909')
assert subprocess.run(['systemctl', 'is-active', 'ancientempires-training.service'], capture_output=True, text=True).stdout.strip() == 'inactive'
out = ROOT / 'runtime/offload'
inventory = json.loads((out / 'inventory.json').read_text())
receipt = json.loads((out / 'local-receipt.json').read_text())
assert receipt['inventory'] == inventory and receipt['verified'] is True
run = Path(inventory['runDir']).resolve()
assert run.is_relative_to(ROOT / 'training_runs/feature_datasets')
assert json.loads((run / 'migration-status.json').read_text())['migrationId'] == inventory['migrationId']

# 保留原生成器，独立入口只改变已归档数据的恢复与最终校验位置。
source = (ROOT / 'tools/skirmish_old_dataset_migrate.ts').read_text()
source = "import { createHash } from 'node:crypto';\n" + source
helper = '''
// 本机逐文件校验完成后才允许使用归档回执；清单本身仍留在服务器。
export async function archivedCheckpointValid(manifestFile: string, runDir: string): Promise<boolean> {
    let receipt: any;
    try { receipt = JSON.parse(await readFile(path.join(runDir, 'offloaded-checkpoints.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    const relative = path.relative(runDir, manifestFile).replace(/\\\\/g, '/');
    const expected = receipt.inventory.manifests[relative];
    if (!expected) return false;
    if (receipt.verified !== true || receipt.inventory.runDir !== runDir) throw new Error('归档回执不匹配');
    const actual = createHash('sha256').update(await readFile(manifestFile)).digest('hex');
    if (actual !== expected) throw new Error('已归档 checkpoint 清单被修改');
    return true;
}
export async function hasOffloadedCheckpoints(runDir: string): Promise<boolean> {
    try { await stat(path.join(runDir, 'offloaded-checkpoints.json')); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
'''
source += helper
old = 'const validation = await validateFeatureDatasetManifest(batchManifest);'
assert source.count(old) == 2
# 新生成批次仍执行原有完整校验。
source = source.replace(old, "const validation = await archivedCheckpointValid(batchManifest, runDir) ? { valid: true, errors: [] } : await validateFeatureDatasetManifest(batchManifest);", 1)
needle = '        const validation = await validateFeatureDatasetManifest(manifestFile);'
assert source.count(needle) == 1
source = source.replace(needle, '''        if (await hasOffloadedCheckpoints(runDir)) {
            await update('paused', '全部批次导出完成，等待本机汇总和完整校验', manifestFile);
            return { runDir, statusFile, finalManifest: manifestFile, completedBatches, totalBatches: batches.length, paused: true };
        }
''' + needle)
needle = '        if (finalStat.isFile()) {'
assert source.count(needle) == 1
source = source.replace(needle, needle + '''
            if (await hasOffloadedCheckpoints(runDir)) {
                const final = JSON.parse(await readFile(finalManifest, 'utf8'));
                return { runDir, statusFile, finalManifest, completedBatches: Number(final.summary.batches), totalBatches: Number(final.summary.batches), paused: true };
            }
''')
adapter = ROOT / 'tools/server_offloaded_migrate.ts'
adapter.write_text(source)
# 验证未归档回退、可信回执以及清单损坏拒绝，失败时不清理任何分片。
with tempfile.TemporaryDirectory(dir=out) as temporary:
    test = Path(temporary)
    manifest = test / 'manifest.json'
    manifest.write_text('{}')
    code = '''
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { archivedCheckpointValid, hasOffloadedCheckpoints } = await import(process.argv[1]);
const run = process.argv[2], file = run + '/manifest.json';
assert.equal(await archivedCheckpointValid(file, run), false);
assert.equal(await hasOffloadedCheckpoints(run), false);
await writeFile(run + '/offloaded-checkpoints.json', JSON.stringify({verified:true,inventory:{runDir:run,manifests:{'manifest.json':createHash('sha256').update('{}').digest('hex')}}}));
assert.equal(await archivedCheckpointValid(file, run), true);
assert.equal(await hasOffloadedCheckpoints(run), true);
await writeFile(file, '{"changed":true}');
await assert.rejects(() => archivedCheckpointValid(file, run));
console.log('归档续跑入口测试通过');
'''
    subprocess.run(['node', '--openssl-legacy-provider', '--import', 'tsx', '--input-type=module', '-e', code, adapter.as_uri(), str(test)], cwd=ROOT, check=True)
pipeline = ROOT / 'tools/server_training_pipeline.py'
text = pipeline.read_text()
(out / 'pipeline-before-offload.py').write_text(text)
needle = "args = ['tools/skirmish_old_dataset_migrate.ts'"
assert text.count(needle) == 1
text = text.replace(needle, "args = ['tools/server_offloaded_migrate.ts'")
needle = "    if not manifest or result.get('paused'):"
assert text.count(needle) == 1
text = text.replace(needle, "    if manifest and result.get('paused'):\n        save(state='paused', phase='awaiting-local-validation', finalManifest=manifest, childPid=None, reason='全部批次已导出，等待本机汇总及完整校验')\n        return\n" + needle)
compile(text, str(pipeline), 'exec')
pipeline.write_text(text)
deployment = ROOT / 'deployment_manifest.json'
snapshot = json.loads(deployment.read_text())
(out / 'deployment-before-offload.json').write_text(json.dumps(snapshot, indent=2))
for file in [adapter, pipeline]:
    snapshot['sourceFiles'][file.relative_to(ROOT).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
deployment.write_text(json.dumps(snapshot, indent=2))

# 先检查所有待删除文件；任何不匹配都会在删除前终止。
targets = []
for relative, expected in inventory['files'].items():
    file = (run / relative).resolve()
    assert file.is_relative_to(run / 'checkpoints')
    assert file.is_file() and file.stat().st_size == expected['bytes']
    with file.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected['sha256']
    if relative not in inventory['manifests']:
        targets.append(file)
(run / 'offloaded-checkpoints.json').write_text(json.dumps(receipt, indent=2))
for file in targets:
    file.unlink()
# 传输包只是副本，已验证的原始分片在本机保留。
(out / 'completed.tar.gz').unlink()
(out / 'completed.tar.xz').unlink(missing_ok=True)
print(json.dumps({'offloadedBatches': len(inventory['manifests']), 'removedShardFiles': len(targets)}))
