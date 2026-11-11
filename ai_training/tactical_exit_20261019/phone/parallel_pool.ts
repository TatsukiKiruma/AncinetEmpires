import { GameEngine } from '../../../src/game/engine';
import { borrowedEngine } from './borrowed_engine';
import type { Action } from '../../../src/game/types';
import type { Evaluation } from '../model_battle_search_ai';

const WORKERS=4;
interface Lane {worker:Worker;pending:Map<number,{resolve:(value:any)=>void;reject:(reason:any)=>void}>;}
let lanes:Lane[]|undefined,sequence=0,modelSequence=0;
const models=new WeakMap<object,Promise<number>>();
export const PARALLEL_AUDIT={workers:WORKERS,featureJobs:0,candidateJobs:0,evaluatedCandidates:0,concurrentGames:1};

function pool(){
    if(lanes)return lanes;
    const url=(globalThis as any).stage5PhoneWorkerUrl??('/runtime-worker.js'+location.search);
    lanes=Array.from({length:WORKERS},()=>{
        const worker=new Worker(url),lane:Lane={worker,pending:new Map()};
        worker.onmessage=event=>{
            const {id,value,error}=event.data,request=lane.pending.get(id);
            if(!request)return;
            lane.pending.delete(id);
            if(error)request.reject(Error(error));else request.resolve(value);
        };
        worker.onerror=event=>{for(const request of lane.pending.values())request.reject(Error(event.message));lane.pending.clear();};
        return lane;
    });
    return lanes;
}
function request(index:number,payload:any){
    const lane=pool()[index],id=++sequence;
    return new Promise<any>((resolve,reject)=>{lane.pending.set(id,{resolve,reject});lane.worker.postMessage({id,...payload});});
}
async function modelIdentity(model:object,old:any){
    let prior=models.get(model);
    if(!prior){const key=++modelSequence;prior=Promise.all(pool().map((_,index)=>request(index,{kind:'model',key,model,old}))).then(()=>key);models.set(model,prior);}
    return prior;
}

/** 只拆分原候选列表，逐项按原索引拼回；不裁剪候选或保存最终特征结果。 */
export async function parallelFeatures(engine:GameEngine,actions:readonly Action[]){
    const state=engine.getState(),parts=Array.from({length:WORKERS},()=>[] as {index:number;action:Action}[]);
    actions.forEach((action,index)=>parts[index%WORKERS].push({index,action}));
    const old:number[][]=Array(actions.length),extra:number[][]=Array(actions.length),focus:number[][]=Array(actions.length);
    const stats={candidates:actions.length,stepMs:0,followupMs:0,threatMs:0,pathMs:0,exhaustiveFallbacks:0};
    await Promise.all(parts.map(async(part,index)=>{
        if(!part.length)return;
        PARALLEL_AUDIT.featureJobs++;
        const result=await request(index,{kind:'features',state,actions:part.map(item=>item.action)});
        part.forEach((item,offset)=>{old[item.index]=result.old[offset];extra[item.index]=result.extra[offset];focus[item.index]=result.focus[offset];});
        for(const key of ['stepMs','followupMs','threatMs','pathMs','exhaustiveFallbacks'] as const)stats[key]+=result.stats[key];
    }));
    return {old,extra,focus,stats};
}

/** 每个根仍完整执行同一权威评估；首选通过原早退条件后才分发其余根。 */
export async function parallelEvaluations(engine:GameEngine,player:number,items:{action:Action;index:number}[],model:object,old:any,options:any){
    const key=await modelIdentity(model,old),state=engine.getState(),parts=Array.from({length:WORKERS},()=>[] as typeof items);
    items.forEach((item,index)=>parts[index%WORKERS].push(item));
    const results=new Map<number,Evaluation>();
    await Promise.all(parts.map(async(part,index)=>{
        if(!part.length)return;
        PARALLEL_AUDIT.candidateJobs++;PARALLEL_AUDIT.evaluatedCandidates+=part.length;
        const values=await request(index,{kind:'candidates',state,player,items:part,key,options});
        for(const value of values){
            // 后续保护检查按需重建同一真实叶子，不传输引擎私有缓存。
            let branch:GameEngine|undefined;
            Object.defineProperty(value,'branch',{enumerable:false,get:()=>branch??=borrowedEngine(new GameEngine(value.state))});
            results.set(value.index,value);
        }
    }));
    return results;
}

export function closeParallelWorkers(){if(lanes)for(const lane of lanes)lane.worker.terminate();lanes=undefined;}
