/** 单GPU服务负责微批调度，不参与困难AI控制流。 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../hard_jobs';
type Request = { data: ArrayBuffer; memory: SharedArrayBuffer };
export class GpuBroker {
    child = spawn(path.join(ROOT,'ai_training/.venv-rocm/Scripts/python.exe'), [path.join(ROOT,'ai_training/gpu/parallel/batch_service.py'),'--target-util','50'], {windowsHide:true,stdio:['pipe','pipe','pipe']});
    queue: Request[] = []; active: Request[] = []; buffer = Buffer.alloc(0); scheduled = false; failure: Error | null = null;
    stats = {batches:0,requests:0,maxBatch:0,candidates:0,rangeRequests:0,rangeOrigins:0,gpuMs:0,serviceSeconds:0,utilSamples:0,utilSum:0,utilMax:0,utilization:[] as unknown[]};
    identity: unknown; closing=false; resolve!:()=>void; reject!:(e:Error)=>void;
    ready = new Promise<void>((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
    constructor(public batchWaitMs = 0, private onSample?: (sample:unknown)=>void) {
        const startup=setTimeout(()=>this.fail(Error('GPU初始化超时')),60000);this.ready.then(()=>clearTimeout(startup),()=>clearTimeout(startup));
        this.child.stderr.on('data', b=>process.stderr.write(b));
        this.child.on('error',e=>this.fail(e));
        this.child.on('exit',code=>{if(!this.closing||code) this.fail(Error(`GPU服务退出${code}`));});
        this.child.stdin.on('error',e=>this.fail(e));
        this.child.stdout.on('data',b=>{try {this.buffer=Buffer.concat([this.buffer,b]);this.parse();}catch(e){this.fail(e as Error);}});
    }
    fail(e:Error) {this.failure=e;this.reject(e);for(const r of [...this.active,...this.queue]) {const f=new Int32Array(r.memory,0,4);Atomics.store(f,0,-1);Atomics.notify(f,0);}this.active=[];this.queue=[];}
    enqueue(r:Request) {if(this.failure){const f=new Int32Array(r.memory,0,4);Atomics.store(f,0,-1);Atomics.notify(f,0);return;}this.queue.push(r);this.schedule();}
    schedule() {if(this.scheduled||this.active.length||!this.queue.length)return;this.scheduled=true;const run=()=>{this.scheduled=false;this.flush();};if(this.batchWaitMs)setTimeout(run,this.batchWaitMs);else setImmediate(run);}
    flush() {
        if(this.active.length||!this.queue.length||this.failure)return;
        let outputBytes=0,count=0;
        for(const r of this.queue){const bytes=new Float64Array(r.data)[0]*24;if(count&&(outputBytes+bytes>32*1024*1024||count>=128))break;outputBytes+=bytes;count++;}
        this.active=this.queue.splice(0,count);
        const parts:Buffer[]=[];const n=Buffer.alloc(4);n.writeUInt32LE(this.active.length);parts.push(n);
        for(const r of this.active){const b=Buffer.from(r.data),size=Buffer.alloc(4);size.writeUInt32LE(b.length);parts.push(size,b);}
        this.child.stdin.write(Buffer.concat(parts));
    }
    parse() {
        while(this.buffer.length>=8){const j=this.buffer.readUInt32LE(0),n=this.buffer.readUInt32LE(4);if(j+n>64*1024*1024)throw Error('GPU响应越界');if(this.buffer.length<8+j+n)return;
            const meta=JSON.parse(this.buffer.subarray(8,8+j).toString()),raw=this.buffer.subarray(8+j,8+j+n);this.buffer=this.buffer.subarray(8+j+n);
            if(meta.error)throw Error(meta.error);
            if(meta.ready){this.identity=meta;this.resolve();continue;}
            if(meta.counts?.length!==this.active.length||n!==meta.counts.reduce((s:number,v:number)=>s+v*24,0))throw Error('批量GPU响应布局不一致');
            if(this.active.some((r,i)=>meta.counts[i]!==new Float64Array(r.data)[0]))throw Error('批量GPU请求与响应候选数不一致');
            let offset=0;
            for(let i=0;i<this.active.length;i++){const r=this.active[i],bytes=meta.counts[i]*24;if(bytes>r.memory.byteLength-16)throw Error('共享缓冲区不足');Buffer.from(r.memory,16,bytes).set(raw.subarray(offset,offset+bytes));offset+=bytes;const f=new Int32Array(r.memory,0,4);Atomics.store(f,0,1);Atomics.notify(f,0);}
            this.stats.batches++;this.stats.requests+=this.active.length;this.stats.maxBatch=Math.max(this.stats.maxBatch,this.active.length);this.stats.gpuMs+=meta.gpuMs;this.stats.serviceSeconds+=meta.serviceSeconds;
            for(const r of this.active){const d=new Float64Array(r.data);if(d[1]===-1){this.stats.rangeRequests++;this.stats.rangeOrigins++;}else this.stats.candidates+=d[0];}
            if(!this.stats.utilization.length||meta.utilization?.epoch!== (this.stats.utilization.at(-1) as any)?.epoch){
                const sample={...meta.utilization,throttleMs:meta.throttleMs};delete sample.engines;
                this.onSample?.(sample);
                this.stats.utilization.push(sample);if(this.stats.utilization.length>60)this.stats.utilization.shift();
                if(sample.available){this.stats.utilSamples++;this.stats.utilSum+=sample.processMaxEnginePercent;this.stats.utilMax=Math.max(this.stats.utilMax,sample.processMaxEnginePercent);}
            }
            this.active=[];this.schedule();
        }
    }
    close(){this.closing=true;this.child.stdin.end(Buffer.alloc(4));}
}
