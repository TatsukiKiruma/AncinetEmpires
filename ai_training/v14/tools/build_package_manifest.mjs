/**
 * V14/T14-11：交付包清单与任务状态台账。
 *
 * 只扫描原始运行目录（排除包内副本），统计真实存在的工件并给出摘要；
 * 任务状态由人工判断写入 `v14/configs/v14_task_status_source.json`，
 * 本脚本负责把它与真实工件存在性做一次一致性核对，避免「状态写 DONE 但工件不存在」。
 *
 * 用法：
 *   node v14/tools/build_package_manifest.mjs --run-id v14_20260924_t14
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, ensureDir, fileIdentity, gitInfo, realSha256, rel, writeJson } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
const runDir = ensureDir(path.join('v14', 'out', runId));

/** 递归列出文件，跳过包目录与临时文件。 */
function walk(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'package') continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, acc);
        else if (!/\.tmp$/.test(entry.name)) acc.push(abs);
    }
    return acc;
}

const files = walk(runDir);
const byTask = {};
for (const abs of files) {
    const parts = rel(abs).split('/');
    const taskIndex = parts.findIndex((p) => /^T14-\d+$/.test(p));
    const key = taskIndex >= 0 ? parts[taskIndex] : 'run-level';
    byTask[key] = byTask[key] ?? { files: 0, bytes: 0, samples: [] };
    const size = fs.statSync(abs).size;
    byTask[key].files += 1;
    byTask[key].bytes += size;
    if (byTask[key].samples.length < 6) byTask[key].samples.push(rel(abs));
}

const taskStatusSource = path.join(REPO_ROOT, 'v14', 'configs', 'v14_task_status_source.json');
let taskStatus = null;
if (fs.existsSync(taskStatusSource)) {
    taskStatus = JSON.parse(fs.readFileSync(taskStatusSource, 'utf8'));
    const missing = [];
    for (const task of taskStatus.tasks ?? []) {
        for (const artifact of task.evidence ?? []) {
            if (!fs.existsSync(path.join(REPO_ROOT, artifact))) {
                missing.push({ task: task.id, artifact });
            }
        }
    }
    taskStatus.evidenceIntegrity = { checked: true, missing, ok: missing.length === 0 };
    writeJson(path.join(runDir, 'task_status.json'), taskStatus);
}

const git = gitInfo();
const manifest = {
    schema: 'v14_package_manifest_1',
    task: 'T14-11',
    runId,
    generatedAt: new Date().toISOString(),
    head: git.head,
    worktreeNote: '本清单只统计原始运行目录 v14/out/<runId>/ 下的文件；包内副本不重复计数。',
    countsByTask: Object.fromEntries(Object.entries(byTask).map(([k, v]) => [k, {
        files: v.files,
        bytes: v.bytes,
        megabytes: +(v.bytes / 1048576).toFixed(2),
        samples: v.samples,
    }])),
    totalFiles: files.length,
    totalMB: +(files.reduce((a, f) => a + fs.statSync(f).size, 0) / 1048576).toFixed(2),
    requiredTopLevel: [
        'source_snapshot.json', 'task_status.json', 'claim_ledger.json', 'commands.ps1',
        'final_report.md', 'promotion_decision.json',
    ].map((name) => fileIdentity(path.join('v14', 'out', runId, name))),
    keyArtifacts: [
        'v14/out/' + runId + '/T14-00/source_snapshot.json',
        'v14/out/' + runId + '/T14-00/artifact_identity.json',
        'v14/out/' + runId + '/T14-00/environment.json',
        'v14/out/' + runId + '/T14-00/experiment_protocol.json',
        'v14/out/' + runId + '/T14-00/split_protocol.json',
        'v14/out/' + runId + '/T14-01/rule_contract.md',
        'v14/out/' + runId + '/T14-01/fixture_manifest.json',
        'v14/out/' + runId + '/T14-01/rule_suite_results.json',
        'v14/out/' + runId + '/T14-02/dataset_contract.json',
        'v14/out/' + runId + '/T14-02/reconstruction_report.json',
        'v14/out/' + runId + '/T14-02/codec_roundtrip.json',
        'v14/out/' + runId + '/T14-02/candidate_coverage.json',
        'v14/out/' + runId + '/T14-02/label_independence.json',
        'v14/out/' + runId + '/T14-02/split_manifest.json',
        'v14/out/' + runId + '/T14-03/feature_semantics_report.json',
        'v14/out/' + runId + '/T14-03/state_aliasing_cases.json',
        'v14/out/' + runId + '/T14-03/python_ts_forward_parity.json',
        'v14/out/' + runId + '/T14-03/candidate_permutation_invariance.json',
        'v14/out/' + runId + '/T14-03/schema_compatibility.json',
        'v14/out/' + runId + '/T14-04/tiny_fixture_manifest.json',
        'v14/out/' + runId + '/T14-04/tiny_fit_metrics.json',
        'v14/out/' + runId + '/T14-05/eval_protocol_v14.json',
        'v14/out/' + runId + '/T14-06/matches/dev_matches_summary.json',
        'v14/out/' + runId + '/T14-06/failure_taxonomy.json',
        'v14/out/' + runId + '/T14-07/teacher_qualification.json',
        'v14/out/' + runId + '/T14-08/dagger_groups_summary.json',
        'v14/out/' + runId + '/T14-09/promotion_decision.json',
        'v14/out/' + runId + '/T14-11/final_report.md',
    ].map((p) => fileIdentity(p)),
};
writeJson(path.join(runDir, 'package_manifest.json'), manifest);
console.log(`[T14-11] package_manifest.json：${manifest.totalFiles} 个文件 / ${manifest.totalMB} MB`);
for (const [task, info] of Object.entries(manifest.countsByTask).sort()) {
    console.log(`  ${task}: ${info.files} files, ${info.megabytes} MB`);
}
if (taskStatus?.evidenceIntegrity && !taskStatus.evidenceIntegrity.ok) {
    console.warn('[T14-11] task_status 中引用的证据文件缺失：');
    for (const m of taskStatus.evidenceIntegrity.missing) console.warn(`  ${m.task}: ${m.artifact}`);
    process.exitCode = 1;
}
