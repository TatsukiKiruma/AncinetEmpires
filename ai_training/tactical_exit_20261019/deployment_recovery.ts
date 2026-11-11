import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {evaluateLeaf} from './leaf';
import {isProductiveFollow} from './plan_commit';
import {actorId} from '../tactical_scale_20261018/tactics';
import {COMPLETION_RECHECK_LIMIT,type CompletedOption} from './completion_recovery';
import type {PlanStep} from './model_battle_search_ai';
import type {Action,GameState,Unit} from '../../src/game/types';

type Leaf=ReturnType<typeof evaluateLeaf>;
export interface RejectedDeployment {leaf:Leaf;plan:PlanStep[];options:CompletedOption[];}
const finisher=(v:CompletedOption):Action=>v.plan.find(p=>p.action.type!=='move'&&p.action.type!=='post_attack_move')!.action;
const signature=(plan:PlanStep[])=>plan.map(p=>encodeAction(p.action)).join('|');

/** 只复核已执行的部署完结，不新增移动、攻击节点或分支网络前向。 */
export function recoverDeployment(before:GameState,player:number,id:string,actor:Unit,current:Leaf,rejected:RejectedDeployment[],model:any,oldSchema:any){
    const candidates=rejected.flatMap(source=>{
        const threats=new Set(source.leaf.risks.filter(r=>r.lethal).flatMap(r=>r.witness.flatMap(a=>a.type==='attack'?[a.attackerId]:[])));
        const protectedIds=new Set(source.leaf.risks.filter(r=>r.lethal).map(r=>r.id));protectedIds.add(id);
        return source.options.filter(v=>signature(v.plan)!==signature(source.plan)&&finisher(v).type!=='wait').map(option=>{
            const a=finisher(option),priority=a.type==='attack'&&threats.has(a.targetId)?2:a.type==='heal'&&protectedIds.has(a.targetId)?1:0;
            return {source,option,priority,key:signature(option.plan)};
        });
    }).sort((a,b)=>b.priority-a.priority||b.option.lightScore-a.option.lightScore||(a.key<b.key?-1:a.key>b.key?1:0));
    let leaf=current,rechecks=0,chosen:{option:CompletedOption;rejected:RejectedDeployment}|undefined;
    const seen=new Set<string>();
    for(const {source,option,key} of candidates){
        if(rechecks>=COMPLETION_RECHECK_LIMIT)break;if(seen.has(key))continue;seen.add(key);
        const s=option.state,complete=option.branch.isTerminal()||s.currentPlayer!==player||!option.branch.getLegalActions(player,{unitId:id,skipRecruitment:true}).some(a=>actorId(a,s,s)===id);
        if(!complete)continue;rechecks++;
        const checked=evaluateLeaf(before,option.branch,player,id,model,oldSchema,actor);
        if(isProductiveFollow({...checked,complete:true,plan:option.plan,freeAttacks:option.freeAttacks})&&checked.tactical>=source.leaf.tactical-.15&&checked.tactical>=current.tactical-.15&&checked.score>source.leaf.score+1e-10&&checked.score>leaf.score+1e-10){leaf=checked;chosen={option,rejected:source};}
    }
    return {leaf,rechecks,chosen};
}
