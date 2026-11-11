import fs from 'node:fs';
import assert from 'node:assert/strict';

const replaceOnce=(source:string,old:string,next:string)=>{assert.equal(source.split(old).length,2,'待优化源码身份变化：'+old.slice(0,80));return source.replace(old,next);};

/** 命中仍核验数值可编码性；缓存只跳过相同只读记录的重复展开与JSON分配。 */
export function optimizeTokenIdentity(source:string){
    source=replaceOnce(source,'rows:Map<string,Sparse>','rows:Map<string,Sparse>;identities:WeakMap<object,Sparse>');
    source=replaceOnce(source,'rows:new Map()','rows:new Map(),identities:new WeakMap()');
    source=replaceOnce(source,'const tokens=packet.tokens.map(record=>{',`const tokens=packet.tokens.map(record=>{
        const frozen=Object.isFrozen(record),identity=frozen?cache!.identities.get(record):undefined;
        if(identity)return identity;`);
    source=replaceOnce(source,'        return row;','        if(frozen)cache!.identities.set(record,row);\n        return row;');
    return source;
}

/** 仅缓存既有单兵提议；状态其余字段、几何代数、目标及完整权威移动列表全部进入身份。 */
export function optimizeProposals(source:string){
    source=replaceOnce(source,"import { beginMovementScope,movementGeometry as geometryCosts,cachedThreatMoves as legalMoves } from './movement_query_cache';", "import { beginMovementScope,movementGeometry as geometryCosts,cachedThreatMoves as legalMoves,geometryIdentity } from './movement_query_cache';");
    source=replaceOnce(source,'        let best:typeof out[number]|undefined;',`        const {map:_map,rules:_rules,...properties}=s;
        const pendingForKey=s.units.find(u=>u.id===s.pendingUnitId);
        properties.units=[unit,...(target.id===unit.id?[]:[target]),...(pendingForKey&&pendingForKey.id!==unit.id&&pendingForKey.id!==target.id?[pendingForKey]:[])];
        const proposalKey=JSON.stringify([geometryIdentity(s),properties,moves]);
        if(phoneProposalCache.has(proposalKey)){
            phoneProposalAudit.hits++;
            const prior=phoneProposalCache.get(proposalKey);
            if(prior)out.push(structuredClone(prior));
            continue;
        }
        phoneProposalAudit.misses++;
        let best:typeof out[number]|undefined;`);
    source=replaceOnce(source,'        if(best)out.push(best);',`        if(phoneProposalCache.size>=8192){phoneProposalCache.clear();phoneProposalAudit.evictions++;}
        phoneProposalCache.set(proposalKey,best?structuredClone(best):null);
        if(best)out.push(best);`);
    return source+`\n// 有界缓存只保存可复算的单兵提议，不保存最终风险或Value。\nconst phoneProposalCache=new Map<string,any>();\nconst phoneProposalAudit={hits:0,misses:0,evictions:0};\n(globalThis as any).__stage5ProposalAudit=phoneProposalAudit;\n`;
}

export function performancePlugin(repo:string,target:string,proposals=true){
    return {name:'Chrome87同源重复计算优化',setup(builder:any){
        builder.onLoad({filter:/[\\/]tactical_exit_20261019[\\/]value_state\.ts$/},(args:any)=>{
            const contents=optimizeTokenIdentity(fs.readFileSync(args.path,'utf8'));
            fs.writeFileSync(target+'/value-state.optimized.ts.snapshot',contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:repo+'/ai_training/tactical_exit_20261019'};
        });
        if(proposals)builder.onLoad({filter:/[\\/]tactical_exit_20261019[\\/]focus_threat\.ts$/},(args:any)=>{
            const contents=optimizeProposals(fs.readFileSync(args.path,'utf8'));
            fs.writeFileSync(target+'/focus-proposals.optimized.ts.snapshot',contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:repo+'/ai_training/tactical_exit_20261019'};
        });
    }};
}
