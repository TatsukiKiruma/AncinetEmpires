// 只在审核目录运行少量裁判负对照，不改写原阶段测试产物。
import {match} from '../r8_pure_policy_stage_20261014_125300/research/supervisor.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const O='ai_training/review_r8_20261014_212059';const rows=[];
for(const [type,expected] of [['hang','timeout_truncated'],['mutate','error'],['illegal','error'],['heuristic','step_truncated']]){
 const r=await match({mapName:'(2) Duel.aem',candidateSeat:0,candidate:{type},seeds:[1001,1002],maxSteps:5,maxDecisionMs:1000,maxWallSeconds:5},path.resolve(O,'runner_'+type));
 assert.equal(r.outcome,expected);rows.push({type,expected,actual:r.outcome,seconds:r.elapsedWallSeconds,exit:r.processExit});
}
fs.writeFileSync(path.join(O,'runner_results.json'),JSON.stringify({passed:true,rows},null,2));console.log(rows);
