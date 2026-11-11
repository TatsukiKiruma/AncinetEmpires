import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
const root = path.resolve('ai_training/sd64x3_phone_20261016');
await build({ entryPoints: [path.join(root, 'trained_browser.ts')], bundle: true, outfile: path.join(root, 'trained-browser.js'), platform: 'browser', target: 'chrome120' });
let resolveDone;
const done = new Promise(r => { resolveDone = r; });
const allowed = new Set(['trained-browser.js', 'probe-base.jsonl.gz', 'probe-encoded.jsonl.gz', 'trained-reference.jsonl.gz', 'schema.json', 'candidate.json']);
const server = http.createServer(async (req, res) => {
  if (req.url === '/complete' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) throw Error('结果超限'); }
    const result = JSON.parse(body); fs.writeFileSync(path.join(root, 'trained-browser-parity.json'), JSON.stringify(result, null, 2)); res.end('ok'); resolveDone(result); return;
  }
  const name = req.url?.slice(1);
  if (!name) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>双人SD一致性验收</title><body>验收中<script src="/trained-browser.js"></script></body></html>'); return; }
  if (!allowed.has(name)) { res.statusCode = 404; res.end(); return; }
  if (name.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
  fs.createReadStream(path.join(root, name)).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disk-cache-size=1048576', `--user-data-dir=${path.join(root, 'trained-chrome-profile')}`, `http://127.0.0.1:${port}/`], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let errors = ''; chrome.stderr.on('data', x => { if (errors.length < 4000) errors += x; });
chrome.on('error', e => resolveDone({ browserPassed: false, error: String(e) }));
chrome.on('exit', (code, signal) => { if (code) resolveDone({ browserPassed: false, error: `Chrome退出:${code}:${signal}`, stderr: errors }); });
const timeout = setTimeout(() => resolveDone({ browserPassed: false, error: '浏览器验收超时', stderr: errors }), 180000);
const result = await done; clearTimeout(timeout); chrome.kill(); server.close();
console.log(JSON.stringify(result)); if (!result.browserPassed) process.exitCode = 1;

