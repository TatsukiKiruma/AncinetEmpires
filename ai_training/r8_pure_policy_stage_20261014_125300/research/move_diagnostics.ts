// 在既有DEV轨迹上抽样查询教师与规则路径事实，诊断不产生计分对局。
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {GameEngine,strictStep,encodeAction,hash} from './common';import {policy} from './policy';
import {encodePathRelations} from '../frozen/src/game/ai/path_relations';
const S=path.resolve(__dirname,'..'),id=process.argv[2],rows:any[]=[];
for(let g=0;g<20;g++){
 const p=path.join(S,`runs/dev_${id}/game_${g}`);if(!fs.existsSync(p+'.json'))continue;const r=JSON.parse(fs.readFileSync(p+'.json','utf8'));const events=fs.readFileSync(p+'.jsonl','utf8').trim().split('\n').map(x=>JSON.parse(x));const e=new GameEngine(events.find(x=>x.type==='ready').initialState);let decisions=0;
 for(const x of events.filter(x=>x.type==='step')){
  const st=e.getState(),legal=e.getLegalActions(st.currentPlayer);assert.equal(hash(st),x.beforeHash);
  if(x.player===r.candidateSeat&&(decisions++%10===0||x.step>=r.steps-4)){
   const teacher=policy({type:'heuristic'},parseInt(x.beforeHash.slice(0,8),16),x.player);const target=teacher.act(structuredClone(st),structuredClone(legal));const candidates=[x.action,target];const rel=encodePathRelations(st,x.player,candidates);
   rows.push({game:g,map:r.mapName,step:x.step,player:x.player,action:encodeAction(x.action),teacher:encodeAction(target),actionType:x.action.type,teacherType:target.type,match:encodeAction(target)===x.actionCode,pathFacts:{chosen:rel[0],teacher:rel[1]},ownGold:st.players[x.player].gold,ownUnits:st.units.filter(u=>u.ownerId===x.player).length,enemyUnits:st.units.filter(u=>u.ownerId!==x.player).length});
  }
  strictStep(e,legal,x.action);
 }
}
const confusion:any={};for(const r of rows){const k=r.teacherType+'→'+r.actionType;confusion[k]=(confusion[k]??0)+1;}
fs.writeFileSync(path.join(S,`evidence/move_diagnostics_${id}.json`),JSON.stringify({id,samples:rows.length,confusion,rows,caveat:'教师输出是诊断参照，不是真实最优动作；路径字段仅规则派生事实。'},null,2));console.log({samples:rows.length,confusion});
