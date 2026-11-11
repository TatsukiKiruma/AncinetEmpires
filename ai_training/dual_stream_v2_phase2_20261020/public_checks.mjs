import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, '../..');
const python = process.env.DUAL_V2_PYTHON ?? 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe';
const commands = [
    ['lint', 'npm.cmd', ['run', 'lint']], ['test', 'npm.cmd', ['test']], ['build', 'npm.cmd', ['run', 'build']],
    ['independent-tsc', 'npx.cmd', ['tsc', '-p', 'ai_training/dual_stream_v2_phase2_20261020/tsconfig.json', '--noEmit']],
    ['loss-tests', 'node', ['ai_training/run.mjs', python, '-X', 'utf8', 'dual_stream_v2_phase2_20261020/test_loss.py']]
];
const results = await Promise.all(commands.map(([name, executable, args]) => new Promise(resolve => {
    const start = Date.now(), log = fs.openSync(path.join(dir, `${name}.log`), 'w');
    const windowsShell = executable.endsWith('.cmd');
    const child = spawn(executable, args, { cwd: root, shell: windowsShell, windowsHide: true, stdio: ['ignore', log, log] });
    child.on('error', error => { fs.closeSync(log); resolve({ name, passed: false, error: String(error) }); });
    child.on('exit', code => { fs.closeSync(log); resolve({ name, command: [executable, ...args], code, passed: code === 0, seconds: (Date.now() - start) / 1000, log: `${name}.log` }); });
})));
const result = { passed: results.every(r => r.passed), results, generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(dir, 'public-checks.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result)); process.exitCode = result.passed ? 0 : 1;
