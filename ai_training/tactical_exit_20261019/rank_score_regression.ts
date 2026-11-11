import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { infer,legalActions } from './policy_runtime';
import { auditSearchRisks } from './audit_search_risks';
import { SEARCH_PRIOR_WEIGHT } from './search_prior_config';
import { SEARCH_MAX_OWN_NODES } from './search_budget';
import { read,save,hash,sha,DIR } from './io';
const mode=process.argv[2]??'teacher',modelFile=mode==='final'?'model-final.json':'teacher-model.json',model=read(modelFile),old=read('old-schema.json'),checks=[];
for(const [i,item] of read('browser-states.json').entries()){
    const engine=new GameEngine(item.state),legal=legalActions(engine),root=infer(engine,legal,model,old),zero=new ModelBattleSearchAI(model,old,{priorWeight:0}),fitted=new ModelBattleSearchAI(model,old);
    zero.getAction(engine,item.state.currentPlayer,legal,root,{});fitted.getAction(engine,item.state.currentPlayer,legal,root,{});
    const a=zero.lastDecision,b=fitted.lastDecision;assert.equal(hash(engine.getState()),hash(item.state));assert.equal(b.branchPolicyCalls,0);assert.ok(b.nodes<=SEARCH_MAX_OWN_NODES);
    assert.deepEqual(b.traces.map((v:any)=>[v.index,v.score,v.value,v.tactical,v.net,v.complete,v.commanderLethal,v.actorLethal]),a.traces.map((v:any)=>[v.index,v.score,v.value,v.tactical,v.net,v.complete,v.commanderLethal,v.actorLethal]),'校准只能改变排序分，不能改写叶子分、真实战损或安全标记');
    for(const v of b.traces)assert.ok(Math.abs(v.rankScore-(v.score+SEARCH_PRIOR_WEIGHT*v.policyConfidence))<1e-12);
    if(b.vetoLeafRanked){assert.ok(a.vetoLeafRanked);assert.equal(a.selected,b.selected,'Veto固定按叶子分排序，普通策略系数不能改变其选择');}
    if(b.traces.some((v:any)=>v.naturalWin))assert.ok(b.reason.includes('自然获胜'),'自然获胜守卫不能被策略置信度覆盖');
    const audit=auditSearchRisks(engine,b);checks.push({i,changedByCalibration:a.selected!==b.selected,audit});
}
const result={passed:true,mode,modelHash:hash(model),modelSha256:sha(fs.readFileSync(path.join(DIR,modelFile))),states:checks.length,priorWeight:SEARCH_PRIOR_WEIGHT,leafScoresExact:true,checks};save(mode==='final'?'rank-score-final-gate.json':'rank-score-gate.json',result);console.log({passed:true,mode,states:checks.length,priorWeight:SEARCH_PRIOR_WEIGHT});
