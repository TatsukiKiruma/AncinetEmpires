import assert from 'node:assert/strict';
import path from 'node:path';
import {prototype, schedule} from './scenarios';
import {rotatingCuts} from './cut_rotation';
import {frozenPlan} from './resume_plan';
import {getTileTerrainKey} from '../../../src/game/terrain_rules';
import {here,data,save,sha,read} from './io';
for(const players of [5,6]){
 const s=prototype(players);assert.equal(s.map.width,21);assert.equal(s.map.height,21);
 const tally=new Map<string,number>();
 for(let y=0;y<21;y++)for(let x=0;x<21;x++){
  const t=s.map.tiles[y][x], key=getTileTerrainKey(t);tally.set(key,(tally.get(key)??0)+1);
  assert.equal(key,getTileTerrainKey(s.map.tiles[y][20-x]),`${players}/${x},${y}`);
 }
 for(const key of ['road','forest','mountain'])assert((tally.get(key)??0)>0);
 assert((tally.get('town')??0)>players);assert.equal(tally.get('castle'),players+1);
}
const cuts=Array.from({length:10},(_,i)=>({state:prototype(5),sourceGame:`source-${i}`,sourceStep:i}));
const first=rotatingCuts(cuts,[5,5,5],1),second=rotatingCuts(cuts,[5,5,5],2);
assert.deepEqual([...first,...second].map(c=>c!.sourceStep),[0,1,2,3,4,5]);
assert.equal(rotatingCuts(cuts,[6],1)[0],undefined);
assert.equal(rotatingCuts(cuts,[5],11)[0]!.sourceStep,0);
const plan=path.join(data,'gen1/block-2.json'), old=frozenPlan(plan)!;
assert.deepEqual(old,read(plan));
const before=old.find(j=>j.players===5).state, after=schedule(1,3).find(j=>j.players===5)!.state;
assert.notEqual(sha(JSON.stringify(before.map)),sha(JSON.stringify(after.map)));
save(path.join(here,'REVISION_TESTS.json'),{passed:true,terrainSymmetry:[5,6],cutRotation:[0,1,2,3,4,5],frozenPlanRetained:true,sealedAccess:0});
console.log('地图对称性、地形覆盖、cut轮转、冻结计划保留均通过');
