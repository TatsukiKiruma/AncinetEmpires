import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {BatchClient,HERE,DATA} from './client';
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(p:string,v:any)=>fs.writeFileSync(p,JSON.stringify(v,null,2));
const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
async function batch(label:string,tasks:any[],workers:number,coalesceMs:number){
 const client=new BatchClient(read(path.join(HERE,'GPU_KERNEL_BENCH.json')).selected,coalesceMs),started=performance.now(),games:any[]=[],threads:Worker[]=[];
 const group:any={label,workers,coalesceMs,requestedGames:tasks.length,startedAt:new Date().toISOString(),games};
 save(path.join(DATA,`${label}-progress.json`),group);
 save(path.join(DATA,`${label}-inputs.json`),tasks);
 try{
  // P0串行，其他方案在所配worker上并行推进本组固定局数。
  const chunks=label==='P0'?tasks.map(t=>[t]):[tasks];
  for(const chunk of chunks){
   await Promise.all(Array.from({length:Math.min(workers,chunk.length)},(_,index)=>new Promise<void>((resolve,reject)=>{
    const worker=new Worker(path.join(HERE,'worker_bootstrap.mjs'),{workerData:{tasks:chunk.filter((_,i)=>i%workers===index)}});threads.push(worker);
    worker.on('message',async m=>{
     if(m.type==='infer'){try{const rows=await client.forwardBatch(m.obs,{valueOnly:m.valueOnly});worker.postMessage({type:'result',id:m.id,rows});}catch(e){worker.postMessage({type:'result',id:m.id,error:String(e)});}}
     if(m.type==='game'){games.push(m.result);save(path.join(DATA,`${label}-progress.json`),group);console.log(JSON.stringify({label,...m.result}));}
     if(m.type==='progress')save(path.join(DATA,`${label}-worker-${index}.json`),m);
     if(m.type==='trace')fs.appendFileSync(path.join(DATA,`${label}-${m.id}-trajectory.jsonl`),m.rows.map((r:any)=>JSON.stringify(r)).join('\n')+'\n');
     if(m.type==='error')reject(Error(m.error));
    });worker.on('error',reject);worker.on('exit',code=>code?reject(Error(`Worker退出${code}`)):resolve());
   })));
  }
 }finally{await Promise.all(threads.map(w=>w.terminate()));await client.close();}
 const seconds=(performance.now()-started)/1000,steps=games.reduce((s,g)=>s+g.steps,0),sorted=[...client.batches].sort((a,b)=>a-b);
 Object.assign(group,{complete:games.length===tasks.length,seconds,steps,stepsPerSec:steps/seconds,equivalentSecPer450StepGame:450*seconds/steps,equivalentGamesPerHour:steps/seconds*8,validTeacherSamplesPerHour:games.reduce((s,g)=>s+g.validTeachers,0)/seconds*3600,meanPhysicalGpuBatchSize:mean(client.batches),p95PhysicalGpuBatchSize:sorted[Math.floor(sorted.length*.95)]??null,queueWaitMs:mean(client.waits),gpuForwardFraction:client.gpu.reduce((s,r)=>s+r.gpuMs,0)/(seconds*1000),physicalGpuBatches:client.batches.length,actualConcurrentGames:label==='P0'?1:tasks.length,gpuExited:client.child.exitCode!==null});
 save(path.join(DATA,`${label}-result.json`),group);return group;
}
const manifest=read(path.join(HERE,'../stage3/DEV_INITIAL_MANIFEST.json'));
const panel=read(path.join(HERE,'../stage3/OMNI_ARENA_DEV_PANEL.json'));
const slots=manifest.slots.filter((s:any)=>s.category==='normal');
function selfTasks(count:number,mode:string,mixed:boolean){return Array.from({length:count},(_,i)=>{const players=2+i%3,pool=slots.filter((s:any)=>s.players===players),slot=pool[Math.floor(i/3)%pool.length];return {id:`self-${i}`,state:read(path.join(HERE,'../stage3',slot.file)),seed:20261107+i,mode,mixed};});}
const search=read(path.join(HERE,'SEARCH_ABLATION_BENCH.json'));
if(search.status!=='complete')throw Error('搜索消融未完成');
const hetero=search.selectedHeterogeneous;
if(['tactical-corrected','tactical-B-only'].includes(process.argv[2])){
 const dev18=read(path.join(HERE,'../stage6/DEV18_SUMMARY.json')).find((r:any)=>r.id==='C1');
 const full=read(path.join(HERE,'../stage6/DEV54_SUMMARY.json'));
 const dev54=Array.isArray(full)?full.find((r:any)=>r.id==='C1'):full;
 const required=['p2-2-s1','p2-3-s1','p3-10-s0','p3-10-s2','p4-18-s0'];
 const chosen=[2,3,4].flatMap(n=>[...dev54.games.filter((g:any)=>g.players===n&&required.includes(g.id)),...dev18.games.filter((g:any)=>g.players===n&&!required.includes(g.id))].slice(0,4)).map(g=>dev54.games.find((b:any)=>b.id===g.id));
 if(required.some(id=>!chosen.some(g=>g.id===id))||new Set(chosen.map(g=>g.id)).size!==12)throw Error('指定12局名单不完整');
 const tasks=(games:any[],mode:string)=>games.map((g:any)=>{const match=panel.matches.find((m:any)=>m.id===g.id),slot=manifest.slots[match.slot],state=read(path.join(HERE,'../stage3',slot.file));return {...match,state,tactical:true,modelPlayer:g.modelPlayer,mode,mixed:false};});
 const previous=read(path.join(DATA,fs.existsSync(path.join(DATA,'Tactical-A-result.json'))?'Tactical-A-result.json':'Tactical-A-progress.json'));
 const kept=previous.games.filter((g:any)=>chosen.some(c=>c.id===g.id));
 const result:any={status:'running',baseline:chosen,candidates:{A:{complete:false,games:kept}},sealedAccess:0,panelCorrection:{reason:'指定两局不在Dev18；使用Dev54同C1结果补齐',baselineSource:'stage6/DEV54_SUMMARY.json',excludedExtraDiagnostics:previous.games.filter((g:any)=>!chosen.some(c=>c.id===g.id)).map((g:any)=>g.id)}};
 if(fs.existsSync(path.join(HERE,'TACTICAL_SANITY_12.json')))fs.copyFileSync(path.join(HERE,'TACTICAL_SANITY_12.json'),path.join(HERE,'TACTICAL_INITIAL_PANEL_ATTEMPT.json'));
 save(path.join(HERE,'TACTICAL_SANITY_12.json'),result);
 if(process.argv[2]!=='tactical-B-only'){
  const extra=await batch('Tactical-A-required',tasks(chosen.filter(g=>!kept.some((k:any)=>k.id===g.id)),'S2'),2,1);
  result.candidates.A={complete:true,games:[...kept,...extra.games],sources:['Tactical-A-result.json','Tactical-A-required-result.json']};
 }
 save(path.join(HERE,'TACTICAL_SANITY_12.json'),result);
 result.candidates.B=await batch('Tactical-B-corrected',tasks(chosen,hetero),4,1);
 result.status=result.candidates.A.complete?'complete':'incomplete';save(path.join(HERE,'TACTICAL_SANITY_12.json'),result);
}else if(process.argv[2]==='tactical'){
 const old=read(path.join(HERE,'../stage6/DEV18_SUMMARY.json')).find((r:any)=>r.id==='C1');
 const required=['p2-2-s1','p2-3-s1','p3-10-s0','p3-10-s2','p4-18-s0'];
 const chosen=[2,3,4].flatMap(n=>{const a=old.games.filter((g:any)=>g.players===n);return [...a.filter((g:any)=>required.includes(g.id)),...a.filter((g:any)=>!required.includes(g.id))].slice(0,4);});
 const result:any={status:'running',baseline:chosen,candidates:{},sealedAccess:0};
 for(const [label,mode] of [['A','S2'],['B',hetero]]){
  const tasks=chosen.map((g:any)=>{const match=panel.matches.find((m:any)=>m.id===g.id),slot=manifest.slots[match.slot],state=read(path.join(HERE,'../stage3',slot.file));return {...match,state,tactical:true,modelPlayer:g.modelPlayer,mode,mixed:false};});
  result.candidates[label]=await batch(`Tactical-${label}`,tasks,4,1);save(path.join(HERE,'TACTICAL_SANITY_12.json'),result);
 }
 result.status='complete';save(path.join(HERE,'TACTICAL_SANITY_12.json'),result);
}else{
 const result:any={status:'running',groups:[],sealedAccess:0};
 const run=async(label:string,count:number,mode:string,mixed:boolean,workers:number,window:number)=>{const r=await batch(label,selfTasks(count,mode,mixed),workers,window);result.groups.push(r);save(path.join(HERE,'SELFPLAY_THROUGHPUT_BENCH.json'),result);return r;};
 if(process.argv[2]!=='selfplay-rest')await run('P0',3,'S1',false,1,0);
 const p1a=await run('P1-4w',12,'S2',false,4,1),p1b=await run('P1-6w',12,'S2',false,6,2),best=p1a.stepsPerSec>=p1b.stepsPerSec?p1a:p1b;
 await run('P2',18,'S2',true,best.workers,best.coalesceMs);
 await run('P3',18,hetero,true,best.workers,best.coalesceMs);
 result.status='complete';save(path.join(HERE,'SELFPLAY_THROUGHPUT_BENCH.json'),result);
}
