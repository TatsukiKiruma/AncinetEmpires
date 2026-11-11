/**
 * V17/T17-05：从带多标签的**同一输入池**生成同批对照训练变体（owner：T17-05）。
 *
 * 中文：B0 / B1 / B2 必须共享完全相同的输入行、相同顺序、相同 split、相同采样计划，
 * 只允许变一个因素（policy 标签来源 / 学生状态占比）。本工具只改三件事，
 * 且**行顺序逐行不变**，保证 DataLoader 在相同 `--data-order-seed` 下给出同一采样序列：
 *   1. `targetActionIndex` / `targetActionCode` 换成指定标签来源；
 *   2. 缺少该来源标签的行把 `policyLossMask` 置 false（不伪造标签、不偷偷用 L1 顶上）；
 *   3. 写一份 variant 报告（每类计数、标签来源分布、SHA）。
 *
 * 支持来源：
 *   `l1`       —— 冻结的 L1/H0 标签（B0 与旧基线）
 *   `teacher`  —— B100 教师的最终 hard 动作（B1/B2 主监督）
 *   `behavior` —— 行为策略实际动作（诊断）
 *   `s1`       —— 条件备选 S2 搜索标签（本轮默认不使用）
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/make_train_variant_v17.ts `
 *     --dataset <pool.jsonl> --target teacher --out <B1.jsonl> --report <B1.report.json>
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DATASET = path.resolve(arg('--dataset', '') as string);
const TARGET = arg('--target', 'l1') as 'l1' | 'teacher' | 'behavior' | 's1';
const OUT = path.resolve(arg('--out', '') as string);
const REPORT = arg('--report', null);
const REQUIRE_CLEAN = arg('--require-clean', 'true') === 'true';
/**
 * V17/T17-05 预登记单因素变体：B1 的 0/20 崩盘诊断。
 *
 * 假设（**在跑之前写下来**）：教师在当前状态分布上把 12%（1,441/12,021）"L1 本来会 move/attack"
 * 的状态标成 `wait`，4,000 次更新把学生训成"爱待机"，于是开局即被压制（B1 的 DEV20 局均只有 17s）。
 * 若成立，则**只**把这些行的 policyLossMask 置 false（不换标签来源、不改输入、不改预算）应该
 * 明显好于 B1。若不成立，说明崩盘另有原因，本变体如实报负结果。
 *
 * 注意：这是**事后单因素消融**，不是"数据修好所以结论成立"；无论结果如何都写进报告。
 */
const EXCLUDE_WAIT_OVERRIDE = arg('--exclude-wait-override', 'false') === 'true';

