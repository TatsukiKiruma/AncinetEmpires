/** 将独立保存前态分块；只做无损压缩与寻址，不运行游戏。 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { HERE, INDEX, OLD_SPLIT, read, save, sha, fileSha, directory, lines, frames } from './io';

const out = path.resolve(process.argv[2]), part = Number(process.argv[3] ?? 0), parts = Number(process.argv[4] ?? 1);
const old = read(OLD_SPLIT), parents = [...read(INDEX).map((p: any) => ({ ...p, corpus: 'new' })), ...old.train.map((p: any) => ({ ...p, corpus: 'old', split: 'train' })), ...old.dev.map((p: any) => ({ ...p, corpus: 'old', split: 'dev' }))];
fs.mkdirSync(out, { recursive: true });
for (let i = part; i < parents.length; i += parts) {
    const p = parents[i], receiptPath = path.join(out, p.parentId + '.json'); if (fs.existsSync(receiptPath)) continue;
    let target = path.join(out, p.parentId + '.blocks');
    if (fs.existsSync(target)) target = path.join(out, p.parentId + `.interrupted-retry-${Date.now()}.blocks`);
    const fd = fs.openSync(target, 'wx'), blocks: any[] = []; let buffer: Buffer[] = [], size = 0, offset = 0, cursor = 0;
    const flush = () => { if (!buffer.length) return; const b = gzipSync(Buffer.concat(buffer), { level: 3 }); fs.writeSync(fd, b); blocks.push({ first: cursor - buffer.length, rows: buffer.length, offset, bytes: b.length, sha256: sha(b) }); offset += b.length; buffer = []; size = 0; };
    const append = (b: Buffer) => { buffer.push(b); size += b.length; cursor++; if (buffer.length >= 32 || size > 2 ** 20) flush(); };
    try {
        if (p.source?.includes('replica')) { for await (const r of lines(path.join(directory(p), 'decisions.jsonl.gz'))) append(Buffer.from(JSON.stringify(r) + '\n')); }
        else { for await (const b of frames(path.join(directory(p), 'states.bin.gz'))) { const header = Buffer.alloc(4); header.writeInt32BE(b.length); append(Buffer.concat([header, b])); } }
        flush(); if (cursor !== p.actions) throw Error('随机寻址副本记录数不符');
    } finally { fs.closeSync(fd); }
    const sourceFile = p.source?.includes('replica') ? 'decisions.jsonl.gz' : 'states.bin.gz';
    save(receiptPath, { parentId: p.parentId, sourceFile, sourceSha256: fileSha(path.join(directory(p), sourceFile)), path: target, sha256: fileSha(target), records: cursor, bytes: offset, blocks });
    console.log(JSON.stringify({ i, parentId: p.parentId, records: cursor, bytes: offset }));
}
save(path.join(HERE, `STORE_PART_${part}.json`), { out, part, parts, completed: true, historicalReplay: false });
