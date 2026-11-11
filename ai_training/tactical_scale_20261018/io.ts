import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, '../..');
export const PHONE = 'C:/Users/SHIINA/.codex/visualizations/2026/10/18/01a14c51-a6eb-7493-800e-4df86d9f18d7/phone-ab';
export const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const hash = (data: unknown) => sha(JSON.stringify(data));
export const read = (name: string) => JSON.parse(fs.readFileSync(path.resolve(DIR, name), 'utf8').replace(/^\uFEFF/, ''));
export function save(name: string, data: unknown) {
    const target = path.resolve(DIR, name);
    if (!target.startsWith(DIR + path.sep)) throw Error('输出越界');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(data));
}
export function quantiles(values: number[]) {
    const x = [...values].sort((a, b) => a - b);
    const p = (q: number) => x.length ? x[Math.max(0, Math.ceil(q * x.length) - 1)] : null;
    return { count: x.length, p50: p(.5), p95: p(.95), p99: p(.99), max: p(1) };
}
