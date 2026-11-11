/** 旧批次完全退出后合并账本并重组后继，输入和attempt偏移保持。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {reconcile} from './audit';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {createJobState} from '../gpu/hard_jobs';
import {ROOT,OUT,SOURCE_DIR,PREVIOUS,read,save,hash,fileSha,tally} from './common.mjs';

export function prepareAfterBoundary(){
    assert(!fs.existsSync(path.join(OUT,'JOBS_224.json')),'后继输入已生成，禁止重复准备');
    const request=read(path.join(OUT,'HANDOFF_REQUEST.json')),closed=read(path.join(PREVIOUS,'CLOSED.json')),state=read(path.join(PREVIOUS,'STATE.json')),final=read(path.join(PREVIOUS,'FINAL_REPORT.json'));
    assert(closed.allStartedCollectorProcessesExited&&closed.activeCollector===null);assert.equal(closed.driverPid,request.oldDriverPid);
    assert.deepEqual(state.batches.map((b:any)=>b.number),[2,3]);assert(state.batches.every((b:any)=>b.audited));assert.equal(state.startedParents.length,64);
    assert.equal(fileSha(path.join(PREVIOUS,'BATCH_PLAN.json')),request.oldBatchPlanSha256);assert.equal(fileSha(path.join(PREVIOUS,'JOBS_288.json')),request.oldJobsSha256);
    assert.equal(fileSha(path.join(PREVIOUS,'MERGED_QUALIFIED_INDEX.json')),final.mergedIndexSha256);
    const previousBase=read(path.join(PREVIOUS,'BASELINE_RECONCILIATION.json')),base=reconcile([...previousBase.rows,...state.qualified]);assert.equal(base.unique.length,final.globalDistinct);
    const oldPlan=read(path.join(PREVIOUS,'BATCH_PLAN.json')),remaining=oldPlan.batches.filter((b:any)=>b.number>=4),originalInputs=remaining.map((b:any)=>read(path.join(PREVIOUS,b.input)));
    assert.equal(remaining.length,7);assert(remaining.every((b:any)=>!fs.existsSync(path.join(PREVIOUS,b.directory))));
    const jobs=originalInputs.flatMap((i:any)=>i.jobs);assert.equal(jobs.length,224);assert.equal(hash(jobs),hash(read(path.join(PREVIOUS,'JOBS_288.json')).jobs.slice(64)));
    const prior=new Set(state.startedParents),successful=new Set(base.rows.map((r:any)=>r.parentId));assert(jobs.every((j:any)=>!prior.has(j.parentId)&&!successful.has(j.parentId)));
    const attemptOffsets=Object.assign({},...originalInputs.map((i:any)=>i.attemptOffsets));
    save('JOBS_224.json',{schema:'hard-curriculum-jobs-v1',jobs});save('BASELINE_RECONCILIATION.json',base);save('BASELINE_INDEX.json',base.unique);
    const batches=[];
    for(let i=0;i<4;i++){
        const subset=jobs.slice(i*64,(i+1)*64),name=`batch64-${String(i+1).padStart(3,'0')}`,input=name+'.input.json';assert.equal(subset.length,i===3?32:64);
        save(input,{schema:'hard-collection-pc64-input-v1',jobs:subset,attemptOffsets:Object.fromEntries(subset.map((j:any)=>[j.executionSequence,attemptOffsets[j.executionSequence]??0])),source:'project-apk-hard-replica-gpu',frozenOriginalFileSha256:fileSha(path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json'))});
        readCollectionInput(path.join(OUT,input));for(const j of subset)createJobState(j);
        batches.push({number:i+1,input,directory:name,workers:subset.length,jobs:subset.map((j:any)=>({executionSequence:j.executionSequence,parentId:j.parentId}))});
    }
    save('BATCH_PLAN.json',{authorizedParents:224,maximumWorkers:64,maximumPrimaryBatches:4,autoStartOtherGaps:false,autoCloseAfterLastBatch:true,batches});
    save('AUTHORIZATION.json',{date:'2026-10-30',source:'用户要求后继追加到64并发，原288局范围不变',authorizedParents:224,workers:64,finalBatchWorkers:32,selectedJobsSha256:fileSha(path.join(OUT,'JOBS_224.json')),old64AlreadyAttemptedNotRepeated:true,otherGapsRequireConfirmation:true,autoCloseAfterLastBatch:true,training:false,historicalReplay:false,tensors:false,automaticAdmission:false});
    save('PREVIOUS_RESULTS.json',{oldDataDirectory:PREVIOUS,oldStateSha256:fileSha(path.join(PREVIOUS,'STATE.json')),oldFinalSha256:fileSha(path.join(PREVIOUS,'FINAL_REPORT.json')),baselineDistinct:base.unique.length,preservedFailures:state.failures,oldDrainRetained:fs.existsSync(path.join(PREVIOUS,'DRAIN')),originalBatchInputs:remaining.map((b:any)=>({input:b.input,sha256:fileSha(path.join(PREVIOUS,b.input))}))});
    save('SCOPE_CONTRACTS.json',{passed:true,parents:224,concurrency:[64,64,64,32],previous64Excluded:true,noParentOutsideOriginal288:true,originalJobAndSeedUnchanged:true,attemptOffsetsUnchanged:true,autoClose:true,gameActionsExecuted:0,historicalReplay:false});
    save('PREPARATION.json',{parents:224,batches:4,maximumWorkers:64,baselineDistinct:base.unique.length,selectedByCategory:tally(jobs,(j:any)=>j.category),selectedByPlayers:tally(jobs,(j:any)=>j.actualPlayerCount),oldCollectorsAndDriverExited:true,inputsValidated:4,initialStatesVerified:224});
    fs.mkdirSync(path.join(OUT,'source-snapshot'));for(const name of fs.readdirSync(SOURCE_DIR).filter(n=>/\.(ts|mjs|ps1)$/.test(n)))fs.copyFileSync(path.join(SOURCE_DIR,name),path.join(OUT,'source-snapshot',name));
    return read(path.join(OUT,'PREPARATION.json'));
}
