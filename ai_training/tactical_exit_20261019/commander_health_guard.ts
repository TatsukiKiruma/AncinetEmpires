import { isCommanderUnit } from '../../src/game/rule_config';
import type { GameState } from '../../src/game/types';

interface ComparedLeaf {
    state:GameState;riskKnown:boolean;naturalWin:boolean;
    risks:{id:string;commander:boolean;hp:number;damage:number}[];
}
/** Veto不能为了普通单位，将原有指挥官换到更低的见证后剩余HP；不新增反扑搜索。 */
export function commanderHealthProtection(before:GameState,player:number,primary:ComparedLeaf,alternative:ComparedLeaf){
    return before.units.filter(u=>u.ownerId===player&&isCommanderUnit(before,u,player)).map(u=>{
        const baseUnit=primary.state.units.find(v=>v.id===u.id),baseRisk=primary.risks.find(r=>r.id===u.id&&r.commander),risk=alternative.risks.find(r=>r.id===u.id&&r.commander);
        const defeat=primary.state.winner!==null&&!primary.naturalWin;
        const baselineMode=defeat?'natural-loss':!baseUnit?'commander-already-lost':primary.riskKnown&&baseRisk?'known-witness':'current-hp-upper-bound';
        const baselineRemaining=defeat||!baseUnit?0:primary.riskKnown&&baseRisk?Math.max(0,baseRisk.hp-baseRisk.damage):baseUnit.hp;
        const remaining=alternative.riskKnown&&risk?Math.max(0,risk.hp-risk.damage):null;
        return {id:u.id,baselineMode,baselineRemaining,remaining,preserved:remaining!==null&&remaining>=baselineRemaining};
    });
}
