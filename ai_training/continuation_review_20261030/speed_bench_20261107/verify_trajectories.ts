import fs from 'node:fs';
import path from 'node:path';
import {GameEngine} from '../../../src/game/engine';
import {DATA,HERE} from './client';
const checks:any[]=[];
const files=fs.readdirSync(DATA).filter(f=>/^(P\d|Tactical-).*-(result|progress)\.json$/.test(f));
const chosen=new Map<string,string>();
for(const file of files){const key=file.replace(/-(result|progress)\.json$/,'');if(!chosen.has(key)||file.endsWith('-result.json'))chosen.set(key,file);}
for(const file of chosen.values()){
 const group=JSON.parse(fs.readFileSync(path.join(DATA,file),'utf8'));
 const inputs=JSON.parse(fs.readFileSync(path.join(DATA,`${group.label}-inputs.json`),'utf8'));
 for(const result of group.games){
  const task=inputs.find((t:any)=>t.id===result.id),engine=new GameEngine(task.state,{applyInitialTurnStart:false});
  const rows=fs.readFileSync(path.join(DATA,`${group.label}-${result.id}-trajectory.jsonl`),'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
  let validTeachers=0;
  for(const [index,row] of rows.entries()){
   const state=engine.getState();if(row.step!==index||row.player!==state.currentPlayer||row.turn!==state.turn||!engine.hasLegalAction(state.currentPlayer,row.action))throw Error(`重放身份或动作不符：${group.label}/${result.id}/${index}`);
   if(row.teacher){const t=row.teacher,total=t.probabilities.reduce((a:number,b:number)=>a+b,0);if(!t.available||Math.abs(total-1)>1e-8||t.evaluatedMask.filter((v:boolean,i:number)=>v&&!t.vetoMask[i]).length<2)throw Error('有效教师合同不符');validTeachers++;}
   engine.step(row.action);
  }
  if(rows.length!==result.steps||engine.isTerminal()!==result.natural||validTeachers!==result.validTeachers||(result.natural&&engine.getState().winner!==result.winner))throw Error('终态或计数不符');
  checks.push({label:group.label,id:result.id,steps:rows.length,validTeachers,natural:result.natural,passed:true});
 }
}
fs.writeFileSync(path.join(HERE,'TRAJECTORY_VERIFICATION.json'),JSON.stringify({checks,passed:true,sealedAccess:0},null,2));
console.log(JSON.stringify({verifiedGames:checks.length,steps:checks.reduce((s,r)=>s+r.steps,0)}));
