import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DIR, save, sha } from './common';
import { DurableLog } from './durable_log';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';

const temp = fs.mkdtempSync(path.join(DIR, 'log-regression-')), file = path.join(temp, 'witnesses.jsonl.gz');
const hashes: string[] = [];
try {
    const writer = new DurableLog(file);
    for (let i = 0; i < 4; i++) {
        const data = randomBytes(700000).toString('hex'); hashes.push(sha(data)); await writer.line({ i, data });
        let rows = 0;
        // 不调用close也应可以完整读取已flush的所有成员，模拟进程在决策边界中断。
        for await (const row of gzipRows(fs.readFileSync(file))) { assert.equal(sha(row.data), hashes[row.i]); rows++; }
        assert.equal(rows, i + 1);
    }
    await writer.close(); const bytes = fs.statSync(file).size; assert.ok(bytes > 2_000_000);
    const resumed = new DurableLog(file); await resumed.line({ i: 4, data: '恢复追加' }); await resumed.close();
    let rows = 0; for await (const row of gzipRows(fs.readFileSync(file))) { if (row.i < 4) assert.equal(sha(row.data), hashes[row.i]); rows++; }
    assert.equal(rows, 5);
    const emptyFile = path.join(temp, 'empty-witnesses.jsonl.gz'), empty = new DurableLog(emptyFile); await empty.close();
    let emptyRows = 0; for await (const _ of gzipRows(fs.readFileSync(emptyFile))) emptyRows++;
    assert.equal(emptyRows, 0);
    save('durable-log-regression.json', { passed: true, compressedBytesBeforeResume: bytes, rows, flushedBeforeClose: true, appendAfterResume: true, emptyWitnessClose: true, twoMbLimitRemoved: true });
} finally {
    if (path.dirname(path.resolve(temp)) !== path.resolve(DIR)) throw Error('日志回归临时路径越界');
    fs.rmSync(temp, { recursive: true });
}
