/**
 * V17/T17-01：网络输入身份的跨语言/跨实现一致性检查。
 *
 * 中文：把 `v17/tools/v17_input_identity.ts` 的 TS 实现与 V16 审核脚本
 * `v17/review/audit_v16.py` 已经算好的 `{train,val}_input_index.jsonl` 对齐。
 * 审核索引是**独立实现**（Python + struct.pack + json.dumps），因此这是一个真实
 * 的交叉验证，而不是自己对自己。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/v17_identity_parity.ts --rows 500
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { policyInputKeyHexV17 } from './v17_input_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROWS = Number(arg('--rows', '500'));
const ROOT = process.cwd();
const OUT = path.resolve(arg('--out', 'v17/out/v17_20260926_r2/identity/input_identity_parity.json') as string);

interface IndexRow { sampleId: string; key: string; savedKey: string; mapName: string; family: string }

function loadIndex(p: string): Map<string, IndexRow> {
    const map = new Map<string, IndexRow>();
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const row = JSON.parse(t) as IndexRow;
        map.set(row.sampleId, row);
    }
    return map;
}

function headLines(p: string, n: number): string[] {
    const out: string[] = [];
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.allocUnsafe(1 << 20);
    let carry = '';
    try {
        while (out.length < n) {
            const read = fs.readSync(fd, buf, 0, buf.length, null);
            if (read <= 0) break;
            carry += buf.toString('utf8', 0, read);
            const parts = carry.split('\n');
            carry = parts.pop() as string;
            for (const p2 of parts) {
                const t = p2.trim();
                if (t) out.push(t);
                if (out.length >= n) break;
            }
        }
        if (out.length < n && carry.trim()) out.push(carry.trim());
    } finally {
        fs.closeSync(fd);
    }
    return out;
}

const report: Record<string, unknown> = {
    schema: 'v17_input_identity_parity_1',
    identityId: 'v17-netinput-v1',
    rows: ROWS,
    splits: {},
};

for (const split of ['train', 'val']) {
    const idxPath = path.join(ROOT, `v17/review/${split}_input_index.jsonl`);
    const dataPath = path.join(ROOT, `v16/out/v16_20260926_core/T16-04/dataset_v16_${split}.jsonl`);
    if (!fs.existsSync(idxPath) || !fs.existsSync(dataPath)) {
        (report.splits as Record<string, unknown>)[split] = { skipped: true, reason: '缺索引或数据文件' };
        continue;
    }
    const index = loadIndex(idxPath);
    const lines = headLines(dataPath, ROWS);
    let checked = 0;
    let matchAudit = 0;
    let matchSaved = 0;
    const mismatches: Array<Record<string, unknown>> = [];
    for (const line of lines) {
        const row = JSON.parse(line) as Record<string, unknown> & {
            sampleId: string; spatialTensor: number[]; globalFeatures: number[];
            candidateActions: Array<{ actorCoord?: unknown; landingCoord?: unknown; targetCoord?: unknown; semantics: number[] }>;
            policyInputKey: string;
        };
        const key = policyInputKeyHexV17(row.spatialTensor, row.globalFeatures, row.candidateActions);
        checked += 1;
        const idx = index.get(row.sampleId);
        if (idx && idx.key === key) matchAudit += 1;
        else if (mismatches.length < 5) mismatches.push({ sampleId: row.sampleId, tsKey: key, auditKey: idx?.key ?? null });
        if (row.policyInputKey === key) matchSaved += 1;
    }
    (report.splits as Record<string, unknown>)[split] = {
        checked,
        matchAuditKey: matchAudit,
        matchSavedPolicyInputKey: matchSaved,
        auditIndexSize: index.size,
        mismatches,
        pass: checked > 0 && matchAudit === checked,
    };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.splits as Record<string, { pass?: boolean; skipped?: boolean }>)
    .every((s) => s.skipped === true || s.pass === true);
process.exit(ok ? 0 : 1);
