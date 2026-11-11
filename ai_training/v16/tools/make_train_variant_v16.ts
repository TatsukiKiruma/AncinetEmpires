/**
 * V16/T16-05：从带双标签的数据集生成同批对照的训练变体（owner：T16-05）。
 *
 * A0/A1/A2 必须「同一核心状态、同 split、同 model seed42、同 batch sample plan、同更新数」，
 * 只允许变一个因素（结构 GAP / 标签来源）。本工具只改三件事，且**行顺序逐行不变**，
 * 从而保证 DataLoader 在相同 `--data-order-seed` 下给出同一个采样序列：
 *   1. `targetActionIndex` / `targetActionCode` 换成指定标签来源；
 *   2. 缺少该来源标签的行把 `policyLossMask` 置 false（不伪造标签）；
 *   3. 写一份 variant 报告（每类计数、SHA）。
 *
 * 用法：
 *   node ... v16/tools/make_train_variant_v16.ts --dataset <in.jsonl> --target l1 \
 *     --out <core_l1.jsonl> --report <core_l1.report.json>
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const DATASET = path.resolve(arg('--dataset', '') as string);
const TARGET = arg('--target', 'l1') as 'l1' | 's1' | 'behavior';
const OUT = path.resolve(arg('--out', '') as string);
const REPORT = arg('--report', null);

if (!fs.existsSync(DATASET)) throw new Error(`[T16-05] 数据集不存在：${DATASET}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// 中文：数据集可达数百 MB，`readFileSync(...).split()` 会撞上 V8 的最大字符串长度。
// 这里改为按块流式读行，保持**行顺序逐行不变**（同 data-order-seed ⇒ 同采样序列）。
const outHandle = fs.openSync(OUT, 'w');
const hash = crypto.createHash('sha256');
const counts = { rows: 0, labeled: 0, unlabeled: 0, bySource: {} as Record<string, number> };
let pending = '';
const chunkBuffer = Buffer.alloc(1 << 22);

const emit = (line: string): void => {
    if (line.trim().length === 0) return;
    const row = JSON.parse(line) as Record<string, unknown>;
    const ordered = row.orderedActionCodes as string[] | undefined;
    if (!Array.isArray(ordered)) throw new Error(`[T16-05] ${row.sampleId as string} 缺少 orderedActionCodes。`);
    counts.rows += 1;
    let code: string | null = null;
    if (TARGET === 'l1') code = (row.l1ActionCode as string | null) ?? null;
    else if (TARGET === 's1') code = (row.searchActionCode as string | null) ?? null;
    else code = (row.behaviorActionCode as string | null) ?? null;

    const usable = TARGET !== 's1' || row.softLossUsable !== false;
    let text: string;
    if (code === null || !usable) {
        counts.unlabeled += 1;
        text = JSON.stringify({
            ...row, targetActionIndex: 0, targetActionCode: null,
            targetSource: TARGET, policyLossMask: false,
        });
    } else {
        const index = ordered.indexOf(code);
        if (index < 0) {
            counts.unlabeled += 1;
            text = JSON.stringify({
                ...row, targetActionIndex: 0, targetActionCode: null, targetSource: TARGET,
                policyLossMask: false, targetMissingReason: 'label-not-in-canonical-candidate-list',
            });
        } else {
            counts.labeled += 1;
            const source = String(row.sourcePolicy ?? 'unknown');
            counts.bySource[source] = (counts.bySource[source] ?? 0) + 1;
            text = JSON.stringify({
                ...row, targetActionIndex: index, targetActionCode: code,
                targetSource: TARGET, policyLossMask: true,
            });
        }
    }
    const out = `${text}\n`;
    fs.writeSync(outHandle, out);
    hash.update(out, 'utf8');
};

let readBytes = 0;
while (true) {
    const read = fs.readSync(fs.openSync(DATASET, 'r'), chunkBuffer, 0, chunkBuffer.length, readBytes);
    if (read <= 0) break;
    readBytes += read;
    pending += chunkBuffer.subarray(0, read).toString('utf8');
    const parts = pending.split('\n');
    pending = parts.pop() as string;
    for (const part of parts) emit(part);
}
if (pending.length > 0) emit(pending);
fs.closeSync(outHandle);
const sha = hash.digest('hex');
const report = {
    schema: 'v16_train_variant_1',
    task: 'T16-05',
    sourceDataset: DATASET.replace(/\\/g, '/'),
    targetSource: TARGET,
    rows: counts.rows,
    labeledRows: counts.labeled,
    unlabeledRows: counts.unlabeled,
    labelRate: counts.rows === 0 ? null : counts.labeled / counts.rows,
    byBehaviorSource: counts.bySource,
    outPath: OUT.replace(/\\/g, '/'),
    outSha256: sha,
    rule: '行顺序逐行保留，只有 targetActionIndex/targetActionCode/policyLossMask 变化；缺标签的行不伪造目标。',
};
if (REPORT !== null) fs.writeFileSync(path.resolve(REPORT), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
