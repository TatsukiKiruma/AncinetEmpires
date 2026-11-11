import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const dir = path.dirname(fileURLToPath(import.meta.url)), outputName = process.env.DEVICE_OUT ?? 'device-comparison-10';
if (!/^device-comparison-10(?:-run\d+)?$/.test(outputName)) throw Error('设备产物目录无效');
const out = path.join(dir, outputName);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => { const file = path.join(out, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
fs.mkdirSync(out, { recursive: true });
const serveExisting = process.argv.includes('--serve-existing');
if (fs.existsSync(path.join(out, 'plan.json')) && !serveExisting) throw Error('已有设备测试现场，拒绝覆盖；应显式恢复或另建尝试');
const original = JSON.parse(fs.readFileSync(path.join(dir, 'generations/gen_01/arena/plan.json')));
const slots = original.slots.filter(s => s.mode === 'turn_search' && s.opponent === 'apk_like' && s.panel === 'fixed');
if (slots.length !== 10) throw Error('固定10槽数量错误');
const plan = { id: 'dual-v2-gen1-phone-then-pc-10slots-v1', slots, budgets: original.budgets, states: original.maps.slice(0, 5).map(m => JSON.parse(fs.readFileSync(path.resolve(dir, m.path)))), modelPrefix: original.modelPrefix, calibrationPrefix: original.calibrationPrefix, concurrency: 1, workers: 1, order: ['phone', 'pc'], note: '两端同包同模型同初态同种子；保留1000ms决策限制，超时仍保留耗时与见证。总墙钟含诊断日志传输，另给AI计算总和。' };
const bundle = serveExisting ? null : await build({ entryPoints: [path.join(dir, 'device_worker.ts')], bundle: true, outfile: path.join(out, 'worker.js'), platform: 'browser', target: 'chrome87', metafile: true });
if (!serveExisting) save('plan.json', plan);
else if (JSON.stringify(JSON.parse(fs.readFileSync(path.join(out, 'plan.json')))) !== JSON.stringify(plan)) throw Error('恢复计划身份不一致');
const assets = { '/plan.json': path.join(out, 'plan.json'), '/worker.js': path.join(out, 'worker.js'), '/model.json': path.join(dir, original.modelPrefix + '.json'), '/model.bin': path.join(dir, original.modelPrefix + '.bin'), '/head.json': path.join(dir, original.calibrationPrefix, 'head-calibration.json'), '/value.json': path.join(dir, original.calibrationPrefix, 'value-config.json') };
if (!serveExisting) save('identity.json', { createdAt: new Date().toISOString(), assets: Object.fromEntries(Object.entries(assets).map(([k, f]) => [k, sha(fs.readFileSync(f))])), sources: Object.fromEntries(Object.keys(bundle.metafile.inputs).map(f => [f, sha(fs.readFileSync(f))])), budgets: plan.budgets, modelGeneration: 1, promoted: false });
else {
    const identity = JSON.parse(fs.readFileSync(path.join(out, 'identity.json')));
    for (const [key, file] of Object.entries(assets)) if (identity.assets[key] !== sha(fs.readFileSync(file))) throw Error('恢复资产SHA不一致');
    if (fs.existsSync(path.join(out, 'phone/device.json')) || fs.existsSync(path.join(out, 'pc/device.json'))) throw Error('已有设备执行，拒绝从头运行');
}
let chrome, phoneDone = false, pcDone = false, startingPc = false;
const append = (file, value) => { const target = path.join(out, file), fd = fs.openSync(target, 'a'); try { fs.writeSync(fd, gzipSync(JSON.stringify(value) + '\n')); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
const repack = folder => { for (const file of ['actions.jsonl.gz', 'witnesses.jsonl.gz']) { const target = path.join(folder, file); if (!fs.existsSync(target)) fs.writeFileSync(target, gzipSync('')); else fs.writeFileSync(target, gzipSync(gunzipSync(fs.readFileSync(target)), { level: 9 })); } };
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/record' && req.method === 'POST') {
            const device = url.searchParams.get('device'), kind = url.searchParams.get('kind');
            if (!['phone', 'pc'].includes(device) || (device === 'pc' && !phoneDone)) throw Error('设备顺序错误');
            const chunks = []; let size = 0;
            for await (const bytes of req) { chunks.push(bytes); size += bytes.length; if (size > 16000000) throw Error('单条收据过大'); }
            const data = JSON.parse(Buffer.concat(chunks).toString()), index = data.index;
            if (kind === 'device') { if (fs.existsSync(path.join(out, device, 'device.json'))) throw Error('该设备已启动，拒绝重复运行'); save(`${device}/device.json`, data); }
            else if (kind === 'start') { if (!Number.isInteger(index) || index < 0 || index >= 10 || fs.existsSync(path.join(out, device, String(index), 'started.json'))) throw Error('槽位无效或已启动'); save(`${device}/${index}/started.json`, data); }
            else if (kind === 'step') {
                if (!Number.isInteger(index) || index < 0 || index >= 10) throw Error('槽位越界');
                if (data.row) append(`${device}/${index}/actions.jsonl.gz`, data.row);
                if (data.rejected) save(`${device}/${index}/rejected-decision.json`, data.rejected);
                for (const w of data.witnesses) { const { finalHash, ...other } = w; append(`${device}/${index}/witnesses.jsonl.gz`, { ...other, finalSha256: sha(finalHash) }); }
                save(`${device}/progress.json`, { index, actions: (data.row?.i ?? data.rejected?.i ?? 0) + Number(!!data.row), turn: data.turn, updatedAt: new Date().toISOString() });
            } else if (kind === 'result') {
                save(`${device}/${index}/result.json`, data); repack(path.join(out, device, String(index)));
                console.log(JSON.stringify({ device, index, classification: data.classification, actions: data.actions, wallSeconds: data.wallMs / 1000, modelP95: data.latency.model.p95, rootP95: data.latency.root.p95 }));
            } else if (kind === 'complete') { save(`${device}/complete.json`, data); if (device === 'phone') phoneDone = true; else pcDone = true; }
            else if (kind === 'visibility') append(`${device}/visibility.jsonl.gz`, data);
            else if (kind === 'fatal') { save(`${device}/fatal.json`, data); console.error(device, data); }
            else throw Error('无效记录类型');
            res.end('ok'); return;
        }
        if (url.pathname === '/start-pc' && req.method === 'POST') {
            if (!phoneDone || startingPc) throw Error('手机未完成或电脑已启动'); startingPc = true;
            const profile = path.join(out, 'pc-chrome-profile'); fs.mkdirSync(profile);
            chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/?device=pc`], { windowsHide: true, stdio: 'ignore' });
            save('pc-process.json', { pid: chrome.pid, profile, startedAt: new Date().toISOString() }); res.end('started'); return;
        }
        if (url.pathname === '/status') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ phoneDone, pcDone, startingPc })); return; }
        if (url.pathname === '/shutdown' && req.method === 'POST') {
            if (!phoneDone || !pcDone) throw Error('尚未完成20槽');
            if (chrome?.pid && chrome.exitCode === null) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            res.end('closed'); setTimeout(() => server.close(), 100); return;
        }
        if (url.pathname === '/') {
            const device = url.searchParams.get('device'); if (!['phone', 'pc'].includes(device)) throw Error('设备无效');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>双流v2十槽计时</title><body><h2>双流v2：${device === 'phone' ? '手机' : '电脑'}10槽验证</h2><pre id="progress">正在加载</pre><script>const w=new Worker('/worker.js');w.onmessage=e=>{document.querySelector('pre').textContent=JSON.stringify(e.data,null,2)};w.onerror=e=>{document.querySelector('pre').textContent=e.message;fetch('/record?device=${device}&kind=fatal',{method:'POST',body:JSON.stringify({error:e.message})})};document.addEventListener('visibilitychange',()=>fetch('/record?device=${device}&kind=visibility',{method:'POST',body:JSON.stringify({hidden:document.hidden,at:Date.now()})}));w.postMessage({device:'${device}'});</script></body></html>`); return;
        }
        const file = assets[url.pathname]; if (!file) { res.writeHead(404).end(); return; }
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream'); fs.createReadStream(file).pipe(res);
    } catch (error) { console.error(String(error)); res.writeHead(400).end(String(error)); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
save('server.json', { pid: process.pid, port: server.address().port, startedAt: new Date().toISOString() });
console.log(JSON.stringify({ ready: true, port: server.address().port, out }));
