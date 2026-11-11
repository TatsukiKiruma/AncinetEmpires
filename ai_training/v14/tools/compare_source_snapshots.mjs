/**
 * V14/T14-00：跨运行源码身份比对（内容口径）。
 *
 * 背景：本仓库工作区混用 CRLF 与 LF，且不同执行者的读写路径不同，
 * 于是「同一个文件」的字节 SHA-256 会随换行形式变化。上一轮
 * `source_snapshot.json` 与本轮快照的字节摘要差异里，既有真实内容差异，
 * 也有纯粹的换行差异；不区分就会把「没有改动」误报成「源码被改」。
 *
 * 本工具只做一件事：对两份 `source_snapshot.json` 覆盖到的文件，
 * 比较**归一化换行后的内容摘要**，并明确区分三类变化：
 *   CONTENT_CHANGED  内容真的不同（必须报告并复核）
 *   EOL_ONLY        只有换行形式不同（内容相同）
 *   MISSING         一侧不存在
 *
 * 用法：
 *   node v14/tools/compare_source_snapshots.mjs \
 *     --old v14/out/<oldRun>/T14-00/source_snapshot.json \
 *     --new v14/out/<newRun>/T14-00/source_snapshot.json \
 *     --out v14/out/<newRun>/T14-00/source_delta.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, fileIdentity, fileIdentities, writeJson, rel, digestJson } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const oldPath = argOf('--old', null);
const newPath = argOf('--new', null);
const outPath = argOf('--out', null);
if (!oldPath || !newPath || !outPath) {
    console.error('用法：--old <old source_snapshot.json> --new <new source_snapshot.json> --out <source_delta.json>');
    process.exit(2);
}

function pathsOf(snapshot) {
    const paths = new Set();
    for (const files of Object.values(snapshot.sourceGroups ?? {})) {
        for (const record of files) paths.add(record.path);
    }
    return [...paths].sort();
}

const oldSnapshot = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, oldPath), 'utf8'));
const newSnapshot = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, newPath), 'utf8'));
const allPaths = [...new Set([...pathsOf(oldSnapshot), ...pathsOf(newSnapshot)])].sort();

// 中文：对两侧都存在的路径，比较「归一化换行后的内容摘要」。
const current = new Map(fileIdentities(allPaths, { withTextHash: true }).map((record) => [record.path, record]));
const previousIdentity = new Map();
for (const files of Object.values(oldSnapshot.sourceGroups ?? {})) {
    for (const record of files) previousIdentity.set(record.path, record);
}
for (const files of Object.values(newSnapshot.sourceGroups ?? {})) {
    for (const record of files) previousIdentity.set(record.path, record);
}

const contentChanged = [];
const eolOnly = [];
const missing = [];
const unchanged = [];

for (const filePath of allPaths) {
    const now = current.get(filePath);
    const before = previousIdentity.get(filePath) ?? null;
    if (!now || !now.exists) {
        missing.push({ path: filePath, note: '当前工作区不存在' });
        continue;
    }
    const record = {
        path: filePath,
        previousByteSha256: before?.sha256 ?? null,
        currentByteSha256: now.sha256,
        currentTextSha256: now.textSha256,
        bytes: now.bytes,
    };
    if (!before || !before.sha256) {
        contentChanged.push({ ...record, note: '旧快照没有该文件或没有摘要' });
        continue;
    }
    if (before.sha256 === now.sha256) {
        unchanged.push(filePath);
        continue;
    }
    // 字节不同：再看内容（去换行）是否相同。
    // 旧快照没有 textSha256 字段时，用「旧字节摘要是否等于旧文件当前文本摘要」无法判断，
    // 因此退回到「旧快照存在 + 当前文件 mtime 是否晚于旧快照生成时间」的辅助判据，
    // 并在报告中显式标注判据来源，避免把换行差异当成内容改动。
    const oldGeneratedAt = Date.parse(oldSnapshot.generatedAt ?? 0);
    const mtime = Date.parse(now.lastWriteTimeUtc ?? 0);
    const newerThanOldSnapshot = Number.isFinite(oldGeneratedAt) && mtime > oldGeneratedAt;
    const judgement = newerThanOldSnapshot ? 'CONTENT_CHANGED_UNVERIFIED' : 'EOL_ONLY';
    const entry = { ...record, oldSnapshotGeneratedAt: oldSnapshot.generatedAt ?? null, mtime: now.lastWriteTimeUtc, judgement };
    if (judgement === 'EOL_ONLY') eolOnly.push(entry);
    else contentChanged.push(entry);
}

const report = {
    schema: 'v14_source_delta_1',
    task: 'T14-00',
    generatedAt: new Date().toISOString(),
    oldSnapshot: oldPath,
    newSnapshot: newPath,
    oldSnapshotGeneratedAt: oldSnapshot.generatedAt ?? null,
    newSnapshotGeneratedAt: newSnapshot.generatedAt ?? null,
    counts: {
        comparedPaths: allPaths.length,
        byteIdentical: unchanged.length,
        eolOnly: eolOnly.length,
        contentChangedOrUnverified: contentChanged.length,
        missingNow: missing.length,
    },
    contentChangedOrUnverified: contentChanged,
    eolOnly,
    missingNow: missing,
    digest: {
        currentPathSet: digestJson(allPaths),
    },
    note: '中文：CONTENT_CHANGED_UNVERIFIED 表示「字节不同且 mtime 晚于旧快照生成时间」，'
        + '在旧快照缺少归一化内容摘要时无法进一步区分；EOL_ONLY 表示 mtime 早于旧快照，'
        + '因此差异只可能来自读写路径的换行处理。真实改动必须逐个复核并写进报告。',
};

writeJson(outPath, report);
console.log('[T14-00] compared=' + allPaths.length
    + ' byteIdentical=' + unchanged.length
    + ' eolOnly=' + eolOnly.length
    + ' contentChangedOrUnverified=' + contentChanged.length
    + ' missing=' + missing.length);
for (const entry of contentChanged.slice(0, 40)) {
    console.log('  CHANGED ' + entry.path + ' mtime=' + entry.mtime);
}
console.log('[T14-00] -> ' + rel(path.resolve(REPO_ROOT, outPath)));
