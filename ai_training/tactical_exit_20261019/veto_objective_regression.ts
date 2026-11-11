import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { SEARCH_MAX_OWN_NODES } from './search_budget';
import { commanderHealthProtection } from './commander_health_guard';
import { retaliation } from './leaf';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,hash,sha } from './io';
const model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json'),cases=[];
for(const [slot,index] of [['apk_like-teacher_search-m1-s0',57],['heuristic-teacher_search-m1-s0',56]] as const){
    const folder=path.join(DIR,'teacher-r14-battles/slots',slot),result=JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8')),bytes=fs.readFileSync(path.join(folder,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path));
    for(const row of rows){assert.equal(hash(engine.getState()),row.beforeHash);if(row.i===index)break;assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);}
    const ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,result.slot.seat),d=ai.lastDecision,primary=d.traces.find((v:any)=>encodeAction(v.action)===d.preferred),selected=d.traces.find((v:any)=>encodeAction(v.action)===d.selected);
    const referenceAction=engine.getLegalActions(result.slot.seat).find(a=>a.type==='move'&&a.unitId==='apk_u1'&&a.to.x===3&&a.to.y===3)!;assert.ok(referenceAction);
    const reference=ai.evaluateCandidate(engine,result.slot.seat,referenceAction),base=engine.clone();base.step(primary.action);for(const follow of primary.plan)base.step(follow.action);
    assert.ok(reference.complete&&reference.riskKnown&&!reference.commanderLethal&&!reference.actorLethal&&reference.tactical>=primary.tactical-.15);
    assert.ok(commanderHealthProtection(engine.getState(),result.slot.seat,{...primary,state:base.getState()},reference).every(v=>v.preserved));
    const protectedActor=retaliation(reference.branch,result.slot.seat,primary.actor);assert.ok(protectedActor.known&&protectedActor.risks.some(r=>r.id===primary.actor&&!r.lethal));
    assert.ok(selected.score>=reference.score-1e-10,'Veto备选必须按风险调整后的叶子分选择，不能让同单位绝对优先或已被否决策略的置信分覆盖更高叶子值');
    assert.ok(d.vetoLeafRanked&&d.reason.startsWith('Veto'));
    const changedScale=new ModelBattleSearchAI(model,old,{priorWeight:1.6});assert.equal(encodeAction(changedScale.getAction(engine,result.slot.seat)),encodeAction(action),'普通融合系数不能改变Veto固定叶子排序');
    const audit=auditSearchRisks(engine,d);assert.ok(d.nodes<=SEARCH_MAX_OWN_NODES);cases.push({slot,row:index,beforeHash:hash(engine.getState()),legacySelected:rows.find(r=>r.i===index).code,selected:encodeAction(action),selectedScore:selected.score,admissibleReferenceScore:reference.score,logSha256:sha(bytes),audit});
}
const r={passed:true,cases,scope:'相同输入下选择满足全部原守卫的更高叶子值，普通融合系数不改变Veto；不是对战增益证明'};if(process.env.STAGE5_VETO_OBJECTIVE_RECEIPT)save(process.env.STAGE5_VETO_OBJECTIVE_RECEIPT,r);console.log(r);
