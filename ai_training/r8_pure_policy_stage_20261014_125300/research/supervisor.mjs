import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork} from 'node:child_process';
import crypto from 'node:crypto';
import {createGzip} from 'node:zlib';
export const STAGE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export async function match(cfg,out,worker=path.join(STAGE,'runs/worker.cjs')){
 if(!fs.existsSync(worker))throw Error('执行器缺失，拒绝创建槽位');
 if(cfg.candidate.expectedSha256&&sha(cfg.candidate.model)!==cfg.candidate.expectedSha256)throw Error('模型冻结哈希不符');
 if(fs.existsSync(out+'.json'))throw Error('拒绝覆盖已执行槽位 '+out);
 fs.mkdirSync(path.dirname(out),{recursive:true});
 const dest=fs.createWriteStream(out+(cfg.collect?'.jsonl.gz':'.jsonl'),{flags:'wx'});const trace=cfg.collect?createGzip({level:1}):dest;if(cfg.collect)trace.pipe(dest);const t0=performance.now();
 const child=fork(worker,[],{stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,TSX_DISABLE_CACHE:'1'}});
 let timer;let lastStep=-1;let finalResult;let initial;let last;let error='';
 return await new Promise((resolve)=>{
  const finish=(r)=>{if(finalResult)return;clearTimeout(timer);clearTimeout(wall);clearTimeout(startup);finalResult={...cfg,...r,elapsedWallSeconds:(performance.now()-t0)/1000,lastAction:last?.action,initialStateHash:initial?.initialStateHash,finalStateHash:r.finalStateHash??last?.afterHash,loadedModelSha256:initial?.modelSha256,workerBundleSha256:sha(worker)};child.kill();trace.end();};
  const startup=setTimeout(()=>finish({outcome:'error',error:'子进程启动超时',steps:0}),30000);
  const wall=setTimeout(()=>finish({outcome:'timeout_truncated',reason:'外部单局墙钟',steps:lastStep+1}),cfg.maxWallSeconds*1000);
  child.stderr.on('data',d=>error+=d);
  child.on('message',msg=>{
   trace.write(JSON.stringify(msg)+'\n');
   if(msg.type==='ready'){initial=msg;clearTimeout(startup);}
   if(msg.type==='decision'){clearTimeout(timer);timer=setTimeout(()=>finish({outcome:'timeout_truncated',reason:'外部同步策略硬超时',steps:lastStep+1,timeoutPlayer:msg.player}),cfg.maxDecisionMs);}
   if(msg.type==='step'){clearTimeout(timer);last=msg;lastStep=msg.step;}
   if(msg.type==='result')finish(msg);
  });
  child.on('exit',(code,signal)=>{if(!finalResult)finish({outcome:'error',error:`子进程退出 ${code}/${signal}: ${error}`,steps:lastStep+1});finalResult.processExit={code,signal};fs.writeFileSync(out+'.json',JSON.stringify(finalResult,null,2),{flag:'wx'});if(dest.closed)resolve(finalResult);else dest.once('close',()=>resolve(finalResult));});
  child.send(cfg);
 });
}
export async function panel(configPath){
 const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));const dir=path.join(STAGE,'runs',cfg.id);fs.mkdirSync(dir,{recursive:true});
 const budget=JSON.parse(fs.readFileSync(path.join(STAGE,'identity/budget.json')));const results=[];
 for(const g of cfg.games){
  if(Date.now()/1000>budget.finalDeadlineUnix)throw Error('总预算截止');
  const out=path.join(dir,`game_${g.gameIndex}`);
  const r=fs.existsSync(out+'.json')?JSON.parse(fs.readFileSync(out+'.json')):await match({...g,candidate:cfg.candidate,recordInputs:true},out);
  if(cfg.candidate.expectedSha256&&r.loadedModelSha256!==cfg.candidate.expectedSha256)throw Error('记录实际加载模型与冻结身份不符');
  results.push(r);console.log(cfg.id,g.gameIndex,r.outcome,r.steps);
 }
 const counts={};for(const r of results)counts[r.outcome]=(counts[r.outcome]??0)+1;
 const report={configSha256:sha(configPath),games:results.length,counts,naturalWinRate:(counts.natural_win??0)/20,results};
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[2]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await panel(process.argv[2]);
