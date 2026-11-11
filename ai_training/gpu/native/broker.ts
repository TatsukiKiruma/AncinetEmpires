/** 原生HIP微批调度：直接传递数值数组，复用固定页与GPU缓冲区。 */
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,fileSha} from '../hard_jobs';
import {native,sdkInclude} from './binding';
import {nextGpuThrottleDelay} from './throttle';
type Request={data:ArrayBuffer;memory:SharedArrayBuffer};
export class NativeBroker {
    queue:Request[]=[];active:Request[]=[];scheduled=false;failure:Error|null=null;closing=false;
    stats={batches:0,requests:0,maxBatch:0,candidates:0,rangeRequests:0,rangeOrigins:0,fieldRequests:0,fieldCells:0,gpuMs:0,serviceSeconds:0,gpuCpuSeconds:0,utilSamples:0,utilSum:0,utilMax:0,throttleMs:0,schedulerTimeoutBatches:0,schedulerImmediateBatches:0,utilization:[] as any[]};
    identity:unknown;ready:Promise<void>;current:Promise<void>|null=null;timer:ReturnType<typeof setInterval>;delay=0;
    constructor(public batchWaitMs=0,private onSample?:(sample:unknown)=>void){
        const kernel=path.join(ROOT,'ai_training/gpu/native/build/kernel.hip');
        const device=native.initializeHip(fs.readFileSync(kernel,'utf8'),sdkInclude);
        this.stats.gpuCpuSeconds=device.initializationCpuSeconds;
        this.identity={ready:true,pid:process.pid,...device,kernelSha256:fileSha(kernel),binarySha256:fileSha(path.join(ROOT,'ai_training/gpu/native/build/hard_native.node')),targetUtilPercent:50,backend:'node-api-cpp-hip-batched-fp64',eventMode:'default-active'};
        native.sampleGpu();this.timer=setInterval(()=>this.sample(),1000);this.ready=Promise.resolve();
    }
    sample(){const sample={...native.sampleGpu(),throttleMs:this.delay};this.onSample?.(sample);this.stats.utilization.push(sample);if(this.stats.utilization.length>60)this.stats.utilization.shift();if(sample.available){this.stats.utilSamples++;this.stats.utilSum+=sample.processMaxEnginePercent;this.stats.utilMax=Math.max(this.stats.utilMax,sample.processMaxEnginePercent);this.delay=nextGpuThrottleDelay(this.delay,sample.processMaxEnginePercent);}}
    fail(e:Error){this.failure=e;for(const r of [...this.active,...this.queue]){const flag=new Int32Array(r.memory,0,4);Atomics.store(flag,0,-1);Atomics.notify(flag,0);}this.queue=[];this.active=[];}
    enqueue(r:Request){if(this.failure){const flag=new Int32Array(r.memory,0,4);Atomics.store(flag,0,-1);Atomics.notify(flag,0);return;}this.queue.push(r);this.schedule();}
    schedule(){if(this.scheduled||this.active.length||!this.queue.length||this.closing)return;this.scheduled=true;const run=()=>{this.scheduled=false;this.current=this.flush();};const wait=this.batchWaitMs+this.delay;if(wait){this.stats.schedulerTimeoutBatches++;setTimeout(run,wait);}else{this.stats.schedulerImmediateBatches++;setImmediate(run);}}
    async flush(){if(this.active.length||!this.queue.length||this.failure||this.closing)return;let bytes=0,count=0;for(const r of this.queue){const b=new Float64Array(r.data)[0]*24;if(count&&(bytes+b>32*1024**2||count>=128))break;bytes+=b;count++;}this.active=this.queue.splice(0,count);
        try{const inputs=this.active.map(r=>new Float64Array(r.data)),result=await native.calculateBatch(inputs);if(result.counts.length!==this.active.length||result.output.length!==result.counts.reduce((s,v)=>s+v*3,0)||result.counts.some((n,i)=>n!==inputs[i][0]))throw Error('原生批次输出布局不同');
            let offset=0;for(let i=0;i<this.active.length;i++){const r=this.active[i],n=result.counts[i]*3;if(n*8>r.memory.byteLength-16)throw Error('原生响应超过共享缓冲');new Float64Array(r.memory,16,n).set(result.output.subarray(offset,offset+n));offset+=n;const flag=new Int32Array(r.memory,0,4);Atomics.store(flag,0,1);Atomics.notify(flag,0);}
            this.stats.batches++;this.stats.requests+=inputs.length;this.stats.maxBatch=Math.max(this.stats.maxBatch,inputs.length);this.stats.gpuMs+=result.gpuMs;this.stats.serviceSeconds+=result.serviceSeconds;this.stats.gpuCpuSeconds+=result.gpuCpuSeconds;this.stats.throttleMs+=this.delay;
            for(const d of inputs){if(d[1]===-1){this.stats.rangeRequests++;this.stats.rangeOrigins++;}else if(d[1]===-2){this.stats.fieldRequests++;this.stats.fieldCells+=d[0];}else this.stats.candidates+=d[0];}this.active=[];this.schedule();
        }catch(e){this.fail(e as Error);}
    }
    async close(){this.closing=true;clearInterval(this.timer);await this.current;native.closeMonitor();native.closeHip();}
}
