/** 核对D盘迁移原件后，按旧冻结清单接续第2—10批，不重跑首批32个父局。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {reconcile} from './audit';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {createJobState} from '../gpu/hard_jobs';
import {ROOT,OUT,SOURCE_DIR,PREVIOUS,PREVIOUS_SOURCE,read,save,fileSha,hash,tally} from './common.mjs';
assert(!fs.existsSync(OUT),'接续输出目录必须是新目录');
const migrationFile=path.join(path.dirname(PREVIOUS),'MIGRATION.json'),migration=read(migrationFile);
assert(migration.verified&&migration.historicalPathsPreserved&&migration.copiedFiles===246);
for(const f of migration.files){const file=path.join(PREVIOUS,f.relativePath);assert.equal(fs.statSync(file).size,f.bytes,f.relativePath);assert.equal(fileSha(file).toUpperCase(),f.sha256.toUpperCase(),f.relativePath);}
const oldState=read(path.join(PREVIOUS,'STATE.json')),oldFinal=read(path.join(PREVIOUS,'FINAL_REPORT.json')),oldClosed=read(path.join(PREVIOUS,'CLOSED.json')),oldPlan=read(path.join(PREVIOUS,'BATCH_PLAN.json')),allJobs=read(path.join(PREVIOUS,'JOBS_320.json')).jobs;
assert(oldClosed.allStartedCollectorProcessesExited&&oldClosed.batchesStarted===1);
assert.equal(oldState.batches.length,1);assert.equal(oldState.batches[0].number,1);assert(oldState.batches[0].audited);
assert.equal(oldState.startedParents.length,32);assert.equal(oldState.qualified.length,31);assert.equal(oldFinal.globalDistinct,1900);
assert.equal(fileSha(path.join(PREVIOUS,'MERGED_QUALIFIED_INDEX.json')),oldFinal.mergedIndexSha256);
const mapPath=(old:string)=>{if(!old)return old;const normalized=old.replaceAll('\\','/'),prefix=PREVIOUS_SOURCE.replaceAll('\\','/');return normalized===prefix?PREVIOUS:normalized.startsWith(prefix+'/')?PREVIOUS+normalized.slice(prefix.length):old;};
const normalizeRow=(row:any)=>{const result={...row};for(const key of ['localDirectory','runDirectory'])if(row[key]){const mapped=mapPath(row[key]);if(mapped!==row[key]){result.historicalLocations??={};result.historicalLocations[key]=row[key];result[key]=mapped;}}return result;};
const oldBase=read(path.join(PREVIOUS,'BASELINE_RECONCILIATION.json'));
const base=reconcile([...oldBase.rows,...oldState.qualified].map(normalizeRow));assert.equal(base.unique.length,1900);
const succeeded=new Set(base.rows.map((r:any)=>r.parentId)),firstBatch=new Set(oldState.startedParents);
const entries=oldPlan.batches.filter((b:any)=>b.number>=2&&b.number<=10);assert.equal(entries.length,9);
const inputs=entries.map((b:any)=>read(path.join(PREVIOUS,b.input))),jobs=inputs.flatMap((i:any)=>i.jobs);
assert.equal(jobs.length,288);assert.equal(hash(jobs),hash(allJobs.slice(32)));assert.equal(new Set(jobs.map((j:any)=>j.parentId)).size,288);
assert(jobs.every((j:any)=>!succeeded.has(j.parentId)&&!firstBatch.has(j.parentId)));
assert(entries.every((b:any)=>!fs.existsSync(path.join(PREVIOUS,b.directory))),'历史后继批次已有输出，须先核实');
fs.mkdirSync(OUT,{recursive:false});
save('JOBS_288.json',{schema:'hard-curriculum-jobs-v1',jobs});save('BASELINE_RECONCILIATION.json',base);save('BASELINE_INDEX.json',base.unique);
for(let i=0;i<entries.length;i++){const entry=entries[i];save(entry.input,inputs[i]);readCollectionInput(path.join(OUT,entry.input));for(const job of inputs[i].jobs)createJobState(job);}
save('BATCH_PLAN.json',{authorizedParents:288,maximumWorkers:32,maximumPrimaryBatches:9,autoStartOtherGaps:false,autoCloseAfterLastBatch:true,originalBatchRange:[2,10],batches:entries});
save('AUTHORIZATION.json',{date:'2026-10-29',source:'用户最新明确要求继续剩余288局',authorizedParents:288,workers:32,selectedJobsSha256:fileSha(path.join(OUT,'JOBS_288.json')),finishOnlyOriginalBatches2Through10:true,noRetryPreviousTruncation2159:true,oldDrainRetained:fs.existsSync(path.join(PREVIOUS,'DRAIN')),otherGapsStillRequireConfirmation:true,autoCloseAfterLastBatch:true,training:false,historicalReplay:false,tensors:false,automaticAdmission:false});
save('MIGRATION_REFERENCE.json',{oldSourceDirectory:PREVIOUS_SOURCE,oldDataDirectory:PREVIOUS,migrationManifest:migrationFile,migrationManifestSha256:fileSha(migrationFile),verifiedFiles:246,baselineInputHash:fileSha(path.join(PREVIOUS,'BASELINE_RECONCILIATION.json')),previousFinalSha256:fileSha(path.join(PREVIOUS,'FINAL_REPORT.json')),previousMergedIndexSha256:oldFinal.mergedIndexSha256,oldOriginalsNotModified:true,newRuntimePathMappingOnly:true,preservedPreviousFailures:oldState.failures});
save('PREPARATION.json',{parents:288,batches:9,workers:32,baselineDistinct:1900,previousNaturalParents:31,previousTruncatedParents:1,previous32AllExcluded:true,inputsValidated:9,initialStatesVerified:288,selectedByCategory:tally(jobs,(j:any)=>j.category),selectedByPlayers:tally(jobs,(j:any)=>j.actualPlayerCount),sourceDirectory:SOURCE_DIR,dataDirectory:OUT});
fs.mkdirSync(path.join(OUT,'source-snapshot'));
for(const name of fs.readdirSync(SOURCE_DIR).filter(n=>/\.(ts|mjs|ps1)$/.test(n)))fs.copyFileSync(path.join(SOURCE_DIR,name),path.join(OUT,'source-snapshot',name));
save('SOURCE_SNAPSHOT.json',Object.fromEntries(fs.readdirSync(path.join(OUT,'source-snapshot')).map(name=>[name,fileSha(path.join(OUT,'source-snapshot',name))])));
console.log(JSON.stringify(read(path.join(OUT,'PREPARATION.json'))));
