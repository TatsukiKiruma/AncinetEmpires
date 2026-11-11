import { GameEngine } from '../../src/game/engine';
import { getEffectiveStats,getMoveCostForUnit } from '../../src/game/abilities';
import type { Action,Unit,GameState } from '../../src/game/types';
import { exactGeometryEquals } from './geometry_equal';
let movesCache=new Map<string,Action[]>();
let geometry=new Map<string,number>(),positiveCosts=new Map<string,boolean>();
let geometryEpoch=0;
let stateGeometry=new WeakMap<GameState,number>();
let lastGeometry:{id:number;map:GameState['map'];rules:GameState['rules']}|undefined;
export const MOVEMENT_CACHE_AUDIT={geometryHits:0,structuralHits:0,geometryMisses:0,positiveHits:0,positiveMisses:0,moveHits:0,moveMisses:0,evictions:0};

/** 只清理快照身份；完整签名缓存跨查询作用域有界复用。 */
export function beginMovementScope(){stateGeometry=new WeakMap();}
export function clearMovementCache(){geometryEpoch++;geometry.clear();positiveCosts.clear();movesCache.clear();stateGeometry=new WeakMap();lastGeometry=undefined;}

/** 淘汰代数属于几何身份，避免其他局内缓存把淘汰前后的同号几何混为一谈。 */
export function geometryIdentity(s:GameState){
    let geom=stateGeometry.get(s);
    if(geom===undefined){
        if(lastGeometry&&exactGeometryEquals(s.map,lastGeometry.map)&&exactGeometryEquals(s.rules,lastGeometry.rules)){geom=lastGeometry.id;MOVEMENT_CACHE_AUDIT.structuralHits++;}
        else{
            const encoded=JSON.stringify([s.map,s.rules]);geom=geometry.get(encoded);
            if(geom===undefined){MOVEMENT_CACHE_AUDIT.geometryMisses++;if(geometry.size>=256){clearMovementCache();MOVEMENT_CACHE_AUDIT.evictions++;}geom=geometry.size;geometry.set(encoded,geom);}else MOVEMENT_CACHE_AUDIT.geometryHits++;
            // 独立保存已知几何，调用者随后修改旧快照也不能污染快捷判等依据。
            const copy=JSON.parse(encoded);lastGeometry={id:geom,map:copy[0],rules:s.rules===undefined?undefined:copy[1]};
        }
        stateGeometry.set(s,geom);
    }
    return {geom,epoch:geometryEpoch};
}
export function movementGeometry(s:GameState,unit:Unit){
    const {geom}=geometryIdentity(s);
    const costKey=JSON.stringify([geom,unit.unitClass,unit.apkMoveOverrides]);let positive=positiveCosts.get(costKey);
    if(positive===undefined){MOVEMENT_CACHE_AUDIT.positiveMisses++;positive=s.map.tiles.every(row=>row.every(t=>getMoveCostForUnit(s,unit,t)>=1));if(positiveCosts.size>=4096){positiveCosts.clear();MOVEMENT_CACHE_AUDIT.evictions++;}positiveCosts.set(costKey,positive);}else MOVEMENT_CACHE_AUDIT.positiveHits++;
    return {geom,positive};
}
/** 复用权威移动集合；只有全图步价至少1时才裁掉半径外占位。 */
export function cachedThreatMoves(engine:GameEngine,unit:Unit,s:GameState){
    const distance=Math.max(getEffectiveStats(unit).move,unit.movementRemaining??0),{geom,positive}=movementGeometry(s,unit);
    const occupants=s.units.filter(u=>!positive||Math.abs(u.pos.x-unit.pos.x)+Math.abs(u.pos.y-unit.pos.y)<=distance).map(u=>[u.id,u.ownerId,u.pos,u.unitClass]);
    const key=JSON.stringify([geom,s.currentPlayer,s.turn,s.pendingUnitId,s.units.find(u=>u.id===s.pendingUnitId),s.players,s.graves,unit,occupants]);
    let moves=movesCache.get(key);
    if(!moves){MOVEMENT_CACHE_AUDIT.moveMisses++;moves=engine.getLegalActions(s.currentPlayer,{unitId:unit.id,skipRecruitment:true,onlyOrdinaryMoves:true});if(movesCache.size>=4096){movesCache.clear();MOVEMENT_CACHE_AUDIT.evictions++;}movesCache.set(key,moves);}else MOVEMENT_CACHE_AUDIT.moveHits++;
    return moves;
}

