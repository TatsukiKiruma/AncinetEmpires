import type { GameState } from '../../../src/game/types';
const readonlyTiles=new WeakSet<object>();
const identities=new WeakMap<object,Map<string,{epoch:number;geom:number}>>();
const maps=new Map<string,GameState['map']>();
export function registerReadonlyTiles(tiles:GameState['map']['tiles']){readonlyTiles.add(tiles);}
export function isReadonlyTiles(tiles:GameState['map']['tiles']){return readonlyTiles.has(tiles);}
/** 仅合并完全相同且所有字段均为无损JSON标量的模型地图。 */
export function internReadonlyMap(map:GameState['map']){
    if(readonlyTiles.has(map.tiles))return map;
    const scalar=(value:any)=>value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);
    if(Object.keys(map).some(key=>key!=='tiles'&&!scalar((map as any)[key]))||map.tiles.some(row=>row.some(tile=>Object.keys(tile).some(key=>!scalar((tile as any)[key])))))return map;
    const key=JSON.stringify(map),prior=maps.get(key);if(prior)return prior;
    for(const row of map.tiles){for(const tile of row)Object.freeze(tile);Object.freeze(row);}Object.freeze(map.tiles);Object.freeze(map);
    readonlyTiles.add(map.tiles);if(maps.size>=64)maps.clear();maps.set(key,map);return map;
}
function signature(state:GameState){const {tiles:_tiles,...properties}=state.map;return JSON.stringify([properties,state.rules]);}
export function lookupReadonlyGeometry(state:GameState,epoch:number){
    if(!readonlyTiles.has(state.map.tiles))return undefined;
    const prior=identities.get(state.map.tiles)?.get(signature(state));return prior?.epoch===epoch?prior.geom:undefined;
}
export function rememberReadonlyGeometry(state:GameState,epoch:number,geom:number){
    if(!readonlyTiles.has(state.map.tiles))return;
    let records=identities.get(state.map.tiles);if(!records){records=new Map();identities.set(state.map.tiles,records);}
    if(records.size>=256)records.clear();records.set(signature(state),{epoch,geom});
}
