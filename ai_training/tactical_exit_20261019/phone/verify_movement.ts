import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as original from '../../../src/game/map';
import { UNIT_CONFIGS } from '../../../src/game/constants';
import { StableMoveQueue } from './stable_move_queue';
import { movementPlugin } from './movement_optimization';
import type { UnitClass,GameState } from '../../../src/game/types';

const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(here,'../..');
const target=path.join(here,'revisions/xiaomi_20261020','stable-movement-parity-'+Date.now());fs.mkdirSync(target);
const entry=path.join(target,'entry.ts');fs.writeFileSync(entry,`export * from ${JSON.stringify(repo+'/src/game/map.ts')};`,{flag:'wx'});
const output=path.join(target,'movement.mjs');await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',outfile:output,plugins:[movementPlugin(repo,target)]});
const actual=await import(pathToFileURL(output).href);
let sequence=81293;
const random=()=>{sequence=(Math.imul(sequence,1664525)+1013904223)>>>0;return sequence/4294967296;};
let queueChecks=0,movementChecks=0,deployChecks=0;
for(let trial=0;trial<100;trial++){
    const queue=new StableMoveQueue(),reference:{pos:{x:number;y:number};cost:number}[]=[];
    for(let step=0;step<1000;step++){
        if(!reference.length||random()<.6){const value={pos:{x:step,y:trial},cost:Math.floor(random()*12)/2};queue.push(value);reference.push(value);}
        else {reference.sort((a,b)=>a.cost-b.cost);assert.deepEqual(queue.shift(),reference.shift());queueChecks++;}
    }
    reference.sort((a,b)=>a.cost-b.cost);
    while(reference.length){assert.deepEqual(queue.shift(),reference.shift());queueChecks++;}
    assert.equal(queue.shift(),undefined);
}
const roots:GameState[]=[];
for(let lane=0;lane<4;lane++){
    const file=path.join(here,'search-scale',`roots-${lane}.jsonl.gz`);
    roots.push(...gunzipSync(fs.readFileSync(file)).toString().trim().split('\n').map(line=>JSON.parse(line).state));
}
const adversarial:GameState[]=[];
for(const unitClass of Object.keys(UNIT_CONFIGS) as UnitClass[])for(const weakened of [false,true]){
    const state=structuredClone(roots[0]);state.units=state.units.slice(0,3);const unit=state.units[0];
    unit.unitClass=unitClass;unit.status=weakened?{type:'weakened',remainingTicks:2}:undefined;
    for(const row of state.map.tiles)for(const tile of row)tile.apkMoveCost=0;
    state.units[1].pos={...unit.pos};state.units[2].pos={...unit.pos};
    adversarial.push(state);
}
for(const [index,state] of [...roots,...adversarial].entries()){
    for(const unit of state.units){
        assert.deepEqual([...actual.getMovementCosts(state,unit.id)],[...original.getMovementCosts(state,unit.id)]);
        for(const max of [undefined,0,1,2.5,8])assert.deepEqual(actual.getReachablePositions(state,unit.id,max),original.getReachablePositions(state,unit.id,max));
        movementChecks+=6;
    }
    for(const unitClass of Object.keys(UNIT_CONFIGS) as UnitClass[])for(const player of state.players){
        const pos=state.units.find(unit=>unit.ownerId===player.id)?.pos??{x:0,y:0};
        assert.deepEqual(actual.getRecruitDeployPositions(state,player.id,unitClass,pos),original.getRecruitDeployPositions(state,player.id,unitClass,pos));deployChecks++;
    }
    if(index%100===0)console.log(JSON.stringify({states:index,movementChecks,deployChecks}));
}
const report={passed:true,roots:roots.length,adversarial:adversarial.length,queueChecks,movementChecks,deployChecks,reachableAndCostMapInsertionOrderExact:true,gamesStarted:0};
fs.writeFileSync(path.join(target,'PARITY.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({output:target,...report}));
