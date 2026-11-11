/** 独立阶段三身份门禁；不改写旧科学合同。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, read, fileSha } from '../stage1/io';
export const S3 = path.dirname(fileURLToPath(import.meta.url));
export function preflight() {
    const contract = read(path.join(S3, 'SCIENCE_CONTRACT.json'));
    for (const [file, digest] of Object.entries(contract.files)) if (fileSha(path.join(ROOT, file)) !== digest) throw Error('阶段三冻结依赖变化：' + file);
    return fileSha(path.join(S3, 'SCIENCE_CONTRACT.json'));
}
export function sealedAllowed() {
    if (!fs.existsSync(path.join(S3, 'FINAL_CANDIDATE_LOCK.json'))) throw Error('唯一最终候选尚未锁定，禁止封存测试访问');
}
