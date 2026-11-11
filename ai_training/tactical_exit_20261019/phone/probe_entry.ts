export * from './runtime';
export { GameEngine } from '../../../src/game/engine';
export { evaluateValue,stateTokens,stateSummary,commanderRisks } from '../value_state';
export { encodePolicy } from '../encode';
export { infer } from '../policy_runtime';
export { cloneGameState } from '../../../src/game/clone_state';
export { extractFeatures } from '../combined_tactics';
export { geometryIdentity,clearMovementCache } from '../movement_query_cache';

/** 只比较属性复制分配；所有变体先核对输出与特殊键隔离。 */
export function probeRecordCopies(state:any){
    const rows=[...state.map.tiles.flat(),...state.players,...state.units],copies=new Map<string,(source:any)=>any>();
    const variants:Record<string,(source:any)=>any>={
        spread:source=>({...source}),
        assign:source=>Object.assign({},source),
        loop:source=>{const out:any={};for(const key of Object.keys(source))Object.defineProperty(out,key,{value:source[key],writable:true,enumerable:true,configurable:true});return out;},
        shape:source=>{
            const keys=Object.keys(source),key=keys.join('|');let copy=copies.get(key);
            if(!copy){copy=new Function('source','return {'+keys.map(key=>'['+JSON.stringify(key)+']:source['+JSON.stringify(key)+']').join(',')+'};') as any;copies.set(key,copy!);}
            return copy!(source);
        },
    };
    const result:any={};
    for(const [name,copy] of Object.entries(variants)){
        for(const row of rows)if(JSON.stringify(copy(row))!==JSON.stringify(row))throw Error('属性复制不一致:'+name);
        for(let warm=0;warm<5;warm++)for(const row of rows)copy(row);
        const samples:number[]=[];let checksum=0;
        for(let round=0;round<5;round++){
            const start=performance.now();for(let repeat=0;repeat<50;repeat++)for(const row of rows)checksum+=Object.keys(copy(row)).length;
            samples.push(performance.now()-start);
        }
        result[name]={samples,checksum};
    }
    return result;
}
