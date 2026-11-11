import { GameEngine } from '../../src/game/engine';
import { isCommanderUnit } from '../../src/game/rule_config';
import { calculateDamage } from '../../src/game/rules';
import { nextOpponent } from '../tactical_scale_20261018/threat';
import { beginFocusScope,focusThreat } from './focus_threat';
import { valueSummary } from './features';
import type { Action } from '../../src/game/types';

/** 只计算价值摘要实际使用的指挥官风险；默认候选特征与数据生成保持原实现。 */
export function runtimeValueSummary(engine:GameEngine,actions:readonly Action[]){
    if(!actions.length)return valueSummary(engine.getState(),[]);
    const before=engine.getState(),player=before.currentPlayer,commanders=before.units.filter(u=>u.ownerId===player&&isCommanderUnit(before,u,player)).map(u=>u.id);
    const global=engine.getLegalActions(player,{skipMovement:true}),canRecruit=global.some(a=>a.type.startsWith('recruit_'));
    const freeAttack=global.some(a=>{
        if(a.type!=='attack'||calculateDamage(before,a.attackerId,a.targetId)<=0)return false;
        const branch=engine.clone(),attacker=before.units.find(u=>u.id===a.attackerId)!;branch.step(a);
        return (branch.getState().units.find(u=>u.id===a.attackerId)?.hp??0)>=attacker.hp;
    });
    let damage=0,lethal=0;beginFocusScope();
    if(commanders.length)for(const action of actions){
        const branch=engine.clone(),result=branch.step(action);if(result.info.includes('非法动作'))throw Error('价值摘要候选非法');
        const reply=nextOpponent(branch,player);if(!reply.known)continue;
        const state=reply.branch.getState();
        for(const id of commanders){
            if(!state.units.some(u=>u.id===id))continue;
            const risk=focusThreat(reply.branch,id);damage=Math.max(damage,risk.damage);lethal=Math.max(lethal,risk.lethal);
        }
    }
    return valueSummary(before,[[0,0,0,0,Math.fround(damage/128),lethal,0,0,Number(canRecruit),Number(freeAttack)]]);
}
