import {parentPort,workerData} from 'node:worker_threads';
import {GameEngine} from '../../../src/game/engine';
import {encodeAction,mulberry32} from '../../../src/game/env';
import {getAllianceId} from '../../../src/game/rule_config';
import {OriginalApkLikeHardAI} from '../../../src/game/ai/original_apk_like_hard_ai';
import {encodeDualObservation} from '../../../src/ai_runtime/dual_v2/encoder';
import {ReachabilityContext} from '../../../src/ai_runtime/dual_v2/reachability';
import {tacticalPriorBundle} from '../../../src/ai_runtime/dual_v3/search_policy';
import {BatchedNeuralBeamSearchAI} from './sandbox_search';
import {config} from './search_bench';
let sequence=0;const pending=new Map<number,any>();
parentPort!.on('message',(m:any)=>{if(m.type==='result'){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.rows);}});
const model={supportsValueOnly:true,forwardBatch:(obs:any[],context?:any):Promise<any[]>=>new Promise((resolve,reject)=>{const id=sequence++;pending.set(id,{resolve,reject});parentPort!.postMessage({type:'infer',id,obs,valueOnly:context?.valueOnly});})};
async function game(task:any){
 const engine=new GameEngine(task.state,{applyInitialTurnStart:false}),ids=task.state.players.filter((p:any)=>p.isAlive).map((p:any)=>p.id).sort((a:number,b:number)=>a-b),rng=mulberry32(task.seed);
 const ai=new Map(ids.map((id:number)=>[id,new BatchedNeuralBeamSearchAI(model,config(task.mode))]));
 const hard=new Map(ids.map((id:number)=>[id,new OriginalApkLikeHardAI({rng:mulberry32(task.seed+31+id*10007)})]));
 const started=performance.now(),eliminations:any[]=[];let steps=0,teachers=0,slow=0,fast=0,substantive=0;
 let trace:any[]=[];
 while(!engine.isTerminal()){
  const state=engine.getState();if(!task.tactical&&state.turn-task.state.turn>=35)break;
  const legal=engine.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender');let action:any,teacher:any=null;
  if(task.tactical&&state.currentPlayer!==task.modelPlayer)action=hard.get(state.currentPlayer)!.getAction(engine,state.currentPlayer);
  else if(legal.length===1)action=legal[0];
  else{
   substantive++;
   if(task.mixed&&rng()>=.25){
    fast++;const context=new ReachabilityContext(state),observation=encodeDualObservation(state,legal,context),[out]=await model.forwardBatch([observation]);
    const {priors,forbidden}=tacticalPriorBundle(state,legal,context,true);
    const scores=Array.from(observation.actions.sourceIndices).map((source:number,i:number)=>({source,score:out.logits[i]+priors[source],forbidden:!!forbidden?.[source]})).filter(r=>!r.forbidden);
    const maximum=Math.max(...scores.map(r=>r.score));const weights=scores.map(r=>Math.exp((r.score-maximum)/1));let draw=rng()*weights.reduce((a,b)=>a+b,0);let index=0;while(index<weights.length-1&&(draw-=weights[index])>0)index++;action=legal[scores[index].source];
   }else{
    slow++;const strategy=ai.get(state.currentPlayer)!;action=await strategy.getAction(engine,state.currentPlayer);const t=strategy.telemetry.teacher;
    if(t?.available&&t.evaluatedMask.filter((v:boolean,i:number)=>v&&!t.vetoMask[i]).length>=2){teachers++;teacher=t;}
   }
  }
  if(!engine.hasLegalAction(state.currentPlayer,action))throw Error('实战动作非法');
  const result=engine.step(action);if(result.info.includes('非法动作'))throw Error('引擎拒绝动作');
  const newly=state.players.filter(p=>p.isAlive&&!result.state.players.find(q=>q.id===p.id)?.isAlive);
  if(newly.length)eliminations.push({step:steps,turn:state.turn,ids:newly.map(p=>p.id)});
  trace.push({step:steps,player:state.currentPlayer,turn:state.turn,action,teacher});
  steps++;if(steps%100===0){parentPort!.postMessage({type:'trace',id:task.id,rows:trace});trace=[];parentPort!.postMessage({type:'progress',id:task.id,steps,rounds:result.state.turn-task.state.turn});}
 }
 const final=engine.getState(),natural=engine.isTerminal();
 if(trace.length)parentPort!.postMessage({type:'trace',id:task.id,rows:trace});
 const result={id:task.id,players:ids.length,steps,rounds:final.turn-task.state.turn,natural,winner:natural?final.winner:null,classification:natural?'natural':'round_truncation',won:task.tactical&&natural?final.winner===getAllianceId(final,task.modelPlayer):null,wallMs:performance.now()-started,validTeachers:teachers,slow,fast,substantive,eliminations,seed:task.seed,mode:task.mode};
 parentPort!.postMessage({type:'game',result});return result;
}
try{await Promise.all(workerData.tasks.map(game));parentPort!.postMessage({type:'done'});}catch(e){parentPort!.postMessage({type:'error',error:String(e)});}finally{parentPort!.close();}
