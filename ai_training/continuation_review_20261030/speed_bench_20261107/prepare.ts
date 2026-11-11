import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {GameEngine} from '../../../src/game/engine';
import {encodeDualObservation} from '../../../src/ai_runtime/dual_v2/encoder';
import {packTensorBatch} from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
const here = path.resolve('ai_training/continuation_review_20261030/speed_bench_20261107');
const data = 'D:/AncientEmpiresData/speed_bench_20261107_v1';
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const reads: any[]=[];
function read(p:string){
 if (/sealed|historical|offline-329/i.test(p)) throw Error('拒绝访问封存路径');
 const b=fs.readFileSync(p); reads.push({path:p,sha256:sha(b)}); return b;
}
const selection=JSON.parse(read(path.join(here,'../stage6/DISTILL_SELECTION.json')).toString());
const tasks=selection.tasks.filter((t:any)=>t.split==='dev');
const selected:any[]=[], roots:any[]=[], observations:any[]=[];
const cache=new Map<string,any>();
for(let i=0; selected.length<256 && i<tasks.length;i++){
 const players=2+i%3, phase=Math.floor(i/3)%3;
 const pool=tasks.filter((t:any)=>t.players===players&&t.phase===phase);
 const task=pool[Math.floor(i/9)]; if(!task)continue;
 if(!cache.has(task.source)) {const b=read(task.source); if(sha(b)!==task.sourceSha256)throw Error('来源摘要不匹配');cache.set(task.source,JSON.parse(gunzipSync(b).toString()));}
 const row=cache.get(task.source); if(row.split!=='dev')throw Error('来源不是开发集');
 const state=row.samples[task.index].state, engine=new GameEngine(state,{applyInitialTurnStart:false});
 const legal=engine.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender');
 if(legal.length<6)continue;
 observations.push(encodeDualObservation(state,legal)); selected.push({...task,legalActions:legal.length});
 if(roots.filter(r=>r.task.players===players&&r.task.phase===phase).length<4)roots.push({task,state});
}
if(observations.length!==256 || roots.length!==36)throw Error(`样本不足：${observations.length}/${roots.length}`);
const packed=packTensorBatch(observations,observations.map(()=>({target:0,policyMask:false,valueTarget:new Float32Array(6),valueMask:false,weight:1})));
fs.writeFileSync(path.join(data,'observations.bin'),packed.bytes,{flag:'wx'});
fs.writeFileSync(path.join(data,'observations.json'),JSON.stringify({...packed.metadata,sources:selected}),{flag:'wx'});
fs.writeFileSync(path.join(data,'roots.json'),JSON.stringify(roots),{flag:'wx'});
fs.writeFileSync(path.join(here,'DEV_SELECTION.json'),JSON.stringify({selected,roots:roots.map(r=>r.task),reads,sealedAccess:0},null,2),{flag:'wx'});
console.log(JSON.stringify({observations:observations.length,roots:roots.length,bytes:packed.bytes.length}));
