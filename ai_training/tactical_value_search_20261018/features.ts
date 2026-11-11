import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { isCommanderUnit,getTileIncome } from '../../src/game/rule_config';
import { calculateDamage } from '../../src/game/rules';
import { nextOpponent } from '../tactical_scale_20261018/threat';
import { actorId } from '../tactical_scale_20261018/tactics';
import { beginFocusScope,focusThreat } from './focus_threat';
import type { Action,GameState } from '../../src/game/types';

export const FOCUS_KEYS=['actor_focus_damage','actor_focus_lethal','actor_relaxed_top3_damage','actor_focus_attackers','commander_focus_damage','commander_focus_lethal','commander_relaxed_top3_damage','focus_known','can_still_recruit','has_free_attack'].map(k=>'tactic_v4.'+k);
export function extendFeatures(engine:GameEngine,actions:readonly Action[]){
    beginFocusScope();const before=engine.getState(),player=before.currentPlayer;
    const commanders=before.units.filter(u=>u.ownerId===player&&isCommanderUnit(before,u,player)).map(u=>u.id);
    // 全局收尾提示独立于当前候选子集，攻击条件前向不能把仍可招募误记为否。
    const global=engine.getLegalActions(player,{skipMovement:true});
    const canRecruit=global.some(a=>a.type.startsWith('recruit_'));
    const freeAttack=global.some(a=>{
        if(a.type!=='attack'||calculateDamage(before,a.attackerId,a.targetId)<=0)return false;
        const b=engine.clone(),attacker=before.units.find(u=>u.id===a.attackerId)!;b.step(a);
        return (b.getState().units.find(u=>u.id===a.attackerId)?.hp??0)>=attacker.hp;
    });
    return actions.map(action=>{
        const branch=engine.clone(),result=branch.step(action);if(result.info.includes('非法动作'))throw Error('扩展特征输入非法:'+encodeAction(action));
        const id=actorId(action,before,result.state),reply=nextOpponent(branch,player),s=reply.branch.getState();
        const actor=reply.known&&id&&s.units.some(u=>u.id===id)?focusThreat(reply.branch,id):null;
        const risks=reply.known?commanders.filter(id=>s.units.some(u=>u.id===id)).map(id=>focusThreat(reply.branch,id)):[];
        return [actor?.damage??0,actor?.lethal??0,actor?.relaxed??0,actor?.attackers??0,Math.max(0,...risks.map(r=>r.damage)),Math.max(0,...risks.map(r=>r.lethal)),Math.max(0,...risks.map(r=>r.relaxed)),Number(reply.known),Number(canRecruit),Number(freeAttack)]
            .map((v,i)=>Math.fround([0,2,4,6].includes(i)?v/128:i===3?v/3:v));
    });
}

/** 双方经济、军力与阶段摘要；只读公共状态，价值目标不参与输入。 */
export function valueSummary(s:GameState,focus:number[][]):number[]{
    const player=s.currentPlayer,ids=[player,...s.players.filter(p=>p.id!==player).map(p=>p.id)].slice(0,2),out:number[]=[];
    for(const id of ids){
        const units=s.units.filter(u=>u.ownerId===id),commanders=units.filter(u=>isCommanderUnit(s,u,id));
        const tiles=s.map.tiles.flat().filter(t=>t.ownerId===id);
        out.push((s.players.find(p=>p.id===id)?.gold??0)/1024,units.length/32,units.reduce((n,u)=>n+u.hp,0)/4096,
            commanders.reduce((n,u)=>n+u.hp,0)/128,commanders.length,tiles.reduce((n,t)=>n+getTileIncome(s,t),0)/512,
            tiles.length/32,units.filter(u=>!u.hasActed).length/32);
    }
    out.push(Math.min(s.turn,100)/100,Number(s.turn<=5),Number(s.turn>=6&&s.turn<=15),Number(s.turn>=16),
        Math.max(0,...focus.map(r=>r[4])),Math.max(0,...focus.map(r=>r[5])),focus[0]?.[8]??0,focus[0]?.[9]??0);
    return out.map(Math.fround);
}
