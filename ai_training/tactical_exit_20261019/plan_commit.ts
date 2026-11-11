import type { Action } from '../../src/game/types';

interface ProductivePlan {
    complete:boolean;riskKnown:boolean;commanderLethal:boolean;actorLethal:boolean;
    plan:{action:Action}[];captures:number;enemyKills:number;net:number;healingNet:number;freeAttacks:number;
}
/** 默认动作的安全有效后续也应落实；无收益待机仍留给下一次真实决策。 */
export function isProductiveFollow(v:ProductivePlan):boolean{
    if(!v.complete||!v.riskKnown||v.commanderLethal||v.actorLethal||!v.plan.some(p=>p.action.type!=='wait'))return false;
    return v.captures>0||v.enemyKills>0||v.net>0||v.healingNet>0||v.freeAttacks>0||v.plan.some(p=>p.action.type==='summon'||p.action.type==='support');
}
