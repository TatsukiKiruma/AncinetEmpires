// 独立从初态执行日志动作，核对裁判转移，不能用强制动作回放替代合法性检查。
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {GameEngine,hash,encodeAction,strictStep,features,inputHash} from './common';
const S=path.resolve(__dirname,'..');const dirs=process.argv.slice(2);const results:any[]=[];
for(const dir of dirs){
 const full=path.resolve(S,'runs',dir);
 for(const file of fs.readdirSync(full).filter(x=>/^game_\d+\.json$/.test(x))){
  const p=path.join(full,file);const r=JSON.parse(fs.readFileSync(p,'utf8'));const events=fs.readFileSync(p.replace(/\.json$/,'.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
  const ready=events.find(x=>x.type==='ready');assert(ready,'缺初态');const e=new GameEngine(ready.initialState);assert.equal(hash(e.getState()),r.initialStateHash);
  const steps=events.filter(x=>x.type==='step');const signature:string[]=[];
  for(const [i,s] of steps.entries()){
   assert.equal(s.step,i);assert.equal(hash(e.getState()),s.beforeHash);assert.equal(e.getState().currentPlayer,s.player);
   const legal=e.getLegalActions(s.player);assert.deepEqual(legal.map(encodeAction),s.legalCodes);assert.equal(encodeAction(s.action),s.actionCode);
   if(i%50===0&&s.inputHash)assert.equal(inputHash(features(e.getState(),legal)),s.inputHash);
   const out=strictStep(e,legal,s.action);assert.equal(out.reward,s.reward);assert.equal(out.done,s.done);assert.equal(out.info,s.info);assert.equal(hash(e.getState()),s.afterHash);
   signature.push(s.beforeHash+'|'+s.actionCode+'|'+s.afterHash);
  }
  assert.equal(steps.length,r.steps);if(r.finalStateHash)assert.equal(hash(e.getState()),r.finalStateHash);
  if(r.outcome.startsWith('natural_')){assert(e.isTerminal());assert.equal(e.getWinner(),r.winner);assert.equal(r.outcome,e.getWinner()===r.candidateSeat?'natural_win':'natural_loss');}
  const st=e.getState();const actionTypes:any={};for(const x of steps.filter(x=>x.player===r.candidateSeat))actionTypes[x.action.type]=(actionTypes[x.action.type]??0)+1;
  const endPlayers=st.players.map(p=>({id:p.id,gold:p.gold,units:st.units.filter(u=>u.ownerId===p.id).length,totalHp:st.units.filter(u=>u.ownerId===p.id).reduce((n,u)=>n+u.hp,0),commanderHp:st.units.filter(u=>u.ownerId===p.id&&u.unitClass==='commander').map(u=>u.hp)}));
  results.push({panel:dir,gameIndex:r.gameIndex,map:r.mapName,seat:r.candidateSeat,outcome:r.outcome,steps:steps.length,trajectoryHash:hash(signature),surrender:r.lastAction?.type==='surrender',actionTypes,endTurn:st.turn,endPlayers});
 }
}
const duplicates:any[]=[];for(let i=0;i<results.length;i++)for(let j=0;j<i;j++)if(results[i].trajectoryHash===results[j].trajectoryHash)duplicates.push([results[j],results[i]]);
const report={passed:true,checkedGames:results.length,inputHashCheck:'每50步重编码，其余步完整状态、合法动作及转移校验',results,duplicates};
const name=dirs.join('_');fs.writeFileSync(path.join(S,'evidence',`replay_${name}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,games:results.length,duplicates:duplicates.length}));
