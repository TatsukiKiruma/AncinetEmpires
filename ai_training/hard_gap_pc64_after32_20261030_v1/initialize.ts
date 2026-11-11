/** 固定当前批次边界和后继身份，先发排空再安装独立接续。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {OUT,PREVIOUS,PREVIOUS_SOURCE,read,save,fileSha} from './common.mjs';
assert(!fs.existsSync(OUT),'后继输出目录已存在');
const state=read(path.join(PREVIOUS,'STATE.json')),identity=read(path.join(PREVIOUS,'RUN_IDENTITY.json')),current=state.batches.at(-1);
assert.equal(identity.driverSha256,fileSha(path.join(PREVIOUS_SOURCE,'drive.ts')));
assert.deepEqual(state.batches.map((b:any)=>b.number),[2,3]);assert.equal(current.number,3);
assert(fs.existsSync(path.join(PREVIOUS,'DRAIN')));
fs.mkdirSync(OUT,{recursive:false});
save('HANDOFF_REQUEST.json',{created:new Date().toISOString(),source:'用户要求后继追加到64并发',oldDataDirectory:PREVIOUS,oldDriverPid:read(path.join(PREVIOUS,'PROGRESS.json')).pid,currentBatchNumber:3,currentCollectorPid:current.pid,expectedAlreadyStartedBatches:[2,3],remainingOriginalBatches:[4,5,6,7,8,9,10],remainingParents:224,maximumWorkers:64,expectedNewBatchSizes:[64,64,64,32],original288ScopeUnchanged:true,waitForOldCollectorAndDriverExit:true,oldDrainRetained:true,oldBatchPlanSha256:fileSha(path.join(PREVIOUS,'BATCH_PLAN.json')),oldJobsSha256:fileSha(path.join(PREVIOUS,'JOBS_288.json'))});
save('HANDOFF_STATUS.json',{phase:'configured_waiting_for_current32',created:new Date().toISOString(),remainingParents:224,maximumWorkers:64});
console.log(JSON.stringify(read(path.join(OUT,'HANDOFF_REQUEST.json'))));
