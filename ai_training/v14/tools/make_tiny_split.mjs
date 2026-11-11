/**
 * V14/T14-04：为 tiny-fit 记忆诊断生成专用 split manifest。
 *
 * 记忆诊断要求 128 个状态全部被优化，因此 train 必须包含它们全部；
 * 训练器同时要求 val 非空（V11/T13-01 拒绝静默切分），所以保留一个
 * 「没有任何样本的哨兵 root」作为 val 占位，并在报告里如实标注 val 规模为 0。
 *
 * 用法：
 *   node v14/tools/make_tiny_split.mjs --run-id v14_20260924_t14
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, writeJson, rel } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
const tinyDir = path.join(REPO_ROOT, 'v14', 'out', runId, 'T14-04');
const datasetPath = path.join(tinyDir, 'tiny_fit_dataset.jsonl');
if (!fs.existsSync(datasetPath)) {
    console.error(`[T14-04] 缺少 ${rel(datasetPath)}`);
    process.exit(1);
}
const rows = fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const roots = [...new Set(rows.map((r) => r.rootFamilyId))].sort();
const partitions = rows.reduce((acc, r) => {
    acc[r.partition] = (acc[r.partition] ?? 0) + 1;
    return acc;
}, {});

const manifest = {
    schema: 'v14_tiny_fit_split_manifest_1',
    task: 'T14-04',
    runId,
    generatedAt: new Date().toISOString(),
    purpose: '128 状态记忆能力诊断（diagnostic=true）：全部状态参与优化。',
    trainRootFamilies: roots,
    valRootFamilies: ['V14_TINYFIT_SENTINEL_NO_SAMPLES'],
    testRootFamilies: [],
    valSizeNote: 'val 为占位 root，实际 val 样本数为 0。训练器 V11/T13-01 拒绝空 val，'
        + '而记忆诊断必须让 128 个状态全部被优化；因此这里显式记录该取舍，'
        + '并不把 val accuracy 当作泛化指标。',
    rows: rows.length,
    distinctRoots: roots.length,
    sourcePartitionOfRows: partitions,
    datasetPath: rel(datasetPath),
};
writeJson(path.join(tinyDir, 'tiny_split_manifest.json'), manifest);
console.log(`[T14-04] tiny_split_manifest.json: trainRoots=${roots.length} rows=${rows.length} -> ${rel(path.join(tinyDir, 'tiny_split_manifest.json'))}`);
