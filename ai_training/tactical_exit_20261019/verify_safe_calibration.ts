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
let unsafeScoreChanges=0,witnessActions=0,safeCandidates=0;
const safe=(v:any)=>v.complete&&v.riskKnown&&!v.commanderLethal&&!v.actorLethal;
for(let i=0;i<roots.length;i++){
    const item=roots[i],before=previous[i],engine=new GameEngine(item.state),legal=legalActions(engine),root=infer(engine,legal,model,old),ai=new ModelBattleSearchAI(model,old,{priorWeight:0});ai.getAction(engine,item.state.currentPlayer,legal,root,{});
    const x=root.x,inputHash=hash({tokens:x.tokens,groups:x.groups,candidates:x.candidates,refs:x.refs,codes:x.codes,actionGroups:x.actionGroups}),candidates=(ai.lastDecision.traces??[]).map((v:any)=>({code:encodeAction(v.action),index:v.index,score:v.score,confidence:root.prior[v.index],complete:v.complete,riskKnown:v.riskKnown,commanderLethal:v.commanderLethal,actorLethal:v.actorLethal,naturalWin:v.naturalWin,tactical:v.tactical,net:v.net}));
    assert.equal(item.id,before.id);assert.equal(inputHash,before.inputHash);assert.equal(root.x.codes[root.out.best],before.preferred);assert.equal(hash(engine.getState()),item.stateHash);
    try{
        assert.deepEqual(candidates.map(({score,...v}:any)=>v),before.candidates.map(({score,...v}:any)=>v),'军力风险修复不能改变候选覆盖、真实战损或已知安全标记');
        assert.deepEqual(candidates.filter(safe),before.candidates.filter(safe),'条件校准只使用的安全候选矩阵必须精确保持');
    }catch(error){save(`revisions/r11/rejected-safe-reuse-${lane}.json`,{passed:false,lane,id:item.id,stateHash:item.stateHash,reason:'风险记账修复改变了同单位后续选择，拒绝复用旧条件校准',previousCandidates:before.candidates,currentCandidates:candidates,currentCoreSha256:sha(fs.readFileSync(path.join(DIR,'model_battle_search_ai.ts'))),currentLeafSha256:sha(fs.readFileSync(path.join(DIR,'leaf.ts')))});throw error;}
    safeCandidates+=candidates.filter(safe).length;
    unsafeScoreChanges+=candidates.filter((v:any,j:number)=>v.score!==before.candidates[j].score).length;
    const audit=auditSearchRisks(engine,ai.lastDecision);witnessActions+=audit.witnessActions;
    if((i+1)%10===0)save(`revisions/r11/safe-calibration-${lane}.live.json`,{roots:i+1,total:roots.length,safeCandidates,unsafeScoreChanges,witnessActions});
}
const result={passed:true,lane,roots:roots.length,safeCandidateMatrixExact:true,allCandidateCoverageAndSafetyExact:true,safeCandidates,unsafeScoreChanges,witnessActions,currentCoreSha256:sha(fs.readFileSync(path.join(DIR,'model_battle_search_ai.ts'))),currentLeafSha256:sha(fs.readFileSync(path.join(DIR,'leaf.ts'))),configSha256:sha(fs.readFileSync(path.join(DIR,'search_prior_config.ts'))),previousDataSha256:sha(fs.readFileSync(path.join(DIR,prefix,`teacher-${lane}.jsonl.gz`))),modelSha256:receipt.modelSha256,calibrationSha256:sha(fs.readFileSync(path.join(DIR,prefix,'teacher-calibration.json')))};save(`revisions/r11/safe-calibration-${lane}.json`,result);console.log(result);
