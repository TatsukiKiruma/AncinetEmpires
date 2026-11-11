/** 工作线程管理常驻Python，主线程只在明确的GPU数值请求期间等待。 */
const { parentPort, workerData } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const control = new Int32Array(workerData.control);
const bytes = new Uint8Array(workerData.bytes);
const child = spawn(workerData.python, ['-u', workerData.script, '--device', workerData.device], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
function respond(value) {
    let encoded = Buffer.from(JSON.stringify(value));
    if (encoded.length > bytes.length) encoded = Buffer.from(JSON.stringify({ error: 'GPU响应超过共享缓冲区' }));
    bytes.set(encoded); Atomics.store(control, 1, encoded.length); Atomics.store(control, 0, 1); Atomics.notify(control, 0);
}
child.on('error', error => respond({ error: String(error) }));
child.on('exit', code => { respond({ error: 'GPU进程退出：' + code }); parentPort.close(); });
createInterface({ input: child.stdout }).on('line', line => {
    try { respond(JSON.parse(line)); } catch (error) { respond({ error: 'GPU输出无法解析：' + String(error) }); }
});
parentPort.on('message', request => {
    if (request === 'close') { child.stdin.end(); return; }
    child.stdin.write(JSON.stringify(request) + '\n', error => { if (error) respond({ error: String(error) }); });
});
