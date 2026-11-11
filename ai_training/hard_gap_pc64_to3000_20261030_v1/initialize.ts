/** 固化本次全部补缺授权及前序进程身份，不启动对局。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {OUT,PREVIOUS,SOURCE_DIR,read,save,fileSha} from './common.mjs';
assert(!fs.existsSync(OUT),'本次必须使用全新D盘数据目录');
fs.mkdirSync(OUT,{recursive:true});
const p=read(path.join(PREVIOUS,'PROGRESS.json')),handoff=read(path.join(PREVIOUS,'HANDOFF_STATUS.json')),state=read(path.join(PREVIOUS,'STATE.json'));
save('AUTHORIZATION.json',{date:'2026-10-30',source:'用户要求追加后继全部局面，使所有数据达到3000局',targetDistinct:3000,maximumWorkers:64,primaryJobsFirst:true,fillFailuresTruncationsAndDuplicatesWithSameCellNewParents:true,noSuccessfulParentRepeated:true,oldAttemptBudgetsRetained:true,autoCloseAtTarget:true,allHighFrequencyDataOnD:true,phoneRemainsStopped:true,training:false,tensors:false,historicalReplay:false,automaticAdmission:false,frozenSplitChanged:false});
save('HANDOFF_REQUEST.json',{created:new Date().toISOString(),previous:PREVIOUS,oldDriverPid:p.pid,oldSupervisorPid:handoff.pid,currentCollectorPid:state.batches.at(-1).pid,waitForAllPreviousChildren:true,targetDistinct:3000,maximumWorkers:64,priorProgress:p,sourceDirectory:SOURCE_DIR,sourceAuthorizationSha256:fileSha(path.join(OUT,'AUTHORIZATION.json'))});
save('HANDOFF_STATUS.json',{phase:'configured',targetDistinct:3000,maximumWorkers:64,updated:new Date().toISOString()});
console.log(JSON.stringify({configured:true,target:3000,workers:64,previous:PREVIOUS,out:OUT}));
