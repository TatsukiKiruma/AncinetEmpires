import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,sha,hash } from './io';
const plan=read('teacher-battle-plan.json'),model=read('teacher-model.json'),old=read('old-schema.json'),folder='teacher-r11-battles/slots';
for(const name of fs.readdirSync(path.join(DIR,folder)).sort()){
    const base=path.join(DIR,folder,name),result=JSON.parse(fs.readFileSync(path.join(base,'result.json'),'utf8'));if(result.slot.model!=='teacher_search')continue;
    const bytes=fs.readFileSync(path.join(base,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path));
    for(const row of rows){
        assert.equal(hash(engine.getState()),row.beforeHash);const trace=row.search?.traces?.find((v:any)=>encodeAction(v.action)===row.code);
        if(row.action.type==='recruit_to_castle'&&trace?.deploymentMoveAvailable&&trace.complete&&trace.plan?.length&&trace.plan.every((p:any)=>p.action.type==='wait')&&!row.search.planCommitted){
            const actual=engine.clone();actual.step(row.action);const planned=actual.clone();for(const p of trace.plan)assert.ok(!planned.step(p.action).info.includes('非法动作'));
            const actor=actual.getState().units.find(u=>u.id===trace.actor)!;assert.ok(!actor.hasMoved&&!actor.hasActed&&planned.getState().units.find(u=>u.id===actor.id)!.hasActed);assert.notEqual(hash(actual.getState()),hash(planned.getState()));
            const fresh=new ModelBattleSearchAI(model,old).evaluateCandidate(engine,row.player,row.action);
            if(fresh.deploymentDeferred)assert.deepEqual(fresh.state,actual.getState());else assert.ok(fresh.complete&&fresh.plan.some(p=>p.action.type!=='wait'));
            const audit=auditSearchRisks(engine,{traces:[fresh]});const receipt={passed:true,slot:name,row:row.i,beforeHash:row.beforeHash,logSha256:sha(bytes),root:row.code,oldSimulatedFollow:trace.plan.map((p:any)=>encodeAction(p.action)),oldSimulatedStateHash:hash(planned.getState()),actualRootStateHash:hash(actual.getState()),newDeferred:!!fresh.deploymentDeferred,newPlan:fresh.plan.map(p=>encodeAction(p.action)),newNodes:fresh.nodes,audit,scope:'权威前缀重放证明旧叶子与实际执行状态不同；不是实战增益证明',state:engine.getState()};save('deployment-real-witness-gate.json',receipt);console.log({...receipt,state:undefined});process.exit(0);
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);
    }
}
throw Error('没有找到已结束R11轨迹中的招募待机估值不一致帧');
