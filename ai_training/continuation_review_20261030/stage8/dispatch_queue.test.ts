import {describe,it,expect} from 'vitest';
import {dispatchQueue,orderedJobs} from './dispatch_queue';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
describe('同代共享队列',()=>{
 it('重排不改变输入集合，编号先于过滤排序确定',()=>{
  const plans=Array.from({length:3},(_,block)=>Array.from({length:20},(_,index)=>({gameId:`${block}-${index}`,players:2+index%5,seed:block*100+index,roles:{0:'candidate'},state:{turn:index}})));
  const before=JSON.stringify(plans),queue=orderedJobs(plans);
  expect(JSON.stringify(plans)).toBe(before);expect(new Set(queue.map(t=>t.transportJobId)).size).toBe(60);
  for(const q of queue){expect(q.transportJobId).toBe(q.block*20+q.index+1);expect(q.job).toBe(plans[q.block][q.index]);}
  expect(queue.map(t=>t.job.players)).toEqual(queue.map(t=>t.job.players).sort((a,b)=>b-a));
  expect(queue.filter(t=>t.job.players===6).map(t=>t.transportJobId)).toEqual([5,10,15,20,25,30,35,40,45,50,55,60]);
 });
 it('8槽乱序结束即补位，没有跨block屏障；回调索引不变',async()=>{
  const tasks=Array.from({length:12},(_,i)=>({block:Math.floor(i/4),id:i}));
  const releases=new Map<number,()=>void>(),started:number[]=[],results:number[]=[],events:any[]=[];
  const running=dispatchQueue(tasks,8,async(t)=>{started.push(t.id);await new Promise<void>(r=>releases.set(t.id,r));return t.id;},(r,i)=>{expect(r).toBe(tasks[i].id);results.push(r);},{onStart:e=>events.push(e)});
  await tick();expect(started).toHaveLength(8);releases.get(7)!();await tick();expect(started).toContain(8);expect(results).toEqual([7]);
  releases.get(8)!();await tick();expect(started).toContain(9);
  for(let i=0;i<12;i++){releases.get(i)?.();await tick();}
  await running;expect(results).toHaveLength(12);expect(Math.max(...events.map(e=>e.active))).toBe(8);
 });
 it('STOP不再派发，已派发全部排空，返回停止状态',async()=>{
  let stop=false;const releases:(()=>void)[]=[];const started:number[]=[];
  const run=dispatchQueue([0,1,2,3],2,async n=>{started.push(n);await new Promise<void>(r=>releases.push(r));return n;},undefined,{shouldDispatch:()=>!stop});
  await tick();stop=true;releases[0]();await tick();expect(started).toEqual([0,1]);releases[1]();
  expect((await run).stopped).toBe(true);expect(started).toHaveLength(2);
 });
 it('真实失败不补位，不把未完成任务当完成',async()=>{
  let release!:()=>void;const started:number[]=[];
  const run=dispatchQueue([0,1,2],2,async n=>{started.push(n);if(n===0)throw Error('服务失败');await new Promise<void>(r=>release=r);return n;});
  const rejected=expect(run).rejects.toThrow('服务失败');await tick();release();await rejected;expect(started).toEqual([0,1]);
 });
});
