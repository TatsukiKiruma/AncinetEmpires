import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const S3 = path.join(HERE, '../stage3');
export const DATA = 'D:/AncientEmpiresData/continuation_stage4_v5_20261101_v1';
export const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export const sha = (bytes: string | Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
export const fileSha = (file: string) => sha(fs.readFileSync(file));

/** 每次写入使用独立临时名；Windows共享冲突最多指数退避两秒，不重跑对局。 */
export async function save(file: string, value: unknown, immutable = false) {
    return saveText(file, JSON.stringify(value, null, 2) + '\n', immutable);
}
export async function saveText(file: string, content: string, immutable = false) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const pending = `${file}.${process.pid}.${crypto.randomUUID()}.pending`;
    fs.writeFileSync(pending, content, { flag: 'wx' });
    const started = performance.now(); let delay = 8;
    try {
        while (true) {
            try {
                if (immutable) {
                    // 硬链接的独占创建避免检查存在与替换之间的竞态，结果发布后只读。
                    fs.linkSync(pending, file); fs.unlinkSync(pending);
                } else fs.renameSync(pending, file);
                return;
            } catch (error: any) {
                if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || performance.now() - started + delay > 2000) throw error;
                await new Promise(resolve => setTimeout(resolve, delay)); delay = Math.min(128, delay * 2);
            }
        }
    } finally { if (fs.existsSync(pending)) fs.unlinkSync(pending); }
}

export function modelIdentity() {
    const manifest = read(path.join(S3, 'OMNI_BASE_MODEL_MANIFEST.json'));
    const prefix = manifest.models.best['final.bin'].path.replace(/\.bin$/, '');
    if (fileSha(prefix + '.bin') !== '1d3b6d01b91de9cbd56693b9140ca769e9df06c490701adccfd8fc701fb4a6a6' || fileSha(prefix + '.json') !== manifest.models.best['final.json'].sha256) throw Error('Omni-Base模型摘要不符');
    return { prefix, binSha256: fileSha(prefix + '.bin'), metadataSha256: fileSha(prefix + '.json') };
}

export function allowSealed() {
    const lockFile = path.join(HERE, 'STAGE4_V5_CANDIDATE_LOCK.json');
    if (!fs.existsSync(lockFile)) throw Error('第四阶段唯一候选尚未锁定，禁止封存面板访问');
    const lock = read(lockFile), attempt = path.join(HERE, 'FINAL_TEST_ATTEMPT.json');
    if (!fs.existsSync(attempt) || read(attempt).lockSha256 !== fileSha(lockFile)) throw Error('唯一封存尝试未占用或锁定摘要不符');
    const identity = modelIdentity();
    if (lock.modelSha256 !== identity.binSha256 || lock.metadataSha256 !== identity.metadataSha256) throw Error('锁定权重或元数据不符');
    for (const [file, digest] of Object.entries(lock.sources)) if (fileSha(path.join(ROOT, file)) !== digest) throw Error('锁定后源码变化：' + file);
    return lock;
}
