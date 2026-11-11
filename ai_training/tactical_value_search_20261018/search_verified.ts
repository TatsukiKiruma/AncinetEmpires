import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';
import { infer } from './policy_runtime';
import { ModelBattleSearchAI,type SearchMemory } from './model_battle_search_verified_ai';
export { infer } from './policy_runtime';
export type { SearchMemory } from './model_battle_search_verified_ai';

/** 评测适配层；模型化BattleSearchAI单独承担搜索控制和Maximin。 */
export function chooseBounded(engine:GameEngine,actions:Action[],model:any,oldSchema:any,arm:'pure'|'value_rerank'|'bounded',remainingGameNodes=2400,memory:SearchMemory={}){
    const start=performance.now(),root=infer(engine,actions,model,oldSchema);let index=root.out.best;
    let search:any={index,nodes:0,traces:[],preferred:root.x.codes[index],selected:root.x.codes[index],triggered:false,reason:'纯分层策略',framework:'src/game/ai/battle_search_ai.ts'};
    if(arm!=='pure'){
        const ai=new ModelBattleSearchAI(model,oldSchema,{arm,maxNodes:Math.min(48,remainingGameNodes),friendlyRolloutSteps:arm==='bounded'?3:0,maxDecisionMs:Math.max(1,29000-(performance.now()-start))});
        const action=ai.getAction(engine,engine.getState().currentPlayer,actions,root,memory);index=root.x.codes.indexOf(encodeAction(action));if(index<0)throw Error('搜索返回非权威候选');search={...search,...ai.lastDecision};
    }
    return {action:root.x.actions[index],extra:root.x.candidates[index].filter(([i])=>i>=119&&i<141).map(([,v])=>v),focus:root.x.focus[index],index,value:root.value,input:root.x,logits:root.out.logits,search:{...search,arm,elapsedMs:performance.now()-start}};
}
