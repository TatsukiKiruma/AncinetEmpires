import fs from 'node:fs';
import path from 'node:path';
import { sha, ROOT } from './common';

/** 原子更新排重索引，旧训练输入按内容SHA保全；预留临时文件的峰值空间。 */
export function persistEvaluationIndex(directory: string, packed: Buffer, usedBytes: number, maxBytes = 950_000_000) {
    const root = path.resolve(directory), target = path.join(root, 'evaluation-exclusions.txt.gz');
    const previous = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const currentSha = sha(packed), previousSha = previous ? sha(previous) : null;
    if (previousSha === currentSha) return { changed: false, sha256: currentSha, archivedSha256: previousSha };
    const history = previousSha ? path.join(root, 'evaluation-index-history', previousSha + '.txt.gz') : null;
    const archiveBytes = history && !fs.existsSync(history) ? previous!.length : 0;
    // 新索引在同卷工作区暂存，原路径仍原子替换；目录峰值取保全前后两态的较大值。
    const peakBytes = Math.max(usedBytes + archiveBytes, usedBytes + archiveBytes + packed.length - (previous?.length ?? 0));
    if (peakBytes >= maxBytes) throw Error('原子更新与保全旧排重索引将超过磁盘门禁，须先归档');
    const free = fs.statfsSync(root);
    if (Number(free.bavail) * Number(free.bsize) - archiveBytes - packed.length < 12 * 1024 ** 3) throw Error('索引暂存将触及系统12GiB空闲守卫');
    if (history) {
        fs.mkdirSync(path.dirname(history), { recursive: true });
        if (!fs.existsSync(history)) fs.copyFileSync(target, history);
        if (sha(fs.readFileSync(history)) !== previousSha) throw Error('旧代排重索引保全SHA不符');
        const archived = fs.openSync(history, 'r+');
        try { fs.fsyncSync(archived); } finally { fs.closeSync(archived); }
    }
    const stagingRoot = path.resolve(ROOT, '.runtime'); fs.mkdirSync(stagingRoot, { recursive: true });
    if (fs.statSync(root).dev !== fs.statSync(stagingRoot).dev) throw Error('索引原子替换要求同一磁盘卷');
    const staging = fs.mkdtempSync(path.join(stagingRoot, 'phase51-index-'));
    const temporary = path.join(staging, 'evaluation-exclusions.txt.gz');
    try {
        const fd = fs.openSync(temporary, 'w');
        try { let offset = 0; while (offset < packed.length) offset += fs.writeSync(fd, packed, offset); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
        if (sha(fs.readFileSync(temporary)) !== currentSha) throw Error('索引暂存SHA不符');
        fs.renameSync(temporary, target);
    } finally {
        // 仅清理当前调用创建的同卷暂存文件和空目录，不递归处理工作区其它内容。
        if (path.dirname(path.resolve(staging)) !== stagingRoot || !path.basename(staging).startsWith('phase51-index-')) throw Error('索引暂存清理越界');
        fs.rmSync(temporary, { force: true }); fs.rmdirSync(staging);
    }
    return { changed: true, sha256: currentSha, archivedSha256: previousSha, peakDirectoryBytes: peakBytes, stagedBytes: packed.length };
}
