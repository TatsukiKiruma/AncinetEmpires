import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { statfs, readdir, stat, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { digest, sha256 } from '../data_acceptance_20261016/replay/core';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const OUT = path.join(ROOT, 'ai_training/dual_stream_v2_phase3_20261020/new_replays');
export const MIN_FREE_BYTES = 12 * 1024 ** 3;
export const MAX_OUTPUT_BYTES = 50_000_000;
export class PauseError extends Error {}
export async function guardFree(): Promise<number> {
  const s = await statfs(ROOT); const freeBytes = Number(s.bavail) * Number(s.bsize);
  if (freeBytes < MIN_FREE_BYTES) throw new PauseError(`空闲${freeBytes}字节，低于12GiB，暂停自身`);
  return freeBytes;
}
export async function walk(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const rows = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(rows.map(x => x.isDirectory() ? walk(path.join(dir, x.name), predicate) : predicate(x.name) ? [path.join(dir, x.name)] : []))).flat().sort();
}
export async function fileSha(file: string): Promise<string> {
  const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex');
}
export async function outputBytes(): Promise<number> {
  return (await Promise.all((await walk(OUT, () => true)).map(async f => (await stat(f)).size))).reduce((a, b) => a + b, 0);
}
export async function guard(): Promise<{ freeBytes: number; outputBytes: number }> {
  const freeBytes = await guardFree(), bytes = await outputBytes();
  if (bytes >= MAX_OUTPUT_BYTES) throw new PauseError('本目录达到256MiB输出预算，暂停自身');
  return { freeBytes, outputBytes: bytes };
}
export async function sourceIdentity() {
  const game = await walk(path.join(ROOT, 'src/game'), n => n.endsWith('.ts') && !n.endsWith('.test.ts'));
  const files = [...game, ...['tools/apk_game_get_validate.ts', 'tools/apk_game_get_report.ts', 'tools/apk_resource_crypto.ts', 'package.json', 'package-lock.json'].map(f => path.join(ROOT, f))];
  const hashes = Object.fromEntries(await Promise.all(files.map(async f => [path.relative(ROOT, f).replaceAll('\\', '/'), sha256(await readFile(f))])));
  return { hash: digest(hashes), hashes, node: process.version };
}
export async function immutable(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2), { flag: 'wx' });
}
export async function mutable(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2)); await rename(temp, file);
}
export class GzipLines {
  private gzip = createGzip({ level: 6 });
  private output;
  private outputDone: Promise<void>;
  private gzipDone: Promise<void>;
  private error: Error | null = null;
  bytes = 0;
  lines = 0;
  constructor(public file: string, private remainingBudget: number) {
    this.output = createWriteStream(file, { flags: 'wx' });
    this.gzip.on('data', chunk => {
      this.bytes += chunk.length;
      if (this.bytes > this.remainingBudget) this.gzip.destroy(new PauseError('压缩产物将超过256MiB预算，暂停自身'));
    });
    this.gzip.on('error', e => { this.error = e; this.output.destroy(e); });
    this.output.on('error', e => { this.error = e; this.gzip.destroy(e); });
    this.gzip.pipe(this.output);
    this.outputDone = finished(this.output); this.outputDone.catch(() => {});
    this.gzipDone = finished(this.gzip); this.gzipDone.catch(() => {});
  }
  async line(value: unknown) {
    if (this.error) throw this.error;
    if (!this.gzip.write(JSON.stringify(value) + '\n')) await once(this.gzip, 'drain');
    this.lines++;
  }
  async close() {
    if (!this.gzip.writableEnded) this.gzip.end();
    await Promise.all([this.gzipDone, this.outputDone]);
    if (this.error) throw this.error;
  }
}
