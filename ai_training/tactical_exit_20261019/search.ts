import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { extendFeatures } from '../tactical_value_search_20261018/features';
import { extractFeatures } from '../tactical_scale_20261018/complete_tactics';
import { infer } from './policy_runtime';
import { ModelBattleSearchAI,type SearchMemory } from './model_battle_search_ai';
import type { Action } from '../../src/game/types';
export type { SearchMemory } from './model_battle_search_ai';
export function chooseBounded(engine:GameEngine,legal:Action[],model:any,old:any,arm:string,_nodes:number,memory:SearchMemory){
    const searchArm=arm.endsWith('_search'),queue=searchArm&&memory.queue?.[0],s=engine.getState();
    if(queue&&queue.state===JSON.stringify(s)&&legal.some(a=>encodeAction(a)===encodeAction(queue.action))){
        const ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,s.currentPlayer,legal,undefined,memory),index=legal.findIndex(a=>encodeAction(a)===encodeAction(action));
        return {action,index,logits:legal.map(()=>0),input:{verifiedQueue:true},focus:extendFeatures(engine,[action])[0],extra:extractFeatures(engine,[action]).extra[0],search:{...ai.lastDecision,preferredPolicyEvaluated:false}};
    }
    const root=infer(engine,legal,model,old);let index=root.out.best,search:any={preferred:root.x.codes[index],selected:root.x.codes[index],triggered:false,changed:false,nodes:0,reason:'纯策略',traces:[],branchPolicyCalls:0};
    if(searchArm){const ai=new ModelBattleSearchAI(model,old);const action=ai.getAction(engine,s.currentPlayer,legal,root,memory);index=root.x.codes.indexOf(encodeAction(action));search={...ai.lastDecision,preferredPolicyEvaluated:true};}
    return {action:root.x.actions[index],index,logits:root.out.logits,input:root.x,focus:root.x.focus[index],extra:root.x.extra[index],search};
}
