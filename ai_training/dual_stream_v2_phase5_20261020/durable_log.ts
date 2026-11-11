import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DIR, sha } from './common';

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

/** 并发原子替换或夹具清理可能使已列出的路径消失；只忽略ENOENT，其它错误照常抛出。 */
export function directoryBytes(folder: string): number {
    try {
        return fs.readdirSync(folder, { withFileTypes: true }).reduce((n, entry) => {
            if (entry.isSymbolicLink()) throw Error('阶段5禁止支持链接');
            const file = path.join(folder, entry.name);
            try { return n + (entry.isDirectory() ? directoryBytes(file) : fs.statSync(file).size); }
            catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return n; throw error; }
        }, 0);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
}

/** 仅显式的第4代运行可使用登记预算；旧协议原件不改，工程新增证据另有扩展账本。 */
export function evidenceLimit() {
    if (process.env.LEAGUE_PHASE54 === '1') {
        const protocol = JSON.parse(fs.readFileSync(path.join(DIR, 'phase54-audit/protocol.json'), 'utf8'));
        if (protocol.phase !== '5.4' || protocol.resource.minimumFreeBytes !== 12 * 1024 ** 3 || protocol.resource.evidenceCapBytes !== 2_000_000_000) throw Error('阶段5.4证据空间预登记失配');
        return protocol.resource.evidenceCapBytes;
    }
    let cap = 950_000_000;
    if (process.env.LEAGUE_EVIDENCE_LIMIT) {
        const protocol = JSON.parse(fs.readFileSync(path.join(DIR, 'phase53-audit/gen4-protocol.json'), 'utf8'));
        cap = Number(process.env.LEAGUE_EVIDENCE_LIMIT);
        if (protocol.generation !== 4 || cap !== protocol.resource.evidenceCapBytes || cap !== 1_200_000_000) throw Error('新增证据预算必须等于第4代预登记协议');
        const extensionPath = path.join(DIR, 'phase53-audit/gen4-resource-extension.json');
        if (fs.existsSync(extensionPath)) {
            const extension = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));
            if (extension.generation !== 4 || extension.originalEvidenceCapBytes !== cap || extension.evidenceCapBytes !== 1_350_000_000 || extension.minimumFreeBytes !== 12 * 1024 ** 3 || extension.originalProtocolSha256 !== sha(fs.readFileSync(path.join(DIR, 'phase53-audit/gen4-protocol.json'))) || !extension.qualityAndTimingThresholdsUnchanged) throw Error('工程证据空间扩展账本失配');
            cap = extension.evidenceCapBytes;
        }
    }
    return cap;
}

export function diskGuard() {
    const bytes = directoryBytes(DIR), free = fs.statfsSync(DIR), cap = evidenceLimit();
    if (bytes >= cap || Number(free.bavail) * Number(free.bsize) < 12 * 1024 ** 3) throw Error('阶段5磁盘门禁要求暂停写入，保留全部现存产物');
    return bytes;
}
