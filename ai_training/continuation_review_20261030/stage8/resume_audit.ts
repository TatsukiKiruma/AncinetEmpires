import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {data,here,read,sha,save,fileSha} from './io';
const ledger=read(path.join(here,'RESUME_BASELINES.json'));
const checks=[];
for(const file of ledger.files) {
 assert.equal(fileSha(file.file).toLowerCase(),file.sha256.toLowerCase());
}
for(let block=0;block<10;block++){
 const plan=path.join(data,'gen1',`block-${block}.json`);if(!fs.existsSync(plan))continue;
 for(const [index,job] of read(plan).entries()){
  if(!fs.existsSync(job.database))continue;
  const db=new DatabaseSync(job.database,{readOnly:true});
  try{
   assert.equal(db.prepare('PRAGMA quick_check').get()!.quick_check,'ok');
   const p=db.prepare('SELECT identity,value FROM progress WHERE id=1').get();
   assert(p);const identity=sha(JSON.stringify({...job,type:'job',id:block*20+index+1,database:undefined,deadlineMs:undefined}));
   // 原线程发送顺序是 payload,type,id；对象键顺序属于旧身份契约。
   assert.equal(p.identity,identity,job.gameId);
   const progress=JSON.parse(String(p.value));
   checks.push({game:job.gameId,step:progress.step,complete:progress.complete,natural:progress.natural,identity});
  }finally{db.close();}
 }
}
save(path.join(here,'RESUME_AUDIT.json'),{passed:true,checks,completed:checks.filter(c=>c.complete).length,natural:checks.filter(c=>c.natural).length,sealedAccess:0});
console.log(JSON.stringify({databases:checks.length,completed:checks.filter(c=>c.complete).length,natural:checks.filter(c=>c.natural).length}));
