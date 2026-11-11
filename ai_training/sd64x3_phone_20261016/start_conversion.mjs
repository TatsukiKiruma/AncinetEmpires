import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = path.resolve('ai_training/sd64x3_phone_20261016'), lanes = 12;
const jobs = [], pending = [];
for (let lane = 0; lane < lanes; lane++) {
  const out = fs.openSync(path.join(root, `convert-${lane}.log`), 'a'), err = fs.openSync(path.join(root, `convert-${lane}.err`), 'a');
  const p = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'convert.ts'), String(lane), String(lanes)], { detached: true, windowsHide: true, stdio: ['ignore', out, err] });
  fs.closeSync(out); fs.closeSync(err); jobs.push({ lane, pid: p.pid });
  pending.push(new Promise(resolve => p.on('exit', (code, signal) => resolve({ lane, code, signal }))));
}
fs.writeFileSync(path.join(root, 'conversion-processes.json'), JSON.stringify({ started: new Date().toISOString(), lanes, jobs }, null, 2));
console.log(JSON.stringify(jobs));
const results = await Promise.all(pending);
fs.writeFileSync(path.join(root, 'conversion-exit.json'), JSON.stringify(results, null, 2));
if (results.some(r => r.code !== 0)) process.exitCode = 1;
