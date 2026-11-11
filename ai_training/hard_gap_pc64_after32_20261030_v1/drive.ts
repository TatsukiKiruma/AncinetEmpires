/** 固定224父局、最高64并发，末批按实际32局；末批后关闭，不读取待确认缺口来补发。 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {auditGpu,reconcile} from './audit';
import {ROOT,OUT,read,save,fileSha,hash,tally} from './common.mjs';
const plan=read(path.join(OUT,'BATCH_PLAN.json')),authorization=read(path.join(OUT,'AUTHORIZATION.json')),jobs=read(path.join(OUT,'JOBS_224.json')).jobs;
assert.equal(fileSha(path.join(OUT,'JOBS_224.json')),authorization.selectedJobsSha256);
assert.equal(plan.authorizedParents,224);assert.equal(plan.maximumWorkers,64);assert.equal(plan.batches.length,4);assert.equal(jobs.length,224);
const allowed=new Set(jobs.map((j:any)=>j.parentId));assert.equal(allowed.size,224);
let inputOffset=0;for(const entry of plan.batches){const input=read(path.join(OUT,entry.input));assert.equal(input.jobs.length,entry.workers);assert.equal(hash(input.jobs),hash(jobs.slice(inputOffset,inputOffset+input.jobs.length)));inputOffset+=input.jobs.length;}assert.equal(inputOffset,224);
const lock=path.join(OUT,'DRIVER.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,created:new Date().toISOString()}),{flag:'wx'});
const base=read(path.join(OUT,'BASELINE_RECONCILIATION.json'));
const state:any={created:new Date().toISOString(),authorizedParents:224,maximumWorkers:64,batches:[],qualified:[],failures:[],startedParents:[]};
let active:any=null,activeChild:ReturnType<typeof spawn>|null=null,stopRequested=false;
const signalStop=()=>{stopRequested=true;if(active){const directory=path.join(OUT,active.directory);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'STOP'),'请求正常停止本次限定采集');}};
process.on('SIGINT',signalStop);process.on('SIGTERM',signalStop);
function checkpoint(phase:string){
    const merged=reconcile([...base.rows,...state.qualified]),batchDone=state.batches.filter((b:any)=>b.audited).length;
    save('STATE.json',state);save('COLLECTED_INDEX.json',state.qualified);save('MERGED_QUALIFIED_INDEX.json',merged.unique);save('DUPLICATE_GROUPS.json',merged.duplicates);
    save('PROGRESS.json',{phase,pid:process.pid,authorizedParents:224,maximumWorkers:64,primaryBatchLimit:4,batchesStarted:state.batches.length,batchesAudited:batchDone,attemptedParents:new Set(state.startedParents).size,naturalQualifiedParents:state.qualified.length,newDistinctTrajectories:merged.unique.length-base.unique.length,baselineDistinct:base.unique.length,globalDistinct:merged.unique.length,failures:state.failures.length,remainingAuthorizedParents:224-new Set(state.startedParents).size,activeBatch:active?.number??null,selectedByCategory:tally(jobs,(j:any)=>j.category),selectedByPlayers:tally(jobs,(j:any)=>j.actualPlayerCount),autoStartOtherGaps:false,autoCloseAfterLastBatch:true,updated:new Date().toISOString()});
    return merged;
}
async function runBatch(entry:any){
    assert(state.batches.length<4,'禁止第5个后继批次');
    const input=read(path.join(OUT,entry.input));assert(input.jobs.every((j:any)=>allowed.has(j.parentId)));
    const directory=path.join(OUT,entry.directory);assert(!fs.existsSync(directory),'本批必须使用新输出目录');
    const batch:any={...entry,started:new Date().toISOString()};state.batches.push(batch);active=batch;
    const args=['--openssl-legacy-provider','--import','tsx','gpu/parallel/run.ts','--out',directory,'--jobs',path.join(OUT,entry.input),'--benchmark','--single-batch','--workers',String(input.jobs.length),'--limit',String(input.jobs.length),'--native','--gpu-range','--gpu-distance','--shared-assets','--shared-worker-code','--compact-records','--record-chunk-kib','1024'];
    const stdout=fs.openSync(path.join(OUT,entry.directory+'.stdout.log'),'wx'),stderr=fs.openSync(path.join(OUT,entry.directory+'.stderr.log'),'wx');
    const child=spawn(process.execPath,args,{cwd:path.join(ROOT,'ai_training'),windowsHide:true,stdio:['ignore',stdout,stderr]});activeChild=child;fs.closeSync(stdout);fs.closeSync(stderr);
    batch.pid=child.pid;batch.command={executable:process.execPath,args};checkpoint('collecting');
    const timer=setInterval(()=>{try{if(fs.existsSync(path.join(OUT,'STOP')))signalStop();checkpoint('collecting');}catch(e){console.error(e);signalStop();}},15000);
    let exit:number|null;try{exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);activeChild=null;}
    batch.finished=new Date().toISOString();batch.exitCode=exit;
    for(const job of input.jobs){
        const parent=path.join(directory,`parent-${job.executionSequence}`),attempts=fs.existsSync(parent)?fs.readdirSync(parent).filter(n=>/^attempt-\d+$/.test(n)):[];
        if(!attempts.length){state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:'not_started',batch:batch.number});continue;}
        state.startedParents.push(job.parentId);
        const attempt=Math.max(...attempts.map(n=>Number(n.slice(8)))),dir=path.join(parent,`attempt-${attempt}`),resultFile=path.join(dir,'result.json');
        if(!fs.existsSync(resultFile)){state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:'incomplete_record',directory:dir});continue;}
        const r=read(resultFile);
        if(r.natural&&!r.error){try{state.qualified.push(await auditGpu(dir,directory));}catch(e){state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:'static_contract_rejected',error:String(e),directory:dir});}}
        else state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:r.stop,error:r.error,steps:r.steps,directory:dir});
    }
    batch.audited=new Date().toISOString();active=null;checkpoint('batch_audited');console.log(JSON.stringify(read(path.join(OUT,'PROGRESS.json'))));
    if(exit!==0)throw Error(`第${batch.number}批采集进程异常退出${exit}；已保留本批全部记录，停止后续调度`);
}
try{
    save('RUN_IDENTITY.json',{created:new Date().toISOString(),batchPlanSha256:fileSha(path.join(OUT,'BATCH_PLAN.json')),selectedJobsSha256:fileSha(path.join(OUT,'JOBS_224.json')),authorizationSha256:fileSha(path.join(OUT,'AUTHORIZATION.json')),baselineSha256:fileSha(path.join(OUT,'BASELINE_RECONCILIATION.json')),auditorSha256:fileSha(path.join(path.dirname(import.meta.filename),'audit.ts')),driverSha256:fileSha(import.meta.filename),gpuRunSha256:fileSha(path.join(ROOT,'ai_training/gpu/parallel/run.ts')),authorizedParents:224,workers:64,automaticOtherGapDispatch:false,recordFormat:'benchmark模式的完整紧凑记录；无repeat-first或人为max-actions'});
    checkpoint('ready');
    for(const entry of plan.batches){
        if(stopRequested||fs.existsSync(path.join(OUT,'STOP'))||fs.existsSync(path.join(OUT,'DRAIN')))break;
        const disk=fs.statfsSync(OUT);if(disk.bavail*disk.bsize<3*1024**3)throw Error('可用空间不足3GiB，停止新调度');
        await runBatch(entry);
    }
    const exhausted=state.batches.length===4&&state.batches.every((b:any)=>b.audited),phase=exhausted?(state.qualified.length===224?'complete':'completed_with_gaps'):'stopped';
    const merged=checkpoint(phase);
    assert(state.batches.length<=4&&new Set(state.startedParents).size<=224&&state.qualified.every((r:any)=>allowed.has(r.parentId)));
    save('FINAL_REPORT.json',{...read(path.join(OUT,'PROGRESS.json')),scopeExhausted:exhausted,authorizedParents:224,allBatchCollectorsExited:true,allGpuWorkersAndBrokerClosed:true,remainingRequiresUserConfirmation:true,selected224Qualified:state.qualified.length,globalDistinct:merged.unique.length,remainingTo3000:3000-merged.unique.length,failures:state.failures,mergedIndexSha256:fileSha(path.join(OUT,'MERGED_QUALIFIED_INDEX.json')),historicalReplay:false,training:false,tensors:false,automaticAdmission:false});
}catch(e){
    if(activeChild&&activeChild.exitCode===null){signalStop();await new Promise<void>(resolve=>activeChild!.once('exit',()=>resolve()));activeChild=null;}
    checkpoint('attention');save('DRIVER_ERROR.json',{error:String(e),stack:(e as Error).stack,created:new Date().toISOString()});console.error(e);process.exitCode=1;
}
finally{save('CLOSED.json',{closed:new Date().toISOString(),driverPid:process.pid,activeCollector:activeChild?.pid??null,allStartedCollectorProcessesExited:activeChild===null,otherGapsStarted:false,batchesStarted:state.batches.length,attemptedParents:new Set(state.startedParents).size});fs.unlinkSync(lock);}
