/** 固定320授权边界及输入身份回归，不执行对局。 */
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {OUT,read,save,hash} from './common.mjs';
const plan=read(path.join(OUT,'BATCH_PLAN.json')),jobs=read(path.join(OUT,'JOBS_320.json')).jobs,base=read(path.join(OUT,'BASELINE_RECONCILIATION.json'));
assert.equal(plan.batches.length,10);assert.equal(plan.authorizedParents,320);assert.equal(plan.maximumWorkers,32);
const all=plan.batches.flatMap((b:any)=>readCollectionInput(path.join(OUT,b.input)).jobs);
assert.equal(all.length,320);assert.equal(hash(all),hash(jobs));assert.equal(new Set(all.map((j:any)=>j.parentId)).size,320);
assert(all.every((j:any)=>!base.rows.some((r:any)=>r.parentId===j.parentId)));
const deferred=read(path.join(OUT,'DEFERRED_JOBS.json')).jobs;assert(deferred.every((j:any)=>!all.some((s:any)=>s.parentId===j.parentId)));
const source=fs.readFileSync(path.join(OUT,'drive.ts'),'utf8');assert(source.includes('for(const entry of plan.batches)'));assert(!source.includes('makeSupplement'));assert(source.includes("'--workers','32','--limit','32'"));
save('SCOPE_CONTRACTS.json',{passed:true,parents:320,batches:10,workers:32,baselineSuccessExcluded:true,noDeferredParentSelected:true,automaticSupplementalParents:false,autoClose:true,gameActionsExecuted:0,historicalReplay:false});
console.log(JSON.stringify({passed:true,parents:320,batches:10,workers:32,deferredParents:deferred.length}));
