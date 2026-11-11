/** 派生限定224局的64并发驱动，最后不足64时按实际数量收尾。 */
import fs from 'node:fs';
import path from 'node:path';
import {SOURCE_DIR,PREVIOUS_SOURCE} from './common.mjs';
fs.copyFileSync(path.join(PREVIOUS_SOURCE,'audit.ts'),path.join(SOURCE_DIR,'audit.ts'),fs.constants.COPYFILE_EXCL);
let source=fs.readFileSync(path.join(PREVIOUS_SOURCE,'drive.ts'),'utf8');
const loop="for(let i=0;i<9;i++){const input=read(path.join(OUT,plan.batches[i].input));assert.equal(input.jobs.length,32);assert.equal(hash(input.jobs),hash(jobs.slice(i*32,(i+1)*32)));}";
if(!source.includes(loop))throw Error('旧驱动分批身份锚点改变');
source=source.replace(loop,"let inputOffset=0;for(const entry of plan.batches){const input=read(path.join(OUT,entry.input));assert.equal(input.jobs.length,entry.workers);assert.equal(hash(input.jobs),hash(jobs.slice(inputOffset,inputOffset+input.jobs.length)));inputOffset+=input.jobs.length;}assert.equal(inputOffset,224);");
for(const [before,after] of [
 ['固定288父局、九批32并发','固定224父局、最高64并发，末批按实际32局'],
 ['JOBS_288.json','JOBS_224.json'],
 ['assert.equal(plan.authorizedParents,288)','assert.equal(plan.authorizedParents,224)'],
 ['assert.equal(plan.maximumWorkers,32)','assert.equal(plan.maximumWorkers,64)'],
 ['assert.equal(plan.batches.length,9)','assert.equal(plan.batches.length,4)'],
 ['assert.equal(jobs.length,288)','assert.equal(jobs.length,224)'],
 ['assert.equal(allowed.size,288)','assert.equal(allowed.size,224)'],
 ['authorizedParents:288','authorizedParents:224'],
 ['maximumWorkers:32','maximumWorkers:64'],
 ['primaryBatchLimit:9','primaryBatchLimit:4'],
 ['remainingAuthorizedParents:288-','remainingAuthorizedParents:224-'],
 ["assert(state.batches.length<9,'禁止第10个接续批次')","assert(state.batches.length<4,'禁止第5个后继批次')"],
 ["'--workers','32','--limit','32'","'--workers',String(input.jobs.length),'--limit',String(input.jobs.length)"],
 ['workers:32','workers:64'],
 ['state.batches.length===9','state.batches.length===4'],
 ['state.qualified.length===288','state.qualified.length===224'],
 ['state.batches.length<=9','state.batches.length<=4'],
 ['new Set(state.startedParents).size<=288','new Set(state.startedParents).size<=224'],
 ['selected288Qualified','selected224Qualified'],
]){if(!source.includes(before))throw Error('64并发驱动锚点改变：'+before);source=source.replaceAll(before,after);}
fs.writeFileSync(path.join(SOURCE_DIR,'drive.ts'),source,{flag:'wx'});
console.log(JSON.stringify({parents:224,batches:4,workers:[64,64,64,32]}));
