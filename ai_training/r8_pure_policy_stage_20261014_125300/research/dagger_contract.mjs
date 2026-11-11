import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import assert from 'node:assert/strict';import {match,STAGE,sha} from './supervisor.mjs';
const model=path.join(STAGE,'checkpoints/r1_warm/best.json'),traces=[];
for(let k=0;k<2;k++){
 const out=path.join(STAGE,`evidence/dagger_isolation_${k}`),cfg={gameId:`contract_${k}`,familyId:`contract_${k}`,split:'diagnostic',mapName:'(2) Duel.aem',candidateSeat:0,seeds:[997,998],labelSeed:600+k,candidate:{type:'model',model,expectedSha256:sha(model),rollInProbability:.2},collect:true,collectBoth:false,recordInputs:true,maxSteps:40,maxWallSeconds:30,maxDecisionMs:1000};
 const r=await match(cfg,out,path.join(STAGE,'runs/dagger_worker.cjs'));assert.notEqual(r.outcome,'error');assert.notEqual(r.outcome,'timeout_truncated');traces.push(zlib.gunzipSync(fs.readFileSync(out+'.jsonl.gz')).toString().trim().split('\n').map(x=>JSON.parse(x)).filter(x=>x.type==='step'));
}
assert.deepEqual(traces[0].map(x=>[x.actionCode,x.afterHash,x.rngAfter]),traces[1].map(x=>[x.actionCode,x.afterHash,x.rngAfter]));
const diagnostics=traces[0].filter(x=>x.player===0).at(-1).diagnostics;assert(diagnostics.teacherDecisions>0&&diagnostics.modelDecisions>0);
fs.writeFileSync(path.join(STAGE,'evidence/dagger_rollin_contract.json'),JSON.stringify({passed:true,teacherQueryDoesNotAlterTrajectory:true,diagnostics,collectionOnly:true,steps:traces[0].length},null,2));console.log('DAgger roll-in隔离合同通过');
