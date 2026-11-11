import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),name=process.argv[2]??'initial';
await build({entryPoints:[path.join(root,'group_browser.ts')],bundle:true,outfile:path.join(root,'group-browser.js'),platform:'browser',target:'chrome120'});
let finish;const done=new Promise(r=>finish=r);
const allowed=new Set(['group-browser.js','group-inputs.json',`group-${name}.json`,`group-python-${name}.json`,'browser-states.json','old-schema.json']);
const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/complete'&&req.method==='POST'){
        let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)throw Error('结果超限');}
        const result=JSON.parse(body);fs.writeFileSync(path.join(root,`group-browser-${name}.json`),JSON.stringify(result));res.end('ok');finish(result);return;
    }
    const file=url.pathname.slice(1);
    if(!file){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>分层模型数值验收</title><body>校验中<script src="group-browser.js"></script></body></html>');return;}
    if(!allowed.has(file)){res.writeHead(404);res.end();return;}
    if(file.endsWith('.js'))res.setHeader('Content-Type','text/javascript');fs.createReadStream(path.join(root,file)).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disk-cache-size=1048576',`--user-data-dir=${path.join(root,'chrome-profile-'+name+'-'+process.pid)}`,`http://127.0.0.1:${server.address().port}/?model=${name}`],{windowsHide:true,stdio:['ignore','ignore','pipe']});
fs.writeFileSync(path.join(root,`browser-process-${process.pid}.json`),JSON.stringify({node:process.pid,chrome:chrome.pid,port:server.address().port}));
let errors='';chrome.stderr.on('data',chunk=>{if(errors.length<4000)errors+=chunk;});
chrome.on('error',e=>finish({passed:false,error:String(e)}));const timeout=setTimeout(()=>finish({passed:false,error:'浏览器校验超时',stderr:errors}),180000);
const result=await done;clearTimeout(timeout);chrome.kill();server.close();console.log(JSON.stringify(result));process.exit(result.passed?0:1);
