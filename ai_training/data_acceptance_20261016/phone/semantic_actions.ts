import type { Action, GameState } from '../../../src/game/types';

// 实体ID由两套引擎分别生成；跨引擎比较时保留实体属性与pending角色，不把ID字符串当棋规差异。
export function semanticActionCodes(state:GameState,actions:readonly Action[]):string[]{
  const entityKeys=state.units.map(u=>JSON.stringify([u.ownerId,u.unitClass,u.pos.x,u.pos.y,u.id===state.pendingUnitId,u.apkUnitCode??null]));
  if(new Set(entityKeys).size!==entityKeys.length)throw Error('实体语义键不唯一，拒绝合并候选');
  const unit=(id:string)=>{
    const u=state.units.find(u=>u.id===id);if(!u)throw Error(`动作引用不存在的单位${id}`);
    return [u.ownerId,u.unitClass,u.pos.x,u.pos.y,u.id===state.pendingUnitId,u.apkUnitCode??null];
  };
  const grave=(id:string)=>{
    const g=state.graves?.find(g=>g.id===id);if(!g)throw Error(`动作引用不存在的墓碑${id}`);
    return [g.pos.x,g.pos.y,g.ownerId??null,g.remainingTurns];
  };
  return actions.map(action=>{
    const result:Record<string,unknown>={...action};
    for(const key of ['unitId','attackerId','targetId','healerId','summonerId','supporterId']){
      const value=result[key];if(typeof value==='string')result[key]=unit(value);
    }
    if(typeof result.graveId==='string')result.graveId=grave(result.graveId);
    return JSON.stringify(result);
  }).sort();
}
