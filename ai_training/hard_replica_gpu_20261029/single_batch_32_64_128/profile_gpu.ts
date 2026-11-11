/** 正式批次全部退出后，独立采样当前GPU采集路径的CPU调用栈。 */
import {Worker} from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GpuBroker} from '../../gpu/parallel/broker';
import {readJobs} from '../../gpu/hard_jobs';
const directory=path.dirname(fileURLToPath(import.meta.url));
const stop=new SharedArrayBuffer(4),broker=new GpuBroker(),pool:Worker[]=[];
const jobs=readJobs().slice(0,21),results:unknown[]=[];
const begin=performance.now(),cpuBegin=process.cpuUsage();
try{
    await broker.ready;
    await Promise.all(Array.from({length:4},(_,index)=>new Promise<void>((resolve,reject)=>{
        const memory=new SharedArrayBuffer(16*1024*1024);
        const worker=new Worker(new URL('./profile-worker.mjs',import.meta.url),{workerData:{memory,stop,backend:'gpu',gpuRange:true,profileFile:path.join(directory,`gpu-worker-${index}.cpuprofile`)}});pool.push(worker);
        const dispatch=()=>{const job=jobs.shift();if(job){const output=path.join(directory,'..','bench-cpu-profile',`parent-${job.executionSequence}`);fs.mkdirSync(output,{recursive:true});worker.postMessage({job,directory:output,attempt:1,maxActions:50,verify:false,probe:false});}else worker.postMessage({type:'profile-stop'});};
        worker.on('error',reject);
        worker.on('message',message=>{
            if(message.type==='score')broker.enqueue({data:message.data,memory});
            else if(message.type==='ready')dispatch();
            else if(message.type==='result'){if(message.result.error){reject(Error(message.result.error));return;}results.push(message.result);dispatch();}
            else if(message.type==='profile-saved')resolve();
        });
    })));
    fs.writeFileSync(path.join(directory,'CPU_GPU_PROFILE_RUN.json'),JSON.stringify({purpose:'当前GPU路径CPU热点调查，独立于单批性能计时',games:results.length,wallSeconds:(performance.now()-begin)/1000,nodeCpu:process.cpuUsage(cpuBegin),gpu:broker.stats,results},null,2));
}finally{Atomics.store(new Int32Array(stop),0,1);await Promise.all(pool.map(w=>w.terminate()));broker.close();}
