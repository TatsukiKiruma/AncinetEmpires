/** 验证连续gzip成员、跨块中文、无末尾换行与压缩截断错误。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { gzipJsonRows } from '../gzip_rows';
const dir=path.dirname(fileURLToPath(import.meta.url));
const expected=[{text:'中文边界'.repeat(12000)},{text:'第二个gzip成员'}];
const file=path.join(dir,'concatenated.jsonl.gz'),raw=Buffer.concat(expected.map((row,i)=>gzipSync(JSON.stringify(row)+(i===0?'\n':''))));
fs.writeFileSync(file,raw);const rows=[];for await(const row of gzipJsonRows(file))rows.push(row);assert.deepEqual(rows,expected);
const broken=path.join(dir,'truncated.jsonl.gz');fs.writeFileSync(broken,raw.subarray(0,raw.length-8));let rejected=false;
try{for await(const row of gzipJsonRows(broken))void row;}catch{rejected=true;}
assert.ok(rejected,'压缩截断必须报错，不能静默产生通过回执');
console.log(JSON.stringify({passed:true,concatenatedMembers:2,unicodeAcrossChunks:true,noTrailingNewline:true,truncatedGzipRejected:true}));
