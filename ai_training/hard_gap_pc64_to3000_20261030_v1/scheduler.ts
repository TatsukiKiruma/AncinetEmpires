/** 以21个课程格的有效去重缺口选局，原输入优先，补充父局独立留痕。 */
import assert from 'node:assert/strict';
import {createJobState} from '../gpu/hard_jobs';
import {hash,originalJobs,tally} from './common.mjs';
export const targetCells=tally(originalJobs,(j:any)=>`${j.category}/${j.actualPlayerCount}`);
export const jobCell=(j:any)=>`${j.category}/${j.actualPlayerCount}`;
export const rowCell=(r:any)=>`${r.category}/${r.players}`;

export function remainingCells(unique:any[]){
    const counts=tally(unique,rowCell);
    for(const [cell,count] of Object.entries(counts))assert(Number(count)<=targetCells[cell],`已完成课程格超配：${cell}`);
    return {counts,gaps:Object.fromEntries(Object.keys(targetCells).map(c=>[c,targetCells[c]-(counts[c]??0)])),remaining:3000-unique.length};
}

export function makeSupplement(origin:any,index:number){
    assert(Number.isSafeInteger(index)&&index>0&&index<1000000);
    const job=structuredClone(origin),parentId=`hc7-pc64-20261030-to3000-extra-${String(index).padStart(6,'0')}`;
    Object.assign(job,{executionSequence:100000+index,parentId,designSlotId:parentId,seed:2050000000+index,batch:4,device:'pc-gpu',observation:false,jsRngMode:'project_seeded_mulberry32_per_player'});
    const changes:any[]=[];
    if(job.state){
        // 保留课程、地图、编成和保护，仅小幅变化资源与生命，产生独立且可追溯的局面。
        for(const p of job.state.players){const before=p.gold;p.gold+=50*(1+(index+p.id)%4);changes.push({field:`players/${p.id}/gold`,before,after:p.gold});}
        for(let i=0;i<job.state.units.length;i++){const u=job.state.units[i],before=u.hp;u.hp=Math.max(1,u.hp-1-(index+i)%3);changes.push({field:`units/${i}/hp`,before,after:u.hp});}
        job.initialStateSha256=hash(job.state);
    }
    job.supplementalLineage={originalSequence:origin.executionSequence,originalParentId:origin.parentId,originalSeed:origin.seed,originalJobSha256:hash(origin),originalInitialStateSha256:origin.initialStateSha256,reason:'补足同类别人数格的失败、截断或重复缺口',changes,normalAndParameterInitialStateRetained:!job.state};
    createJobState(job);return job;
}

export function selectNext(unique:any[],allRows:any[],primary:any[],attempted:Set<string>,nextSupplement:number){
    const status=remainingCells(unique),reserved={...status.counts},done=new Set(allRows.map((r:any)=>r.parentId)),jobs:any[]=[],supplements:any[]=[];
    const available=primary.filter(j=>!done.has(j.parentId)&&!attempted.has(j.parentId));
    const cellOrder=()=>Object.keys(targetCells).filter(c=>(reserved[c]??0)<targetCells[c]).sort((a,b)=>(reserved[a]??0)/targetCells[a]-(reserved[b]??0)/targetCells[b]||a.localeCompare(b));
    const limit=Math.min(64,status.remaining);
    while(jobs.length<limit){
        const cell=cellOrder().find(c=>available.some(j=>jobCell(j)===c));if(!cell)break;
        const index=available.findIndex(j=>jobCell(j)===cell),job=available.splice(index,1)[0];jobs.push(job);reserved[cell]=(reserved[cell]??0)+1;
    }
    while(jobs.length<limit){
        const cell=cellOrder()[0];assert(cell);
        const successful=new Set(allRows.map((r:any)=>r.parentId)),all=originalJobs.filter((j:any)=>jobCell(j)===cell),known=all.filter((j:any)=>successful.has(j.parentId)),pool=known.length?known:all;
        const index=nextSupplement++,origin=pool[(index-1)%pool.length],job=makeSupplement(origin,index);
        assert(!done.has(job.parentId)&&!attempted.has(job.parentId));jobs.push(job);supplements.push(job);reserved[cell]=(reserved[cell]??0)+1;
    }
    assert.equal(new Set(jobs.map(j=>j.parentId)).size,jobs.length);
    assert(jobs.length<=64&&jobs.length<=status.remaining);
    for(const cell of Object.keys(targetCells))assert((reserved[cell]??0)<=targetCells[cell]);
    return {jobs,supplements,nextSupplement};
}
