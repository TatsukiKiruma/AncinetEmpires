import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./batch_mux',()=>({BatchMux:class{
 clients:any[]=[];
 constructor(_window:number,_services:number,_mode:string,readonly model?:any){}
 async forwardBatch(obs:any[]){if(obs[0]==='fail')throw Error('推理失败');return [this.model?.sha256??'default'];}
 async close(){}
}}));
import {WorkerPool} from './worker_pool';
function worker(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ae-stage8-worker-')),file=path.join(dir,'worker.mjs');
 fs.writeFileSync(file,`import {parentPort} from 'node:worker_threads';
const jobs=new Map();parentPort.on('message',m=>{
 if(m.type==='job'){jobs.set(m.id,m);parentPort.postMessage({type:'inference',id:m.id,observations:[m.fail?'fail':'ok'],model:m.role==='C1'?'C1':undefined});}
 if(m.type==='inference_result'){const j=jobs.get(m.id);parentPort.postMessage({type:'job_progress',id:m.id,event:{gameId:j.gameId,step:7}});setTimeout(()=>parentPort.postMessage({type:'job_result',id:m.id,result:{received:j,model:m.rows[0]}}),j.delay??1);}
});`);return path.relative(import.meta.dirname,file);
}
describe('真实线程池路由与派发',()=>{
 it('乱序回调按原队列索引归属，worker仅收到payload/type/id，K1独立路由',async()=>{
  const pool=new WorkerPool(4,2,2,2,'default',worker(),{prefix:'latest',sha256:'latest'},true,false,{prefix:'K1',sha256:'K1'});
  const seen:any[]=[],events:any[]=[];pool.onProgress=m=>events.push(m);
  const tasks=Array.from({length:12},(_,i)=>({gameId:`g${i}`,transportJobId:100-i,role:i%2?'C1':'candidate',delay:12-i}));
  try{await pool.run(tasks,(reply,index)=>{expect(reply.result.received.id).toBe(tasks[index].transportJobId);expect(reply.result.received.transportJobId).toBeUndefined();expect(reply.result.received.block).toBeUndefined();expect(reply.result.model).toBe(index%2?'K1':'latest');seen.push(index);});}
  finally{await pool.close();}
  expect(new Set(seen).size).toBe(12);expect(events).toHaveLength(12);
 });
 it('推理异常立即停止派发，不能冒充自然结果',async()=>{
  const pool=new WorkerPool(1,1,2,2,'default',worker(),{prefix:'K1',sha256:'K1'});let starts=0;
  try{await expect(pool.run([{gameId:'bad',fail:true},{gameId:'not-started'}],undefined,{onStart:()=>starts++})).rejects.toThrow('推理失败');}
  finally{await pool.close();}
  expect(starts).toBe(1);
 });
});
