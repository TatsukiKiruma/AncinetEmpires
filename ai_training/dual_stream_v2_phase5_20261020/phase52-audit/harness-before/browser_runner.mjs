import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.env.LEAGUE_FOLDER), prefix = process.argv[2] ?? 'model';
if (!['model'].includes(prefix)) throw Error('权重前缀无效');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const script = path.join(dir, 'browser-bundle.js');
await build({ entryPoints: [path.join(sourceDir, 'browser.ts')], bundle: true, outfile: script, platform: 'browser', target: 'chrome120' });
const profile = fs.mkdtempSync(path.join(dir, 'temporary-chrome-'));
let server, chrome, timeout, result, stderr = '', cleanupError;
try {
    if (path.dirname(path.resolve(profile)) !== path.resolve(dir)) throw Error('Chrome临时目录越界');
    let resolveDone;
    const done = new Promise(r => { resolveDone = r; });
    const allowed = new Set(['pipeline-inputs.json', 'pipeline-reference.json', 'head-calibration.json', 'value-parity-inputs.json', 'value-config.json', 'browser-bundle.js', 'samples.bin', 'samples.json', 'parent-model.json', 'parent-model.bin', `${prefix}.json`, `${prefix}.bin`, `${prefix}-torch-reference.json`, `${prefix}-node-output.json`]);
    server = http.createServer(async (req, res) => {
        try {
            if (req.url === '/complete' && req.method === 'POST') {
                const chunks = []; let size = 0;
                for await (const part of req) { chunks.push(part); size += part.length; if (size > 1000000) throw Error('浏览器收据超过预算'); }
                resolveDone(JSON.parse(Buffer.concat(chunks).toString())); res.end('ok'); return;
            }
            const name = req.url?.slice(1);
            if (!name || name.startsWith('?')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>双流阶段4三端验收</title><body>正在核验模型前向<script src="/browser-bundle.js"></script></body></html>'); return; }
            if (!allowed.has(name)) { res.writeHead(404).end(); return; }
            res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream');
            fs.createReadStream(path.join(dir, name)).pipe(res);
        } catch (error) { resolveDone({ passed: false, error: String(error) }); res.writeHead(500).end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disk-cache-size=1048576', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/?prefix=${prefix}`], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr.on('data', bytes => { if (stderr.length < 8000) stderr += bytes.toString(); });
    chrome.on('error', error => resolveDone({ passed: false, error: String(error) }));
    chrome.on('exit', (code, signal) => resolveDone({ passed: false, error: `Chrome退出：${code}/${signal}`, stderr }));
    timeout = setTimeout(() => resolveDone({ passed: false, error: 'Chrome验收超时', stderr }), 180000);
    result = await done;
} catch (error) { result = { passed: false, error: String(error), stderr }; }
finally {
    clearTimeout(timeout);
    // 只结束本脚本创建的进程树；成功与异常路径都立即清理已核验的专属目录。
    if (chrome?.pid && chrome.exitCode === null) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    if (server?.listening) await new Promise(r => server.close(r));
    if (path.dirname(path.resolve(profile)) !== path.resolve(dir)) throw Error('拒绝清理目录外路径');
    for (let attempt = 0; attempt < 10; attempt++) {
        try { fs.rmSync(profile, { recursive: true, force: true }); cleanupError = undefined; break; }
        catch (error) { cleanupError = String(error); await new Promise(r => setTimeout(r, 200)); }
    }
}
const runtimeFiles = fs.readdirSync(path.resolve(sourceDir, '../../src/ai_runtime/dual_v2')).filter(x => x.endsWith('.ts') && !x.endsWith('.test.ts')).sort();
const runtimeIdentity = Object.fromEntries(runtimeFiles.map(name => [name, sha(fs.readFileSync(path.resolve(sourceDir, '../../src/ai_runtime/dual_v2', name)))]));
const receipt = { ...result, chromeProfileCleaned: !fs.existsSync(profile), cleanupError, runtimeIdentity, weightsSha256: sha(fs.readFileSync(path.join(dir, `${prefix}.bin`))), samplesSha256: sha(fs.readFileSync(path.join(dir, 'samples.bin'))), browserBundleSha256: sha(fs.readFileSync(script)), generatedAt: new Date().toISOString() };
receipt.passed = !!receipt.passed && receipt.chromeProfileCleaned;
fs.writeFileSync(path.join(dir, `${prefix}-browser-parity.json`), JSON.stringify(receipt, null, 2) + '\n');
fs.appendFileSync(path.join(dir, 'browser-attempts.jsonl'), JSON.stringify({ prefix, passed: receipt.passed, maxLogit: receipt.maxLogit, maxActor: receipt.maxActor, maxValue: receipt.maxValue, maxNode: receipt.maxNode, chromeProfileCleaned: receipt.chromeProfileCleaned, error: receipt.error, generatedAt: receipt.generatedAt, weightsSha256: receipt.weightsSha256 }) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, maxLogit: receipt.maxLogit, maxActor: receipt.maxActor, maxValue: receipt.maxValue, maxNode: receipt.maxNode, chromeProfileCleaned: receipt.chromeProfileCleaned, error: receipt.error }));
process.exitCode = receipt.passed ? 0 : 1;
