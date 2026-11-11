import fs from 'node:fs';import assert from 'node:assert/strict';
import {GameEngine,createState,MAPS,hash,encodeAction,strictStep} from './common';import {policy} from './policy';
const rows:any[]=[];
for(let m=0;m<MAPS.length;m++){
 const traces:string[][]=[];const calls:any[]=[];
 for(let run=0;run<3;run++){
  const e=new GameEngine(createState(MAPS[m]));const ps=[policy({},31001+m*10+(run===2?1000:0),0),policy({},31002+m*10+(run===2?1000:0),1)];const trace=[];
  for(let step=0;step<45&&!e.isTerminal();step++){
   const st=e.getState(),le=e.getLegalActions(st.currentPlayer),p=ps[st.currentPlayer],before=p.rng.snapshot();
   if(run===1){const teacher=policy({},441+step,st.currentPlayer);teacher.act(structuredClone(st),structuredClone(le));assert.deepEqual(p.rng.snapshot(),before);}
   const action=p.act(structuredClone(st),structuredClone(le));trace.push(encodeAction(action));strictStep(e,structuredClone(le),action);
  }
  traces.push(trace);calls.push(ps.map(p=>p.rng.snapshot()));
 }
 assert.deepEqual(traces[0],traces[1]);rows.push({map:MAPS[m],teacherQueriesDoNotChangeTrajectory:true,differentSeedChangesTrajectory:hash(traces[0])!==hash(traces[2]),traceHashes:traces.map(hash),rng:calls});
}
fs.writeFileSync('ai_training/r8_pure_policy_stage_20261014_125300/evidence/rng_contract.json',JSON.stringify({passed:true,scope:'独立PROBE随机流，未运行候选FINAL',rows},null,2));console.log(rows.map(x=>({map:x.map,diff:x.differentSeedChangesTrajectory})));
