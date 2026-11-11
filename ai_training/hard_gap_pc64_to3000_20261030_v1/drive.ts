/** 最高64并发补足3000局有效去重自然对局，全部课程格达标后自动关闭。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {auditGpu,reconcile} from './audit';
import {remainingCells,selectNext,targetCells} from './scheduler';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {ROOT,OUT,SOURCE_DIR,read,save,fileSha,hash,stable,tally} from './common.mjs';

const auth=read(path.join(OUT,'AUTHORIZATION.json'));assert(auth.targetDistinct===3000&&auth.maximumWorkers===64&&auth.autoCloseAtTarget);
const base=read(path.join(OUT,'BASELINE_RECONCILIATION.json')),primary=read(path.join(OUT,'PRIMARY_JOBS.json')).jobs,prior=read(path.join(OUT,'PREVIOUS_ATTEMPTS.json')),identity=read(path.join(OUT,'SOURCE_IDENTITY.json'));
const lock=path.join(OUT,'DRIVER.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,created:new Date().toISOString()}),{flag:'wx'});
const state:any={created:new Date().toISOString(),target:3000,maximumWorkers:64,batches:[],qualified:[],failures:[],attempts:{},supplementalJobs:[],nextSupplement:1,noProgressBatches:0};
let active:any=null,activeChild:ReturnType<typeof spawn>|null=null,stopRequested=false;
const accepted=()=>reconcile([...base.rows,...state.qualified]);
function signalStop(){stopRequested=true;if(active){const dir=path.join(OUT,active.directory);if(fs.existsSync(dir))fs.writeFileSync(path.join(dir,'STOP'),'请求正常停止本次补足采集');}}
process.on('SIGINT',signalStop);process.on('SIGTERM',signalStop);
function checkpoint(phase:string){
    const merged=accepted(),status=remainingCells(merged.unique);
    save('STATE.json',state);save('COLLECTED_INDEX.json',state.qualified);save('MERGED_QUALIFIED_INDEX.json',merged.unique);save('DUPLICATE_GROUPS.json',merged.duplicates);
    save('PROGRESS.json',{phase,pid:process.pid,target:3000,maximumWorkers:64,baselineDistinct:base.unique.length,globalDistinct:merged.unique.length,remainingTo3000:status.remaining,newDistinctTrajectories:merged.unique.length-base.unique.length,naturalQualifiedParents:state.qualified.length,failures:state.failures.length,batchesStarted:state.batches.length,batchesAudited:state.batches.filter((b:any)=>b.audited).length,activeBatch:active?.number??null,byCategory:tally(merged.unique,(r:any)=>r.category),byPlayers:tally(merged.unique,(r:any)=>r.players),bySource:tally(merged.unique,(r:any)=>r.source),byCell:status.counts,gaps:status.gaps,supplementalParents:state.supplementalJobs.length,autoCloseAtTarget:true,updated:new Date().toISOString()});
    return merged;
}
function verifySources(){
    for(const [name,expected] of Object.entries(identity.publicSources))assert.equal(fileSha(path.join(ROOT,name)),expected,`公共采集源码发生变动：${name}`);
    for(const [name,expected] of Object.entries(identity.controls))assert.equal(fileSha(path.join(SOURCE_DIR,name)),expected,`本次控制源码发生变动：${name}`);
}
async function runBatch(entry:any,jobs:any[]){
    const directory=path.join(OUT,entry.directory);assert(!fs.existsSync(directory),'每批须使用独立新目录');verifySources();
    const input=readCollectionInput(path.join(OUT,entry.input));assert.equal(hash(input.jobs),hash(jobs));
    const previousCount=accepted().unique.length;
    const args=['--openssl-legacy-provider','--import','tsx','gpu/parallel/run.ts','--out',directory,'--jobs',path.join(OUT,entry.input),'--benchmark','--single-batch','--workers',String(jobs.length),'--limit',String(jobs.length),'--native','--gpu-range','--gpu-distance','--shared-assets','--shared-worker-code','--compact-records','--record-chunk-kib','1024'];
    const stdout=fs.openSync(path.join(OUT,entry.directory+'.stdout.log'),'wx'),stderr=fs.openSync(path.join(OUT,entry.directory+'.stderr.log'),'wx');
    active=entry;entry.started=new Date().toISOString();
    const child=spawn(process.execPath,args,{cwd:path.join(ROOT,'ai_training'),windowsHide:true,stdio:['ignore',stdout,stderr]});activeChild=child;fs.closeSync(stdout);fs.closeSync(stderr);
    entry.pid=child.pid;entry.command={executable:process.execPath,args};checkpoint('collecting');
    const timer=setInterval(()=>{try{if(fs.existsSync(path.join(OUT,'STOP')))signalStop();checkpoint('collecting');}catch(e){console.error(e);signalStop();}},15000);
    let exit:number|null;try{exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearInterval(timer);activeChild=null;}
    entry.finished=new Date().toISOString();entry.exitCode=exit;
    for(const job of jobs){
        const parent=path.join(directory,`parent-${job.executionSequence}`),attempts=fs.existsSync(parent)?fs.readdirSync(parent).filter(n=>/^attempt-\d+$/.test(n)).map(n=>Number(n.slice(8))):[];
        if(!attempts.length){state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:'not_started',batch:entry.number});continue;}
        const attempt=Math.max(...attempts),dir=path.join(parent,`attempt-${attempt}`),resultFile=path.join(dir,'result.json');
        state.attempts[job.executionSequence]={parentId:job.parentId,seed:job.seed,starts:attempt,directory:dir,status:'incomplete_record'};
        if(!fs.existsSync(resultFile)){state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:'incomplete_record',directory:dir});continue;}
        const r=read(resultFile);state.attempts[job.executionSequence].status=r.stop;
        if(r.natural&&!r.error){
            try{assert.equal(hash(read(path.join(dir,'job.json'))),hash(job),'实际输入与本批冻结输入不符');state.qualified.push(await auditGpu(dir,directory));state.attempts[job.executionSequence].status='qualified';}
            catch(e){state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:'static_contract_rejected',error:String(e),directory:dir});state.attempts[job.executionSequence].status='static_contract_rejected';}
        }else state.failures.push({parentId:job.parentId,sequence:job.executionSequence,stop:r.stop,error:r.error,steps:r.steps,directory:dir});
    }
    entry.audited=new Date().toISOString();active=null;
    const merged=checkpoint('batch_audited');entry.newDistinct=merged.unique.length-previousCount;
    state.noProgressBatches=entry.newDistinct===0?state.noProgressBatches+1:0;
    checkpoint('batch_audited');console.log(JSON.stringify(read(path.join(OUT,'PROGRESS.json'))));
    if(exit!==0)throw Error(`第${entry.number}批异常退出${exit}，停止调度并保留已有数据`);
    if(state.failures.some((f:any)=>f.stop==='static_contract_rejected'||f.stop==='incomplete_record'||f.error))throw Error('出现静态合同或运行错误，需要诊断后接续；失败不计成功');
    if(state.noProgressBatches>=3)throw Error('连续三批没有新增有效轨迹，停止重复调度等待诊断');
}
try{
    save('RUN_IDENTITY.json',{created:new Date().toISOString(),authorizationSha256:fileSha(path.join(OUT,'AUTHORIZATION.json')),baselineSha256:fileSha(path.join(OUT,'BASELINE_RECONCILIATION.json')),primaryJobsSha256:fileSha(path.join(OUT,'PRIMARY_JOBS.json')),sourceIdentitySha256:fileSha(path.join(OUT,'SOURCE_IDENTITY.json')),targetDistinct:3000,maximumWorkers:64,recordFormat:'完整紧凑记录，无repeat-first及额外max-actions',training:false,historicalReplay:false,tensors:false,automaticAdmission:false});
    while(true){
        const merged=checkpoint('scheduling'),status=remainingCells(merged.unique);if(status.remaining===0)break;
        if(stopRequested||fs.existsSync(path.join(OUT,'STOP'))||fs.existsSync(path.join(OUT,'DRAIN')))break;
        const disk=fs.statfsSync(OUT);if(disk.bavail*disk.bsize<3*1024**3)throw Error('D盘空间不足3GiB，停止新调度');
        const attempted=new Set<string>(state.batches.flatMap((b:any)=>b.jobs.map((j:any)=>j.parentId)));
        const selected=selectNext(merged.unique,merged.rows,primary,attempted,state.nextSupplement);assert(selected.jobs.length>0);
        state.nextSupplement=selected.nextSupplement;state.supplementalJobs.push(...selected.supplements);save('SUPPLEMENTAL_JOBS.json',{schema:'hard-curriculum-jobs-v1',jobs:state.supplementalJobs});
        const jobs=selected.jobs,number=state.batches.length+1,name=`batch64-${String(number).padStart(3,'0')}`;
        const offsets=Object.fromEntries(jobs.map((j:any)=>[j.executionSequence,prior.offsets[j.executionSequence]??0]));
        save(name+'.input.json',{schema:'hard-collection-pc64-input-v1',jobs,attemptOffsets:offsets,frozenOriginalFileSha256:identity.frozenJobsSha256,source:'project-apk-hard-replica-gpu'});
        const entry={number,input:name+'.input.json',directory:name,workers:jobs.length,jobs:jobs.map((j:any)=>({executionSequence:j.executionSequence,parentId:j.parentId})),attemptOffsets:offsets};
        state.batches.push(entry);checkpoint('batch_prepared');await runBatch(entry,jobs);
    }
    const merged=accepted(),status=remainingCells(merged.unique),complete=status.remaining===0;
    checkpoint(complete?'complete':'stopped');
    if(complete){assert.equal(merged.unique.length,3000);assert.equal(new Set(merged.unique.map((r:any)=>r.semanticTrajectorySha256)).size,3000);assert.equal(stable(status.counts),stable(targetCells));}
    save('FINAL_REPORT.json',{...read(path.join(OUT,'PROGRESS.json')),targetReached:complete,allBatchCollectorsExited:true,allGpuWorkersAndBrokerClosed:true,mergedIndexSha256:fileSha(path.join(OUT,'MERGED_QUALIFIED_INDEX.json')),failures:state.failures,sourcePolicy:['apk-hard-original-phone','project-apk-hard-replica-gpu'],phoneRemainsStopped:true,staticContractOnly:true,historicalReplay:false,training:false,tensors:false,automaticAdmission:false,frozenSplitChanged:false});
}catch(e){
    if(activeChild?.pid&&activeChild.exitCode===null){signalStop();await new Promise<void>(resolve=>activeChild!.once('close',()=>resolve()));activeChild=null;}
    checkpoint('attention');save('DRIVER_ERROR.json',{error:String(e),stack:(e as Error).stack,created:new Date().toISOString()});console.error(e);process.exitCode=1;
}finally{
    save('CLOSED.json',{closed:new Date().toISOString(),driverPid:process.pid,activeCollector:activeChild?.pid??null,allStartedCollectorProcessesExited:activeChild===null,targetReached:accepted().unique.length===3000,phoneRemainsStopped:true});fs.unlinkSync(lock);
}
