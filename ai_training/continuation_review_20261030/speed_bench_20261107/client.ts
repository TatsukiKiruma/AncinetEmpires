import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import {packTensorBatch} from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import {decodeResponse} from '../stage4_v7/binary_response';
export const HERE=path.resolve('ai_training/continuation_review_20261030/speed_bench_20261107');
export const DATA='D:/AncientEmpiresData/speed_bench_20261107_v1';
export class BatchClient {
 supportsValueOnly=true;child:any;queue:any[]=[];pending:any=null;buffer=Buffer.alloc(0);timer:any;failure:any=null;gpu:any[]=[];batches:number[]=[];waits:number[]=[];packMs=0;
 constructor(tier='G1',public coalesceMs=1,public maximum=256){
  this.child=spawn(path.resolve('ai_training/.venv-rocm/Scripts/python.exe'),['-B','-u',path.join(HERE,'service.py'),tier],{windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
  let stderr='';this.child.stderr.on('data',(b:Buffer)=>{stderr+=b.toString();let i;while((i=stderr.indexOf('\n'))>=0){const line=stderr.slice(0,i);stderr=stderr.slice(i+1);try{const r=JSON.parse(line);if(r.gpuMs!==undefined)this.gpu.push(r);}catch{console.error(line);}}});
  this.child.stdout.on('data',(b:Buffer)=>{this.buffer=Buffer.concat([this.buffer,b]);if(this.buffer.length<4)return;const n=this.buffer.readUInt32LE();if(this.buffer.length<n+4)return;try{const rows=decodeResponse(this.buffer.subarray(4,n+4));this.buffer=this.buffer.subarray(n+4);const p=this.pending;this.pending=null;clearTimeout(p.timeout);let offset=0;for(const q of p.items){q.resolve(rows.slice(offset,offset+q.obs.length));offset+=q.obs.length;}this.schedule();}catch(e){this.fail(e);}});
  this.child.on('error',(e:any)=>this.fail(e));this.child.on('exit',(code:number)=>{if(code!==0||this.pending||this.queue.length)this.fail(Error(`推理服务退出${code}`));});
 }
 fail(e:any){this.failure=e;if(this.pending){clearTimeout(this.pending.timeout);this.pending.items.forEach((q:any)=>q.reject(e));this.pending=null;}this.queue.splice(0).forEach(q=>q.reject(e));}
 forwardBatch(obs:any[],context?:any):Promise<any[]>{if(this.failure)return Promise.reject(this.failure);return new Promise((resolve,reject)=>{this.queue.push({obs,valueOnly:!!context?.valueOnly,resolve,reject,at:performance.now()});this.schedule();});}
 schedule(){if(this.pending||this.timer||!this.queue.length)return;this.timer=setTimeout(()=>{this.timer=null;this.flush();},this.coalesceMs);}
 flush(){if(this.pending||!this.queue.length)return;const mode=this.queue[0].valueOnly,items:any[]=[];let count=0;
  for(let i=0;i<this.queue.length;){const q=this.queue[i];if(q.valueOnly===mode&&count+q.obs.length<=this.maximum){items.push(q);count+=q.obs.length;this.queue.splice(i,1);}else i++;}
  if(!items.length){this.fail(Error('单请求大于批容量'));return;}
  const now=performance.now(),obs=items.flatMap(q=>q.obs);items.forEach(q=>this.waits.push(now-q.at));this.batches.push(count);
  const packed=packTensorBatch(obs,obs.map(()=>({target:0,policyMask:false,valueTarget:new Float32Array(6),valueMask:false,weight:1})));
  const meta=Buffer.from(JSON.stringify({...packed.metadata,sources:obs.map(()=>({})),valueOnly:mode})),header=Buffer.alloc(8);header.writeUInt32LE(meta.length);header.writeUInt32LE(packed.bytes.length,4);this.packMs+=performance.now()-now;
  this.pending={items,timeout:setTimeout(()=>{this.fail(Error('推理看门狗超时'));this.child.kill();},120000)};
  this.child.stdin.write(Buffer.concat([header,meta,packed.bytes]));
 }
 async close(){clearTimeout(this.timer);if(this.pending||this.queue.length)this.fail(Error('服务关闭'));if(this.child.exitCode!==null)return;this.child.stdin.end();const timer=setTimeout(()=>this.child.kill(),10000);await once(this.child,'exit');clearTimeout(timer);}
}
