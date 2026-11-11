/** 验证调度边界、独立父局和补缺配额；不执行任何游戏动作或规则回放。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {selectNext,makeSupplement,targetCells,jobCell,remainingCells} from './scheduler';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {OUT,save,originalJobs,hash,tally} from './common.mjs';
const checks:any[]=[];
function check(name:string,fn:()=>void){fn();checks.push({name,passed:true});}
const row=(j:any)=>({parentId:j.parentId,executionSequence:j.executionSequence,category:j.category,players:j.actualPlayerCount,semanticTrajectorySha256:hash(j.parentId)});
const fixture=path.join(OUT,'contract-fixtures','input.json');fs.mkdirSync(path.dirname(fixture),{recursive:true});
function validate(jobs:any[],attemptOffsets:any={}){fs.writeFileSync(fixture,JSON.stringify({schema:'hard-collection-pc64-input-v1',jobs,attemptOffsets}));return readCollectionInput(fixture);}

check('64路上限与末批精确补足3000',()=>{
    const rows:any[]=[],attempted=new Set<string>();let next=1,batches=0,last=0;
    while(rows.length<3000){const selected=selectNext(rows,rows,originalJobs,attempted,next);assert(selected.jobs.length>0&&selected.jobs.length<=64);next=selected.nextSupplement;for(const j of selected.jobs){assert(!attempted.has(j.parentId));attempted.add(j.parentId);rows.push(row(j));}last=selected.jobs.length;assert(++batches<60);}
    assert.equal(rows.length,3000);assert.equal(remainingCells(rows).remaining,0);assert.deepEqual(tally(rows,(r:any)=>`${r.category}/${r.players}`),targetCells);assert.equal(batches,47);assert.equal(last,56);
    assert.equal(selectNext(rows,rows,originalJobs,attempted,next).jobs.length,0);
});
check('成功父局与已尝试失败父局排除并生成同格独立补充',()=>{
    const missing=originalJobs.slice(0,5),rows=originalJobs.slice(5).map(row),attempted=new Set([missing[0].parentId,missing[1].parentId]);
    const result=selectNext(rows,rows,missing,attempted,100);assert.equal(result.jobs.length,5);assert.equal(result.supplements.length,2);
    assert(result.jobs.every(j=>!attempted.has(j.parentId)));const updated=[...rows,...result.jobs.map(row)];assert.equal(remainingCells(updated).remaining,0);validate(result.jobs);
});
check('去重代表之外的已成功父局也禁止重采',()=>{
    const missing=originalJobs[0],rows=originalJobs.slice(1).map(row),duplicate={...row(missing),semanticTrajectorySha256:rows[0].semanticTrajectorySha256};
    const result=selectNext(rows,[...rows,duplicate],[missing],new Set(),200);assert.equal(result.jobs.length,1);assert.notEqual(result.jobs[0].parentId,missing.parentId);assert.equal(result.supplements.length,1);
});
check('补充21课程格谱系和保护保持，身份种子不碰撞',()=>{
    const cells=new Map<string,any>();for(const j of originalJobs)cells.set(jobCell(j),j);
    const jobs=[...cells.values()].map((j,i)=>makeSupplement(j,300+i));validate(jobs);
    assert.equal(new Set(jobs.map(j=>j.parentId)).size,21);assert.equal(new Set(jobs.map(j=>j.seed)).size,21);
    for(const j of jobs){const origin=originalJobs.find((o:any)=>o.executionSequence===j.supplementalLineage.originalSequence);assert.equal(j.supplementalLineage.originalJobSha256,hash(origin));for(const key of ['category','profile','actualPlayerCount','map','setup','maxActions','maxEffectiveSeconds'])assert.equal(hash(j[key]),hash(origin[key]));}
    const mutated=structuredClone(jobs);mutated[0].maxActions++;assert.throws(()=>validate(mutated));
});
check('支持继承实际启动偏移并拒绝超过三次',()=>{const j=originalJobs[0];const checked=validate([j],{[j.executionSequence]:2});assert.equal(checked.attemptOffsets[j.executionSequence],2);assert.throws(()=>validate([j],{[j.executionSequence]:3}));});
save('SCOPE_CONTRACTS.json',{passed:true,checks,gameActionsExecuted:0,historicalReplay:false,training:false,target:3000,maximumWorkers:64});
console.log(JSON.stringify({passed:true,checks:checks.length,target:3000,maximumWorkers:64,gameActionsExecuted:0}));
