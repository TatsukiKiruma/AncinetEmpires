import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {STAGE,sha,panel} from './supervisor.mjs';
// 只消费预登记20槽位；恢复时panel保留所有已完成结果，包括失败和截断。
const frozen=JSON.parse(fs.readFileSync(path.join(STAGE,'identity/candidate_freeze.json')));
function verify(){for(const [p,h] of Object.entries(frozen.files))assert.equal(sha(path.join(STAGE,p)),h,`冻结身份漂移 ${p}`);}
verify();const runtime=JSON.parse(fs.readFileSync(path.join(STAGE,'identity/node_runtime.json')));assert.equal(sha(process.execPath),runtime.nodeBinarySha256);
const cfg=JSON.parse(fs.readFileSync(path.join(STAGE,'configs/final_candidate.json'))),manifest=JSON.parse(fs.readFileSync(path.join(STAGE,'configs/final_manifest.json')));assert.deepEqual(cfg.games,manifest.games);assert.equal(cfg.candidate.type,'model');assert.equal(cfg.candidate.expectedSha256,frozen.modelSha256);
const p=path.join(STAGE,'identity/panel_consumption.json'),state=JSON.parse(fs.readFileSync(p));
if(!state.newFinalConsumed){state.newFinalConsumed=true;state.finalStartedUnix=Date.now()/1000;state.frozenModelSha256=frozen.modelSha256;fs.writeFileSync(p,JSON.stringify(state,null,2));}else assert.equal(state.frozenModelSha256,frozen.modelSha256);
const report=await panel(path.join(STAGE,'configs/final_candidate.json'));verify();assert.equal(report.games,20);assert(report.results.every(r=>r.loadedModelSha256===frozen.modelSha256&&r.workerBundleSha256===frozen.workerBundleSha256));
state.newFinalCompleted=true;state.finalCompletedUnix=Date.now()/1000;fs.writeFileSync(p,JSON.stringify(state,null,2));fs.writeFileSync(path.join(STAGE,'evidence/final_execution_identity.json'),JSON.stringify({passed:true,modelSha256:frozen.modelSha256,workerSha256:frozen.workerBundleSha256,games:20},null,2));
