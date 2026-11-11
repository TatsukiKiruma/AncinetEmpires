// 独立审核：只重放既有轨迹和抽查模型输出，所有结果写入本审核目录。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {GameEngine,createState,hash,inputHash,features,encodeAction,strictStep} from '../r8_pure_policy_stage_20261014_125300/research/common';
import {policy} from '../r8_pure_policy_stage_20261014_125300/research/policy';
import {encodePathRelations} from '../r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/path_relations';
const S='ai_training/r8_pure_policy_stage_20261014_125300';
const O='ai_training/review_r8_20261014_212059';
const model=path.resolve(S,'checkpoints/r1_warm/best.json');
const rows:any[]=[],probes:any[]=[];
for(const panel of ['final_r8','dev_r1_warm']){
 for(let g=0;g<20;g++){
  const stem=path.join(S,'runs',panel,`game_${g}`);
  const r=JSON.parse(fs.readFileSync(stem+'.json','utf8'));
  const events=fs.readFileSync(stem+'.jsonl','utf8').trim().split('\n').map(x=>JSON.parse(x));
  const ready=events.find(x=>x.type==='ready');
  const e=new GameEngine(createState(r.mapName));
  assert.equal(hash(e.getState()),hash(ready.initialState));assert.equal(hash(e.getState()),r.initialStateHash);
  const signature:string[]=[];const actions:any={};let recruitAvailable=0,noRecruitGold=0,checks=0;
  const p=policy({type:'model',model},r.seeds[r.candidateSeat],r.candidateSeat);
  for(const s of events.filter(x=>x.type==='step')){
   assert.equal(s.step,signature.length);assert.equal(e.getState().currentPlayer,s.player);assert.equal(hash(e.getState()),s.beforeHash);
   const state=e.getState();const legal=e.getLegalActions(s.player);assert.deepEqual(legal.map(encodeAction),s.legalCodes);assert.equal(encodeAction(s.action),s.actionCode);
   if(s.step%100===0 && s.inputHash){assert.equal(inputHash(features(state,legal)),s.inputHash);checks++;}
   if(s.player===r.candidateSeat){
    actions[s.action.type]=(actions[s.action.type]??0)+1;
    const rec=legal.some(x=>x.type==='recruit_to_castle'||x.type==='recruit_and_deploy');
    if(rec){recruitAvailable++;if(!s.action.type.startsWith('recruit'))noRecruitGold=Math.max(noRecruitGold,state.players[s.player].gold);}
    if(panel==='final_r8' && r.mapName.includes('Swamplands') && probes.filter(x=>x.game===g).length<3){
     const actual=p.act(structuredClone(state),structuredClone(legal));assert.equal(encodeAction(actual),s.actionCode);
     const teacher=policy({type:'heuristic'},parseInt(s.beforeHash.slice(0,8),16),s.player).act(structuredClone(state),structuredClone(legal));
     probes.push({game:g,step:s.step,gold:state.players[s.player].gold,legalRecruitCount:legal.filter(x=>x.type.startsWith('recruit')).length,modelAction:actual,teacherAction:teacher,legalTypes:[...new Set(legal.map(x=>x.type))],pathFacts:encodePathRelations(state,s.player,[actual,teacher]),commander:state.units.filter(u=>u.ownerId===s.player&&u.unitClass==='commander').map(u=>({pos:u.pos,hasMoved:u.hasMoved,hasActed:u.hasActed})),ownedCastles:state.map.tiles.flatMap((row,y)=>row.flatMap((t,x)=>t.terrainId===10&&t.ownerId===s.player?[{x,y}]:[]))});
    }
   }
   const out=strictStep(e,legal,s.action);assert.equal(out.reward,s.reward);assert.equal(out.done,s.done);assert.equal(out.info,s.info);assert.equal(hash(e.getState()),s.afterHash);
   signature.push(s.beforeHash+'|'+s.actionCode+'|'+s.afterHash);
  }
  assert.equal(signature.length,r.steps);assert.equal(hash(e.getState()),r.finalStateHash);assert(e.isTerminal());assert.equal(e.getWinner(),r.winner);
  assert.equal(r.outcome,e.getWinner()===r.candidateSeat?'natural_win':'natural_loss');
  rows.push({panel,game:g,map:r.mapName,seat:r.candidateSeat,outcome:r.outcome,steps:r.steps,trajectoryHash:hash(signature),actions,recruitAvailable,maxGoldWithRecruitButOtherAction:noRecruitGold,inputHashChecks:checks});
 }
}
const cross=rows.filter(x=>x.panel==='final_r8').flatMap(f=>rows.filter(x=>x.panel==='dev_r1_warm'&&x.trajectoryHash===f.trajectoryHash).map(d=>({final:f.game,dev:d.game})));
const finals=rows.filter(x=>x.panel==='final_r8');const within=finals.flatMap((f,i)=>finals.slice(0,i).filter(x=>x.trajectoryHash===f.trajectoryHash).map(x=>[x.game,f.game]));
fs.writeFileSync(path.join(O,'replay_results.json'),JSON.stringify({passed:true,checkedGames:rows.length,cross,within,rows,swamplandsProbes:probes},null,2));
console.log(JSON.stringify({passed:true,games:rows.length,cross,within,swamplands:finals.filter(x=>x.map.includes('Swamplands')),probes},null,2));
