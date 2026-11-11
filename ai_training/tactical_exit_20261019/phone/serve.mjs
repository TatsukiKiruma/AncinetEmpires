import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

// PC只托管冻结资产和追加日志，所有决策与引擎step均在指定真机页面执行。
const assets=path.resolve(process.argv[2]),preflight=path.resolve(process.argv[3]),mode=process.argv[4]??'selfcheck';
assert.ok(['selfcheck','play','diagnostic'].includes(mode));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest=read(path.join(assets,'ASSETS.json')),device=read(preflight),config=read(path.join(assets,'config.json'));
assert.ok(device.passed&&device.connected&&device.serial==='c2357770'&&device.manufacturer==='Xiaomi');
assert.equal(digest(path.join(assets,'runtime.js')),manifest.bundleSha256);assert.equal(digest(path.join(assets,'config.json')),manifest.configSha256);
if(manifest.workerBundleSha256)assert.equal(digest(path.join(assets,'runtime-worker.js')),manifest.workerBundleSha256);
if(mode==='play'){
    const gate=read(path.resolve(process.argv[5]));
    assert.ok(gate.passed&&gate.valueGatePassed&&gate.rootTargetPassed,'真机自检与速度前置未全部通过');
    assert.equal(gate.bundleSha256,manifest.bundleSha256);assert.equal(gate.configSha256,manifest.configSha256);
    assert.equal(gate.workerBundleSha256,manifest.workerBundleSha256);
    assert.equal(gate.serial,device.serial);
}
const folder=path.join(assets,`${mode}-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(folder);
fs.copyFileSync(preflight,path.join(folder,'DEVICE.json'),fs.constants.COPYFILE_EXCL);
const token=randomBytes(24).toString('hex');let claimed=false,slotIndex=0,lineCount=0,active=null,visibilityViolations=0,foregroundConfirmed=false;
const write=(file,data)=>fs.writeFileSync(path.join(folder,file),JSON.stringify(data),{flag:'wx'});
const log=data=>fs.appendFileSync(path.join(folder,'events.jsonl'),JSON.stringify({receivedAt:new Date().toISOString(),...data})+'\n');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>阶段5小米真机验证</title><body><p id="status">正在加载冻结资产……</p><script src="/runtime.js?token=${token}"></script><script>
const status=document.getElementById('status');
const endpoint=url=>url+(url.includes('?')?'&':'?')+'token=${token}';
async function request(url,body){const response=await fetch(endpoint(url),body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw Error(url+' HTTP '+response.status+' '+await response.text());return response.json();}
async function post(value){return request('/event',{...value,visibilityState:document.visibilityState});}
(async()=>{
  await request('/claim',{userAgent:navigator.userAgent});
  if(document.visibilityState!=='visible')throw Error('验证页不在前台');
  const screenLock=await navigator.wakeLock.request('screen');
  await post({type:'foreground',wakeLockHeld:!screenLock.released});
  document.addEventListener('visibilitychange',()=>post({type:'visibility-change'}));
  const response=await fetch(endpoint('/config.json')),text=await response.text();
  const config=JSON.parse(text);if(Stage5Phone.sha(text)!=='${manifest.configSha256}')throw Error('资产SHA不匹配');
  await post({type:'loaded',bundleSha256:'${manifest.bundleSha256}',configSha256:'${manifest.configSha256}',userAgent:navigator.userAgent});
  if('${mode}'==='diagnostic'){
    globalThis.stage5DiagnosticConfig=config;
    status.textContent='真机性能诊断已准备，正式对局0。';await post({type:'diagnostic-ready'});
    globalThis.stage5DiagnosticScreenLock=screenLock;
    return;
  }else if('${mode}'==='selfcheck'){
    status.textContent='正在核对69个固定决策、Value与完整根时延……';
    const report=await Stage5Phone.selfcheck(config,post);await post({type:'check-result',report});
    status.textContent='自检结束：Value p95='+report.valueLatency.p95+'ms，完整根 p95='+report.rootLatency.p95+'ms。';
  }else{
    for(const slot of config.plan.slots){status.textContent='真机单并发执行：'+slot.id;await Stage5Phone.playSlot(config,slot,post);}
    await post({type:'finished'});status.textContent='120槽执行结束，等待PC严格重放与门禁汇总。';
  }
  await screenLock.release();
})().catch(async error=>{status.textContent='验证停止：'+error;await post({type:'error',error:String(error),stack:error.stack}).catch(()=>{});});
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
    try{
        const url=new URL(req.url,'http://127.0.0.1');
        if(url.searchParams.get('token')!==token){res.writeHead(403);res.end();return;}
        res.setHeader('Cache-Control','no-store');
        if(req.method==='GET'){
            if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
            if(['/runtime.js','/config.json',...(manifest.workerBundleSha256?['/runtime-worker.js']:[])].includes(url.pathname)){
                res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'application/json; charset=utf-8');
                fs.createReadStream(path.join(assets,url.pathname.slice(1))).pipe(res);return;
            }
            if(url.pathname==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({mode,claimed,slotIndex,lineCount,active}));return;}
        }
        let text='';for await(const chunk of req){text+=chunk;if(text.length>32000000)throw Error('事件大小超限');}
        const data=JSON.parse(text);
        if(url.pathname==='/claim'){
            assert.ok(!claimed,'已有一个页面持有本轮单并发租约');assert.match(data.userAgent,/Android/);claimed=true;log({type:'claimed',...data});
        }else if(url.pathname==='/event'){
            assert.ok(claimed);log(data);
            if(data.visibilityState!=='visible')visibilityViolations++;
            if(data.type==='foreground')foregroundConfirmed=data.wakeLockHeld===true&&data.visibilityState==='visible';
            if(data.type==='check-result'){
                const report={...data.report,passed:data.report.passed&&foregroundConfirmed&&visibilityViolations===0,foregroundConfirmed,visibilityViolations,serial:device.serial,bundleSha256:manifest.bundleSha256,workerBundleSha256:manifest.workerBundleSha256,configSha256:manifest.configSha256,receivedAt:new Date().toISOString()};
                write('SELFCHECK.json',report);console.log(JSON.stringify({event:'selfcheck-finished',path:folder,...report,fixtures:report.fixtures.length,valueSamples:undefined,rootSamples:undefined}));
            }else if(data.type==='started'){
                assert.equal(mode,'play');assert.equal(active,null);assert.deepEqual(data.slot,config.plan.slots[slotIndex]);
                active=data.slot.id;lineCount=0;fs.mkdirSync(path.join(folder,'slots',active),{recursive:true});write(`slots/${active}/started.json`,data);
            }else if(data.type==='action'){
                assert.equal(mode,'play');assert.ok(active);assert.equal(data.row.i,lineCount);
                fs.appendFileSync(path.join(folder,'slots',active,'actions.jsonl'),JSON.stringify(data.row)+'\n');lineCount++;
            }else if(data.type==='result'){
                assert.equal(mode,'play');assert.equal(data.result.slot.id,active);assert.equal(data.result.actions,lineCount);
                write(`slots/${active}/final.json`,data.final);write(`slots/${active}/result.json`,data.result);
                fs.writeFileSync(path.join(folder,'slots',active,'actions.jsonl.gz'),gzipSync(fs.readFileSync(path.join(folder,'slots',active,'actions.jsonl'))),{flag:'wx'});
                console.log(JSON.stringify({event:'slot-finished',slot:active,classification:data.result.classification,actions:lineCount}));active=null;slotIndex++;
            }else if(data.type==='error'){write('ERROR.json',data);console.log(JSON.stringify(data));}
            else if(data.type==='finished'){assert.equal(slotIndex,120);write('EXECUTION.json',{slots:slotIndex,finished:true});}
            else if(data.type.endsWith('progress'))console.log(JSON.stringify(data));
        }else throw Error('未知端点');
        res.setHeader('Content-Type','application/json');res.end('{}');
    }catch(error){res.writeHead(409,{'Content-Type':'text/plain; charset=utf-8'});res.end(String(error));console.error(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,url=`http://127.0.0.1:${port}/?token=${token}`;
write('SESSION.json',{mode,port,url,serial:device.serial,manifestSha256:digest(path.join(assets,'ASSETS.json')),phoneConcurrency:1,serverPid:process.pid,hostBattleSteps:0});
fs.copyFileSync(new URL(import.meta.url),path.join(folder,'serve.mjs.snapshot'),fs.constants.COPYFILE_EXCL);
console.log(JSON.stringify({listening:true,mode,port,url,folder}));
if(process.argv.includes('--launch')){
    const adb='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe';
    const run=args=>execFileSync(adb,['-s',device.serial,...args],{encoding:'utf8',timeout:20000,windowsHide:true});
    const reverse=run(['reverse',`tcp:${port}`,`tcp:${port}`]);
    const launch=run(['shell','am','start','-a','android.intent.action.VIEW','-d',url,'com.android.chrome']);
    write('LAUNCH.json',{serial:device.serial,port,reverse,launch,executedAt:new Date().toISOString()});
}
