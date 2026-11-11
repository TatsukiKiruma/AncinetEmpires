import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,hash,sha } from './io';
const phase=process.argv[2]??'teacher-r16',plan=read('teacher-battle-plan.json'),model=read('teacher-model.json'),old=read('old-schema.json');
let inspected=0,pairedLosses=0;
for(const slot of plan.slots.filter((s:any)=>s.model==='teacher_search')){
    const base=path.join(DIR,phase+'-battles/slots',slot.id),pure=path.join(DIR,phase+'-battles/slots',slot.id.replace('teacher_search','pure'),'result.json');
    if(!fs.existsSync(path.join(base,'result.json'))||!fs.existsSync(pure))continue;
    const result=read(path.join(base,'result.json'));if(result.classification==='natural_win'||read(pure).classification!=='natural_win')continue;
    assert.ok(read(path.join(base,'strict-replay.json')).passed);pairedLosses++;
    const bytes=fs.readFileSync(path.join(base,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[slot.mapIndex].path));let local=0;
    for(const row of rows){
        assert.equal(hash(engine.getState()),row.beforeHash);
        if(row.search?.changed&&local<12){
            local++;inspected++;
            const ai=new ModelBattleSearchAI(model,old,{topK:12}),action=ai.getAction(engine,row.player),d=ai.lastDecision;
            assert.equal(d.preferred,row.search.preferred);assert.equal(d.branchPolicyCalls,0);assert.ok(d.nodes<=300);
            const chosen=d.traces.find((v:any)=>encodeAction(v.action)===encodeAction(action)),previous=row.search.traces.find((v:any)=>encodeAction(v.action)===row.code),oldCodes=new Set(row.search.traces.map((v:any)=>encodeAction(v.action)));
            const improved=chosen&&previous&&!oldCodes.has(encodeAction(action))&&chosen.complete&&chosen.riskKnown&&!chosen.commanderLethal&&!chosen.actorLethal&&(d.reason.startsWith('Veto')?chosen.score>previous.score+1e-10:chosen.rankScore>previous.rankScore+1e-10);
            if(improved){
                const audit=auditSearchRisks(engine,d),receipt={passed:true,coverageGap:true,phase,slot:slot.id,row:row.i,beforeHash:row.beforeHash,logSha256:sha(bytes),coreSha256:sha(fs.readFileSync(path.join(DIR,'model_battle_search_ai.ts'))),topK:12,maximumOwnNodes:300,preferred:d.preferred,oldSelected:row.code,oldScore:previous.score,oldRankScore:previous.rankScore,selected:encodeAction(action),newScore:chosen.score,newRankScore:chosen.rankScore,reason:d.reason,inspected,pairedLosses,audit,state:engine.getState(),decision:d,scope:'仅诊断当前Top6外真实可重放、更高分且满足全部原守卫的候选；Top12尚未资格验收，不作为实战增益或超参数优胜证据'};
                save(phase+'-root-coverage-gate.json',receipt);console.log({...receipt,state:undefined,decision:undefined});process.exit(0);
            }
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);
    }
}
const receipt={passed:true,coverageGap:false,phase,inspected,pairedLosses,scope:'每个配对失败局前12次实际纠正中未找到满足全部原守卫的更高分新增根；不据此扩大候选'};save(phase+'-root-coverage-gate.json',receipt);console.log(receipt);
