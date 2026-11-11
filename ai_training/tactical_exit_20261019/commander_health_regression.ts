import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { SEARCH_MAX_OWN_NODES } from './search_budget';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,hash,sha } from './io';
const model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json'),cases=[];
for(const [slot,index] of [['apk_like-teacher_search-m1-s0',57],['heuristic-teacher_search-m1-s0',56]] as const){
    const folder=path.join(DIR,'teacher-r12-battles/slots',slot),result=JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8')),bytes=fs.readFileSync(path.join(folder,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path));
    for(const row of rows){assert.equal(hash(engine.getState()),row.beforeHash);if(row.i===index)break;assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);}
    const legacy=rows.find(r=>r.i===index)!,ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,result.slot.seat),decision=ai.lastDecision;
    assert.ok(decision.reason.startsWith('Veto'),'原高价值单位的真实致死仍须否决');
    const primary=decision.traces.find((v:any)=>encodeAction(v.action)===decision.preferred),selected=decision.traces.find((v:any)=>encodeAction(v.action)===decision.selected),base=primary.risks.find((r:any)=>r.commander),risk=selected.risks.find((r:any)=>r.id===base.id);
    assert.ok(primary.highValueActor&&primary.actorLethal&&risk&&!risk.lethal&&!selected.actorLethal);
    assert.ok(risk.hp-risk.damage>=base.hp-base.damage,'不能通过把指挥官从安全位置送去承受84/90点集火来保护普通单位');
    assert.notEqual(encodeAction(action),legacy.code);assert.ok(selected.vetoCommanderHealth.every((v:any)=>v.preserved));
    const audit=auditSearchRisks(engine,decision);assert.ok(decision.nodes<=SEARCH_MAX_OWN_NODES);cases.push({slot,row:index,beforeHash:hash(engine.getState()),legacySelected:legacy.code,selected:encodeAction(action),baselineRemaining:base.hp-base.damage,selectedRemaining:risk.hp-risk.damage,logSha256:sha(bytes),audit});
}
const receipt={passed:true,cases,scope:'相同权威前缀与真实见证下的健康不退化回归，不是对战胜率证明'};if(process.env.STAGE5_COMMANDER_HEALTH_RECEIPT)save(process.env.STAGE5_COMMANDER_HEALTH_RECEIPT,receipt);console.log(receipt);
