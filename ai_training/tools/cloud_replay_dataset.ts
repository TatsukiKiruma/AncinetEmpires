import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { auditCloudReplay, digest, type CloudAudit } from './cloud_replay_audit';
import { exportCloudFeatures } from './cloud_replay_features';
import { resolveGitCommit, type ImmutableDatasetManifest } from './skirmish_dataset_artifacts';
import { validateFeatureDatasetManifest } from './skirmish_dataset_validate';

const input = path.resolve('captures/cloud/20260918_053030');
const output = path.resolve('training_runs/cloud_pvp_20260918');
const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
async function json(file: string, value: unknown) { await writeFile(file, JSON.stringify(value, null, 2)); }

async function pool(stage: string, jobs: any[]): Promise<any[]> {
    let next = 0;
    const rows: any[] = [], workers: Worker[] = [];
    if (!jobs.length) return rows;
    try {
        await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, () => new Promise<void>((resolve, reject) => {
            const bridge = `(async()=>{const {register}=await import('tsx/esm/api');register();await import(${JSON.stringify(import.meta.url)});})().catch(e=>{console.error(e);process.exit(1)});`;
            const worker = new Worker(bridge, { eval: true, workerData: { cloudDataset: true, stage } }); workers.push(worker);
            worker.on('message', async message => {
                try {
                    if (!message.ready) {
                        rows.push(message);
                        await json(path.join(output, stage, `${message.id}.json`), message);
                        console.log(`${stage} ${rows.length}/${jobs.length} ${message.category ?? ''} ${message.samples ?? ''}`, message.error ?? '');
                    }
                    worker.postMessage(jobs[next++] ?? null);
                } catch (e) { reject(e); }
            });
            worker.on('error', reject);
            worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`工作进程退出 ${code}`)));
        })));
    } finally { await Promise.all(workers.map(w => w.terminate())); }
    return rows.sort((a,b) => a.id.localeCompare(b.id));
}

