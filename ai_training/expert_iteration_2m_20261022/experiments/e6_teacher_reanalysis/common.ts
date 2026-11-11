/** 新结果只允许写入本实验，旧控制文件仅作身份核验。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const R = path.resolve(HERE, '../..');
export const E = path.join(R, 'execution_v5');
export const ROOT = path.resolve(R, '../..');
export const SEED = 221966910;
export const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
export const sha = (v: string | Buffer) => crypto.createHash('sha256').update(v).digest('hex');
export const hash = (v: unknown) => sha(JSON.stringify(v));
export function writeNew(file: string, value: unknown) {
    if (!path.resolve(file).startsWith(HERE + path.sep)) throw Error('结果超出 E6 工作区');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), { flag: 'wx' });
}
export function space() {
    const disk = fs.statfsSync(HERE);
    if (disk.bavail * disk.bsize < 12 * 1024 ** 3) throw Error('可用空间低于继承的12GiB保留线');
}
export function checkBudget() {
    const file = process.env.E6_BUDGET;
    if (!file) throw Error('实验计算必须由 E6 预算入口启动');
    const budget = read(file);
    if (Date.now() >= Math.min(budget.totalDeadline, budget.stageDeadline)) throw Error('阶段或24小时预算到期');
    space();
}
export function seeded(seed: number) {
    let value = seed >>> 0;
    return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
