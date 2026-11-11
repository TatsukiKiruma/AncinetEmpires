/** 前一轮全部关闭后建立新基线，保留各版本实际尝试与保护记录。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {reconcile} from './audit';
import {remainingCells,targetCells} from './scheduler';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {createJobState} from '../gpu/hard_jobs';
import {ROOT,OUT,SOURCE_DIR,PREVIOUS,PC320,PC288,read,save,hash,fileSha,originalJobs,frozenFile,tally} from './common.mjs';

export function prepareAfterBoundary(){
    assert(!fs.existsSync(path.join(OUT,'PREPARATION.json')),'禁止重复准备或覆盖本次基线');
    const request=read(path.join(OUT,'HANDOFF_REQUEST.json')),closed=read(path.join(PREVIOUS,'CLOSED.json')),final=read(path.join(PREVIOUS,'FINAL_REPORT.json')),previous=read(path.join(PREVIOUS,'STATE.json'));
    assert(closed.allStartedCollectorProcessesExited&&closed.activeCollector===null);
    assert.equal(closed.driverPid,request.oldDriverPid);assert.equal(previous.batches.length,4);assert(previous.batches.every((b:any)=>b.audited&&b.exitCode===0));
    assert.equal(fileSha(path.join(PREVIOUS,'MERGED_QUALIFIED_INDEX.json')),final.mergedIndexSha256);
    const base=reconcile([...read(path.join(PREVIOUS,'BASELINE_RECONCILIATION.json')).rows,...previous.qualified]);assert.equal(base.unique.length,final.globalDistinct);
    const status=remainingCells(base.unique);assert(status.remaining>=0);
    const inherited=read(path.join(PC320,'PREVIOUS_ATTEMPTS.json')),offsets:any={...inherited.pcOffsets},blocked=new Map<number,any>(),history:any[]=[];
    for(const root of [PC320,PC288,PREVIOUS]){
        const state=read(path.join(root,'STATE.json'));
        for(const b of state.batches){
            for(const j of b.jobs){
                const dir=path.join(root,b.directory,`parent-${j.executionSequence}`);
                const attempts=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^attempt-\d+$/.test(n)).map(n=>Number(n.slice(8))):[];
                if(!attempts.length)continue;const attempt=Math.max(...attempts),resultFile=path.join(dir,`attempt-${attempt}`,'result.json'),r=fs.existsSync(resultFile)?read(resultFile):null;
                offsets[j.executionSequence]=Math.max(offsets[j.executionSequence]??0,attempt);
                const record={sequence:j.executionSequence,parentId:j.parentId,attempt,stop:r?.stop??'incomplete_record',resultFile};history.push(record);
                if(!r||(!r.natural&&r.stop!=='stopped'))blocked.set(j.executionSequence,record);
            }
        }
        for(const f of state.failures??[])if(f.stop!=='stopped'&&f.sequence)blocked.set(f.sequence,{...f,sourceDirectory:root});
    }
    for(const e of inherited.exclusions??[])blocked.set(e.sequence,e);
    const inventory=read(path.join(ROOT,'ai_training/hard_collection_pc64_v4_20261029/HISTORICAL_INVENTORY.json'));
    for(const f of inventory.failures)if(f.stop==='action_truncation'&&f.steps>=20000&&f.executionSequence)blocked.set(f.executionSequence,{...f,reason:'历史动作保护截断，派生新父局补足'});
    const done=new Set(base.rows.map((r:any)=>r.parentId)),phoneJobs=read(path.join(ROOT,'ai_training/hard_gap_samsung_20261029_v1/JOBS.json')).jobs;
    const jobs=[...originalJobs,...phoneJobs.filter((j:any)=>j.executionSequence>3000)],unqualified=jobs.filter((j:any)=>!done.has(j.parentId));
    assert.equal(new Set(jobs.map((j:any)=>j.parentId)).size,jobs.length);assert.equal(new Set(jobs.map((j:any)=>j.seed)).size,jobs.length);
    const primary=unqualified.filter((j:any)=>!blocked.has(j.executionSequence)&&(offsets[j.executionSequence]??0)<3);
    save('PRIMARY_JOBS.json',{schema:'hard-curriculum-jobs-v1',jobs:primary});
    save('primary-contract.input.json',{schema:'hard-collection-pc64-input-v1',jobs:primary,attemptOffsets:Object.fromEntries(primary.map((j:any)=>[j.executionSequence,offsets[j.executionSequence]??0]))});
    if(primary.length)readCollectionInput(path.join(OUT,'primary-contract.input.json'));for(const j of primary)createJobState(j);
    save('BASELINE_RECONCILIATION.json',base);save('BASELINE_INDEX.json',base.unique);
    save('PREVIOUS_ATTEMPTS.json',{offsets,blocked:[...blocked.values()],history,sourceBudgetFile:path.join(PC320,'PREVIOUS_ATTEMPTS.json'),sourceBudgetSha256:fileSha(path.join(PC320,'PREVIOUS_ATTEMPTS.json')),phoneHistoryPreserved:true,phoneRemainsStopped:true,deterministicTruncationsNotRepeated:true});
    save('REMAINING_GAPS.json',{target:3000,baselineDistinct:base.unique.length,remaining:status.remaining,targetCells,counts:status.counts,gaps:status.gaps,primaryParents:primary.length,excludedOriginalParents:unqualified.filter((j:any)=>!primary.some((p:any)=>p.parentId===j.parentId)).map((j:any)=>({sequence:j.executionSequence,parentId:j.parentId,starts:offsets[j.executionSequence]??0,reason:blocked.get(j.executionSequence)??'三次实际启动预算耗尽'})),supplementalPolicy:'原输入优先，同课程格独立新父局补足失败/截断/重复；最终只计3000有效去重自然局'});
    const lastRun=read(path.join(PREVIOUS,previous.batches.at(-1).directory,'RUN.json'));
    const publicSources=Object.fromEntries(Object.keys(lastRun.identity.sources).map(name=>[name,fileSha(path.join(ROOT,name))]));
    const controls=Object.fromEntries(fs.readdirSync(SOURCE_DIR).filter(n=>/\.(ts|mjs|ps1)$/.test(n)).map(name=>[name,fileSha(path.join(SOURCE_DIR,name))]));
    save('SOURCE_IDENTITY.json',{publicSources,controls,frozenJobsSha256:fileSha(frozenFile),oldFinalReportSha256:fileSha(path.join(PREVIOUS,'FINAL_REPORT.json')),oldMergedIndexSha256:final.mergedIndexSha256});
    fs.mkdirSync(path.join(OUT,'source-snapshot'));for(const name of Object.keys(controls))fs.copyFileSync(path.join(SOURCE_DIR,name),path.join(OUT,'source-snapshot',name));
    save('PREPARATION.json',{created:new Date().toISOString(),baselineQualifiedParents:base.rows.length,baselineDistinct:base.unique.length,remaining:status.remaining,primaryParents:primary.length,primaryByCategory:tally(primary,(j:any)=>j.category),primaryByPlayers:tally(primary,(j:any)=>j.actualPlayerCount),initialStatesVerified:primary.length,maximumWorkers:64,previousCollectorsExited:true,sourceSha256:hash(publicSources),noTraining:true,noHistoricalReplay:true});
    return read(path.join(OUT,'PREPARATION.json'));
}
