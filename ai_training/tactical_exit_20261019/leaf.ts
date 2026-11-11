import { GameEngine } from '../../src/game/engine';
import { calculateArmyValue } from '../../src/game/env';
import { getAllianceId,isCommanderUnit } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { beginFocusScope,focusThreat,type FocusRisk } from './focus_threat';
import { movingThreat,beginThreatScope } from './shared_single_threat';
import { evaluateValue,commanderRisks,opponentSnapshot,type StateRisk } from './value_state';
import type { Action,GameState,Unit } from '../../src/game/types';

export function unitArmy(s:GameState,id:number){return calculateArmyValue(s,id)-(s.players.find(p=>p.id===id)?.gold??0);}
/** 只比较原有单位的军力损失；新兵不会凭空产生战斗收益。 */
export function ledger(before:GameState,after:GameState,player:number){
    const enemy=before.players.find(p=>p.id!==player)!.id;
    const loss=(id:number)=>{
        let damage=0,recovered=0;
        for(const u of before.units.filter(u=>u.ownerId===id)){
            const retained=after.units.find(v=>v.id===u.id),old=unitArmy({...before,units:[u]},id),next=retained?unitArmy({...after,units:[retained]},id):0;
            damage+=Math.max(0,old-next);recovered+=Math.max(0,next-old);
        }
        return {damage,recovered};
    };
    const own=loss(player),other=loss(enemy),ownLoss=own.damage,enemyLoss=other.damage;
    const added=after.units.filter(u=>u.ownerId===player&&!before.units.some(v=>v.id===u.id));
    const recruitedValue=unitArmy({...after,units:added},player);
    const goldSpent=Math.max(0,(before.players.find(p=>p.id===player)?.gold??0)-(after.players.find(p=>p.id===player)?.gold??0));
    // 招募的+1存活单位常数不是收益；成本差额不能抵销真实战损。
    const recruitSurplus=Math.min(0,recruitedValue-added.length-goldSpent);
    let castles=0,towns=0,enemyCastlesCaptured=0,captures=0;
    before.map.tiles.forEach((row,y)=>row.forEach((tile,x)=>{
        const next=after.map.tiles[y][x],key=getTileTerrainKey(tile),nextKey=getTileTerrainKey(next);
        // 同时比较地形类型与归属，修复/摧毁村庄也产生真实的收入建筑差额。
        const change=(kind:string,id:number)=>Number(nextKey===kind&&next.ownerId===id)-Number(key===kind&&tile.ownerId===id);
        castles+=change('castle',player)-change('castle',enemy);towns+=change('town',player)-change('town',enemy);
        enemyCastlesCaptured+=Number(key==='castle'&&nextKey==='castle'&&tile.ownerId===enemy&&next.ownerId===player);
        captures+=Number((nextKey==='castle'||nextKey==='town')&&tile.ownerId!==player&&next.ownerId===player);
    }));
    const dead=(id:number)=>before.units.filter(u=>u.ownerId===id&&!after.units.some(v=>v.id===u.id));
    const ownDead=dead(player),enemyDead=dead(enemy);
    return {net:(enemyLoss-ownLoss+recruitSurplus)/1024,enemyLoss,ownLoss,healingNet:own.recovered-other.recovered,recruitedValue,goldSpent,recruitSurplus,castles,towns,captures,recruits:added.length,enemyCastlesCaptured,
        enemyKills:enemyDead.length,enemyCommanderKills:enemyDead.filter(u=>isCommanderUnit(before,u,enemy)).length,ownCommanderLost:ownDead.filter(u=>isCommanderUnit(before,u,player)).length};
}
export interface RiskRecord {id:string;commander:boolean;damage:number;lethal:number;hp:number;army:number;witness:Action[];replyState:GameState;focus?:FocusRisk;}
/** 风控另建对手投影；己方叶子仍保留所有未行动队友。 */
export function retaliation(engine:GameEngine,player:number,actor?:string,snapshot?:GameState){
    const before=snapshot??engine.getState(),reply=opponentSnapshot(engine,player,before),s=reply.state,out:RiskRecord[]=[];beginFocusScope();
    if(!reply.known)return {known:false,risks:out};
    const targets=before.units.filter(u=>u.ownerId===player&&(u.id===actor||isCommanderUnit(before,u,player)));
    beginThreatScope();const singles=reply.branch.isTerminal()?new Map():movingThreat(reply.branch,s.units.filter(u=>targets.some(v=>v.id===u.id)),s);
    for(const u of targets){
        const live=s.units.find(v=>v.id===u.id);let r:FocusRisk|undefined;
        if(live&&!reply.branch.isTerminal())r=focusThreat(reply.branch,u.id,s);
        const single=singles.get(u.id),useSingle=!!single&&((single.lethal>(r?.lethal??0))||single.damage>(r?.damage??0));
        const sw=single?.witness as {move:Action|null;attack:Action}|undefined;
        out.push({id:u.id,commander:isCommanderUnit(before,u,player),hp:u.hp,army:unitArmy({...before,units:[u]},player),damage:!live?u.hp:Math.max(r?.damage??0,single?.damage??0),lethal:!live?1:Math.max(r?.lethal??0,single?.lethal??0),witness:useSingle&&sw?[...(sw.move?[sw.move]:[]),sw.attack]:r?.witness??[],replyState:s,focus:r});
    }
    return {known:true,risks:out};
}
export function evaluateLeaf(before:GameState,engine:GameEngine,player:number,actor:string|undefined,model:any,oldSchema:any,actorStart?:Unit){
    const after=engine.getState(),events=ledger(before,after,player),naturalWin=after.winner!==null&&after.winner===getAllianceId(after,player);
    const danger=after.winner===null?retaliation(engine,player,actor,after):{known:true,risks:[] as RiskRecord[]};
    const commanderLethal=events.ownCommanderLost>0||danger.risks.some(r=>r.commander&&!!r.lethal),actorRisk=danger.risks.find(r=>r.id===actor);
    const actorUnit=actorStart??before.units.find(u=>u.id===actor),actorLost=!!actorUnit&&!after.units.some(u=>u.id===actorUnit.id);
    const actorLethal=actorLost||!!actorRisk?.lethal,exposure=danger.risks.reduce((n,r)=>n+r.damage/Math.max(1,r.hp)*r.army/1024,0);
    // 普通单位按行动前真实现存军力分类；指挥官无论残血多少都保留显式保护。
    const actorCapital=actorUnit?Math.max(0,unitArmy({...before,units:[actorUnit]},player)-1):0;
    const highValueActor=!!actorUnit&&(isCommanderUnit(before,actorUnit,player)||isCommanderUnit(after,actorUnit,player)||actorUnit.unitClass==='commander'||actorCapital>=200);
    // 即时阵亡已由真实净战损扣除，只对仍存活单位的未来致死风险计额外军力损失。
    const actorFutureLoss=!actorLost&&actorRisk?.lethal?actorRisk.army:0;
    const prepared:StateRisk[]=danger.risks.filter(r=>r.commander&&r.focus).map(r=>({id:r.id,owner:player,known:danger.known,risk:r.focus!}));
    const value=after.winner!==null?(naturalWin?1:after.winner===-1?0:-1):evaluateValue(engine,model,oldSchema,commanderRisks(engine,prepared,after),after)*(after.currentPlayer===player?1:-1);
    const tactical=events.net+.05*events.healingNet/1024+.18*events.castles+.09*events.towns+.5*(events.enemyCommanderKills-events.ownCommanderLost);
    const score=after.winner!==null?value*10:value*.25+tactical-.25*exposure-1.5*Number(commanderLethal)-.35*actorFutureLoss/1024;
    return {score,value,tactical,exposure,naturalWin,commanderLethal,actorLethal,actorLost,actorCapital,actorFutureLoss,highValueActor,riskKnown:danger.known,risks:danger.risks,...events};
}
