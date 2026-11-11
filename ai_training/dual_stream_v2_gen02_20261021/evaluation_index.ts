import fs from 'node:fs';
import path from 'node:path';
import { sha } from './common';

/** 原子更新排重索引，旧训练输入按内容SHA保全；预留临时文件的峰值空间。 */
export function persistEvaluationIndex(directory: string, packed: Buffer, usedBytes: number, maxBytes = 295_000_000) {
    const root = path.resolve(directory), target = path.join(root, 'evaluation-exclusions.txt.gz');
    const previous = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const currentSha = sha(packed), previousSha = previous ? sha(previous) : null;
    if (previousSha === currentSha) return { changed: false, sha256: currentSha, archivedSha256: previousSha };
    const history = previousSha ? path.join(root, 'evaluation-index-history', previousSha + '.txt.gz') : null;
    const archiveBytes = history && !fs.existsSync(history) ? previous!.length : 0;
    if (usedBytes + archiveBytes + packed.length >= maxBytes) throw Error('原子更新与保全旧排重索引将超过磁盘门禁，须先归档');
    if (history) {
        fs.mkdirSync(path.dirname(history), { recursive: true });
        if (!fs.existsSync(history)) fs.copyFileSync(target, history);
        if (sha(fs.readFileSync(history)) !== previousSha) throw Error('旧代排重索引保全SHA不符');
        const archived = fs.openSync(history, 'r+');
        try { fs.fsyncSync(archived); } finally { fs.closeSync(archived); }
    }
    const temporary = target + '.tmp', fd = fs.openSync(temporary, 'w');
    try { fs.writeSync(fd, packed); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, target);
    return { changed: true, sha256: currentSha, archivedSha256: previousSha };
}
