import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GameEngine,createState,MAPS,features,hash,encodeAction,strictStep,RNG,inputHash} from './common';
import {policy} from './policy';
import {AncientEmpiresEnv} from '../frozen/src/game/env';
import {getLegalActions} from '../frozen/src/game/rules';
const stage='ai_training/r8_pure_policy_stage_20261014_125300';
const samples:any[]=[];const checks:any[]=[];
for(let m=0;m<MAPS.length;m++){
 const s=createState(MAPS[m]);const e=new GameEngine(s);const env=new AncientEmpiresEnv({initialState:structuredClone(s)});
 assert.deepEqual(e.getLegalActions(s.currentPlayer).map(encodeAction),getLegalActions(s,s.currentPlayer).map(encodeAction));
 assert.deepEqual(env.getLegalActions().map(encodeAction),e.getLegalActions(s.currentPlayer).map(encodeAction));
 assert.equal(hash(e.clone().getState()),hash(e.getState()));
 assert.equal(hash(env.clone().getState()),hash(env.getState()));
 assert.equal(hash(env.getState()),hash(s));
 const hs=[policy({type:'heuristic'},431+m*3,0),policy({type:'heuristic'},432+m*3,1)];
 let added=0;
 for(let step=0;step<220&&!e.isTerminal()&&added<30;step++){
  const state=e.getState();const legal=e.getLegalActions(state.currentPlayer);
  if(step%7===0&&added<30){const f=features(state,legal);samples.push({...f,stateJson:structuredClone(state),stateHash:hash(state),inputHash:inputHash(f),mapName:MAPS[m],step,sampleId:samples.length,actionCodes:legal.map(encodeAction)});added++;}
  strictStep(e,structuredClone(legal),hs[state.currentPlayer].act(structuredClone(state),structuredClone(legal)));
 }
 // 极短对局以独立随机流补足，不复制同一个输入。
 if(added<30){for(let g=0;g<4&&added<30;g++){const e2=new GameEngine(createState(MAPS[m]));const ps=[policy({},8431+m*10+g,0),policy({},9431+m*10+g,1)];for(let step=0;step<200&&!e2.isTerminal()&&added<30;step++){const st=e2.getState(),le=e2.getLegalActions(st.currentPlayer);const f=features(st,le);if(step>10&&step%7===0&&!samples.some(x=>x.inputHash===inputHash(f))){samples.push({...f,stateJson:structuredClone(st),stateHash:hash(st),inputHash:inputHash(f),mapName:MAPS[m],step,sampleId:samples.length,actionCodes:le.map(encodeAction)});added++;}strictStep(e2,structuredClone(le),ps[st.currentPlayer].act(structuredClone(st),structuredClone(le)));}}}
 assert(added>=20);checks.push({map:MAPS[m],samples:added,initialGold:s.players.map(p=>p.gold),legal:e.getLegalActions(e.getState().currentPlayer).length});console.log(MAPS[m],added);
}
// 加入历史失败末端状态，覆盖真实晚期与投降反例。
const old=JSON.parse(fs.readFileSync('ai_training/r7_training_stage_20261014_083500/artifacts/final_eval/final_acceptance_report.json','utf8'));
for(const r of old.results){const e=new GameEngine(createState(r.mapName));for(const tr of r.replayTrace){const st=e.getState(),legal=e.getLegalActions(st.currentPlayer);if(tr.stepIndex>=r.totalSteps-2){const f=features(st,legal);samples.push({...f,stateJson:structuredClone(st),stateHash:hash(st),inputHash:inputHash(f),mapName:r.mapName,step:tr.stepIndex,sampleId:samples.length,actionCodes:legal.map(encodeAction),historicalFailure:r.gameIndex});}const a=legal.find(x=>encodeAction(x)===tr.actionEncoded);assert(a);strictStep(e,structuredClone(legal),a);}}
assert(samples.length>=200);
const s=createState(MAPS[0]);for(const field of ['hasBeenHealedThisTurn','hasBeenSupportedThisTurn']){const t=structuredClone(s);(t.units[0] as any)[field]=true;assert.notEqual(hash(t),hash(s));}
const t=structuredClone(s);t.units[0].status={type:'poisoned',remainingTicks:2};assert.notEqual(hash(t),hash(s));
const r1=new RNG(42),r2=new RNG(42);assert.deepEqual(Array.from({length:100},()=>r1.next()),Array.from({length:100},()=>r2.next()));
const rejected=new GameEngine(s).step({type:'move',unitId:'不存在',to:{x:-1,y:-1}});assert(rejected.info?.includes('非法动作'));
fs.writeFileSync(`${stage}/data/parity_fixture.json`,JSON.stringify(samples));
fs.writeFileSync(`${stage}/evidence/core_contracts.json`,JSON.stringify({passed:true,checks,totalSamples:samples.length,fullStateHashIncludesAllFields:true},null,2));
console.log('核心合同通过，夹具',samples.length);
