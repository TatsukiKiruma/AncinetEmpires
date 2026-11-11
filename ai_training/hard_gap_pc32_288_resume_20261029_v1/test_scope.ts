/** 接续范围及仓库外输出合同；不执行对局或回放。 */
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {OUT,ROOT,SOURCE_DIR,PREVIOUS,read,save,hash} from './common.mjs';
const plan=read(path.join(OUT,'BATCH_PLAN.json')),jobs=read(path.join(OUT,'JOBS_288.json')).jobs,base=read(path.join(OUT,'BASELINE_RECONCILIATION.json')),old=read(path.join(PREVIOUS,'STATE.json'));
assert.equal(plan.batches.length,9);assert.equal(plan.authorizedParents,288);assert.equal(plan.maximumWorkers,32);
assert.deepEqual(plan.batches.map((b:any)=>b.number),[2,3,4,5,6,7,8,9,10]);
const selected=plan.batches.flatMap((b:any)=>readCollectionInput(path.join(OUT,b.input)).jobs);
assert.equal(selected.length,288);assert.equal(hash(selected),hash(jobs));assert.equal(new Set(selected.map((j:any)=>j.parentId)).size,288);
assert(selected.every((j:any)=>!old.startedParents.includes(j.parentId)&&!base.rows.some((r:any)=>r.parentId===j.parentId)));
assert(!path.resolve(OUT).toLowerCase().startsWith(path.resolve(ROOT).toLowerCase()+path.sep));
assert(fs.existsSync(path.join(PREVIOUS,'DRAIN')));assert(!fs.existsSync(path.join(OUT,'DRAIN')));
const driver=fs.readFileSync(path.join(SOURCE_DIR,'drive.ts'),'utf8');assert(driver.includes('for(const entry of plan.batches)'));assert(driver.includes('state.batches.length<9'));assert(!driver.includes('makeSupplement'));
save('SCOPE_CONTRACTS.json',{passed:true,parents:288,batches:9,workers:32,previous32NotRepeated:true,oldDrainRetained:true,allOutputOutsideRepository:true,autoClose:true,gameActionsExecuted:0,historicalReplay:false});console.log(JSON.stringify({passed:true,parents:288,batches:9,workers:32,output:OUT}));
