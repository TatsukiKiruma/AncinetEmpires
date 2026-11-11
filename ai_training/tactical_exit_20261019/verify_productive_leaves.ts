import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { infer,legalActions } from './policy_runtime';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,sha,hash } from './io';
const lane=Number(process.argv[2]??0),model=read('teacher-model.json'),old=read('old-schema.json'),prefix='search-scale';
const load=(name:string)=>gunzipSync(fs.readFileSync(path.join(DIR,prefix,name))).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
const roots=load(`roots-${lane}.jsonl.gz`),previous=load(`teacher-${lane}.jsonl.gz`),receipt=read(prefix+`/teacher-${lane}.receipt.json`);assert.equal(roots.length,previous.length);assert.equal(receipt.modelSha256,sha(fs.readFileSync(path.join(DIR,'teacher-model.json'))));
let productivePlans=0,witnessActions=0;
for(let i=0;i<roots.length;i++){
    const item=roots[i],before=previous[i],engine=new GameEngine(item.state),legal=legalActions(engine),root=infer(engine,legal,model,old),ai=new ModelBattleSearchAI(model,old,{priorWeight:0});ai.getAction(engine,item.state.currentPlayer,legal,root,{});
    const x=root.x,inputHash=hash({tokens:x.tokens,groups:x.groups,candidates:x.candidates,refs:x.refs,codes:x.codes,actionGroups:x.actionGroups}),candidates=(ai.lastDecision.traces??[]).map((v:any)=>({code:encodeAction(v.action),index:v.index,score:v.score,confidence:root.prior[v.index],complete:v.complete,riskKnown:v.riskKnown,commanderLethal:v.commanderLethal,actorLethal:v.actorLethal,naturalWin:v.naturalWin,tactical:v.tactical,net:v.net}));
    assert.equal(item.id,before.id);assert.equal(inputHash,before.inputHash);assert.deepEqual(candidates,before.candidates,'提交默认有效后续不能改变已标定候选矩阵');assert.equal(root.x.codes[root.out.best],before.preferred);assert.equal(hash(engine.getState()),item.stateHash);
    const audit=auditSearchRisks(engine,ai.lastDecision);witnessActions+=audit.witnessActions;productivePlans+=Number(!!ai.lastDecision.productiveFollowCommitted);
    if((i+1)%10===0)save(`revisions/r10/candidate-reuse-${lane}.live.json`,{roots:i+1,total:roots.length,productivePlans,witnessActions});
}
const result={passed:true,lane,roots:roots.length,candidatesAndInputsExact:true,productivePlans,witnessActions,currentCoreSha256:sha(fs.readFileSync(path.join(DIR,'model_battle_search_ai.ts'))),configSha256:sha(fs.readFileSync(path.join(DIR,'search_prior_config.ts'))),previousDataSha256:sha(fs.readFileSync(path.join(DIR,prefix,`teacher-${lane}.jsonl.gz`))),modelSha256:receipt.modelSha256,calibrationSha256:sha(fs.readFileSync(path.join(DIR,prefix,'teacher-calibration.json')))};save(`revisions/r10/candidate-reuse-${lane}.json`,result);console.log(result);
