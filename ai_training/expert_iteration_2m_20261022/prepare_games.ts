/** 在优化器与代际选择之前冻结额外开发和最终评测的开局谱系。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap,getAppApkSkirmishMapOptions } from '../../src/game/apk_skirmish_map_assets';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
const dir=path.dirname(fileURLToPath(import.meta.url)),target=path.join(dir,'evaluation-plan.json');if(fs.existsSync(target))throw Error('拒绝覆盖冻结开局');
const maps=getAppApkSkirmishMapOptions().filter(m=>m.playerCount===2).map(m=>m.name),states=new Set<string>(),dev:any[]=[],final:any[]=[],exclusions=new Set<string>();
for(const split of ['dev','final'])for(let family=0;family<(split==='final'?50:10);family++){
    let value=(split==='final'?99221000:88221000)+family;const seed=value,rng=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
    const map=maps[family%maps.length],gold=split==='final'?50*(1+(family*7)%39):50*(1+(family*11)%39),initial=createApkSkirmishGameState(parseAppApkSkirmishMap(map),{mode:'SD',mapName:map,setup:{initialGold:gold,unitLimit:30,levelCap:3}});
    const engine=new GameEngine(initial,{applyInitialTurnStart:false}),prefix=[];
    for(let step=0;step<12&&!engine.isTerminal();step++){
        const legal=engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender'&&a.type!=='end_turn');
        if(!legal.length)break;const a=legal[Math.floor(rng()*legal.length)];prefix.push(a);engine.step(a);
    }
    if(engine.isTerminal())throw Error('评测开局前缀意外终局，必须保留失败并修订协议');
    const state=engine.getState(),key=ruleStateHash(state);if(states.has(key))throw Error('评测开局谱系重复');states.add(key);exclusions.add(key);
    for(let seat=0;seat<2;seat++)(split==='final'?final:dev).push({id:`${split}-${family}-${seat}`,split,map,seat,seed,initial:state,openingLineage:`${split}:${key}`,openingPrefix:{initial,actions:prefix},budgetMs:4000,opponent:'Original-APKlikeAI-Hard'});
}
const protocol={dev,final,finalFamilies:50,finalGames:100,qualification:'同谱系换边成对；新派生开局不等于新的原生地图，历史未知真人谱系不能完全证明排除。最终结果只在冻结模型之后访问'};
fs.writeFileSync(target,JSON.stringify(protocol));fs.writeFileSync(path.join(dir,'new-evaluation-exclusions.txt.gz'),gzipSync([...exclusions].sort().join('\n')+'\n'));
fs.writeFileSync(path.join(dir,'evaluation-plan-identity.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),devGames:dev.length,finalGames:final.length,allStatesUnique:true},null,2));
console.log(JSON.stringify({dev:dev.length,final:final.length}));
