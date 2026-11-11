import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** 累计写入预算包含重复写入；缓存文件体积也计入保守预算。 */
export class Storage {
    written = 0;
    constructor(readonly root: string) {
        if (fs.existsSync(root)) throw Error('输出目录已存在，拒绝覆盖');
        fs.mkdirSync(root, {recursive: true});
    }
    size(dir = this.root): number {
        return fs.readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? this.size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
    }
    check(extra = 0) {
        const disk = fs.statfsSync(this.root);
        const budgetRoot = path.resolve('D:/AncientEmpiresData/continuation_stage5_20261104_v1');
        const size = this.root.startsWith(budgetRoot) ? this.size(budgetRoot) : this.size();
        if (disk.bavail * disk.bsize < 15_000_000_000 || this.written + size + extra > 3_000_000_000) throw Error('磁盘护栏触发，安全停止');
    }
    write(name: string, value: unknown, compressed = false) {
        const text = Buffer.from(JSON.stringify(value)); const bytes = compressed ? gzipSync(text) : text;
        this.check(bytes.length);
        const reservation = spawnSync('python', ['-X', 'utf8', path.join(path.dirname(fileURLToPath(import.meta.url)), 'write_budget.py'), String(bytes.length)], {windowsHide: true, encoding: 'utf8'});
        if (reservation.status !== 0) throw Error('写入预算预留失败：' + reservation.stderr);
        fs.writeFileSync(path.join(this.root, name), bytes, {flag: 'wx'}); this.written += bytes.length;
    }
}