if (!fs.existsSync(DATASET)) throw new Error(`[T17-05] 数据集不存在：${DATASET}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// 中文：数据集可达数百 MB，整文件 `readFileSync().split()` 会撞上 V8 最大字符串长度；
// 这里按块流式读行，保持**行顺序逐行不变**（同 data-order-seed ⇒ 同采样序列）。
const outHandle = fs.openSync(OUT, 'w');
const hash = crypto.createHash('sha256');
const counts = {
    rows: 0,
    labeled: 0,
    unlabeled: 0,
    unlabeledReasons: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
    byEvidenceKind: {} as Record<string, number>,
    byMap: {} as Record<string, number>,
};
let pending = '';
const chunkBuffer = Buffer.alloc(1 << 22);

const emit = (line: string): void => {
    if (line.trim().length === 0) return;
    const row = JSON.parse(line) as Record<string, unknown>;
    const ordered = row.orderedActionCodes as string[] | undefined;
    if (!Array.isArray(ordered)) throw new Error(`[T17-05] ${String(row.sampleId)} 缺少 orderedActionCodes。`);
    counts.rows += 1;

    let code: string | null = null;
    let clean = true;
    let skipReason: string | null = null;
    if (TARGET === 'l1') {
        code = (row.l1ActionCode as string | null) ?? null;
        if (code === null) skipReason = 'no-l1-label';
    } else if (TARGET === 's1') {
        code = (row.searchActionCode as string | null) ?? null;
        if (code === null) skipReason = 'no-search-label';
        if (row.softLossUsable === false) skipReason = 'soft-label-unusable';
    } else if (TARGET === 'behavior') {
        code = (row.behaviorActionCode as string | null) ?? null;
        if (code === null) skipReason = 'no-behavior-label';
    } else {
        code = (row.teacherActionCode as string | null) ?? null;
        if (code === null) skipReason = 'no-teacher-label';
        if (REQUIRE_CLEAN && row.teacherCleanForPolicy === false) skipReason = 'teacher-label-not-clean';
        if (REQUIRE_CLEAN && row.teacherActionInAllowed === false) skipReason = 'teacher-action-illegal';
        if (REQUIRE_CLEAN && row.labelEvidenceKind !== undefined && row.labelEvidenceKind !== 'B100_FINAL_ACTION_HARD') {
            skipReason = `evidence-kind:${String(row.labelEvidenceKind)}`;
        }
    }
    clean = skipReason === null;
    // 预登记单因素变体：只在"教师说 wait，但 L1 不是 wait"的行上撤掉监督。
    if (clean && EXCLUDE_WAIT_OVERRIDE) {
        const t = String(code ?? '');
        const l = String((row.l1ActionCode as string | null) ?? '');
        if (t.startsWith('wait') && l.length > 0 && !l.startsWith('wait')) {
            skipReason = 'excluded-wait-override';
            clean = false;
        }
    }
    // 标签必须真的在候选列表里，否则是映射遗漏，不许写进监督。
    let index = -1;
    if (clean && code !== null) {
        index = ordered.indexOf(code);
        if (index < 0) {
            skipReason = 'label-not-in-ordered-candidates';
            clean = false;
        }
    }

    let text: string;
    if (!clean || code === null || index < 0) {
        counts.unlabeled += 1;
        const reason = skipReason ?? 'unknown';
        counts.unlabeledReasons[reason] = (counts.unlabeledReasons[reason] ?? 0) + 1;
        text = JSON.stringify({
            ...row,
            targetActionIndex: 0,
            targetActionCode: null,
            targetSource: TARGET,
            policyLossMask: false,
            unlabeledReason: reason,
        });
    } else {
        counts.labeled += 1;
        const src = String(row.sourcePolicy ?? 'unknown');
        counts.bySource[src] = (counts.bySource[src] ?? 0) + 1;
        // 中文：`labelEvidenceKind` 是**池行自带**的元数据（池里同时存在两种标签），
        // 直接统计它会得出「B0 也是 B100 标签」这种误导结论。证据类型必须按**本次实际使用的
        // target 列**重新判定。
        const targetEvidence = TARGET === 'teacher'
            ? 'B100_FINAL_ACTION_HARD'
            : TARGET === 'l1'
                ? String(row.l1LabelerVersion ?? 'L1_LABEL')
                : TARGET === 's1'
                    ? 'SEARCH_S1_HARD'
                    : 'BEHAVIOR_POLICY_HARD';
        counts.byEvidenceKind[targetEvidence] = (counts.byEvidenceKind[targetEvidence] ?? 0) + 1;
        const map = String(row.mapName ?? 'unknown');
        counts.byMap[map] = (counts.byMap[map] ?? 0) + 1;
        text = JSON.stringify({
            ...row,
            targetActionIndex: index,
            targetActionCode: code,
            targetSource: TARGET,
            targetEvidenceKind: targetEvidence,
            policyLossMask: true,
        });
    }
    outHandle; // 保持句柄引用，避免被优化掉（实际写在下方的 writeSync）
    fs.writeSync(outHandle, `${text}\n`);
    hash.update(`${text}\n`);
};

const fd = fs.openSync(DATASET, 'r');
try {
    for (;;) {
        const read = fs.readSync(fd, chunkBuffer, 0, chunkBuffer.length, null);
        if (read <= 0) break;
        pending += chunkBuffer.toString('utf8', 0, read);
        const parts = pending.split('\n');
        pending = parts.pop() as string;
        for (const p of parts) emit(p);
    }
    if (pending.trim().length > 0) emit(pending);
} finally {
    fs.closeSync(fd);
    fs.closeSync(outHandle);
}

const report = {
    schema: 'v17_train_variant_1',
    target: TARGET,
    dataset: DATASET.replace(/\\/g, '/'),
    datasetSha256: crypto.createHash('sha256').update(fs.readFileSync(DATASET)).digest('hex'),
    out: OUT.replace(/\\/g, '/'),
    outBytes: fs.statSync(OUT).size,
    rowOrderPreserved: true,
    counts,
    labeledFraction: counts.rows ? Number((counts.labeled / counts.rows).toFixed(4)) : null,
    generatedAt: new Date().toISOString(),
    discipline: [
        '行顺序逐行不变 ⇒ 同 data-order-seed 下采样序列一致。',
        '缺标签一律 policyLossMask=false，不伪造、不用别来源顶替。',
        '标签必须出现在 orderedActionCodes 中，否则记 label-not-in-ordered-candidates。',
    ],
};
if (REPORT) {
    fs.mkdirSync(path.dirname(path.resolve(REPORT)), { recursive: true });
    fs.writeFileSync(path.resolve(REPORT), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(report, null, 2));