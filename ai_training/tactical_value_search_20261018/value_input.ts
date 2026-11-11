import { calculateArmyValue } from '../../src/game/env';
import type { GameState } from '../../src/game/types';

/** 与来源审计的静态军力对照完全相同，不含胜负标签或启发式AI评分。 */
export function armyFeature(state:GameState){
    const own=state.currentPlayer,enemy=state.players.find(p=>p.id!==own)!.id;
    return (calculateArmyValue(state,own)-calculateArmyValue(state,enemy))/1024;
}
export function valueInput(context:number[],summary:number[],model:any,army?:number){
    if(model.valueArmyFeature&&!Number.isFinite(army))throw Error('价值头缺少权威军力输入');
    return [...context,...summary,...(model.valueArmyFeature?[army!]:[])];
}
