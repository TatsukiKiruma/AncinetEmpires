import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DIR, ROOT, read, sha, digest, save, guard } from './io';
import { play, type Slot } from './match';

const manifest = read('manifest.json');
for (const [name, hash] of Object.entries(manifest.sourceBindings)) assert.equal(sha(fs.readFileSync(path.join(ROOT, name))), hash, `源码身份变化:${name}`);
for (const model of manifest.modelPackages) assert.equal(sha(fs.readFileSync(path.join(DIR, model.file))), model.sha256);
if (process.argv[2] === 'slot') {
  await play(manifest.slots.find((s: Slot) => s.id === process.argv[3]));
} else {
  assert.equal(read('preflight.json').passed, true, '适配运行检查未通过');
  const manifestSha256 = digest(manifest);
  if (!fs.existsSync(path.join(DIR, 'run-start.json'))) save('run-start.json', { at: new Date().toISOString(), manifestSha256, resource: guard(), workerCount: 1 });
  for (const slot of manifest.slots as Slot[]) {
    guard();
    const prefix = `slots/${slot.id}`, resultPath = path.join(DIR, prefix, 'result.json');
    if (fs.existsSync(resultPath)) continue;
    if (fs.existsSync(path.join(DIR, prefix, 'started.json'))) {
      save(`${prefix}/result.json`, { slot, classification: 'interrupted', reason: '前次已开始，无补赛或预算重置', actions: null });
      continue;
    }
    await new Promise<void>((resolve, reject) => {
      const child = fork(path.join(DIR, 'run.ts'), ['slot', slot.id], { cwd: ROOT, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      let wallStart: number | null = null, decisionStart: number | null = null, killed: string | null = null;
      const spawned = Date.now();
      child.on('message', (m: { type: string; at?: number }) => {
        if (m.type === 'decision_start') { decisionStart = m.at!; wallStart ??= spawned; }
        if (m.type === 'decision_end') decisionStart = null;
      });
      const timer = setInterval(() => {
        const now = Date.now();
        if (decisionStart !== null && now - decisionStart > manifest.budgets.decisionMs) killed = 'decision_timeout';
        else if (now - (wallStart ?? spawned) > manifest.budgets.wallMs) killed = 'wall_truncation';
        if (killed) child.kill();
      }, 10);
      child.on('error', e => { clearInterval(timer); reject(e); });
      child.on('exit', (code, signal) => {
        clearInterval(timer);
        if (!fs.existsSync(resultPath)) {
          fs.mkdirSync(path.join(DIR, prefix), { recursive: true });
          save(`${prefix}/watchdog.json`, { killed, code, signal, at: new Date().toISOString(), wallStart, decisionStart, spawned });
          save(`${prefix}/result.json`, { slot, classification: killed ?? 'error', reason: '父进程中止或子进程未正常交付；保留原始日志与失败槽', actions: null });
        }
        const log = path.join(DIR, prefix, 'actions.jsonl');
        if (fs.existsSync(log)) {
          const raw = fs.readFileSync(log), compressed = gzipSync(raw, { level: 9, mtime: 0 } as object);
          fs.writeFileSync(log + '.gz', compressed, { flag: 'wx' });
          assert.equal(sha(gunzipSync(fs.readFileSync(log + '.gz'))), sha(raw));
          // 仅删除本次新生成且已校验摘要可恢复的未压缩日志。
          save(`${prefix}/log-receipt.json`, { rawBytes: raw.length, rawSha256: sha(raw), gzipBytes: compressed.length, gzipSha256: sha(compressed) });
          fs.unlinkSync(log);
        }
        resolve();
      });
    });
  }
  save('run-end.json', { at: new Date().toISOString(), resource: guard(), completedSlots: manifest.slots.length });
}
