import { GameEngine } from '../../src/game/engine';
import { getAllianceId,isCommanderUnit } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { evaluateValue } from './value_runtime';
import { legalActions } from './policy_runtime';
import type { GameState } from '../../src/game/types';

export interface Leaf {score:number;value:number;net:number;killed:number;castles:number;ownCommanderLost:number;criticalActorLost:number;naturalWin:boolean;}
/** 神经价值和实际引擎结算差额；没有启发式局面评分依赖。 */
export function evaluateLeaf(before:GameState,engine:GameEngine,player:number,criticalActor:string|undefined,model:any,oldSchema:any):Leaf{
    const after=engine.getState(),enemy=before.players.find(p=>p.id!==player)!.id;
    const hp=(s:GameState,id:number)=>s.units.filter(u=>u.ownerId===id).reduce((n,u)=>n+u.hp,0);
    const net=(hp(before,enemy)-hp(after,enemy)-hp(before,player)+hp(after,player))/128;
    const lost=(id:number)=>before.units.filter(u=>u.ownerId===id&&isCommanderUnit(before,u,id)&&!after.units.some(v=>v.id===u.id)).length;
    const killed=lost(enemy),ownCommanderLost=lost(player),criticalActorLost=Number(!!criticalActor&&before.units.some(u=>u.id===criticalActor)&&!after.units.some(u=>u.id===criticalActor));
    let castles=0;before.map.tiles.forEach((row,y)=>row.forEach((t,x)=>{
        if(getTileTerrainKey(t)!=='castle')return;
        const owner=after.map.tiles[y][x].ownerId;
        // 双方真实夺取与失去对称结算，不能只奖励己方夺城而漏掉对手夺城。
        castles+=Number(t.ownerId===enemy&&owner===player)-Number(t.ownerId===player&&owner===enemy);
    }));
    const naturalWin=after.winner!==null&&after.winner===getAllianceId(after,player);
    if(after.winner!==null)return {score:naturalWin?4:after.winner===-1?0:-4,value:naturalWin?1:after.winner===-1?0:-1,net,killed,castles,ownCommanderLost,criticalActorLost,naturalWin};
    const value=evaluateValue(engine,legalActions(engine),model,oldSchema)*(after.currentPlayer===player?1:-1);
    const score=Math.max(-3,Math.min(3,value+.1*net+.1*(killed-ownCommanderLost)+.05*castles));
    return {score,value,net,killed,castles,ownCommanderLost,criticalActorLost,naturalWin};
}
