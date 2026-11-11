import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../src/game/state_snapshot';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, '../..');
export const SOURCE = path.resolve(DIR, '../sd64x3_phone_20261016');
export const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const digest = (value: unknown) => sha(canonicalJson(value));
export const read = (name: string) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
export function save(name: string, value: unknown) {
  const target = path.join(DIR, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
export function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
export function resource() {
  const stat = fs.statfsSync(ROOT);
  const bytes = files(DIR).reduce((n, p) => n + fs.statSync(p).size, 0);
  const trainingBytes = files(SOURCE).reduce((n, p) => n + fs.statSync(p).size, 0);
  return { freeBytes: stat.bavail * stat.bsize, outputBytes: bytes, phaseWithTrainingBytes: bytes + trainingBytes, rss: process.memoryUsage().rss, at: new Date().toISOString() };
}
export function guard() {
  const r = resource();
  if (r.freeBytes < 12 * 1024 ** 3 || r.phaseWithTrainingBytes >= 512 * 1024 ** 2) throw Error('本任务资源水位停止');
  return r;
}
