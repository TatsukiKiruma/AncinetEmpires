import { GameEngine } from '../../src/game/engine';
import { calculateDamage,estimateCounterDamage,getLegalActions } from '../../src/game/rules';
import { getEffectiveStats,hasAbility,getMoveCostForUnit } from '../../src/game/abilities';
import { areEnemyPlayers } from '../../src/game/rule_config';
import type { Action,GameState,Unit } from '../../src/game/types';
import { movingThreat as original,type Exposure } from '../tactical_scale_20261018/threat';

export const SINGLE_AUDIT={calls:0,grouped:0,proposals:0,representatives:0,fallbacks:0};
let movesCache=new Map<string,Action[]>(),geometry=new Map<string,number>(),positiveCosts=new Map<string,boolean>(),stateGeometry=new WeakMap<GameState,number>();
export function beginSingleScope(){movesCache=new Map();geometry=new Map();positiveCosts=new Map();stateGeometry=new WeakMap();for(const k of Object.keys(SINGLE_AUDIT) as (keyof typeof SINGLE_AUDIT)[])SINGLE_AUDIT[k]=0;}
function legalMoves(engine:GameEngine,state:GameState,unit:Unit){
    let geom=stateGeometry.get(state);if(geom===undefined){const encoded=JSON.stringify([state.map,state.rules]);geom=geometry.get(encoded);if(geom===undefined){geom=geometry.size;geometry.set(encoded,geom);}stateGeometry.set(state,geom);}
    const costKey=JSON.stringify([geom,unit.unitClass,unit.apkMoveOverrides]);let positive=positiveCosts.get(costKey);if(positive===undefined){positive=state.map.tiles.every(row=>row.every(t=>getMoveCostForUnit(state,unit,t)>=1));positiveCosts.set(costKey,positive);}
    const distance=Math.max(getEffectiveStats(unit).move,unit.movementRemaining??0),occupants=state.units.filter(u=>!positive||Math.abs(u.pos.x-unit.pos.x)+Math.abs(u.pos.y-unit.pos.y)<=distance).map(u=>[u.id,u.ownerId,u.pos,u.unitClass]);
    const key=JSON.stringify([geom,state.currentPlayer,state.pendingUnitId,state.players.map(p=>[p.id,p.isAlive]),unit,occupants]);let moves=movesCache.get(key);
    if(!moves){moves=engine.getLegalActions(state.currentPlayer,{unitId:unit.id,skipRecruitment:true}).filter(a=>a.type==='move');movesCache.set(key,moves);}return moves;
}

/** 单行动者的相同战斗后效只执行一个权威代表；净化光环、突击和战役仍走原完整穷举。 */
export function movingThreat(engine:GameEngine,targets:readonly Unit[]):Map<string,Exposure>{
    SINGLE_AUDIT.calls++;const state=engine.getState(),active=state.units.filter(u=>u.ownerId===state.currentPlayer&&!u.hasActed&&!u.apkStatic);
    const immediate=engine.getLegalActions(state.currentPlayer,{skipMovement:true,skipRecruitment:true}).filter(a=>a.type==='wait');
    const unsupported=state.pendingUnitId||state.players.filter(p=>p.isAlive).length!==2||state.rules?.campaignEvents?.length||active.some(u=>hasAbility(u,'cleansing_aura')||hasAbility(u,'assault_troop'));
    if(immediate.length>1||unsupported){SINGLE_AUDIT.fallbacks++;return original(engine,targets);}
    SINGLE_AUDIT.grouped++;
    const result=new Map(targets.map(t=>[t.id,{damage:0,lethal:0,immediate:0,witness:null} as Exposure]));
    if(engine.isTerminal()||!targets.length)return result;
    for(const unit of active){
        const stats=getEffectiveStats(unit),relevant=targets.filter(t=>areEnemyPlayers(state,unit.ownerId,t.ownerId));
        const moves=unit.hasMoved||relevant.every(t=>Math.abs(t.pos.x-unit.pos.x)+Math.abs(t.pos.y-unit.pos.y)>stats.move+stats.maxRange)?[]:legalMoves(engine,state,unit);
        const outcomes=new Map<string,number>();
        for(const move of [null,...moves]){
            const pos=move&&move.type==='move'?move.to:unit.pos;
            if(!relevant.some(t=>{const d=Math.abs(t.pos.x-pos.x)+Math.abs(t.pos.y-pos.y);return d>=stats.minRange&&d<=stats.maxRange;}))continue;
            const projected=move?{...state,units:state.units.map(u=>u.id===unit.id?{...u,pos,hasMoved:true}:u)}:state;
            for(const attack of getLegalActions(projected,state.currentPlayer,{unitId:unit.id,onlyAttacks:true})){
                if(attack.type!=='attack')continue;const target=relevant.find(t=>t.id===attack.targetId);if(!target)continue;SINGLE_AUDIT.proposals++;
                // 主伤与反击均调用公共规则；同一目标的升级、存亡、地形/墓碑后效因此相同。
                // 排除突击剩余移动力、净化和战役后，落点只通过伤害、反击、地形和墓碑影响目标HP。
                // 同一目标的原有/新附状态也相同，毒的回合开始结算仍由代表引擎执行。
                const key=JSON.stringify([unit.id,target.id,calculateDamage(projected,unit.id,target.id),estimateCounterDamage(projected,unit.id,target.id),state.map.tiles[pos.y][pos.x],state.graves?.find(g=>g.pos.x===pos.x&&g.pos.y===pos.y)??null]);
                let damage=outcomes.get(key);
                if(damage===undefined){
                    const branch=engine.clone();if(move&&branch.step(move).info.includes('非法动作'))throw Error('单军代表移动非法');
                    const moved=branch.getState();if(branch.isTerminal()||moved.currentPlayer!==state.currentPlayer)continue;
                    const hit=branch.step(attack);if(hit.info.includes('非法动作'))throw Error('单军代表攻击非法');
                    damage=Math.max(0,target.hp-(hit.state.units.find(u=>u.id===target.id)?.hp??0));outcomes.set(key,damage);SINGLE_AUDIT.representatives++;
                }
                const value=result.get(target.id)!;if(!move)value.immediate=Math.max(value.immediate,damage);
                if(damage>value.damage)Object.assign(value,{damage,lethal:Number(damage>=target.hp),witness:{move,attack}});
            }
        }
    }
    return result;
}
