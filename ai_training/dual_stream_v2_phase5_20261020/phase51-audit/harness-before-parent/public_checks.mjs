import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const dir = import.meta.dirname, root = path.resolve(dir, '../..');
const commands = [ ['lint', 'npm.cmd', ['run', 'lint']], ['test', 'npm.cmd', ['test']], ['build', 'npm.cmd', ['run', 'build']], ['independent-tsc', 'npx.cmd', ['tsc', '-p', 'ai_training/dual_stream_v2_phase5_20261020/tsconfig.json', '--noEmit']] ];
const results = [];
for (const [name, executable, args] of commands) {
    results.push(await new Promise(resolve => {
        const log = fs.openSync(path.join(dir, `final-${name}.log`), 'w'), start = performance.now();
        const child = spawn(executable, args, { cwd: root, shell: executable.endsWith('.cmd'), windowsHide: true, stdio: ['ignore', log, log] });
        child.on('error', error => { fs.closeSync(log); resolve({ name, passed: false, error: String(error) }); });
        child.on('exit', code => { fs.closeSync(log); resolve({ name, command: [executable, ...args], code, passed: code === 0, seconds: (performance.now() - start) / 1000 }); });
    }));
}
const receipt = { passed: results.every(r => r.passed), results, generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(dir, 'public-checks.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt)); process.exitCode = receipt.passed ? 0 : 1;

