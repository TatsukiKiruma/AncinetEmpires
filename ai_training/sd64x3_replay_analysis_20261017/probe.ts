import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {observe} from '../../src/ai_runtime/sd_v1/observation';
import {encode,forward} from '../sd64x3_phone_20261016/model';
import {tacticalFeatures} from '../sd64x3_phone_20261016/tactics';

// 只检查冻结回放状态的合法反事实分支，不修改权重，也不重开对局。
const dir=path.resolve('ai_training/sd64x3_replay_analysis_20261017'),battle=path.resolve('ai_training/sd64x3_phone_battles_20261016');
const analysis=JSON.parse(fs.readFileSync(path.join(dir,'analysis.json'),'utf8'));
const model=JSON.parse(fs.readFileSync(path.join(battle,'models/phone64x3.json'),'utf8'));
const results:any[]=[];
for(const slotData of analysis.slots){
 const slot=slotData.slot, engine=new GameEngine(JSON.parse(fs.readFileSync(path.join(battle,`initial/map-${slot.mapIndex}.json`),'utf8')));
 const rows=gunzipSync(fs.readFileSync(path.join(battle,`slots/${slot.id}/actions.jsonl.gz`))).toString().trim().split('\n').map(x=>JSON.parse(x));
 for(const row of rows){
  const event=slotData.events.find((x:any)=>x.i===row.i);
  if(event?.action.type==='wait'&&event.unit&&event.sameAvailable.move&&(event.chosenTactic[7]||event.unit.class==='commander'&&event.unit.hp<40)){
   const legal=engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type==='wait'&&a.unitId===event.unit.id||a.type==='move'&&a.unitId===event.unit.id);
   const packet=observe(engine.getState(),legal), ordered=packet.codes.map(code=>legal.find(a=>encodeAction(a)===code)!);
   const tactics=tacticalFeatures(new GameEngine(engine.getState(),{disableAutoAdvanceWhenNoMeaningfulAction:true}),ordered),out=forward(encode(packet,model.schema,tactics),model.schema,model.weights);
   const options=ordered.map((a,k)=>({action:a,code:packet.codes[k],score:out.logits[k],damage:tactics[k][6]*128,lethal:tactics[k][7],known:tactics[k][8]}));
   const wait=options.find(x=>x.action.type==='wait')!;
   assert(Math.abs(wait.score-event.top[0].score)<1e-8);
   results.push({slot:slot.id,i:row.i,turn:event.turn,kind:'retreat',unit:event.unit,chosen:wait,safeMoves:options.filter(x=>x.action.type==='move'&&x.known&&!x.damage).sort((a,b)=>b.score-a.score),leastDamage:options.filter(x=>x.action.type==='move').sort((a,b)=>a.damage-b.damage).slice(0,2)});
  }
  if(slot.id==='01-m0-s0'&&event&&event.action.type==='move'&&event.chosenTactic[6]===0&&event.chosenTactic[8]===1&&results.filter(x=>x.kind==='move_then_attack_blindspot').length<3){
   const branch=engine.clone();branch.step(row.action);
   const own=branch.getState().currentPlayer,ending=branch.getLegalActions(own,{skipMovement:true}).find(a=>a.type==='end_turn');
   if(ending)branch.step(ending);
   if(!branch.isTerminal()&&branch.getState().currentPlayer!==own){
    let found:any=null;
    for(const move of branch.getLegalActions(branch.getState().currentPlayer)){
     if(move.type!=='move')continue;
     const moved=branch.clone();moved.step(move);
     const attacks=moved.getLegalActions(moved.getState().currentPlayer,{skipMovement:true}).filter(a=>a.type==='attack'&&a.targetId===row.action.unitId);
     for(const hit of attacks){
      const hp=moved.getState().units.find(u=>u.id===row.action.unitId)?.hp??0;
      const attacked=moved.clone().step(hit),remaining=attacked.state.units.find(u=>u.id===row.action.unitId)?.hp??0;
      if(hp>remaining&&(!found||hp-remaining>found.damage))found={move,attack:hit,damage:hp-remaining,lethal:remaining===0};
     }
    }
    if(found)results.push({slot:slot.id,i:row.i,kind:'move_then_attack_blindspot',chosen:row.action,modelImmediateRisk:event.chosenTactic[6]*128,legalReply:found});
   }
  }
  engine.step(row.action);
 }
}
fs.writeFileSync(path.join(dir,'counterfactual-probes.json'),JSON.stringify({optimizerUpdates:0,limitations:'安全仅指已有特征定义下的对手下一手立即攻击，不保证整回合安全；反事实分支不等于胜负证明',results},null,2));
console.log(JSON.stringify({retreatProbes:results.filter(x=>x.kind==='retreat').length,retreatsWithSafeMove:results.filter(x=>x.kind==='retreat'&&x.safeMoves.length).length,movingThreatExamples:results.filter(x=>x.kind==='move_then_attack_blindspot')}));
