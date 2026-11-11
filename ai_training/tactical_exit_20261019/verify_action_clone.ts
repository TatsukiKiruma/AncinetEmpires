import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { DIR,save } from './io';
import type { Action } from '../../src/game/types';
const out=path.join(DIR,'performance_legal_clone'),source=fs.readFileSync(path.join(out,'engine.ts.proposed'),'utf8')+'\nexport { cloneLegalActions };\n';
await build({stdin:{contents:source,loader:'ts',sourcefile:path.resolve(DIR,'../../src/game/engine.ts'),resolveDir:path.resolve(DIR,'../../src/game')},bundle:true,format:'esm',platform:'node',outfile:path.join(out,'clone-function.mjs')});
const copy=(await import(pathToFileURL(path.join(out,'clone-function.mjs')).href)).cloneLegalActions as (a:Action[])=>Action[];
function fixture(extra=false):Action[]{
    const p={x:1,y:2,...(extra?{extra:{nested:[1,2,3]}}:{})},q={x:3,y:4};
    return [{type:'move',unitId:'甲',to:p},{type:'post_attack_move',unitId:'乙',to:p},{type:'recruit_to_castle',unitClass:'soldier',castlePos:p},{type:'recruit_and_deploy',unitClass:'archer',castlePos:p,to:q},{type:'summon',summonerId:'巫师',graveId:'墓碑',spawnPos:q},{type:'destroy_town',unitId:'战车',target:p},{type:'destroy_town',unitId:'战车'},{type:'attack',attackerId:'甲',targetId:'乙'},{type:'heal',healerId:'医生',targetId:'甲'},{type:'support',supporterId:'歌者',targetId:'甲'},{type:'capture',unitId:'甲'},{type:'repair',unitId:'甲'},{type:'wait',unitId:'甲'},{type:'surrender'},{type:'end_turn'}];
}
function aliases(actions:Action[]){const seen=new Map<object,number>();return actions.flatMap(a=>Object.entries(a).flatMap(([key,v])=>{if(!v||typeof v!=='object')return [];if(!seen.has(v))seen.set(v,seen.size);return [[key,seen.get(v)]];}));}
for(const extra of [false,true]){
    const input=fixture(extra),original=structuredClone(input),actual=copy(input),expected=structuredClone(input);assert.deepEqual(actual,expected);assert.deepEqual(aliases(actual),aliases(expected));
    const moved=actual[0];if(moved.type==='move')moved.to.x=-100;actual.length=0;assert.deepEqual(input,original);
}
const result={passed:true,allActionTypes:15,standardAndExtendedPositions:true,sharedPositionAliasesExact:true,inputAndOutputFullyIsolated:true};save('performance_legal_clone/action-clone-gate.json',result);console.log(result);
