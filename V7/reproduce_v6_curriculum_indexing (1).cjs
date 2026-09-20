'use strict';
/**
 * Independent, minimal reproduction of the array operations read at commit
 * 55177b8ea9459d1b30a83e44eb412fb2f112a4c4.
 * This is NOT a GameEngine replay, a repository unit test, or a training run.
 * Sources: src/game/demo_map.ts; tools/v6_commander_specialist_pipeline.ts.
 */
const assert = require('node:assert/strict');
let assertionCount = 0;
function checkedEqual(actual, expected) { assert.equal(actual, expected); assertionCount += 1; }
function remainingUnits() {
  const units = [
    {id:'u1', ownerId:0, unitClass:'commander', pos:{x:0,y:0}},
    {id:'u2', ownerId:1, unitClass:'commander', pos:{x:7,y:7}},
    {id:'u3', ownerId:0, unitClass:'soldier', pos:{x:1,y:0}},
    {id:'u4', ownerId:1, unitClass:'soldier', pos:{x:6,y:7}},
  ];
  return units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
}
const c = remainingUnits();
c[0].pos = {x:0,y:0};
checkedEqual(c[0].id, 'u2');
checkedEqual(c[0].ownerId, 1);

const f = remainingUnits();
f.push({id:'u_enemy_threat', ownerId:1, unitClass:'soldier', pos:{x:1,y:0}});
f[0].pos = {x:0,y:1};
const fAction = {type:'attack', attackerId:f[0].id, targetId:'u_enemy_threat'};
checkedEqual(f.find(u => u.id === fAction.attackerId).ownerId, 1);
checkedEqual(f.filter(u => u.pos.x === 1 && u.pos.y === 0).length, 2);

const g = remainingUnits();
const enemyComm = g.find(u => u.ownerId === 1 && u.unitClass === 'commander');
enemyComm.pos = {x:6,y:7};
g[0].pos = {x:6,y:6};
const gAction = {type:'attack', attackerId:g[0].id, targetId:enemyComm.id};
checkedEqual(gAction.attackerId, gAction.targetId);

const allocation = [
  ['GENERAL',21000], ['REHIRE',2000], ['SAVING',1500], ['UNBLOCK',1500],
  ['INFLATION',1500], ['PENDING',1000], ['DEFENSE',1000], ['NATURAL_WIN',500]
];
function consumedPrefix(cap) {
  let left = cap;
  const out = {};
  for (const [name,count] of allocation) {
    out[name] = Math.min(left,count); left -= out[name];
  }
  return out;
}
const report = {
  scope:'Independent reproduction of copied array operations and loop bounds; not project execution',
  sourceCommit:'55177b8ea9459d1b30a83e44eb412fb2f112a4c4',
  remainingUnitIds:remainingUnits().map(u=>u.id),
  scenarioC:{movedUnitId:c[0].id, movedOwnerId:c[0].ownerId, intendedOwnerId:0},
  scenarioF:{action:fAction, attackerOwnerId:1, requestedPlayerId:0, unitsAt_1_0:2},
  scenarioG:{action:gAction, selfTarget:true},
  consumedPerEpoch:{bc:consumedPrefix(10000), netA:consumedPrefix(12000), netB:consumedPrefix(12000)},
  curriculumRows:9000,
  curriculumStateParameterCombinationsUpperBound:5+3+1+2+1+1+1,
  assertionsPassed:assertionCount
};
console.log(JSON.stringify(report,null,2));
