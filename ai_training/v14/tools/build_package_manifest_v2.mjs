/**
 * V14/T14-11：交付包清单 + 内部链接/命令入口核验。
 *
 * 只做两件可机械复核的事：
 * 1. 扫描本轮运行目录的原始工件，给出真实字节 SHA-256 与大小；
 * 2. 把最终报告里出现的仓库相对路径逐个核对「是否存在」，并核对命令入口文件是否存在。
 *
 * 计数口径按任务书第 14 节：只扫描原始运行目录，排除包内拷贝。
 *
 * 用法：
 *   node v14/tools/build_package_manifest_v2.mjs --run-id <runId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, fileIdentity, writeJson, rel, gitInfo } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260925_t14b');
const runDir = path.join('v14', 'out', runId);
const absRunDir = path.join(REPO_ROOT, runDir);

/** 递归收集文件（相对仓库根的路径）。 */
function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(rel(full));
    }
    return out;
}

const allFiles = walk(absRunDir).sort();
// 中文：本清单自身与最终报告也属于交付物；它们在被引用前可能已存在或尚在写入，
// 因此清单在最后一步生成，并把自身排除在「扫描到」的集合之外以避免自指摘要。
const artifacts = allFiles
    .filter((file) => !file.endsWith('package_manifest.json'))
    .map((file) => {
        const identity = fileIdentity(file);
        return {
            path: file.replace(/\\/g, '/'),
            sha256: identity.sha256,
            bytes: identity.bytes,
            lastWriteTimeUtc: identity.lastWriteTimeUtc,
        };
    });

// 中文：报告内的仓库相对路径核验（只核验形如 v14/... python/... src/... tools/... 的引用）。
// 报告里也会出现「裸文件名」（例如 `source_delta.json`、`tiny_fit_acceptance.json`），
// 它们在正文里属于某个目录；这里按「本运行目录内同名文件」解析，并在结果中标注解析方式，
// 避免把「写作上省略了目录」误报成「文件缺失」。
const reportPath = path.join(absRunDir, 'final_report.md');
const referenced = new Set();
if (fs.existsSync(reportPath)) {
    const text = fs.readFileSync(reportPath, 'utf8');
    const pattern = /`([A-Za-z0-9_./\\-]+\.(?:json|jsonl|md|ts|mjs|py|ps1|pt|log|txt))`/g;
    let match;
    while ((match = pattern.exec(text)) !== null) referenced.add(match[1].replace(/\\/g, '/'));
}
const runDirIndex = new Map();
for (const file of allFiles) {
    const name = path.basename(file);
    if (!runDirIndex.has(name)) runDirIndex.set(name, file);
}
const linkChecks = [...referenced].sort().map((target) => {
    const direct = [target, path.join(runDir, target), path.join('v14', 'out', runId, target)]
        .find((candidate) => fs.existsSync(path.join(REPO_ROOT, candidate)));
    if (direct) {
        return { reference: target, resolved: direct.replace(/\\/g, '/'), exists: true, mode: 'path' };
    }
    const basename = path.basename(target);
    const inRunDir = runDirIndex.get(basename);
    if (inRunDir) {
        return { reference: target, resolved: inRunDir.replace(/\\/g, '/'), exists: true, mode: 'basename-in-run-dir' };
    }
    // 也允许解析到其他 V14 运行目录（报告会引用上一轮产物）。
    const otherRun = fs.existsSync(path.join(REPO_ROOT, 'v14', 'out'))
        ? fs.readdirSync(path.join(REPO_ROOT, 'v14', 'out'))
            .map((other) => path.join('v14', 'out', other))
            .filter((dir) => fs.existsSync(path.join(REPO_ROOT, dir)))
            .flatMap((dir) => {
                const stack = [dir];
                const found = [];
                while (stack.length) {
                    const current = stack.pop();
                    for (const entry of fs.readdirSync(path.join(REPO_ROOT, current), { withFileTypes: true })) {
                        const next = path.join(current, entry.name);
                        if (entry.isDirectory()) stack.push(next);
                        else if (entry.name === basename) found.push(next);
                    }
                }
                return found;
            })
        : [];
    if (otherRun.length > 0) {
        return {
            reference: target,
            resolved: otherRun[0].replace(/\\/g, '/'),
            exists: true,
            mode: 'basename-in-other-run-dir',
        };
    }
    return { reference: target, resolved: null, exists: false, mode: null };
});

const commandEntryChecks = [
    'v14/tools/tiny_fit_acceptance.py',
    'v14/tools/diag_tiny_fit_alias.py',
    'v14/tools/tiny_fit_ts_verify.ts',
    'v14/tools/forward_parity_probe.ts',
    'v14/tools/failure_attribution.ts',
    'v14/tools/teacher_qualification_probe.ts',
    'v14/tools/dataset_duplicate_impact.py',
    'v14/tools/recheck_v13_evidence.ts',
    'v14/tools/run_dev_matches.mjs',
    'v14/tools/summarize_dev_matches.mjs',
    'v12/tools/run-tool.mjs',
].map((file) => ({ path: file, exists: fs.existsSync(path.join(REPO_ROOT, file)) }));

const git = gitInfo();
const manifest = {
    schema: 'v14_package_manifest_2',
    task: 'T14-11',
    runId,
    generatedAt: new Date().toISOString(),
    codeIdentity: {
        head: git.head,
        branch: git.branch,
        worktreeClean: git.worktreeClean,
        worktreeChangeCount: git.worktreeChanges.length,
        note: '中文：HEAD 不能代替未提交源码的身份；本轮源码身份见 T14-00/source_snapshot.json 与 source_delta.json。',
    },
    counters: {
        artifactsInRunDir: artifacts.length,
        totalBytes: artifacts.reduce((sum, item) => sum + (item.bytes ?? 0), 0),
        note: '计数只扫描本轮原始运行目录；不含包内拷贝、故障注入、自测与重复 best/last 权重之外的任何复制件。'
            + '训练 seed、模型 SHA 与独立对局 root 是不同计数维度，不在此处混算。',
    },
    artifacts,
    linkChecks,
    linkCheckSummary: {
        checked: linkChecks.length,
        missing: linkChecks.filter((item) => !item.exists).length,
    },
    commandEntryChecks,
    commandEntrySummary: {
        checked: commandEntryChecks.length,
        missing: commandEntryChecks.filter((item) => !item.exists).length,
    },
};

writeJson(path.join(runDir, 'package_manifest.json'), manifest);
console.log(`[T14-11] artifacts=${manifest.counters.artifactsInRunDir} bytes=${manifest.counters.totalBytes}`);
console.log(`[T14-11] 链接核验 ${manifest.linkCheckSummary.checked} 项，缺失 ${manifest.linkCheckSummary.missing}`);
for (const item of linkChecks.filter((entry) => !entry.exists)) console.log('   缺失: ' + item.reference);
console.log(`[T14-11] 命令入口核验 ${manifest.commandEntrySummary.checked} 项，缺失 ${manifest.commandEntrySummary.missing}`);
for (const item of commandEntryChecks.filter((entry) => !entry.exists)) console.log('   缺失: ' + item.path);
console.log('[T14-11] HEAD=' + git.head + ' worktreeChanges=' + git.worktreeChanges.length);
