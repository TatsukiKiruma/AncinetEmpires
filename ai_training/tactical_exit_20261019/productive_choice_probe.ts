import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { legalActions } from './policy_runtime';
import { read,hash } from './io';
const model=read('teacher-model.json'),old=read('old-schema.json'),rows=[];
for(const item of read('browser-states.json')){
    const e=new GameEngine(item.state),ai=new ModelBattleSearchAI(model,old),memory:any={},a=ai.getAction(e,item.state.currentPlayer,legalActions(e),undefined,memory),s=ai.lastDecision;
    rows.push({action:encodeAction(a),leafHash:hash((s.traces??[]).map((v:any)=>({index:v.index,score:v.score,value:v.value,tactical:v.tactical,net:v.net,complete:v.complete,commanderLethal:v.commanderLethal,actorLethal:v.actorLethal}))),plan:(memory.queue??[]).map((p:any)=>encodeAction(p.action)),productiveFollowCommitted:!!s.productiveFollowCommitted,unchangedState:hash(e.getState())===hash(item.state)});
}
console.log(JSON.stringify(rows));
