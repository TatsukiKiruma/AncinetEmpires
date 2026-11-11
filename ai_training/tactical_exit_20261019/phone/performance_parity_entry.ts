import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { infer,legalActions } from '../policy_runtime';
import { ModelBattleSearchAI } from '../model_battle_search_ai';
import { auditSearchRisks } from '../audit_search_risks';
import { hash } from '../io';

/** 与冻结R24采集器同一入口；只重算固定前态，绝不生成新对局。 */
export function collect(state:any,model:any,old:any){
    const engine=new GameEngine(state),legal=legalActions(engine),root=infer(engine,legal,model,old);
    const ai=new ModelBattleSearchAI(model,old,{priorWeight:0});ai.getAction(engine,state.currentPlayer,legal,root,{});
    const search=ai.lastDecision,audit=auditSearchRisks(engine,search),x=root.x;
    return {inputHash:hash({tokens:x.tokens,groups:x.groups,candidates:x.candidates,refs:x.refs,codes:x.codes,actionGroups:x.actionGroups}),
        preferred:x.codes[root.out.best],rankingMode:search.vetoLeafRanked?'veto_leaf':'policy_mixed',
        candidates:(search.traces??[]).map((v:any)=>({code:encodeAction(v.action),index:v.index,score:v.score,confidence:root.prior[v.index],complete:v.complete,riskKnown:v.riskKnown,commanderLethal:v.commanderLethal,actorLethal:v.actorLethal,naturalWin:v.naturalWin,tactical:v.tactical,net:v.net})),
        search,audit,afterHash:hash(engine.getState())};
}
