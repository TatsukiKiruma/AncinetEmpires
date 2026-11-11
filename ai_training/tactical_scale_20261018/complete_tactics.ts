import { GameEngine } from '../../src/game/engine';
import { hasAbility,isUndead } from '../../src/game/abilities';
import { areEnemyPlayers,isCommanderUnit } from '../../src/game/rule_config';
import type { Action,GameState } from '../../src/game/types';
import { extractFeatures as extractV2,actorId } from './tactics';
import { nextOpponent,movingThreatExhaustive } from './threat';

/** 同侧精灵与亡灵可能改变行动后的自动换手条件，不能以攻击公式上界筛选。 */
export function requiresAuraCorrection(state: GameState) {
    const enemies=state.units.filter(u=>areEnemyPlayers(state,state.currentPlayer,u.ownerId));
    return enemies.some(u=>hasAbility(u,'cleansing_aura')) && enemies.some(isUndead);
}

export function correctAuraFeatures(engine: GameEngine,actions: readonly Action[],features: {old:number[][];extra:number[][]}) {
    const before=engine.getState(),player=before.currentPlayer;
    if(!requiresAuraCorrection(before))return { branches:0,changed:0 };
    const commanders=before.units.filter(u=>u.ownerId===player&&isCommanderUnit(before,u,player)).map(u=>u.id);
    let branches=0,changed=0;
    actions.forEach((action,index)=>{
        const branch=engine.clone(),result=branch.step(action);
        if(result.info.includes('非法动作'))throw Error('v3校正输入非法');
        const id=actorId(action,before,result.state),reply=nextOpponent(branch,player);
        if(!reply.known||reply.branch.isTerminal())return;
        const s=reply.branch.getState(),current=s.units.filter(u=>u.ownerId===s.currentPlayer);
        if(!current.some(u=>hasAbility(u,'cleansing_aura'))||!current.some(isUndead))return;
        const targets=s.units.filter(u=>u.id===id||commanders.includes(u.id));
        const risks=movingThreatExhaustive(reply.branch,targets);
        const actor=id?risks.get(id):undefined,actorUnit=s.units.find(u=>u.id===id);
        const commander=commanders.map(c=>risks.get(c)).filter(Boolean);
        const replacements:[[number,number],...[number,number][]]=[[4,(actor?.damage??0)/128],[5,actor?.lethal??0],[7,Math.max(0,...commander.map(r=>r!.damage))/128],[8,Math.max(0,...commander.map(r=>r!.lethal))]];
        const immediate=Math.fround((actor?.immediate??0)/128),immediateLethal=Number(!!actorUnit&&(actor?.immediate??0)>=actorUnit.hp);
        if(replacements.some(([i,value])=>features.extra[index][i]!==Math.fround(value))||features.old[index][6]!==immediate||features.old[index][7]!==immediateLethal)changed++;
        for(const [i,value] of replacements)features.extra[index][i]=Math.fround(value);
        features.old[index][6]=immediate;
        features.old[index][7]=immediateLethal;
        branches++;
    });
    return {branches,changed};
}

/** v3完整入口：保留v2所有功能，在组合光环状态额外执行完整结算。 */
export function extractFeatures(engine: GameEngine,actions: readonly Action[]) {
    const features=extractV2(engine,actions);
    const correction={branches:0,changed:0};
    return {...features,stats:{...features.stats,auraCorrection:correction}};
}
