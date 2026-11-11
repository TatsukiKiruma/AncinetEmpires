import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {match,STAGE} from './supervisor.mjs';
const rows=[];
const version=Date.now();
for(const [type,expected] of [['heuristic','step_truncated'],['illegal','error'],['mutate','error'],['nan','error'],['hang','timeout_truncated'],['slow','timeout_truncated'],['surrender','natural_loss']]){
 const r=await match({mapName:'(2) Duel.aem',candidateSeat:0,candidate:{type},seeds:[101,102],maxSteps:10,maxWallSeconds:10,maxDecisionMs:1000,recordInputs:true},path.join(STAGE,'evidence',`contracts_${version}`,`contract_${type}`));
 assert.equal(r.outcome,expected);assert(r.elapsedWallSeconds<12);rows.push({type,expected,actual:r.outcome,seconds:r.elapsedWallSeconds,processExit:r.processExit});
}
fs.writeFileSync(path.join(STAGE,'evidence/runner_contracts.json'),JSON.stringify({passed:true,rows},null,2));
console.log(rows);
