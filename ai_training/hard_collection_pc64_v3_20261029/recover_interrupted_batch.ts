/** 只读收拢意外退出批次的完整自然原件；旧运行锁与中断日志保持。 */
import fs from 'node:fs';
import path from 'node:path';
import {auditGpu,reconcile} from './audit';
import {OUT,read,save,fileSha} from './common.mjs';
const state=read(path.join(OUT,'STATE.json')),batch=state.batches.at(-1),run=path.join(OUT,batch.directory),qualified=[],incomplete=[],rejected=[];
for(const j of batch.jobs){
    const parent=path.join(run,`parent-${j.executionSequence}`),names=fs.readdirSync(parent).filter(n=>/^attempt-\d+$/.test(n)).sort((a,b)=>Number(b.slice(8))-Number(a.slice(8)));
    const directory=path.join(parent,names[0]),resultFile=path.join(directory,'result.json');
    if(!fs.existsSync(resultFile)){incomplete.push({executionSequence:j.executionSequence,parentId:j.parentId,seed:j.seed,attempt:Number(names[0].slice(8)),directory,reason:'进程消失且没有完整result/final；不计成功'});continue;}
    try{qualified.push(await auditGpu(directory,run));}catch(e){rejected.push({directory,error:String(e)});}
}
const base=read(path.join(OUT,'INITIAL_RECONCILIATION.json')),a=reconcile([...base.rows,...qualified]);
save('INTERRUPTION_RECOVERY.json',{created:new Date().toISOString(),oldDriverPid:48404,oldCollectorPid:48284,progressLastUpdated:read(path.join(run,'PROGRESS.json')).updated,oldRunSha256:fileSha(path.join(run,'RUN.json')),oldLocksRetained:true,exitCause:'未确定；无应用错误日志，不能推断原因',qualified,incomplete,rejected,summary:a.summary});
save('RECOVERED_RECONCILIATION.json',a);console.log(JSON.stringify({recovered:qualified.length,incomplete:incomplete.length,rejected,summary:a.summary}));
