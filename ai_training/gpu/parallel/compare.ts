/** 只对照独立运行的最终结果身份，不执行历史动作。 */
import fs from 'node:fs';
import path from 'node:path';
import {hash,fileSha} from '../hard_jobs';
const dirs=process.argv.slice(2);
if(dirs.length<2)throw Error('需要至少两个独立基准目录');
const runs=dirs.map(dir=>({dir,run:JSON.parse(fs.readFileSync(path.join(dir,'RUN.json'),'utf8')),progress:JSON.parse(fs.readFileSync(path.join(dir,'PROGRESS.json'),'utf8')),results:JSON.parse(fs.readFileSync(path.join(dir,'RESULTS.json'),'utf8')) as any[]}));
const key=(r:any)=>hash({sequence:r.executionSequence,steps:r.steps,stop:r.stop,winner:r.winner,finalSha256:r.finalSha256,telemetry:r.telemetry});
const baseline=new Map(runs[0].results.map(r=>[r.executionSequence,key(r)]));
for(const r of runs){if(r.progress.phase!=='complete')throw Error(`基准未完成：${r.dir}`);if(r.results.length!==baseline.size||r.results.some(x=>baseline.get(x.executionSequence)!==key(x)))throw Error(`独立运行的决策结果身份不同：${r.dir}`);}
const traces=runs.map(run=>run.results.map(r=>{const p=path.join(run.dir,`parent-${r.executionSequence}/attempt-${r.attempt}/decisions.jsonl.gz`);return [r.executionSequence,fs.existsSync(p)?fileSha(p):null] as const;}).sort((a,b)=>a[0]-b[0]));
const trajectoryParity=traces.every(t=>hash(t)===hash(traces[0]))&&traces.every(t=>t.every(([,sha])=>sha!==null));
if(!trajectoryParity&&!runs.every(r=>r.run.probe))throw Error('独立新采集的逐步记录字节身份不同；仅比较文件，不执行重放');
console.error(JSON.stringify({trajectoryParity,traceFilesPerRun:traces[0].length}));
console.log(JSON.stringify({resultParity:true,comparison:'独立新对局的步数、终态SHA、胜负、停止原因及AI回退计数；不执行重放',runs:runs.map(r=>{const gpu=r.progress.gpu,samples=gpu?.utilization?.filter((s:any)=>s.available)??[];return {directory:r.dir,backend:r.run.backend,workers:r.run.workers,jobs:r.results.length,natural:r.results.filter(x=>x.natural).length,steps:r.results.reduce((n,x)=>n+x.steps,0),measuredSeconds:r.progress.measuredSeconds,wallSeconds:r.progress.wallSeconds,gpuRequests:gpu?.requests,gpuBatches:gpu?.batches,maxBatch:gpu?.maxBatch,meanBatch:gpu?gpu.requests/gpu.batches:null,gpuMeanUtil:gpu?.utilSamples?gpu.utilSum/gpu.utilSamples:samples.length?samples.reduce((n:number,s:any)=>n+s.processMaxEnginePercent,0)/samples.length:null,gpuMaxUtil:gpu?.utilMax??(samples.length?Math.max(...samples.map((s:any)=>s.processMaxEnginePercent)):null)};})},null,2));
