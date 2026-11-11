import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {evaluateLeaf} from './leaf';
import type {Action,GameState,Unit} from '../../src/game/types';
import type {PlanStep} from './model_battle_search_ai';

type Leaf=ReturnType<typeof evaluateLeaf>;
export interface CompletedOption {branch:GameEngine;state:GameState;plan:PlanStep[];freeAttacks:number;lightScore:number;}
export const COMPLETION_RECHECK_LIMIT=2;

/** 复用已经执行的分支，只对致死见证相关完结补算完整叶子；不增加己方搜索节点。 */
export function recoverCompletion(before:GameState,source:GameState,player:number,id:string,actorStart:Unit,original:Leaf,current:Leaf,options:CompletedOption[],chosen:PlanStep[],model:any,oldSchema:any,isComplete:(b:GameEngine,s:GameState)=>boolean){
    const threats=new Set(original.risks.filter(r=>r.lethal).flatMap(r=>r.witness.flatMap(a=>a.type==='attack'?[a.attackerId]:[])));
    const protectedIds=new Set(original.risks.filter(r=>r.lethal).map(r=>r.id));protectedIds.add(id);
    const relevant=(v:CompletedOption)=>{
        const action=v.plan[0].action;
        if(action.type==='attack'&&threats.has(action.targetId)){
            const old=source.units.find(u=>u.id===action.targetId),next=v.state.units.find(u=>u.id===action.targetId);
            return 1+(old?Math.max(0,old.hp-(next?.hp??0))/Math.max(1,old.hp):0);
        }
        if(action.type==='heal'&&protectedIds.has(action.targetId))return 1;
        return 0;
    };
    const selected=chosen[0]&&encodeAction(chosen[0].action);
    const candidates=options.filter(v=>v.plan.length===1&&v.plan[0].action.type!=='wait'&&encodeAction(v.plan[0].action)!==selected)
        .sort((a,b)=>relevant(b)-relevant(a)||b.lightScore-a.lightScore||(encodeAction(a.plan[0].action)<encodeAction(b.plan[0].action)?-1:1));
    let leaf=current,completion:CompletedOption|undefined,rechecks=0;
    for(const option of candidates){
        if(rechecks>=COMPLETION_RECHECK_LIMIT)break;
        if(!isComplete(option.branch,option.state))continue;
        rechecks++;const checked=evaluateLeaf(before,option.branch,player,id,model,oldSchema,actorStart);
        if(checked.riskKnown&&!checked.commanderLethal&&!checked.actorLethal&&checked.tactical>=original.tactical-.15&&checked.score>leaf.score+1e-10){leaf=checked;completion=option;}
    }
    return {leaf,completion,rechecks};
}
