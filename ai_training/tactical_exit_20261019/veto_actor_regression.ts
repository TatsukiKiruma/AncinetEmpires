// 这是R14未采纳策略的历史假设夹具；R15起不作为当前门禁，保留原件供复核。
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,hash,sha } from './io';
const model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json'),cases=[];
for(const [slot,index] of [['apk_like-teacher_search-m1-s0',57],['heuristic-teacher_search-m1-s0',56]] as const){
    const folder=path.join(DIR,'teacher-r13-battles/slots',slot),result=JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8')),bytes=fs.readFileSync(path.join(folder,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path));
    for(const row of rows){assert.equal(hash(engine.getState()),row.beforeHash);if(row.i===index)break;assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);}
    const ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,result.slot.seat),d=ai.lastDecision,primary=d.traces.find((v:any)=>encodeAction(v.action)===d.preferred),selected=d.traces.find((v:any)=>encodeAction(v.action)===d.selected);
    assert.ok(d.reason.startsWith('Veto')&&primary.actorLethal&&primary.highValueActor);
    assert.equal(selected.actor,primary.actor,'已有同单位完整安全完结时，Veto不能先消耗队友指挥官行动再回头处理原单位');
    assert.ok(selected.complete&&selected.riskKnown&&!selected.actorLethal&&!selected.commanderLethal&&d.vetoSameActorPreferred);
    assert.ok(selected.vetoCommanderHealth.every((r:any)=>r.preserved));const replay=engine.clone();assert.ok(!replay.step(action).info.includes('非法动作'));for(const step of selected.plan)assert.ok(!replay.step(step.action).info.includes('非法动作'));const state=replay.getState();assert.ok(state.units.find(u=>u.id===primary.actor)!.hasActed);
    const commander=engine.getState().units.find(u=>u.id==='apk_u1')!;assert.equal(state.units.find(u=>u.id===commander.id)!.hasActed,commander.hasActed);
    const audit=auditSearchRisks(engine,d);assert.ok(d.nodes<=150);cases.push({slot,row:index,beforeHash:hash(engine.getState()),legacySelected:rows.find(r=>r.i===index).code,selected:encodeAction(action),defaultActor:primary.actor,teammateActionPreserved:true,logSha256:sha(bytes),audit});
}
const r={passed:true,cases,scope:'已有安全完整同单位Veto时保留队友行动；不代表实战资格'};if(process.env.STAGE5_VETO_ACTOR_RECEIPT)save(process.env.STAGE5_VETO_ACTOR_RECEIPT,r);console.log(r);
