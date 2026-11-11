/** 从最终strict轨迹复算守城反例，并保存同图换边配对变化。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
const dir=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(dir,'../..'), base=path.join(root,'deliverables/trained_vs_apk_hard_20261022');
const old=JSON.parse(fs.readFileSync(path.join(base,'phase61-v6r3-hard-slayer/summary.json'),'utf8'));
const current=JSON.parse(fs.readFileSync(path.join(base,'gen05-v6-hard-slayer/summary.json'),'utf8'));
const improved:any[]=[],regressed:any[]=[];
for(const game of current.games){
 const before=old.games.find((g:any)=>g.id===game.id)!;
 const row={map:game.mapName,seat:game.seat,before:before.classification,after:game.classification,beforeRounds:before.rounds,afterRounds:game.rounds};
 if(before.classification==='hard_win'&&game.classification==='model_win')improved.push(row);
 if(before.classification==='model_win'&&game.classification==='hard_win')regressed.push(row);
}
const folder=path.join(base,'gen05-v6-hard-slayer/0-_2_Duel_aem-seat1'), engine=new GameEngine(JSON.parse(fs.readFileSync(path.join(folder,'initial.json'),'utf8')));
let guard:any;
for(const line of fs.readFileSync(path.join(folder,'actions.jsonl'),'utf8').trim().split('\n')){
 const row=JSON.parse(line);
 if(row.step===18){
  const state=engine.getState();guard={step:18,player:state.currentPlayer,gold:state.players.find(p=>p.id===state.currentPlayer)!.gold,position:state.units.find(u=>u.id==='u_6')!.pos,action:row.action};
  assert.equal(row.action.type,'wait');assert.equal(row.action.unitId,'u_6');assert.equal(guard.gold,0);assert.deepEqual(guard.position,{x:8,y:8});
 }
 engine.step(row.action);
}
assert.equal(engine.getState().winner,current.games.find((g:any)=>g.id==='0-_2_Duel_aem-seat1').winner);
const result={improved,regressed,guard};fs.writeFileSync(path.join(dir,'CASE_STUDIES.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
