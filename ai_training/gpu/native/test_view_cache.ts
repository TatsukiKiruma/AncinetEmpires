/** 临时移动、恢复、元数据原位改动和特殊阻挡的缓存失效回归。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeCompute} from './binding';
import {ROOT} from '../hard_jobs';
// 直接测试生成器注入的同一段代码，避免为测试维护另一份视图编码。
import {hardNativeHelpers} from '../../../tools/apk_hard_native_transform.mjs';
const empty=(terrain='plain')=>({terrain,terrainTeam:null,unit:null,unitTeam:null,unitStandby:false});
const data:any={rows:2,cols:3,terrains:[{id:'plain',name:'平原',moveCost:1},{id:'castle',name:'城堡',moveCost:2},{id:'house',name:'房子',moveCost:3}],units:[{id:'infantry',abilities:[]},{id:'air',abilities:['空军']}],teams:[{id:'blue',alliance:1},{id:'red',alliance:2}],gridData:[[empty(),empty('castle'),empty()],[empty(),empty(),empty()]],demoEnemyMovementBlocking:true,activePanel:'moveMode',moveModeConsiderEnemyBlockers:true};
data.gridData[0][0].unit='infantry';data.gridData[0][0].unitTeam='blue';data.gridData[0][1].terrainTeam='blue';data.gridData[1][1].unit='infantry';data.gridData[1][1].unitTeam='red';
let killed:any=null,costCalls=0;const unit={abilities:[] as string[]};
let fieldsBuilt=0;
const distanceField=({view,rows,cols,team,alliance}:any)=>{fieldsBuilt++;const out=new Float64Array(rows*cols*3);for(let k=0;k<rows*cols;k++){let es=0,as=0,e=0,a=0;for(let p=0;p<rows*cols;p++){const d=Math.abs(Math.floor(k/cols)-Math.floor(p/cols))+Math.abs(k%cols-p%cols),cell=view.subarray(p*8,p*8+8);if(cell[4]){if(cell[5]!==alliance){es+=d;e++;}else{as+=d;a++;}}if((cell[1]&4)&&cell[2]){if(cell[3]!==alliance){es+=d;e++;}else if(cell[2]===team){as+=d;a++;}}}out.set([es,as,e*2048+a],k*3);}return out;};
const hooks=new Function('appData','environment','calculateMoveCost','getActiveAiAssaultSnapshot','isEnemyMovementBlocker','roundHardAiDistance',hardNativeHelpers+'\nreturn {read:readHardNativeView,prepare:prepareHardNativeMovement,fieldDistance:calculateHardNativeFieldDistance,cache:createHardNativeCache,pack:packHardNativeRange,unpack:unpackHardNativeRange};')(data,{nativeCompute,distanceField,distanceFieldThreshold:2},(r:number,c:number,u:any)=>{costCalls++;return u.abilities.includes('空军')?1:data.terrains.find((t:any)=>t.id===data.gridData[r][c].terrain).moveCost;},()=>({assaultKilledPosition:killed}),()=>false,(n:number)=>Math.round((n+Number.EPSILON)*100)/100);
const initial=structuredClone(data.gridData),first=hooks.read(),version=first.version,initialValues=first.view.slice();
assert.equal(hooks.read(),first);assert.equal(hooks.read().version,version);
const graph=hooks.prepare(unit,'blue');assert.equal(hooks.prepare(unit,'blue'),graph);assert.equal(graph.blocked[4],1);assert.equal(graph.costs[1],2);const calls=costCalls;
hooks.prepare(unit,'blue');assert.equal(costCalls,calls);
data.gridData[1][2]=data.gridData[0][0];data.gridData[0][0]=empty();const moved=hooks.read();assert(moved.version>version);assert.equal(moved.view[5*8+4],1);assert.equal(moved.view[4],0);assert.notEqual(hooks.prepare(unit,'blue'),graph);
data.gridData=structuredClone(initial);assert.deepEqual(hooks.read().view,initialValues);assert.deepEqual(hooks.prepare(unit,'blue').values,graph.values);
const restored=hooks.read().version;data.gridData=structuredClone(initial);assert.equal(hooks.read().version,restored);
killed={row:0,col:2,isAir:false};assert.equal(hooks.prepare(unit,'blue').blocked[2],1);killed=null;assert.equal(hooks.prepare(unit,'blue').blocked[2],0);
data.demoEnemyMovementBlocking=false;data.moveModeConsiderEnemyBlockers=false;assert.equal(hooks.prepare(unit,'blue').blocked[4],0);data.demoEnemyMovementBlocking=true;
unit.abilities.push('空军');assert.equal(hooks.prepare(unit,'blue').costs[1],1);assert.equal(hooks.prepare(unit,'blue').blocked[4],0);
data.units[0].abilities.push('空军');assert.equal(hooks.prepare(unit,'blue').blocked[4],1);
data.teams[1].alliance=1;assert.equal(hooks.prepare(unit,'blue').blocked[4],0);data.teams[1].alliance=2;
unit.abilities=[];data.terrains[1].moveCost=7;assert.equal(hooks.prepare(unit,'blue').costs[1],7);
data.gridData[1][2].terrain='house';assert.equal(hooks.prepare(unit,'blue').costs[5],3);
data.gridData[0][1].unit='infantry';data.gridData[0][1].unitTeam='blue';data.gridData[0][1].unitStandby=true;assert.equal(hooks.read().view[1*8+7],1);
data.gridData[0][1].unitStandby='true';assert.equal(hooks.read().view[1*8+7],0);
data.terrains[1].name='房子';assert.equal(hooks.read().view[1*8+1],5);
const encoded=hooks.read(),team=encoded.teams.get('blue');let fieldChecks=0;
for(let k=0;k<6;k++)for(const enemy of [0,1])for(const origin of [-1,0,4])for(const landing of [-1,1,4]){const r=Math.floor(k/3),c=k%3;let actual=hooks.fieldDistance(encoded,r,c,team,enemy,origin,landing);if(actual===undefined)actual=hooks.fieldDistance(encoded,r,c,team,enemy,origin,landing);assert.equal(actual,nativeCompute.averageDistance(encoded.view,3,r,c,team.id,team.alliance,enemy,origin,landing));fieldChecks++;}
const bounded=hooks.cache(1024);for(let i=0;i<100;i++){bounded.set(String(i),new Int16Array(64),128);assert(bounded.bytes<=1024);}assert.equal(bounded.get('0'),undefined);
const positions=[{row:767,col:0,remaining:32}],packed=hooks.pack(positions);positions[0].remaining=0;const unpacked=hooks.unpack(packed);assert.equal(unpacked[0].remaining,32);unpacked[0].remaining=1;assert.equal(hooks.unpack(packed)[0].remaining,32);
const result={passed:true,cases:['unchanged-view','temporary-move','deep-clone-restore','killed-blocker','blocking-switch','moving-abilities','blocking-abilities','alliance-mutation','terrain-cost-mutation','new-terrain-appearance','strict-standby','terrain-name-mutation','field-origin-landing-corrections','byte-bound','compact-range-isolation'],costCalls,fieldsBuilt,fieldChecks};
fs.writeFileSync(path.join(ROOT,'ai_training/hard_replica_gpu_20261029/native_hotspots_v3/VIEW_CACHE_TEST.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
