import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { legalActions } from './policy_runtime';
import { read,hash } from './io';
const model=read('teacher-model.json'),old=read('old-schema.json'),rows=[];
for(const item of read('browser-states.json')){
    const engine=new GameEngine(item.state),ai=new ModelBattleSearchAI(model,old,{priorWeight:0}),memory:any={};
    const action=ai.getAction(engine,item.state.currentPlayer,legalActions(engine),undefined,memory),s=ai.lastDecision;
    rows.push({action:encodeAction(action),reason:s.reason,plan:(memory.queue??[]).map((p:any)=>encodeAction(p.action)),leaves:(s.traces??[]).map((v:any)=>({code:encodeAction(v.action),score:v.score,complete:v.complete,commanderLethal:v.commanderLethal,actorLethal:v.actorLethal})),unchangedState:hash(engine.getState())===hash(item.state)});
}
console.log(JSON.stringify(rows));
