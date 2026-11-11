import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { reserve } from './arena_io';

/** 写前预留压缩后的实际字节；预算账本仅初始化时扫描。 */
export function writeNew(file: string, value: unknown, compressed = false) {
    const text = Buffer.from(JSON.stringify(value));
    const bytes = compressed ? gzipSync(text) : text;
    reserve(bytes.length); fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, bytes, {flag: 'wx'});
}
