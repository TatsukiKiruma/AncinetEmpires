'use strict';
// Reduced, isolated reproductions of JavaScript/control-flow behavior in commit
// 6e7b7e22d36597369e75a5f21f743bd2f5faab93. These are NOT game-engine tests,
// do NOT load the user's checkpoints, and do NOT establish game performance.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

// Same argument conversions/iteration as SpatialResNetPredictor.predict.
// The convolution/dense network is deliberately excluded; this probe verifies
// the actual argument contract, not numerical prediction parity.
function predictorBoundary(encodedState, candidateActions) {
  const spatialTensor = encodedState.spatialTensor instanceof Float32Array
    ? encodedState.spatialTensor : new Float32Array(encodedState.spatialTensor);
  const globalFeatures = encodedState.globalFeatures instanceof Float32Array
    ? encodedState.globalFeatures : new Float32Array(encodedState.globalFeatures);
  const candidateSemanticLengths = [];
  for (const act of candidateActions) {
    const semArr = act.semantics instanceof Float32Array
      ? act.semantics : new Float32Array(act.semantics);
    candidateSemanticLengths.push(semArr.length);
  }
  return { spatialElements: spatialTensor.length, globalElements: globalFeatures.length,
    candidateCount: candidateSemanticLengths.length, candidateSemanticLengths };
}
const encoded = {spatialTensor: new Float32Array(24*20*20), globalFeatures: new Float32Array(20)};
const candidates = Array.from({length:37}, () => ({actorCoord:null, landingCoord:null,
  targetCoord:null, semantics:new Float32Array(32)}));
const correct = predictorBoundary(encoded, candidates);
const wrong = predictorBoundary(encoded.spatialTensor, encoded.globalFeatures, candidates);
assert.equal(correct.spatialElements, 9600);
assert.equal(correct.globalElements, 20);
assert.equal(correct.candidateCount, 37);
assert.equal(wrong.spatialElements, 0);
assert.equal(wrong.globalElements, 0);
assert.equal(wrong.candidateCount, 20);
assert(wrong.candidateSemanticLengths.every(n => n === 0));

// Literal null mask and arithmetic used in trainStep.
const valueTarget = undefined;
const entersValueBranch = valueTarget !== null;
const dValScalar = 0.0 * 2 * (0.25 - valueTarget);
assert(entersValueBranch);
assert(Number.isNaN(dValScalar));
const serializedNaN = JSON.stringify([dValScalar]);
assert.equal(serializedNaN, '[null]');

// Same stateHash inputs used by v7 training/DAgger; movement rights omitted.
function repositoryHash(state, playerId) {
  const unitsStr=state.units.map(u=>`${u.id}:${u.ownerId}:${u.unitClass}:${u.pos.x},${u.pos.y}:${u.hp}`).sort().join('|');
  const goldStr=state.players.map(p=>`${p.id}:${p.gold}`).join('|');
  return crypto.createHash('sha256').update(`${state.mapName}:${state.turn}:${playerId}:${goldStr}:${unitsStr}`).digest('hex').substring(0,16);
}
const base={mapName:'fixture',turn:3,players:[{id:0,gold:500,commanderDeathCount:0}],
  units:[{id:'u',ownerId:0,unitClass:'soldier',pos:{x:1,y:1},hp:100,hasMoved:false,hasActed:false}],pendingUnitId:null};
const changed=structuredClone(base);
changed.units[0].hasMoved=true; changed.units[0].hasActed=true;
changed.players[0].commanderDeathCount=2; changed.pendingUnitId='u';
assert.equal(repositoryHash(base,0),repositoryHash(changed,0));

// Unit count stays 2 while positions/health change on every simulated action.
// This only reproduces the termination predicate, not a legal game trajectory.
let stagnationCounter=0, lastUnitCount=2;
const progressStates=Array.from({length:25},(_,i)=>({units:[{x:i%8,hp:100-i},{x:7-i%8,hp:100}],step:i+1}));
for(const state of progressStates){
  if(state.units.length===lastUnitCount)stagnationCounter++;
  else {stagnationCounter=0;lastUnitCount=state.units.length;}
}
assert.equal(stagnationCounter,25);
const decision = {topIndex:3, logits:[0,0,0,1], probs:[0,0,0,1], value:0};
assert.equal(decision.bestActionIndex, undefined);

const result={
  scope:'Reduced source/control-flow probes; no game-engine suite, no production checkpoint, no training or match rerun.',
  reviewedCommit:'6e7b7e22d36597369e75a5f21f743bd2f5faab93',
  checks:{
    predictorContract:{correct,wrong},
    policyOnlyNullMask:{entersValueBranch,gradientIsNaN:Number.isNaN(dValScalar),serializedNaN},
    dedupHash:{sameHashForDifferentMoveRightsAndCommanderState:true,hash:repositoryHash(base,0)},
    stagnation:{differentProgressStates:25,unitCountUnchanged:true,oldPredicateStops:true},
    netAResultField:{declaredResultField:'topIndex',consumerField:'bestActionIndex',consumerValueIsUndefined:true}
  }
};
const output=process.argv[2];
if(output)fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
