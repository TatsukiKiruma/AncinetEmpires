import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction, decodeAction } from '../../src/game/env';
import { UNIT_CONFIGS } from '../../src/game/units';
import { TERRAIN_CONFIG } from '../../src/game/terrain';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode, forward } from '../sd64x3_phone_20261016/model';
import { tacticalFeatures } from '../sd64x3_phone_20261016/tactics';
import { digest } from '../sd64x3_phone_battles_20261016/io';

// 本脚本只读冻结回放与权重；仅向独立分析目录写入诊断，不执行训练。
const dir=path.resolve('ai_training/sd64x3_replay_analysis_20261017');
const battle=path.resolve('ai_training/sd64x3_phone_battles_20261016');
const read=(p:string)=>JSON.parse(fs.readFileSync(path.join(battle,p),'utf8'));
const manifest=read('manifest.json'), model=read('models/phone64x3.json');
const actorId=(a:any)=>a.unitId??a.attackerId??a.healerId??a.supporterId??a.summonerId;
const counts=(list:any[],key:(r:any)=>string)=>list.reduce((o,r)=>(o[key(r)]=(o[key(r)]??0)+1,o),{} as Record<string,number>);
const slots:any[]=[];
for(const slot of manifest.slots){
 const engine=new GameEngine(read(`initial/map-${slot.mapIndex}.json`));
 const rows=gunzipSync(fs.readFileSync(path.join(battle,`slots/${slot.id}/actions.jsonl.gz`))).toString().trim().split('\n').map(x=>JSON.parse(x));
 const events:any[]=[], turns:any[]=[], moves:any[]=[], deaths:any[]=[], recruits:any[]=[];
 const snapshot=(s:any)=>s.players.map((p:any)=>({player:p.id,gold:p.gold,commanderDeaths:p.commanderDeathCount,units:s.units.filter((u:any)=>u.ownerId===p.id).length,hp:s.units.filter((u:any)=>u.ownerId===p.id).reduce((n:number,u:any)=>n+u.hp,0),buildings:s.map.tiles.flat().filter((t:any)=>t.ownerId===p.id&&TERRAIN_CONFIG[t.terrainId as keyof typeof TERRAIN_CONFIG].incomePerTurn>0).length,income:s.map.tiles.flat().filter((t:any)=>t.ownerId===p.id).reduce((n:number,t:any)=>n+TERRAIN_CONFIG[t.terrainId as keyof typeof TERRAIN_CONFIG].incomePerTurn,0)}));
 turns.push({i:0,turn:engine.getState().turn,players:snapshot(engine.getState())});
 for(const row of rows){
  const s=engine.getState(),a=row.action,id=actorId(a),unit=s.units.find(u=>u.id===id);
  assert.equal(digest(s),row.before);
  const legal=engine.getLegalActions(s.currentPlayer);
  const same=legal.filter(x=>actorId(x)===id);
  let detail:any={};
  if(row.side==='model'){
   const packet=observe(s,legal), ordered=packet.codes.map(code=>decodeAction(code)!);
   const tac=tacticalFeatures(new GameEngine(s,{disableAutoAdvanceWhenNoMeaningfulAction:true}),ordered);
   const encoded=encode(packet,model.schema,tac),out=forward(encoded,model.schema,model.weights);
   const k=encoded.codes.indexOf(row.code);
   assert.equal(encoded.codes[out.best],row.code);
   const sorted=out.logits.map((score,j)=>({code:encoded.codes[j],action:ordered[j],score,tactic:tac[j]})).sort((a,b)=>b.score-a.score);
   const bestByType=Object.fromEntries([...new Set(ordered.map(x=>x.type))].map(t=>[t,sorted.find(x=>x.action.type===t)]));
   detail={unit:unit?{id:unit.id,class:unit.unitClass,hp:unit.hp,pos:unit.pos,hasMoved:unit.hasMoved,hasActed:unit.hasActed}:null,chosenTactic:tac[k],chosenProbability:1/out.logits.reduce((n,z)=>n+Math.exp(z-out.logits[k]),0),margin:sorted.length>1?sorted[0].score-sorted[1].score:null,top:sorted.slice(0,4),bestByType,available:counts(legal,x=>x.type),sameAvailable:counts(same,x=>x.type),players:snapshot(s)};
   events.push({slot:slot.id,i:row.i,turn:s.turn,action:a,code:row.code,...detail});
  }
  const beforeUnits=s.units;
  const result=engine.step(a),after=result.state;
  assert.equal(digest(after),row.after);
  if(a.type==='move'||a.type==='post_attack_move')moves.push({i:row.i,side:row.side,id,class:unit?.unitClass,from:unit?.pos,to:a.to});
  if(a.type==='recruit_to_castle')recruits.push({i:row.i,side:row.side,class:a.unitClass,spent:(s.players.find(p=>p.id===row.actor)?.gold??0)-(after.players.find(p=>p.id===row.actor)?.gold??0)});
  for(const u of beforeUnits)if(!after.units.some(v=>v.id===u.id))deaths.push({i:row.i,turn:s.turn,side:u.ownerId===slot.modelSeat?'model':'heuristic',unit:{id:u.id,class:u.unitClass,hp:u.hp,pos:u.pos},cause:a,terminal:result.done,info:result.info});
  if(after.currentPlayer!==s.currentPlayer||result.done)turns.push({i:row.i+1,turn:after.turn,players:snapshot(after),terminal:result.done});
 }
 const m=events;
 const stats={modelActions:m.length,waits:m.filter(x=>x.action.type==='wait').length,waitUnmoved:m.filter(x=>x.action.type==='wait'&&!x.unit?.hasMoved).length,waitWithSameMove:m.filter(x=>x.action.type==='wait'&&x.sameAvailable.move).length,waitWithSameAttack:m.filter(x=>x.action.type==='wait'&&x.sameAvailable.attack).length,waitWithSameCapture:m.filter(x=>x.action.type==='wait'&&x.sameAvailable.capture).length,waitWithSameHeal:m.filter(x=>x.action.type==='wait'&&x.sameAvailable.heal).length,endTurnWithAttack:m.filter(x=>x.action.type==='end_turn'&&x.available.attack).length,chosenExposed:m.filter(x=>x.chosenTactic[6]>0).length,chosenLethalExposure:m.filter(x=>x.chosenTactic[7]>0).length,chosenUnknownRisk:m.filter(x=>!x.chosenTactic[8]).length,modelRecruitClasses:counts(recruits.filter(x=>x.side==='model'),x=>x.class),opponentRecruitClasses:counts(recruits.filter(x=>x.side==='heuristic'),x=>x.class),modelMoves:moves.filter(x=>x.side==='model').length,opponentMoves:moves.filter(x=>x.side==='heuristic').length};
 slots.push({slot,stats,turns,moves,deaths,recruits,events});
 fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify({optimizerUpdates:0,sourceManifestSha256:digest(manifest),slots},null,2));
 console.log(JSON.stringify({slot:slot.id,stats}));
}
