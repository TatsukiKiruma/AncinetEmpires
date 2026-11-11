/** 合并手机停采原件并分层冻结320个缺口，其余输入只登记不调度。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {auditPhone,reconcile} from './audit';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {createJobState} from '../gpu/hard_jobs';
import {ROOT,OUT,read,save,sha,hash,fileSha,originalJobs,tally} from './common.mjs';
const old=path.join(ROOT,'ai_training/hard_collection_pc64_v4_20261029'),phone=path.join(ROOT,'ai_training/hard_gap_samsung_20261029_v1'),closed=path.join(phone,'closeout-pc320-20261029');
const phoneJobs=read(path.join(phone,'JOBS.json')).jobs,byParent=new Map(phoneJobs.map((j:any)=>[j.parentId,j]));
const verified=read(path.join(closed,'VERIFIED_PARENTS.json')),report=read(path.join(closed,'TRANSFER_REPORT.json'));
assert(report.phoneStopped&&report.successfulRawFileShaVerified&&verified.length===report.naturalParents);
const newRows:any[]=[];
for(const r of verified){const j:any=byParent.get(r.parentId);assert(j);const requested=read(path.join(r.localDirectory,'requested-initial-state.json'));const actualJob={...requested.job};assert.equal(actualJob.attemptId,r.attemptId);actualJob.attemptId='__ATTEMPT__';assert.equal(hash(actualJob),hash(j),'手机实际请求与本批冻结输入不符');const checked=await auditPhone(r,j);newRows.push({...checked,phoneDevice:'samsung',transferReport:path.join(closed,'TRANSFER_REPORT.json')});}
save('PHONE_AUDITED.json',newRows);
const oldBase=read(path.join(old,'INITIAL_RECONCILIATION.json')),oldState=read(path.join(old,'STATE.json')),oldIndexFile=path.join(old,'QUALIFIED_INDEX.json');
assert.equal(fileSha(oldIndexFile),read(path.join(old,'STOP_CLOSEOUT.json')).qualifiedIndexSha256);
const merged=reconcile([...oldBase.rows,...oldState.newRows,...newRows]);save('BASELINE_RECONCILIATION.json',merged);save('BASELINE_INDEX.json',merged.unique);
const done=new Set(merged.rows.map((r:any)=>r.parentId));
const originalBySeq=new Map(originalJobs.map((j:any)=>[j.executionSequence,j]));
for(const j of phoneJobs){if(j.executionSequence<=3000)assert.equal(hash(j),hash(originalBySeq.get(j.executionSequence)));else assert(j.supplementalLineage&&j.seed>=2042000001);}
const historical=read(path.join(old,'HISTORICAL_INVENTORY.json'));
const priorOffsets:any={};
for(const [seq,r] of Object.entries(oldState.attempts) as any)priorOffsets[seq]=r.starts;
const earlier=read(path.join(ROOT,'ai_training/hard_collection_pc64_v3_20261029/STATE.json'));
for(const [seq,r] of Object.entries(earlier.attempts??{}) as any)priorOffsets[seq]=Math.max(priorOffsets[seq]??0,r.starts);
for(const e of [...historical.candidates,...historical.failures])if(/production-v[12]$/.test(e.runDirectory)&&e.executionSequence)priorOffsets[e.executionSequence]=Math.max(priorOffsets[e.executionSequence]??0,Number(path.basename(e.directory).slice(8)));
const protectedSequences=new Set(historical.failures.filter((r:any)=>r.stop==='action_truncation'&&r.steps>=20000).map((r:any)=>r.executionSequence));
const remaining=phoneJobs.filter((j:any)=>!done.has(j.parentId));
const exclusions=remaining.filter((j:any)=>(priorOffsets[j.executionSequence]??0)>=3||protectedSequences.has(j.executionSequence));
const excluded=new Set(exclusions.map((j:any)=>j.parentId)),candidates=remaining.filter((j:any)=>!excluded.has(j.parentId));
const targets=tally(originalJobs,(j:any)=>`${j.category}/${j.actualPlayerCount}`),counts=tally(merged.unique,(r:any)=>`${r.category}/${r.players}`),available=tally(candidates,(j:any)=>`${j.category}/${j.actualPlayerCount}`);
const cells=Object.keys(targets).sort().map(cell=>({cell,gap:Math.max(0,targets[cell]-(counts[cell]??0)),available:available[cell]??0,quota:0,fraction:0}));
const remainingDistinct=cells.reduce((n,c)=>n+c.gap,0);assert(remainingDistinct>=320&&candidates.length>=320);
for(const c of cells){const raw=320*c.gap/remainingDistinct;c.quota=Math.min(Math.floor(raw),c.available);c.fraction=raw-Math.floor(raw);}
let assigned=cells.reduce((n,c)=>n+c.quota,0);
while(assigned<320){const order=[...cells].filter(c=>c.quota<c.available).sort((a,b)=>b.fraction-a.fraction||a.cell.localeCompare(b.cell));assert(order.length);for(const c of order){if(assigned>=320)break;c.quota++;assigned++;}}
const selected:any[]=[];
for(const c of cells){
    const groups=new Map<string,any[]>();for(const j of candidates.filter((j:any)=>`${j.category}/${j.actualPlayerCount}`===c.cell)){const k=`${j.profile}/${j.map}`,a=groups.get(k)??[];a.push(j);groups.set(k,a);}
    const keys=[...groups.keys()].sort((a,b)=>sha('pc32-320/'+a).localeCompare(sha('pc32-320/'+b)));
    for(const list of groups.values())list.sort((a,b)=>sha(a.parentId).localeCompare(sha(b.parentId)));
    let picked=0;while(picked<c.quota)for(const key of keys){if(picked>=c.quota)break;const j=groups.get(key)!.shift();if(j){selected.push(j);picked++;}}
}
assert.equal(selected.length,320);assert.equal(new Set(selected.map(j=>j.parentId)).size,320);assert(selected.every(j=>!done.has(j.parentId)));
// 按课程格交错，使每批保有类别与人数覆盖；调度清单仍固定为十批。
const selectedCells=new Map<string,any[]>();for(const j of selected){const k=`${j.category}/${j.actualPlayerCount}`,a=selectedCells.get(k)??[];a.push(j);selectedCells.set(k,a);}
const jobs:any[]=[];while(jobs.length<320)for(const key of [...selectedCells.keys()].sort()){const j=selectedCells.get(key)!.shift();if(j)jobs.push(j);}
save('JOBS_320.json',{schema:'hard-curriculum-jobs-v1',jobs});
const chosen=new Set(jobs.map(j=>j.parentId));save('DEFERRED_JOBS.json',{authorization:'等待用户另行确认，禁止本次调度',jobs:remaining.filter((j:any)=>!chosen.has(j.parentId))});
const batches=[];for(let i=0;i<10;i++){const subset=jobs.slice(i*32,(i+1)*32),name=`batch-${String(i+1).padStart(3,'0')}`,input=name+'.input.json';save(input,{schema:'hard-collection-pc64-input-v1',jobs:subset,attemptOffsets:Object.fromEntries(subset.map(j=>[j.executionSequence,priorOffsets[j.executionSequence]??0])),source:'project-apk-hard-replica-gpu',frozenOriginalFileSha256:fileSha(path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json'))});readCollectionInput(path.join(OUT,input));for(const j of subset)createJobState(j);batches.push({number:i+1,input,directory:name,jobs:subset.map(j=>({executionSequence:j.executionSequence,parentId:j.parentId}))});}
save('BATCH_PLAN.json',{authorizedParents:320,maximumWorkers:32,maximumPrimaryBatches:10,autoStartOtherGaps:false,autoCloseAfterLastBatch:true,batches});
save('PREVIOUS_ATTEMPTS.json',{pcOffsets:priorOffsets,phoneFailedAttemptsFile:path.join(closed,'FAILED_ATTEMPTS.json'),phoneFailedAttemptsSha256:fileSha(path.join(closed,'FAILED_ATTEMPTS.json')),oldBudgetsPreserved:true,exclusions:exclusions.map((j:any)=>({sequence:j.executionSequence,parentId:j.parentId,reason:protectedSequences.has(j.executionSequence)?'历史完整运行触发原20000动作保护，不盲目重跑':'历史PC三次实际启动预算已耗尽'}))});
save('AUTHORIZATION.json',{date:'2026-10-29',source:'用户要求停止三星取回完成数据，再用本机32并发GPU仅采集缺失320局，其余等待确认，采集后关闭',authorizedParents:320,workers:32,selectedJobsSha256:fileSha(path.join(OUT,'JOBS_320.json')),phoneStoppedAndTransferred:true,remainingRequiresNewUserConfirmation:true,automaticSupplementalParents:false,training:false,historicalReplay:false,tensors:false,automaticAdmission:false});
save('PREPARATION.json',{phoneTransferred:verified.length,newPhoneDistinct:merged.unique.length-read(oldIndexFile).length,baselineQualifiedParents:merged.rows.length,baselineDistinct:merged.unique.length,remainingDistinct,selectedParents:320,deferredParents:remaining.length-320,selectedByCategory:tally(jobs,(j:any)=>j.category),selectedByPlayers:tally(jobs,(j:any)=>j.actualPlayerCount),cellQuotas:cells,initialStatesVerified:320,inputsValidated:10,priorProtectedJobsExcluded:exclusions.length,semanticDedupNoReplay:true});
console.log(JSON.stringify(read(path.join(OUT,'PREPARATION.json'))));
