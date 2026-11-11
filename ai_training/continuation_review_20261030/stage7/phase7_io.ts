import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const here = import.meta.dirname;
export const root = path.resolve(here, '../../..');
export const data = 'D:/AncientEmpiresData/continuation_stage7_20261108_v1';
export const s3 = path.join(here, '../stage3');
export const h1 = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final';
export const h1Sha = '3bedc848d9adccc2df67ffb22950d7a020ca4d3106c174e9974a17fc7647eccf';
const publicSha = 'df20a853edcf031f2ae8da1ae379e3dd84ac3f19d77c0765c0dcacef205cb8d1';

export function sha(bytes: Buffer | string) { return createHash('sha256').update(bytes).digest('hex'); }
export function fileSha(file: string) { return sha(fs.readFileSync(file)); }
export function readJson(file: string, digest?: string) {
    const bytes = fs.readFileSync(file);
    if (digest) assert.equal(sha(bytes), digest, `输入摘要变化：${file}`);
    return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
}
export function readLocal(name: string) { return readJson(path.join(here, name)); }
export function saveJson(file: string, data: unknown) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, file);
}
export function saveLocal(name: string, data: unknown) { saveJson(path.join(here, name), data); }
export function checkSourceLock() {
    const lock = readLocal('PUBLIC_SOURCE_LOCK.json');
    const frozen = Object.entries(lock.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const currentFiles = ['src', 'tools', 'docs'].flatMap(dir => fs.readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
        .filter(f => f.isFile()).map(f => path.relative(root, path.join(f.parentPath, f.name)).replaceAll('\\', '/'))).sort();
    // 冻结收据由 Python json.dumps(sort_keys=True, ensure_ascii=True) 生成。
    const asciiJson = (value: unknown) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    const manifestSha = sha('{' + frozen.map(([file, digest]) => `${asciiJson(file)}: ${asciiJson(digest)}`).join(', ') + '}');
    const changed = frozen.filter(([file, digest]) => !fs.existsSync(path.join(root, file)) || fileSha(path.join(root, file)) !== digest).map(([file]) => file);
    const expected = new Set(frozen.map(([file]) => file));
    changed.push(...currentFiles.filter(file => !expected.has(file)));
    const result = { checkedAt: new Date().toISOString(), passed: changed.length === 0 && frozen.length === 646 && currentFiles.length === 646
        && manifestSha === publicSha && lock.sha256 === publicSha && readLocal('PHASE_A_SUBSET.json').passed === true,
        fileCount: currentFiles.length, sha256: manifestSha, changed, phaseARerun: false };
    saveLocal('STAGE7_PUBLIC_SOURCE_CHECK.json', result);
    assert(result.passed, `冻结的公共源码不一致：${JSON.stringify(result)}`);
    return result;
}

export function checkH1() {
    assert.equal(fileSha(h1 + '.bin'), h1Sha);
    assert.equal(fileSha(path.join(path.dirname(h1), 'value-6000.pt')), 'a0af926f76b3c0358742b3f174484c521ffb91f80d8536524e521ecfb9dff835');
}

export function positiveProgressStop() {
    if (fs.existsSync(path.join(here, 'STOP'))) throw Error('收到停止标志');
}
