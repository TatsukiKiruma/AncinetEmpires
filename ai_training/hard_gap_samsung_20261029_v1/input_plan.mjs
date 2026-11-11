/** 从停采封存索引生成全部手机补缺输入；原父局不改写，重复增量用独立新谱系补足。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const out=import.meta.dirname,root=path.resolve(out,'../..'),pc=path.join(root,'ai_training/hard_collection_pc64_v4_20261029');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hash=v=>sha(JSON.stringify(v));
const write=(name,v)=>fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const tally=(rows,key)=>{const c={};for(const r of rows){const k=key(r);c[k]=(c[k]??0)+1;}return c;};
const originalFile=path.join(root,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json'),original=read(originalFile).jobs;
const indexRaw=fs.readFileSync(path.join(pc,'QUALIFIED_INDEX.json')),qualified=JSON.parse(indexRaw),closed=read(path.join(pc,'STOP_CLOSEOUT.json'));
assert.equal(sha(indexRaw),closed.qualifiedIndexSha256);assert.equal(qualified.length,1828);
assert.equal(new Set(qualified.map(r=>r.semanticTrajectorySha256)).size,1828);
const state=read(path.join(pc,'STATE.json')),base=read(path.join(pc,'INITIAL_RECONCILIATION.json'));
const allParents=[...base.rows,...state.newRows],done=new Set(allParents.map(r=>r.parentId));assert.equal(done.size,1836);
const missing=original.filter(j=>!done.has(j.parentId));assert.equal(missing.length,1164);
const kept=new Set(qualified.map(r=>r.parentId)),duplicates=allParents.filter(r=>!kept.has(r.parentId));assert.equal(duplicates.length,8);
assert(duplicates.every(r=>r.category==='parameter_variant'&&r.players===2));
const candidates=original.filter(j=>j.category==='parameter_variant'&&j.profile==='high_gold'&&j.actualPlayerCount===2);
const templates=[...new Map(candidates.map(j=>[j.map,j])).values()].sort((a,b)=>a.map.localeCompare(b.map));
const extra=Array.from({length:8},(_,i)=>{
    const origin=templates[i%templates.length],j=structuredClone(origin),parentId=`hc7-samsung-gap-20261029-extra-${String(i+1).padStart(4,'0')}`;
    Object.assign(j,{executionSequence:3001+i,parentId,designSlotId:parentId,seed:2042000001+i,batch:4,device:'samsung_gap',observation:false});
    j.supplementalLineage={originalSequence:origin.executionSequence,originalParentId:origin.parentId,originalSeed:origin.seed,originalJobSha256:hash(origin),replacedDuplicateParentId:duplicates[i].parentId,replacedDuplicateSequence:duplicates[i].executionSequence,reason:'补足已成功父局中的重复轨迹增量；独立新父局及种子，不冒充原槽成功',stateAndMapRetained:true};return j;
});
const jobs=[...missing,...extra],cells=new Map();
for(const j of jobs){const key=`${j.category}/${j.actualPlayerCount}`,a=cells.get(key)??[];a.push(j);cells.set(key,a);}
for(const list of cells.values())list.sort((a,b)=>a.profile.localeCompare(b.profile)||a.map.localeCompare(b.map)||a.executionSequence-b.executionSequence);
const orderedCells=[...cells.keys()].sort(),arranged=[],observation=[];
for(let round=0;round<2;round++)for(const cell of orderedCells){const j=cells.get(cell).shift();assert(j);arranged.push(j);observation.push(j);}
while([...cells.values()].some(a=>a.length))for(const cell of orderedCells){const j=cells.get(cell).shift();if(j)arranged.push(j);}
assert.equal(arranged.length,1172);assert.equal(new Set(arranged.map(j=>j.parentId)).size,1172);assert.equal(new Set(arranged.map(j=>j.seed)).size,1172);
assert(arranged.every(j=>!done.has(j.parentId)));assert.equal(observation.length,42);
const target=tally(original,j=>`${j.category}/${j.actualPlayerCount}`),actual=tally(qualified,j=>`${j.category}/${j.players}`),queue=tally(arranged,j=>`${j.category}/${j.actualPlayerCount}`);
for(const [cell,n] of Object.entries(target))assert.equal((actual[cell]??0)+(queue[cell]??0),n,cell);
const frozenBySeq=new Map(original.map(j=>[j.executionSequence,j]));for(const j of missing)assert.equal(hash(j),hash(frozenBySeq.get(j.executionSequence)));
const dispatch=arranged.map((j,i)=>({dispatchOrdinal:i+1,executionSequence:j.executionSequence,parentId:j.parentId,workerId:`w0${i%2}`,observation:i<42,category:j.category,players:j.actualPlayerCount,seed:j.seed,jobSha256:hash(j)}));
const preflight=[2,3,4].map(players=>observation.find(j=>j.category==='advantage_endgame'&&j.actualPlayerCount===players).executionSequence);
write('JOBS.json',{schema:'hard-curriculum-jobs-v1',dispatchable:true,jobs:arranged});
write('DISPATCH.json',{schema:'samsung-gap-dispatch-v1',rows:dispatch,preflightSequences:preflight,observationParents:dispatch.filter(r=>r.observation)});
write('SUPPLEMENTAL_JOBS.json',{jobs:extra});
write('SEGMENT_PLAN.json',{device:'ce071717887a94940b7e',model:'SM-N9500',total:1172,originalMissing:1164,supplementalForDuplicates:8,workers:2,remoteRoot:'/data/local/tmp/aeii-hard-production-parallel-gap-samsung-20261029-v1',preflightRoot:'/data/local/tmp/aeii-hard-production-parallel-gap-samsung-20261029-preflight-v1',preflightSequences:preflight,byCategory:tally(arranged,j=>j.category),byPlayers:tally(arranged,j=>j.actualPlayerCount),byCell:queue,frozenOriginalJobsSha256:sha(fs.readFileSync(originalFile)),acceptedIndexSha256:sha(indexRaw),acceptedParents:1828,alreadySuccessfulParentsExcluded:1836,source:'apk_hard_original_mixed_phone',historicalReplay:'disabled_by_user',training:false,tensorGeneration:false,automaticAdmission:false,oldPhoneAndPcAttemptBudgetsPreserved:true,newVersionAttemptLimit:3});
write('AUTHORIZATION.json',{date:'2026-10-29',source:'用户已连接三星，明确要求将全部缺口任务下发，完成后断开电脑接充电器',device:'ce071717887a94940b7e',authorizedTotal:1172,includes1164FrozenGapsAnd8NewDuplicateSupplements:true,phoneIndependentOperation:true,computerCollectionRemainsStopped:true,historicalReplay:false,training:false,tensors:false,automaticAdmission:false,frozenSplitChanged:false});
const historyFiles=[path.join(pc,'STATE.json'),path.join(pc,'ORIGINAL_PHONE_ATTEMPT_HISTORY.json'),path.join(root,'ai_training/hard_collection_pc64_v3_20261029/INTERRUPTION_RECOVERY.json')];
write('PREVIOUS_ATTEMPT_HISTORY.json',{newVersionBudget:3,oldBudgetsNotReset:true,sources:historyFiles.map(file=>({file,sha256:sha(fs.readFileSync(file))})),parents:arranged.map(j=>({executionSequence:j.executionSequence,parentId:j.parentId,seed:j.seed,initialStateSha256:j.initialStateSha256,jobSha256:hash(j),previousPcAttempt:state.attempts[j.executionSequence]??null,supplementalLineage:j.supplementalLineage??null}))});
console.log(JSON.stringify({total:1172,original:1164,extra:8,preflight,byCategory:tally(arranged,j=>j.category),byPlayers:tally(arranged,j=>j.actualPlayerCount)}));
