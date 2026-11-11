import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {data,here,read,save,sha,fileSha,K1} from './io';
const archive=path.join(here,'revisions/plan-b-20261110');
const before=read(path.join(archive,'BEFORE.json'));
for(const f of before.files) assert.equal(fileSha(f.file).toLowerCase(),f.sha256.toLowerCase(),f.file);
const old=read(path.join(here,'RESUME_BASELINES.json'));
const source=Object.fromEntries(['scenarios.ts','league_game.ts','worker_pool.ts','league_worker.bundle.mjs','collect.ts'].map(f=>[f,fileSha(path.join(archive,f+'.before.txt'))]));
const config={...read(path.join(here,'../stage7/TEACHER_CONFIG.json')),modelVersion:K1.sha256,modelPrefix:K1.prefix};
const previousIdentity=sha(JSON.stringify({source,config,model:K1,anchor:K1,blocks:10}));
const tasks:any[]=[];const files:any[]=[];
for(let block=0;block<10;block++){
 const plan=path.join(data,'gen1',`block-${block}.json`);if(!fs.existsSync(plan))continue;
 const frozen=old.files.find((f:any)=>path.resolve(f.file)===path.resolve(plan));
 if(frozen)assert.equal(fileSha(plan).toLowerCase(),frozen.sha256.toLowerCase());
 const jobs=read(plan);assert.equal(jobs.length,20);
 if(!frozen)assert(jobs.every((j:any)=>j.revision==='closed-loop-v2'&&j.sourceIdentity===previousIdentity));
 files.push({file:plan,sha256:fileSha(plan),kind:'plan',sourceIdentities:[...new Set(jobs.map((j:any)=>j.sourceIdentity))]});
 for(const [index,job]of jobs.entries()){
  const id=block*20+index+1,expected=sha(JSON.stringify({...job,type:'job',id,database:undefined,deadlineMs:undefined}));
  const db=new DatabaseSync(job.database,{readOnly:true});
  try{
   assert.equal(db.prepare('PRAGMA quick_check').get()!.quick_check,'ok');
   const row=db.prepare('SELECT identity,value FROM progress WHERE id=1').get()!;assert.equal(row.identity,expected);
   const p=JSON.parse(String(row.value));const n=db.prepare('SELECT COUNT(*) n,MAX(step) last FROM steps').get()!;assert.equal(n.n,p.step);assert.equal(n.last,p.step);
   const receipt=path.join(data,'gen1',job.gameId+'.receipt.json');
   if(fs.existsSync(receipt)){
    const r=read(receipt);assert.equal(r.sourceIdentity,job.sourceIdentity);assert.equal(r.result.gameId,job.gameId);
    assert(p.complete&&r.result.complete);for(const k of ['step','natural','winner','validTeachers','fullRoots'])assert.equal(r.result[k],p[k]);
    files.push({file:receipt,sha256:fileSha(receipt),kind:'receipt',sourceIdentity:r.sourceIdentity,gameId:job.gameId});
   }else assert(!p.complete,'数据库完成但缺收据，必须单独核对');
   const traceHash=await import('node:crypto').then(m=>m.createHash('sha256'));
   for(const r of db.prepare('SELECT value FROM steps ORDER BY step').iterate())traceHash.update(String(r.value)+'\n');
   tasks.push({gameId:job.gameId,block,index,transportJobId:id,sourceIdentity:job.sourceIdentity,checkpointIdentity:expected,
    payloadSha256:sha(JSON.stringify(job)),database:job.database,complete:p.complete,natural:p.natural,step:p.step,rng:p.rng,
    validTeachers:p.validTeachers,fullRoots:p.fullRoots,tracePrefixSha256:traceHash.digest('hex'),stateSha256:sha(JSON.stringify(p.state))});
  }finally{db.close();}
 }
}
const result={revision:'plan-b',previousIdentity,previousSourceLockSha256:fileSha(path.join(archive,'SOURCE_LOCK.json.before.txt')),files,tasks,
 completed:tasks.filter(t=>t.complete).length,natural:tasks.filter(t=>t.natural).length,teachers:tasks.filter(t=>t.complete).reduce((s,t)=>s+t.validTeachers,0),pending:tasks.filter(t=>!t.complete),unplanned:200-tasks.length,sealedAccess:0};
save(path.join(archive,'AUDIT.json'),result);console.log(JSON.stringify({completed:result.completed,natural:result.natural,teachers:result.teachers,pending:result.pending.length,unplanned:result.unplanned}));
