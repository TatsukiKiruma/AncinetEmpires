import { isCommanderUnit } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import type { Action,GameState } from '../../src/game/types';

export interface FriendlyEvents {enemyKills:number;enemyCommanderKills:number;enemyCastlesCaptured:number;captures:number;recruits:number;freeAttacks:number;}
export function friendlyEvents(before:GameState,after:GameState,player:number,actions:Action[],freeAttacks:number):FriendlyEvents{
    const enemy=before.players.find(p=>p.id!==player)!.id,lost=before.units.filter(u=>u.ownerId===enemy&&!after.units.some(v=>v.id===u.id));let castles=0;
    before.map.tiles.forEach((row,y)=>row.forEach((tile,x)=>{castles+=Number(getTileTerrainKey(tile)==='castle'&&tile.ownerId===enemy&&after.map.tiles[y][x].ownerId===player);}));
    return {enemyKills:lost.length,enemyCommanderKills:lost.filter(u=>isCommanderUnit(before,u,enemy)).length,enemyCastlesCaptured:castles,captures:actions.filter(a=>a.type==='capture').length,recruits:actions.filter(a=>a.type.startsWith('recruit_')).length,freeAttacks};
}
/** 模型分差只能排序实际实现目标的候选，不能单凭分数接管普通安全动作。 */
export function verifiedTakeover(rootType:Action['type'],primary:FriendlyEvents,candidate:FriendlyEvents){
    if(candidate.enemyCommanderKills>primary.enemyCommanderKills||candidate.enemyCastlesCaptured>primary.enemyCastlesCaptured)return true;
    if(rootType!=='end_turn'&&rootType!=='wait')return false;
    return candidate.enemyKills>primary.enemyKills||candidate.captures>primary.captures||candidate.recruits>primary.recruits||candidate.freeAttacks>primary.freeAttacks;
}
