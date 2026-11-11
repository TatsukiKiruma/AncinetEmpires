import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, '../../..');
export const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const relative = (file: string) => path.relative(ROOT, file).replaceAll('\\', '/');
export const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
export const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';

export async function walk(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const found: string[] = [];
  for (const entry of entries) {
    // 不遍历支持链接，避免把归档或公共源码链接误作本次数据。
    if (entry.isSymbolicLink()) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(file, predicate));
    else if (entry.isFile() && predicate(entry.name)) found.push(file);
  }
  return found.sort();
}

export async function save(file: string, value: unknown, immutable = false) {
  const target = path.resolve(file);
  if (!target.startsWith(DIR + path.sep) && !['HUMAN_DATA_REPORT.md', 'HUMAN_DATA_INDEX.json'].some(name => target === path.join(DIR, '..', name))) {
    throw Error('真人验收输出目录越界');
  }
  await mkdir(path.dirname(target), { recursive: true });
  const bytes = typeof value === 'string' ? value : json(value);
  if (immutable) await writeFile(target, bytes, { flag: 'wx' });
  else {
    const temporary = target + `.${process.pid}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  }
}
