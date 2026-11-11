import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, '../..');
export const SOURCE = path.resolve(DIR, '../data_acceptance_20261016');
export const RELEASE = 'release-2026-10-15T21-05-00-859Z';
export const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export const stateHash = (value: unknown) => sha(JSON.stringify(value));
export const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function save(name: string, value: unknown) {
    const target = path.resolve(DIR, name);
    if (!target.startsWith(DIR + path.sep)) throw Error('阶段输出目录越界');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}
export async function* gzipRows(bytes: Buffer): AsyncGenerator<any> {
    const input = Readable.from([bytes]), unzip = createGunzip();
    const propagate = (error: Error) => unzip.destroy(error);
    input.on('error', propagate); input.pipe(unzip);
    const lines = createInterface({ input: unzip, crlfDelay: Infinity });
    try { for await (const line of lines) if (line) yield JSON.parse(line); }
    finally { lines.close(); input.destroy(); unzip.destroy(); }
}
export function directoryBytes(root: string): number {
    let total = 0;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const file = path.join(root, entry.name);
        if (entry.isSymbolicLink()) throw Error('阶段目录内禁止支持链接');
        total += entry.isDirectory() ? directoryBytes(file) : fs.statSync(file).size;
    }
    return total;
}
