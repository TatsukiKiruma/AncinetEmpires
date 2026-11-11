/** 从保留的源码派生仅288局驱动；不改旧DRAIN、旧源码或历史账本。 */
import fs from 'node:fs';
import path from 'node:path';
import {SOURCE_DIR,PREVIOUS_SOURCE} from './common.mjs';
fs.copyFileSync(path.join(PREVIOUS_SOURCE,'audit.ts'),path.join(SOURCE_DIR,'audit.ts'),fs.constants.COPYFILE_EXCL);
let source=fs.readFileSync(path.join(PREVIOUS_SOURCE,'drive.ts'),'utf8');
for(const [before,after] of [
 ['固定320父局、十批32并发','固定288父局、九批32并发'],
 ['JOBS_320.json','JOBS_288.json'],
 ['assert.equal(plan.authorizedParents,320)','assert.equal(plan.authorizedParents,288)'],
 ['assert.equal(plan.batches.length,10)','assert.equal(plan.batches.length,9)'],
 ['assert.equal(jobs.length,320)','assert.equal(jobs.length,288)'],
 ['assert.equal(allowed.size,320)','assert.equal(allowed.size,288)'],
 ['for(let i=0;i<10;i++)','for(let i=0;i<9;i++)'],
 ['authorizedParents:320','authorizedParents:288'],
 ['primaryBatchLimit:10','primaryBatchLimit:9'],
 ['remainingAuthorizedParents:320-','remainingAuthorizedParents:288-'],
 ["assert(state.batches.length<10,'禁止第11批')","assert(state.batches.length<9,'禁止第10个接续批次')"],
 ["fileSha(path.join(OUT,'audit.ts'))","fileSha(path.join(path.dirname(import.meta.filename),'audit.ts'))"],
 ['state.batches.length===10','state.batches.length===9'],
 ['state.qualified.length===320','state.qualified.length===288'],
 ['state.batches.length<=10','state.batches.length<=9'],
 ['new Set(state.startedParents).size<=320','new Set(state.startedParents).size<=288'],
 ['selected320Qualified','selected288Qualified'],
]){if(!source.includes(before))throw Error('接续驱动锚点改变：'+before);source=source.replaceAll(before,after);}
fs.writeFileSync(path.join(SOURCE_DIR,'drive.ts'),source,{flag:'wx'});
console.log(JSON.stringify({sourceDirectory:SOURCE_DIR,maximumParents:288,batches:9,workers:32}));