async function main() {
    for (const name of ['audit', 'feature-audit', 'states', 'features']) await mkdir(path.join(output, name), { recursive: true });
    const download = JSON.parse(await readFile(path.join(input, 'download_report.json'), 'utf8'));
    const sourceFiles: { path: string; sha256: string; bytes: number }[] = [];
    // 记录未提交的引擎和工具源码，避免仅凭 Git 提交号误判生成版本。
    async function fingerprint(dir: string) {
        for (const item of await readdir(dir, { withFileTypes: true })) {
            const file = path.join(dir, item.name);
            if (item.isDirectory()) await fingerprint(file);
            else if (/\.(ts|json)$/.test(item.name)) { const raw = await readFile(file); sourceFiles.push({ path: file, sha256: hash(raw), bytes: raw.length }); }
        }
    }
    await fingerprint(path.resolve('src/game'));
    for (const item of await readdir('tools')) if (item.endsWith('.ts')) { const file = path.resolve('tools', item); const raw = await readFile(file); sourceFiles.push({ path: file, sha256: hash(raw), bytes: raw.length }); }
    await json(path.join(output, 'generator-source-hashes.json'), sourceFiles);
    const jobs = download.downloads.map((r: any) => ({ id: r.id, file: path.join(input, r.file), sha256: r.sha256, output }));
    // 文件名使用抓包文件中的安全哈希，原始服务器 ID 只保存在来源记录中。
    for (const job of jobs) { job.serverId = job.id; job.id = job.sha256.slice(0, 24); }
    const audit: CloudAudit[] = await pool('audit', jobs);
    await json(path.join(output, 'audit.json'), audit);
    const eligible = audit.filter(r => r.category === 'full' && r.roomStatus === 'CLOSED');
    const groups = [...new Set(eligible.map(r => r.group))].sort();
    const selected = groups.map(group => eligible.filter(r => r.group === group).sort((a,b) => b.recordCount-a.recordCount || a.id.localeCompare(b.id))[0]);
    const entries = selected.map((row, i) => ({ ...row, split: i < Math.floor(selected.length * 0.8) ? 'train' : i < Math.floor(selected.length * 0.9) ? 'validation' : 'test' }));
    await json(path.join(output, 'selection.json'), { method: '相同初始状态和种子整组去重，保留最长完整回放；组哈希排序后按 80/10/10 切分', entries });
    const stats = await pool('feature-audit', entries);
    await json(path.join(output, 'feature-summary.json'), stats);
    const shards: ImmutableDatasetManifest['shards'] = [];
    const splitStats: Record<string, { games: number; samples: number }> = {};
    for (const split of ['train', 'validation', 'test']) {
        const good = stats.filter(r => r.split === split && !r.error && r.samples > 0);
        const text = (await Promise.all(good.map(r => readFile(r.file, 'utf8')))).join('');
        await writeFile(path.join(output, `${split}.jsonl`), text);
        const samples = good.reduce((n,r) => n+r.samples, 0);
        splitStats[split] = { games: good.length, samples };
        if (split !== 'test') shards.push({ split: split as 'train'|'validation', index: 0, path: `${split}.jsonl`, sha256: hash(text), bytes: Buffer.byteLength(text), samples });
    }
    const summary = { inputGames: audit.length, strictPassed: audit.filter(r => r.strictPassed).length,
        rejected: audit.filter(r => r.category === 'rejected').length, partial: audit.filter(r => r.category === 'partial').length,
        noHumanWinner: audit.filter(r => r.category === 'no-human-winner').length, fullEligible: eligible.length,
        duplicateGroupsRemoved: eligible.length-selected.length, selectedGames: selected.length,
        featureFailures: stats.filter(r => r.error).length, splits: splitStats,
        actionTypes: stats.reduce((out,r) => { for (const [k,v] of Object.entries(r.actionTypes ?? {})) out[k]=(out[k]??0)+Number(v); return out; }, {} as Record<string,number>),
        teacherDisagreements: stats.reduce((n,r) => n+(r.belowTeacher??0),0), trainedModel: false };
    const sources = await Promise.all(jobs.map(async (r: any) => ({ path: r.file, sha256: r.sha256, bytes: (await readFile(r.file)).length })));
    const manifest: ImmutableDatasetManifest = { kind: 'skirmish_feature_dataset_manifest', schemaVersion: 1,
        datasetVersion: 'cloud-human-winner-v3', datasetId: digest({ sources, sourceFiles, summary }), createdAt: new Date().toISOString(),
        generator: { tool: 'cloud_replay_dataset.ts', version: 1, gitCommit: await resolveGitCommit(), options: {
            featureExtractor: 'hashed-action-v3', featureDim: 4096, maxCandidates: 64, sampledRecordsPerGame: 256,
            winnerOnly: true, humanOnly: true, strictReplay: true, relabelHuman: false,
            splitMethod: '初始状态和种子组哈希排序 80/10/10；test 独立保留，不进入训练 manifest', sourceFingerprint: digest(sourceFiles),
        } }, sources, split: { strategy: 'episode-hash-v1', validationRatio: 0.1, seed: 20260918 }, shards, summary };
    await json(path.join(output, 'manifest.json'), manifest);
    const validation = await validateFeatureDatasetManifest(path.join(output, 'manifest.json'));
    await json(path.join(output, 'validation.json'), validation);
    await json(path.join(output, 'summary.json'), summary);
    console.log(JSON.stringify({ summary, validation }));
    if (!validation.valid || !splitStats.train.samples) throw new Error('数据集校验失败或训练集为空');
}

if (isMainThread) main().catch(e => { console.error(e); process.exitCode = 1; });
else if (workerData.cloudDataset) {
    parentPort!.on('message', async job => {
        if (!job) { parentPort!.close(); return; }
        try { parentPort!.postMessage(await (workerData.stage === 'audit' ? auditCloudReplay(job) : exportCloudFeatures(job))); }
        catch (e) { parentPort!.postMessage({ ...job, category: 'rejected', error: e instanceof Error ? e.message : String(e), samples: 0 }); }
    });
    parentPort!.postMessage({ ready: true });
}
