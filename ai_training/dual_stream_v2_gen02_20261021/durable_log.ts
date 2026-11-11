import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DIR } from './common';

/** 每行都是完整gzip成员，写后fsync；异常退出也保留所有已提交动作和反扑见证。 */
export class DurableLog {
    private fd: number;
    constructor(public file: string) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        this.fd = fs.openSync(file, 'a');
    }
    async line(value: unknown) {
        const data = gzipSync(JSON.stringify(value) + '\n', { level: 6 });
        fs.writeSync(this.fd, data); fs.fsyncSync(this.fd);
    }
    async close() {
        fs.fsyncSync(this.fd); fs.closeSync(this.fd);
        // 完结后合并独立成员以利用跨行重复；JSON行逐字节保持，原子替换不产生大特征缓存。
        const raw = fs.readFileSync(this.file), plain = raw.length ? gunzipSync(raw) : Buffer.alloc(0), packed = gzipSync(plain, { level: 9 }), tmp = this.file + '.repack.tmp';
        fs.writeFileSync(tmp, packed); fs.renameSync(tmp, this.file);
    }
}

export function diskGuard() {
    const size = (folder: string): number => fs.readdirSync(folder, { withFileTypes: true }).reduce((n, entry) => {
        if (entry.isSymbolicLink()) throw Error('阶段5禁止支持链接');
        const file = path.join(folder, entry.name); return n + (entry.isDirectory() ? size(file) : fs.statSync(file).size);
    }, 0);
    const bytes = size(DIR), free = fs.statfsSync(DIR);
    if (bytes >= 295_000_000 || Number(free.bavail) * Number(free.bsize) < 12 * 1024 ** 3) throw Error('阶段5磁盘门禁要求暂停写入，保留全部现存产物');
    return bytes;
}
