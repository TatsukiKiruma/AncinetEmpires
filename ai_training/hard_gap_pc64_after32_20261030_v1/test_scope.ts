/** 提交交接前验证64路分批及原288范围，没有执行对局。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {createJobState} from '../gpu/hard_jobs';
import {OUT,SOURCE_DIR,PREVIOUS,read,save,hash} from './common.mjs';
const request=read(path.join(OUT,'HANDOFF_REQUEST.json')),oldJobs=read(path.join(PREVIOUS,'JOBS_288.json')).jobs,oldPlan=read(path.join(PREVIOUS,'BATCH_PLAN.json'));
assert.equal(request.remainingParents,224);assert.equal(request.maximumWorkers,64);assert(request.original288ScopeUnchanged);
const parts=oldPlan.batches.filter((b:any)=>b.number>=4).map((b:any)=>read(path.join(PREVIOUS,b.input))),jobs=parts.flatMap((p:any)=>p.jobs),offsets=Object.assign({},...parts.map((p:any)=>p.attemptOffsets));
assert.equal(jobs.length,224);assert.equal(hash(jobs),hash(oldJobs.slice(64)));assert.equal(new Set(jobs.map((j:any)=>j.parentId)).size,224);
const excluded=new Set(oldJobs.slice(0,64).map((j:any)=>j.parentId));assert(jobs.every((j:any)=>!excluded.has(j.parentId)));
for(let i=0;i<4;i++){const subset=jobs.slice(i*64,(i+1)*64);assert.equal(subset.length,i===3?32:64);const name=`contract-fixtures/batch-${i+1}.json`;save(name,{schema:'hard-collection-pc64-input-v1',jobs:subset,attemptOffsets:Object.fromEntries(subset.map((j:any)=>[j.executionSequence,offsets[j.executionSequence]??0]))});const verified=readCollectionInput(path.join(OUT,name));for(const j of verified.jobs)createJobState(j);}
const driver=fs.readFileSync(path.join(SOURCE_DIR,'drive.ts'),'utf8'),handoff=fs.readFileSync(path.join(SOURCE_DIR,'handoff.ts'),'utf8');
assert(driver.includes("'--workers',String(input.jobs.length),'--limit',String(input.jobs.length)"));assert(driver.includes('state.batches.length<4'));assert(driver.includes('new Set(state.startedParents).size<=224'));assert(!driver.includes('makeSupplement'));assert(handoff.includes('if(!oldAlive&&closed)break;'));assert(handoff.includes('if(alive(request.currentCollectorPid))throw'));
save('PRELAUNCH_CONTRACTS.json',{passed:true,parents:224,newBatchSizes:[64,64,64,32],old64NotRepeated:true,original288ScopeUnchanged:true,oldDriverExitRequired:true,noExtraParentsForPadding:true,initialStatesVerified:224,autoClose:true,gameActionsExecuted:0,historicalReplay:false});
console.log(JSON.stringify({passed:true,parents:224,workers:[64,64,64,32],old64NotRepeated:true}));
