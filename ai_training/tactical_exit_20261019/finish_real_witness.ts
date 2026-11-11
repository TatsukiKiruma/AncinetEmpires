import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { evaluateLeaf } from './leaf';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,hash,sha } from './io';
const plan=read('teacher-battle-plan.json'),folder='teacher-r6-battles/slots',model=read('teacher-model.json'),old=read('old-schema.json');
let tested=0,replayed=0;
// 固定按槽名、实际动作顺序寻找实现反例，不读取胜负标签选择状态。
for(const name of fs.readdirSync(path.join(DIR,folder)).sort()){
    const root=path.join(DIR,folder,name),started=JSON.parse(fs.readFileSync(path.join(root,'started.json'),'utf8'));
    if(started.slot.model!=='teacher_search')continue;
    const bytes=fs.readFileSync(path.join(root,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString('utf8').trim().split('\n').map(line=>JSON.parse(line));
    if(!rows.some(r=>(r.search?.traces??[]).some((t:any)=>t.action.type==='move'&&t.plan?.some((p:any)=>p.action.type==='attack')&&(t.commanderLethal||t.actorLethal))))continue;
    const engine=new GameEngine(read(plan.maps[started.slot.mapIndex].path));
    for(const row of rows){
        const s=engine.getState();assert.equal(hash(s),row.beforeHash);
        for(const trace of row.search?.traces??[]){
            if(trace.action.type!=='move'||!trace.complete||!trace.riskKnown||!(trace.commanderLethal||trace.actorLethal)||!trace.plan?.some((p:any)=>p.action.type==='attack'))continue;
            tested++;const moved=engine.clone();moved.step(trace.action);const wait=moved.getLegalActions(s.currentPlayer,{unitId:trace.actor,skipRecruitment:true}).find(a=>a.type==='wait');if(!wait)continue;
            const safe=moved.clone();safe.step(wait);const leaf=evaluateLeaf(s,safe,s.currentPlayer,trace.actor,model,old);
            if(!leaf.riskKnown||leaf.actorLethal||leaf.commanderLethal||leaf.score<=trace.score)continue;
            const revised=new ModelBattleSearchAI(model,old).evaluateCandidate(engine,s.currentPlayer,trace.action,trace.index);if(!revised.finishRecovery)continue;
            assert.ok(!revised.actorLethal&&!revised.commanderLethal&&revised.complete);
            const audit=auditSearchRisks(engine,{traces:[revised]});
            const result={passed:true,slot:name,row:row.i,beforeHash:row.beforeHash,logSha256:sha(bytes),sourceRevision:'r6',tested,replayed,root:encodeAction(trace.action),oldPlan:trace.plan.map((p:any)=>encodeAction(p.action)),newPlan:revised.plan.map(p=>encodeAction(p.action)),oldScore:trace.score,newScore:revised.score,audit,state:s};
            save('finish-real-witness-gate.json',result);console.log({...result,state:undefined});process.exit(0);
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);replayed++;
    }
}
save('finish-real-witness-gate.json',{passed:false,tested,replayed,error:'实际日志中未找到相同反例'});throw Error('未找到实际反例，保留构造回归与诊断结果');
