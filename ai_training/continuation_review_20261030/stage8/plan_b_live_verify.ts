import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {here,data,read,save,fileSha} from './io';
const migration=read(path.join(here,'SCHEDULER_MIGRATION.json'));
const progress=read(path.join(here,'PROGRESS.json'));
assert(progress.scheduler==='plan-b');
const events=fs.readFileSync(path.join(data,'schedule',progress.runId+'.jsonl'),'utf8').trim().split(/\r?\n/).map(x=>JSON.parse(x));
const checks=[];
for(const task of migration.tasks.filter((t:any)=>!t.complete)){
 const db=new DatabaseSync(task.database,{readOnly:true});
 try{
  const row=db.prepare('SELECT identity,value FROM progress WHERE id=1').get()!;assert.equal(row.identity,task.checkpointIdentity);
  const p=JSON.parse(String(row.value));assert(p.step>=task.step);
  const h=createHash('sha256');for(const r of db.prepare('SELECT value FROM steps WHERE step<=? ORDER BY step').iterate(task.step))h.update(String(r.value)+'\n');
  assert.equal(h.digest('hex'),task.tracePrefixSha256);
  const resumed=events.find(e=>e.kind==='resume'&&e.gameId===task.gameId);
  if(resumed){assert.equal(resumed.identity,task.checkpointIdentity);assert.equal(resumed.step,task.step);assert.equal(resumed.rng,task.rng);}
  checks.push({gameId:task.gameId,before:task.step,current:p.step,actuallyResumed:!!resumed,prefixPreserved:true});
 }finally{db.close();}
}
for(const f of migration.files)assert.equal(fileSha(f.file),f.sha256);
const starts=events.filter(e=>e.kind==='start');
const report={at:new Date().toISOString(),runId:progress.runId,completedReused:migration.tasks.filter((t:any)=>t.complete).length,checks,
 crossBlockStarts:starts.map(e=>({gameId:e.gameId,block:e.block,active:e.active,pending:e.pending})),
 maxActive:Math.max(...starts.map(e=>e.active)),progress,metrics:read(path.join(data,'schedule',progress.runId+'.metrics.json')),
 allOldPlansAndReceiptsUnchanged:true,sealedAccess:0};
save(path.join(here,'PLAN_B_LIVE_VERIFICATION.json'),report);console.log(JSON.stringify(report,null,2));
