import fs from 'node:fs';
import path from 'node:path';
import {GameEngine} from '../../../src/game/engine';
import {encodeAction} from '../../../src/game/env';
import {encodeDualObservation} from '../../../src/ai_runtime/dual_v2/encoder';
import {BatchedNeuralBeamSearchAI} from './sandbox_search';
import {BatchClient,HERE,DATA} from './client';
const base=JSON.parse(fs.readFileSync(path.join(HERE,'../stage6/config-C1.json'),'utf8'));
export function config(mode:string,auditHash=false){return {...base,benchMode:mode,auditHash,budgetMs:3600000,maxNodes:2500,...(mode==='S2'?{finalists:4,rootCandidates:6,twoPlayerResponseVariants:1,responseActors:2,maxNodes:900}:{}),...(mode==='S3'||mode==='S4'?{finalists:8}:{} )};}
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
export function summarize(rows:any[]){return Object.fromEntries(['all',2,3,4].map(group=>{const a=rows.filter(r=>group==='all'||r.players===group);return [group,{count:a.length,meanRootMs:mean(a.map(r=>r.t.rootMs)),...Object.fromEntries(['encodeMs','priorMs','networkMs','keyHashMs','networkCalls','observations'].map(k=>[k,mean(a.map(r=>r.t[k]??0))])),meanBatchSize:a.reduce((s,r)=>s+r.t.observations,0)/Math.max(1,a.reduce((s,r)=>s+r.t.networkCalls,0)),responseCompleteRate:mean(a.map(r=>r.t.responseComplete/Math.max(1,r.t.responseComplete+r.t.responseTruncated)))}];}));}
async function run(){
 const roots=JSON.parse(fs.readFileSync(path.join(DATA,'roots.json'),'utf8')),results:any={status:'running',rows:[],groups:{},sealedAccess:0};
 if(process.argv.includes('--resume')){const old=JSON.parse(fs.readFileSync(path.join(DATA,'search-raw.json'),'utf8'));fs.writeFileSync(path.join(DATA,'search-pre-resume.json'),JSON.stringify(old));results.rows=old.rows.filter((r:any)=>['S0','S1'].includes(r.mode)&&r.index!==0);}
 const gpu=JSON.parse(fs.readFileSync(path.join(HERE,'GPU_KERNEL_BENCH.json'),'utf8'));if(gpu.status!=='complete')throw Error('GPU基准尚未完成');
 for(const mode of ['S0','S1','S2','S3','S4']){
  const client=new BatchClient(mode==='S0'?'G0':gpu.selected,0);
  try{const warmEngine=new GameEngine(roots[0].state,{applyInitialTurnStart:false});const warm=encodeDualObservation(roots[0].state,warmEngine.getLegalActions(roots[0].state.currentPlayer).filter(a=>a.type!=='surrender'));await client.forwardBatch([warm]);await client.forwardBatch(Array(16).fill(warm));for(const [index,root] of roots.entries()){
   if(results.rows.some((r:any)=>r.mode===mode&&r.index===index))continue;
   const engine=new GameEngine(root.state,{applyInitialTurnStart:false}),ai=new BatchedNeuralBeamSearchAI(client,config(mode,true));
   const action=await ai.getAction(engine,root.state.currentPlayer);results.rows.push({mode,index,players:root.task.players,phase:root.task.phase,selected:encodeAction(action),t:ai.telemetry});
   fs.writeFileSync(path.join(DATA,'search-raw.json'),JSON.stringify(results));console.log(JSON.stringify({mode,index,rootMs:ai.telemetry.rootMs,nodes:ai.telemetry.nodes}));
  }}finally{await client.close();}
  results.groups[mode]=summarize(results.rows.filter((r:any)=>r.mode===mode));
  fs.writeFileSync(path.join(HERE,'SEARCH_ABLATION_BENCH.json'),JSON.stringify(results,null,2));
 }
 for(const mode of ['S0','S1','S2','S3','S4'])for(const group of ['all',2,3,4]){
  const a=results.rows.filter((r:any)=>r.mode===mode&&(group==='all'||r.players===group));let kl=0,valid=0,infinite=0;
  const agreement=a.map((r:any)=>{const b=results.rows.find((x:any)=>x.mode==='S0'&&x.index===r.index),p=b.t.teacher,q=r.t.teacher;
   if(p?.available&&q?.available){valid++;p.probabilities.forEach((v:number,i:number)=>{if(v>0){if(q.probabilities[i]===0)infinite++;else kl+=v*Math.log(v/q.probabilities[i]);}});}
   const top=(t:any)=>t.candidates.filter((c:any)=>!c.vetoed&&c.responseComplete).sort((x:any,y:any)=>y.score-x.score).slice(0,2).map((c:any)=>c.rootAction);
   const bt=top(b.t),rt=top(r.t);return {selected:Number(r.selected===b.selected),top:bt.length?bt.filter((x:string)=>rt.includes(x)).length/bt.length:null,veto:Number(JSON.stringify(p?.vetoMask)===JSON.stringify(q?.vetoMask))};});
  Object.assign(results.groups[mode][group],{selectedActionAgreement:mean(agreement.map((r:any)=>r.selected)),top2ActionOverlap:mean(agreement.map((r:any)=>r.top).filter((v:any)=>v!==null)),teacherKL:infinite?'Infinity':valid?kl/valid:null,teacherKLValidRoots:valid,zeroSupportTerms:infinite,survivalVetoAgreement:mean(agreement.map((r:any)=>r.veto))});
 }
 const rank=(m:string)=>{const q=results.groups[m].all;return q.selectedActionAgreement*.5+q.responseCompleteRate*.5;};
 results.selectedHeterogeneous=rank('S3')>=rank('S4')?'S3':'S4';results.hashCollisions=0;results.status='complete';
 fs.writeFileSync(path.join(HERE,'SEARCH_ABLATION_BENCH.json'),JSON.stringify(results,null,2));
}
if(process.argv[1]?.endsWith('search_bench.ts'))await run();
