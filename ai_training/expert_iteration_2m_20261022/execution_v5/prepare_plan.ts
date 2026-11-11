/** 优化器启动前冻结新历史验证开局、换边配对及后续小批量训练采样。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';
import { createApkSkirmishGameState } from '../../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap,getAppApkSkirmishMapOptions } from '../../../src/game/apk_skirmish_map_assets';
import { ruleStateHash } from '../../data_acceptance_20261016/replay/core';

const dir=path.dirname(fileURLToPath(import.meta.url)),parent=path.resolve(dir,'..');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const target=path.join(dir,'plan.json');assert.ok(!fs.existsSync(target),'拒绝覆盖已冻结计划');
const legacy=read(path.join(parent,'evaluation-plan.json')),audit=read(path.join(dir,'known-source-header-audit.json'));
const maps=getAppApkSkirmishMapOptions().filter(map=>map.playerCount===2).map(map=>map.name);
const usedRoots=new Set<string>();
for(const job of [...legacy.dev,...legacy.final,...read(path.join(parent,'regression-plan.json'))]){
    const initial=job.openingPrefix?.initial??job.initial;usedRoots.add(`${job.map}|${initial.rules.initialGold}`);
}
const excluded=new Set<string>(gunzipSync(fs.readFileSync(path.join(dir,'legacy-exclusions.txt.gz'))).toString().trim().split('\n').filter(Boolean));
const validationGolds:number[]=[],history:any[]=[],sampling:any[]=[],validationRoots:any[]=[],states=new Set<string>();
function derive(map:string,gold:number,seed:number,exclude:boolean){
    let value=seed>>>0;const rng=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
    const initial=createApkSkirmishGameState(parseAppApkSkirmishMap(map),{mode:'SD',mapName:map,setup:{initialGold:gold,unitLimit:30,levelCap:3}});
    const engine=new GameEngine(initial,{applyInitialTurnStart:false}),actions=[];
    if(exclude)excluded.add(ruleStateHash(engine.getState()));
    for(let step=0;step<24&&!engine.isTerminal();step++){
        const legal=engine.getLegalActions(engine.getState().currentPlayer).filter(action=>action.type!=='surrender');
        assert.ok(legal.length);const action=legal[Math.floor(rng()*legal.length)];actions.push(action);engine.step(action);
        if(exclude)excluded.add(ruleStateHash(engine.getState()));
    }
    assert.ok(!engine.isTerminal(),'派生开局终局，保留失败且禁止按结果挑开局');
    const state=engine.getState(),key=ruleStateHash(state);assert.ok(!states.has(key),'开局重复');states.add(key);
    assert.equal(state.rules.initialGold,gold);
    return {initial:state,key,openingPrefix:{initial,actions}};
}
for(let family=0;family<10;family++){
    const map=maps[family%maps.length];
    const gold=audit.unusedLegalInitialGolds.find((n:number)=>n>=350&&n<=1500&&!usedRoots.has(`${map}|${n}`)&&!validationGolds.includes(n));
    assert.ok(Number.isInteger(gold),'无足够独立配置，停止而不是复用训练开局');usedRoots.add(`${map}|${gold}`);validationGolds.push(gold);
    const seed=90231000+family,opening=derive(map,gold,seed,true);validationRoots.push({map,gold,key:opening.key});
    for(let seat=0;seat<2;seat++)history.push({id:`history-v5-${String(family).padStart(2,'0')}-${seat}`,split:'historical-development',map,seat,seed,initial:opening.initial,openingLineage:`historical-holdout-v5:${opening.key}`,openingPrefix:opening.openingPrefix,budgetMs:4000,opponent:'historical'});
}
for(const generation of [2,3])for(const opponent of ['Original-APKlikeAI-Hard','historical']){
    const families=opponent==='historical'?5:10;
    for(let family=0;family<families;family++){
        const map=maps[(family+generation*3+(opponent==='historical'?2:0))%maps.length],seed=100231000+generation*1000+(opponent==='historical'?500:0)+family;
        const opening=derive(map,300,seed,false);
        for(let seat=0;seat<2;seat++)sampling.push({id:`v5-g${generation}-${opponent==='historical'?'historical':'hard'}-${String(family).padStart(2,'0')}-${seat}`,generation,split:'train',map,seat,seed,initial:opening.initial,openingLineage:`training-v5:${opening.key}`,openingPrefix:opening.openingPrefix,budgetMs:4000,opponent});
    }
}
assert.equal(history.length,20);assert.equal(sampling.length,60);assert.ok(sampling.every(job=>job.opponent!=='self'));
const plan={revision:5,historicalValidation:history,hardValidation:legacy.dev,sampling,validationInitialGolds:validationGolds,validationRoots,qualification:'历史验证20局由10组固定新派生开局换边组成；初态规则起始金币未出现在5309份已知原生/回放/新增前缀头中，与131局和后续采样300金币配置分离。沿用地图不等于新地图；未知历史谱系仍不具备绝对独立性证明。'};
fs.writeFileSync(target,JSON.stringify(plan,null,2));
const hashes=[...excluded].sort().join('\n')+'\n';fs.writeFileSync(path.join(dir,'opening-exclusions.txt.gz'),gzipSync(hashes));fs.writeFileSync(path.join(dir,'seen-evaluation-exclusions.txt.gz'),gzipSync(hashes));
fs.writeFileSync(path.join(dir,'plan-identity.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),historicalGames:20,historicalFamilies:10,futureSampling:60,newSelfPlay:0,validationInitialGolds:validationGolds,openingExclusions:excluded.size},null,2));
console.log(JSON.stringify({historicalValidation:20,hardValidation:legacy.dev.length,sampling:60,validationGolds,exclusions:excluded.size}));
