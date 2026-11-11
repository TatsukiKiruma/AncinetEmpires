// 用故障注入验证适配器拒绝引擎合同异常；权威引擎本身不改动。
import fs from 'node:fs';import assert from 'node:assert/strict';
import {GameEngine,createState,MAPS,strictStep,hash} from './common';
const s=createState(MAPS[0]),e=new GameEngine(s),legal=e.getLegalActions(s.currentPlayer);const rows:any[]=[];
for(const [name,result,terminal] of [
 ['step拒绝',{reward:0,done:false,info:'非法动作'},false],
 ['非有限reward',{reward:NaN,done:false},false],
 ['done不一致',{reward:0,done:true},false]
] as any[]){const fake={step:()=>result,isTerminal:()=>terminal};assert.throws(()=>strictStep(fake as any,legal,legal[0]));rows.push({name,rejected:true});}
assert.throws(()=>strictStep(e,legal,undefined as any));assert.equal(hash(e.getState()),hash(s));rows.push({name:'空返回动作',rejected:true});
const surrender=legal.find(x=>x.type==='surrender')!;const r=strictStep(e,legal,surrender);assert(r.done);assert.equal(e.getWinner(),1-s.currentPlayer);rows.push({name:'合法投降自然终局',passed:true});
fs.writeFileSync('ai_training/r8_pure_policy_stage_20261014_125300/evidence/step_contracts.json',JSON.stringify({passed:true,rows},null,2));console.log('异常step和空动作合同通过');
