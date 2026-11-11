/** 唯一持续驱动：逐批64完整对局，静态验收后再调度，不训练、不回放。 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {auditGpu,reconcile} from './audit';
import {makeSupplement} from './supplement';
import {ROOT,OUT,read,save,fileSha,hash,originalJobs,tally} from './common.mjs';

const lock=path.join(OUT,'DRIVER.lock');
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,started:new Date().toISOString()}),{flag:'wx'});
const targetCells=tally(originalJobs,(j:any)=>`${j.category}/${j.actualPlayerCount}`);
const base=read(path.join(OUT,'INITIAL_RECONCILIATION.json'));
const stateFile=path.join(OUT,'STATE.json');
const state:any=fs.existsSync(stateFile)?read(stateFile):{schema:'hard-collection-pc64-v3',created:new Date().toISOString(),attempts:{},batches:[],newRows:[],failures:[],supplementalJobs:[],nextSupplement:1};
if(!fs.existsSync(stateFile)&&fs.existsSync(path.join(OUT,'INHERITED_PC_ATTEMPTS.json')))state.attempts=read(path.join(OUT,'INHERITED_PC_ATTEMPTS.json'));
const historical=read(path.join(OUT,'HISTORICAL_INVENTORY.json'));
const oldProductionOffsets:any={};
for(const f of [...historical.failures,...historical.candidates])if(/production-v[12]$/.test(f.runDirectory)&&f.executionSequence){const a=Number(path.basename(f.directory).slice(8));oldProductionOffsets[f.executionSequence]=Math.max(oldProductionOffsets[f.executionSequence]??0,a);}
const originalsBySeq=new Map(originalJobs.map((j:any)=>[j.executionSequence,j]));
function accepted(){
    const all=reconcile([...base.rows,...state.newRows]),counts:any={},selected:any[]=[],extra:any[]=[];
    for(const row of all.unique){const cell=`${row.category}/${row.players}`;if((counts[cell]??0)<targetCells[cell]){selected.push(row);counts[cell]=(counts[cell]??0)+1;}else extra.push(row);}
    return {...all,selected,extra,counts,remaining:3000-selected.length};
}
function checkpoint(phase:string){
    const a=accepted(),done=new Set([...base.rows,...state.newRows].map((r:any)=>r.parentId));
    save('STATE.json',state);save('QUALIFIED_INDEX.json',a.selected);save('DUPLICATE_GROUPS.json',a.duplicates);save('EXTRA_NATURAL_RESULTS.json',a.extra);
    save('OUTSTANDING_ORIGINAL_JOBS.json',{jobs:originalJobs.filter((j:any)=>!done.has(j.parentId)),reason:'未获得合格自然结果；失败和截断不计完成'});
    save('PROGRESS.json',{phase,pid:process.pid,target:3000,qualifiedDistinct:a.selected.length,remaining:a.remaining,qualifiedParents:a.rows.length,duplicateExtraParents:a.rows.length-a.unique.length,originalMissing:originalJobs.filter((j:any)=>!done.has(j.parentId)).length,batches:state.batches.length,failures:state.failures.length,byCategory:tally(a.selected,(r:any)=>r.category),byPlayers:tally(a.selected,(r:any)=>r.players),byCell:a.counts,targetCells,bySource:tally(a.selected,(r:any)=>r.source),actions:a.selected.reduce((n:number,r:any)=>n+r.actions,0),diskFreeBytes:Number(fs.statfsSync(OUT).bavail)*fs.statfsSync(OUT).bsize,updated:new Date().toISOString()});
    return a;
}
async function runBatch(batch:any){
    const input=path.join(OUT,batch.input),directory=path.join(OUT,batch.directory);
    assert(!fs.existsSync(directory),'每批必须使用新目录');
    const args=['--openssl-legacy-provider','--import','tsx','gpu/parallel/run.ts','--out',directory,'--jobs',input,'--benchmark','--single-batch','--workers',String(batch.jobs.length),'--limit',String(batch.jobs.length),'--native','--gpu-range','--gpu-distance','--shared-assets','--shared-worker-code','--compact-records','--record-chunk-kib','1024'];
    const stdout=fs.openSync(path.join(OUT,batch.directory+'.stdout.log'),'wx'),stderr=fs.openSync(path.join(OUT,batch.directory+'.stderr.log'),'wx');
    const child=spawn(process.execPath,args,{cwd:path.join(ROOT,'ai_training'),windowsHide:true,stdio:['ignore',stdout,stderr]});
    fs.closeSync(stdout);fs.closeSync(stderr);batch.pid=child.pid;batch.command={executable:process.execPath,args};batch.started=new Date().toISOString();checkpoint('collecting');
    const timer=setInterval(()=>{
        try{if(fs.existsSync(path.join(OUT,'STOP')))fs.writeFileSync(path.join(directory,'STOP'),'本次持续驱动请求正常停止');checkpoint('collecting');}catch(e){console.error(String(e));}
    },15000);
    const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearInterval(timer);batch.exitCode=exit;batch.finished=new Date().toISOString();
    for(const job of batch.jobs){
        const seq=job.executionSequence,parent=path.join(directory,`parent-${seq}`);
        const attempts=fs.existsSync(parent)?fs.readdirSync(parent).filter(n=>/^attempt-\d+$/.test(n)).map(n=>Number(n.slice(8))):[];
        if(!attempts.length){batch.notStarted??=[];batch.notStarted.push(seq);continue;}
        const attempt=Math.max(...attempts),attemptDir=path.join(parent,`attempt-${attempt}`);
        state.attempts[seq]={starts:attempt,lastDirectory:attemptDir,status:'incomplete',seed:job.seed,parentId:job.parentId,originalJobSha256:hash(job)};
        const rfile=path.join(attemptDir,'result.json');
        if(!fs.existsSync(rfile)){state.failures.push({sequence:seq,attempt,directory:attemptDir,stop:'incomplete',retryable:false});continue;}
        const r=read(rfile);state.attempts[seq].status=r.stop;
        if(r.natural&&!r.error){
            try{const qualified=await auditGpu(attemptDir,directory);state.newRows.push(qualified);state.attempts[seq].status='qualified';}
            catch(e){state.failures.push({sequence:seq,attempt,directory:attemptDir,stop:'static_contract_rejected',error:String(e),retryable:false});state.attempts[seq].status='static_contract_rejected';}
        }else state.failures.push({sequence:seq,attempt,directory:attemptDir,stop:r.stop,error:r.error,retryable:r.stop==='stopped'&&!fs.existsSync(path.join(OUT,'STOP'))});
    }
    batch.audited=new Date().toISOString();checkpoint('batch_audited');
    console.log(JSON.stringify({batch:batch.number,...read(path.join(OUT,'PROGRESS.json'))}));
    // 环境/后端错误须由当前对话诊断，不盲目循环启动全批。
    if(exit!==0){save('ATTENTION.json',{batch:batch.number,exitCode:exit,stderr:path.join(OUT,batch.directory+'.stderr.log'),message:'采集进程异常，等待诊断后接续；已有自然结果已静态验收'});throw Error(`第${batch.number}批异常退出${exit}`);}
}
try{
    save('AUTHORIZATION.json',{date:'2026-10-29',source:'用户明确交接授权',workers:64,targetDistinct:3000,sourcePolicy:['apk-hard-original-phone','project-apk-hard-replica-gpu'],historicalReplay:false,training:false,tensors:false,automaticAdmission:false,frozenSplitChanged:false,oldPhoneBudgetRetained:true,oldProductionOffsets,newVersionAttemptLimit:3,format:'benchmark仅用于紧凑完整记录，正式接受由本目录静态合同及索引控制'});
    save('MIGRATION.json',{created:new Date().toISOString(),oldRuns:historical.runs,referencedPhoneIndexSha256:fileSha(path.join(OUT,'PHONE_AUDITED.json')),referencedGpuIndexSha256:fileSha(path.join(OUT,'HISTORICAL_GPU_AUDITED.json')),initialReconciliationSha256:fileSha(path.join(OUT,'INITIAL_RECONCILIATION.json')),oldEvidenceUntouched:true,sourceFiles:Object.fromEntries(['ai_training/gpu/parallel/run.ts','ai_training/gpu/parallel/collection_input.ts','ai_training/gpu/hard_jobs.ts',...fs.readdirSync(OUT).filter(n=>/\.(ts|mjs)$/.test(n)).map(n=>path.relative(ROOT,OUT).replaceAll('\\','/')+'/'+n)].map(n=>[n,fileSha(path.join(ROOT,n))]))});
    for(const batch of state.batches.filter((b:any)=>!b.audited))throw Error(`存在未审计批次${batch.number}，先核对实际进程和原件后恢复`);
    while(true){
        const a=checkpoint('scheduling');if(!a.remaining)break;
        if(fs.existsSync(path.join(OUT,'STOP'))){checkpoint('stopped');process.exitCode=2;break;}
        const disk=fs.statfsSync(OUT);if(disk.bavail*disk.bsize<3*1024**3)throw Error('可用空间不足3GiB，停止新调度并保留全部证据');
        const done=new Set([...base.rows,...state.newRows].map((r:any)=>r.parentId));
        const pending=originalJobs.filter((j:any)=>!done.has(j.parentId)&&(!state.attempts[j.executionSequence]||state.attempts[j.executionSequence].status==='stopped')&&(state.attempts[j.executionSequence]?.starts??oldProductionOffsets[j.executionSequence]??0)<3);
        let jobs=pending.slice(0,Math.min(64,a.remaining));
        if(!jobs.length){
            const reserved={...a.counts};jobs=[];
            const successfulSequences=new Set([...base.rows,...state.newRows].map((r:any)=>r.executionSequence));
            for(let i=0;i<Math.min(64,a.remaining);i++){
                const cells=Object.keys(targetCells).filter(c=>(reserved[c]??0)<targetCells[c]).sort((x,y)=>(reserved[x]??0)/targetCells[x]-(reserved[y]??0)/targetCells[y]);
                if(!cells.length)break;const cell=cells[0],templates=originalJobs.filter((j:any)=>`${j.category}/${j.actualPlayerCount}`===cell&&successfulSequences.has(j.executionSequence));
                const pool=templates.length?templates:originalJobs.filter((j:any)=>`${j.category}/${j.actualPlayerCount}`===cell);
                const index=state.nextSupplement++,origin=pool[(index-1)%pool.length],job=makeSupplement(origin,index);jobs.push(job);state.supplementalJobs.push(job);reserved[cell]=(reserved[cell]??0)+1;
            }
            save('SUPPLEMENTAL_JOBS.json',{schema:'hard-curriculum-jobs-v1',jobs:state.supplementalJobs});
        }
        assert(jobs.length>0);
        const number=state.batches.length+1,name=`batch-${String(number).padStart(3,'0')}`;
        const attemptOffsets=Object.fromEntries(jobs.map((j:any)=>[j.executionSequence,state.attempts[j.executionSequence]?.starts??oldProductionOffsets[j.executionSequence]??0]));
        save(name+'.input.json',{schema:'hard-collection-pc64-input-v1',jobs,attemptOffsets,frozenOriginalFileSha256:fileSha(path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json')),source:'project-apk-hard-replica-gpu'});
        const batch={number,input:name+'.input.json',directory:name,jobs,attemptOffsets};state.batches.push(batch);checkpoint('batch_prepared');await runBatch(batch);
    }
    const final=checkpoint(accepted().remaining?'stopped':'complete');
    if(!final.remaining){
        assert(final.selected.length===3000&&new Set(final.selected.map((r:any)=>r.parentId)).size===3000&&new Set(final.selected.map((r:any)=>r.semanticTrajectorySha256)).size===3000);
        assert.deepEqual(final.counts,targetCells);
        save('FINAL_REPORT.json',{...read(path.join(OUT,'PROGRESS.json')),allChildrenExited:true,qualifiedIndexSha256:fileSha(path.join(OUT,'QUALIFIED_INDEX.json')),duplicatesSha256:fileSha(path.join(OUT,'DUPLICATE_GROUPS.json')),staticContractOnly:true,historicalReplay:false,training:false,tensors:false,automaticAdmission:false});
        fs.writeFileSync(path.join(OUT,'REPORT.md'),`# 本机64并发采集核验报告\n\n已取得3000局有效、去重完整对局，七类及双人/三人/四人课程格配额全部满足。新调度已停止，全部在途进程正常退出。\n\n最终索引：QUALIFIED_INDEX.json；摘要及来源计数：FINAL_REPORT.json；原槽缺口：OUTSTANDING_ORIGINAL_JOBS.json；失败与尝试：STATE.json；重复组：DUPLICATE_GROUPS.json；补充输入：SUPPLEMENTAL_JOBS.json。\n\n本次只做文件、身份、帧数、摘要链和自然标签静态检查，未执行strict/forced/APK原生回放。跨格式排重将原生复合动作展开为位置语义，忽略显式待机与换手差异，采用保守合并；原件保留。手机原APK与项目困难复刻GPU来源单独登记。未训练、生成张量、自动准入或改变2414/268分区。\n`);
    }
}catch(e){checkpoint('attention');save('DRIVER_ERROR.json',{error:String(e),stack:(e as Error).stack,updated:new Date().toISOString()});console.error(e);process.exitCode=1;}
finally{fs.unlinkSync(lock);}
