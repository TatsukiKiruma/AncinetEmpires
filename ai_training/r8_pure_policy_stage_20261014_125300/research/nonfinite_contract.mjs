import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {match,STAGE} from './supervisor.mjs';
const m=JSON.parse(fs.readFileSync('ai_training/r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json','utf8'));
// 使用有限但会令实际FP32前向溢出的参数，验证真实predictor的非有限输出保护。
m.polDense2.weights.fill(1e38);m.polDense2.biases.fill(1e38);const model=path.join(STAGE,'tmp/nonfinite_model.json');if(!fs.existsSync(model))fs.writeFileSync(model,JSON.stringify(m),{flag:'wx'});
const resultPath=path.join(STAGE,'evidence/nonfinite_actual_forward.json');
const r=fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath,'utf8')):await match({mapName:'(2) Duel.aem',candidateSeat:0,candidate:{type:'model',model},seeds:[87,88],maxSteps:10,maxWallSeconds:10,maxDecisionMs:1000,recordInputs:true},path.join(STAGE,'evidence/nonfinite_actual_forward'));
assert.equal(r.outcome,'error');assert.match(r.error,/非有限|non-finite/);
fs.writeFileSync(path.join(STAGE,'evidence/nonfinite_contract.json'),JSON.stringify({passed:true,actualPredictorOverflow:true,result:r},null,2));console.log('真实前向溢出已拦截');

