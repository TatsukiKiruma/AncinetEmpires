import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const allowed = /^(browser\.(html|js)|browser-states\.json|old-schema\.json|parity-inputs\.json|model-(initial|legacy|new|conditional|best)\.json|python-parity-(initial|legacy|new|conditional|best)\.json)$/;
createServer((request,response) => {
    const name = new URL(request.url,'http://127.0.0.1').pathname.slice(1)||'browser.html';
    if (!allowed.test(name)) { response.writeHead(404); response.end('路径不存在'); return; }
    try { const data=readFileSync(new URL(name,import.meta.url)); response.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript':'application/json','Cache-Control':'no-store'}); response.end(data); }
    catch { response.writeHead(404); response.end('文件未就绪'); }
}).listen(3187,'127.0.0.1',()=>console.log('本地数值校验页面已就绪：http://127.0.0.1:3187/browser.html'));
