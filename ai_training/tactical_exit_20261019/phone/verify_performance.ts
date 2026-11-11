import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { optimizationPlugin } from './encoding_optimization';
import { performancePlugin } from './performance_optimization';
import { borrowedPlugin } from './borrowed_optimization';
import { cowPlugin } from './cow_optimization';
import { movementPlugin } from './movement_optimization';
import { parallelPlugin } from './parallel_optimization';
import { kernelPlugin } from './kernel_optimization';

const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(here,'../..');
const borrowed=process.argv.includes('--borrowed'),cow=process.argv.includes('--cow'),advanced=process.argv.includes('--advanced-cow'),movement=process.argv.includes('--stable-movement');
const readonlyLegal=process.argv.includes('--readonly-legal');
const parallel=process.argv.includes('--workers');
const kernels=process.argv.includes('--zero-kernels');
const lane=Number(process.argv[2]??0),limit=Number(process.argv[3]??0),target=path.join(here,'revisions/xiaomi_20261020',`performance-${kernels?'v12-kernels':parallel?'v11b-workers':readonlyLegal?'v10':movement?'v9':advanced?'v8':cow?'v7':borrowed?'v6':'v5'}-parity-${lane}-${Date.now()}`);fs.mkdirSync(target);
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const digest=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rows=(name:string)=>gunzipSync(fs.readFileSync(path.join(here,'search-scale',name))).toString().trim().split('\n').map(line=>JSON.parse(line));
const roots=rows(`roots-${lane}.jsonl.gz`),frozen=rows(`teacher-r24-${lane}.jsonl.gz`),witness=rows(`teacher-r24-witness-${lane}.jsonl.gz`);
assert.equal(roots.length,frozen.length);assert.equal(roots.length,witness.length);
const receipt=read(path.join(here,`search-scale/teacher-r24-${lane}.receipt.json`));
for(const [name,expected] of Object.entries(receipt.outputs))assert.equal(digest(path.join(here,'search-scale',name)),expected);
const output=path.join(target,'optimized.mjs');
await build({entryPoints:[path.join(here,'phone/performance_parity_entry.ts')],bundle:true,platform:'node',format:'esm',outfile:output,plugins:[...(kernels?[kernelPlugin(target)]:[]),...(parallel?[parallelPlugin(repo,target)]:[]),...(movement?[movementPlugin(repo,target)]:[]),optimizationPlugin(repo,target,advanced),...(!borrowed?[performancePlugin(repo,target)]:advanced?[performancePlugin(repo,target,false)]:[]),...(borrowed?[borrowedPlugin(repo,target,true,parallel)]:[]),...(cow?[cowPlugin(repo,target,advanced,readonlyLegal)]:[])]});
let workerShim:any,workerSha256:string|undefined;
if(parallel){
    const assets=path.join(here,'revisions/xiaomi_20261020',kernels?'phone-r24-v12-kernels':'phone-r24-v11b-workers'),worker=path.join(assets,'runtime-worker.js');
    workerSha256=digest(worker);assert.equal(workerSha256,read(path.join(assets,'ASSETS.json')).workerBundleSha256);
    const shim=await import(pathToFileURL(path.join(here,'phone/node_worker_shim.mjs')).href);workerShim=shim.nodeWorkerShim(worker);
    (globalThis as any).Worker=workerShim.Worker;(globalThis as any).stage5PhoneWorkerUrl='冻结Worker本机验证';
}
const optimized=await import(pathToFileURL(output).href),model=read(path.join(here,'teacher-model.json')),old=read(path.join(here,'old-schema.json'));
let count=0,candidates=0;const audit:Record<string,number>={};
try{for(const [index,item] of roots.entries()){
    if(limit&&index>=limit)break;
    const actual=JSON.parse(JSON.stringify(await optimized.collect(item.state,model,old))),expected=frozen[index];
    for(const key of ['inputHash','preferred','rankingMode','candidates'])assert.deepEqual(actual[key],expected[key],item.id+'/'+key);
    assert.deepEqual(actual.search,witness[index].search,item.id+'/全部搜索元数据');
    assert.deepEqual(actual.audit,witness[index].audit,item.id+'/风险见证审计');assert.equal(actual.afterHash,item.stateHash);
    for(const [key,value] of Object.entries(actual.audit))audit[key]=(audit[key]??0)+(value as number);
    count++;candidates+=actual.candidates.length;
    if(count%10===0){fs.writeFileSync(path.join(target,'live.json'),JSON.stringify({roots:count,total:roots.length}));console.log(JSON.stringify({lane,roots:count,total:roots.length}));}
}}finally{if(workerShim)await workerShim.close();}
const result={passed:true,lane,roots:count,candidates,audit,comparedToFrozenR24:true,allInputCandidatesPlansAndRisksByteExact:true,modelSha256:digest(path.join(here,'teacher-model.json')),limitedPilot:limit>0,proposalCacheAudit:(globalThis as any).__stage5ProposalAudit??null,gamesStarted:0,bundleSha256:digest(output),workerSha256};
fs.writeFileSync(path.join(target,'PARITY.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({output:target,...result}));
