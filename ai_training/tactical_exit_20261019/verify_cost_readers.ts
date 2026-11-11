import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import * as original from '../../src/game/rule_config';
import { UNIT_CONFIGS } from '../../src/game/constants';
import { read,save,DIR } from './io';
import type { GameState,RuleConfig,UnitClass } from '../../src/game/types';
const out=path.join(DIR,'performance_query_cache'),source=fs.readFileSync(path.join(out,'cost-readers.proposed.ts'),'utf8');
await build({stdin:{contents:source,loader:'ts',sourcefile:path.resolve(DIR,'../../src/game/rule_config.ts'),resolveDir:path.resolve(DIR,'../../src/game')},bundle:true,platform:'node',format:'esm',outfile:path.join(out,'cost-readers.proposed.mjs')});
const proposed=await import(pathToFileURL(path.join(out,'cost-readers.proposed.mjs')).href) as typeof original;
const states:GameState[]=[...read('browser-states.json').map((v:any)=>v.state),...read('teacher-battle-plan.json').maps.map((v:any)=>read(v.path))];
const ruleVariants:(RuleConfig|undefined)[]=[undefined,{}, {prices:{soldier:0,ghost:null,commander:100},commanderRecruitCostGrowth:17}, {prices:{soldier:undefined,commander:undefined},commanderRecruitBaseCost:undefined}, {commanderRecruitBaseCost:300,commanderRecruitCostGrowth:0,recruitableUnits:[],unitLimit:0,populationLimit:0}, {teams:{0:{recruitableUnits:['soldier'],unitLimit:1,populationLimit:2}}}, Object.create({prices:{soldier:5},commanderRecruitBaseCost:4,commanderRecruitCostGrowth:2}),Object.defineProperty({prices:Object.create({soldier:1})},'commanderRecruitBaseCost',{value:200,enumerable:false}),{prices:Object.defineProperty({},'soldier',{value:10,enumerable:false})}];
let checks=0;
for(const state of states)for(const variant of [state.rules,...ruleVariants]){
    const s={...state,rules:variant};
    for(const p of s.players){
        p.commanderDeathCount??=0;
        assert.deepEqual(proposed.getRecruitableUnits(s,p.id),original.getRecruitableUnits(s,p.id));checks++;
        for(const unitClass of Object.keys(UNIT_CONFIGS) as UnitClass[]){
            assert.deepEqual(proposed.getUnitCost(s,p.id,unitClass),original.getUnitCost(s,p.id,unitClass));
            assert.equal(proposed.canRecruitUnitClass(s,p.id,unitClass),original.canRecruitUnitClass(s,p.id,unitClass));checks+=2;
        }
        // 规则与金币原位修改后必须立刻生效，不能缓存旧价格或可招募集合。
        const live=structuredClone(state);live.rules??={};live.rules.prices??={};
        for(const price of [null,0,150,9999,undefined]){live.rules.prices.soldier=price;assert.deepEqual(proposed.getUnitCost(live,p.id,'soldier'),original.getUnitCost(live,p.id,'soldier'));assert.equal(proposed.canRecruitUnitClass(live,p.id,'soldier'),original.canRecruitUnitClass(live,p.id,'soldier'));checks+=2;}
    }
}
const result={passed:true,states:states.length,ruleVariants:ruleVariants.length+1,checks,inheritedAndNonEnumerableSemanticsExact:true,nullUndefinedZeroAndMutationExact:true};save('performance_query_cache/cost-readers-gate.json',result);console.log(result);
