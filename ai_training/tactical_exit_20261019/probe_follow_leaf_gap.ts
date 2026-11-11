import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI,type Evaluation } from './model_battle_search_ai';
import { evaluateLeaf } from './leaf';
import { auditSearchRisks } from './audit_search_risks';
import { read,save,DIR,hash,sha } from './io';
import type { Action } from '../../src/game/types';
const phase=process.argv[2]??'teacher-r20',causalOnly=process.argv[3]==='causal',stamp=String(Date.now()),prefix=`revisions/r20/follow-probe-${stamp}`,plan=read('teacher-battle-plan.json'),model=read('teacher-model.json'),old=read('old-schema.json');
assert.ok(read(phase+'-gate.json').strictReplay,'只读已完成完整strict的失败面板');assert.equal(read(phase+'-gate.json').passed,false,'合格教师继续原闭环，不额外扰动');
const frozen=read('source-freeze-'+phase+'.json');for(const [file,v] of Object.entries(frozen.files) as [string,{sha256:string}][])assert.equal(sha(fs.readFileSync(path.resolve(DIR,'../..',file))),v.sha256,'诊断必须使用实际对战版本');
assert.ok(!fs.existsSync(path.join(DIR,prefix)));let scanned=0,alternatives=0,witnessActions=0,leafGaps=0;const cases:any[]=[];
const folders=fs.readdirSync(path.join(DIR,phase+'-battles/slots')).filter(n=>n.includes('teacher_search')).sort((a,b)=>Number(b.startsWith('expanded'))-Number(a.startsWith('expanded'))||a.localeCompare(b));
for(const slotId of folders){
    if(cases.length>=3)break;const base=`${phase}-battles/slots/${slotId}`,r=read(base+'/result.json');if(r.classification!=='natural_loss')continue;
    assert.equal(r.modelHash,hash(model));assert.ok(read(base+'/strict-replay.json').passed);
    const e=new GameEngine(read(plan.maps[r.slot.mapIndex].path)),rows=gunzipSync(fs.readFileSync(path.join(DIR,base,'actions.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(v=>JSON.parse(v));
    for(const row of rows){
        const before=e.getState();assert.equal(hash(before),row.beforeHash);
        if(row.side==='model'&&row.search?.preferredPolicyEvaluated&&cases.length<3){
            for(const trace of row.search.traces??[]){
                if(cases.length>=3)break;
                if(trace.action.type!=='move'||!trace.complete||!trace.riskKnown||!trace.actorLethal&&!trace.commanderLethal||!trace.plan.length)continue;
                const id=trace.actor,actorStart=before.units.find(u=>u.id===id);if(!actorStart)continue;
                const branch=e.clone(),after=branch.step(trace.action).state;if(branch.isTerminal()||after.currentPlayer!==before.currentPlayer)continue;
                const follows=branch.getLegalActions(before.currentPlayer,{unitId:id,skipRecruitment:true}).filter(a=>['attack','capture','heal','summon','destroy_town','repair','support','wait'].includes(a.type)&&encodeAction(a)!==encodeAction(trace.plan[0].action));
                if(!follows.length)continue;
                const reference=new ModelBattleSearchAI(model,old).evaluateCandidate(e,before.currentPlayer,trace.action,trace.index);assert.ok(Math.abs(reference.score-trace.score)<1e-9,'重建原贪心叶子必须相同');scanned++;
                for(const follow of follows){
                    alternatives++;const c=new ModelBattleSearchAI(model,old).evaluateCandidate(branch,before.currentPlayer,follow);
                    // 仅考察一次已枚举完结，不追加新的移动/突击节点。
                    if(!c.complete||c.plan.length)continue;
                    const leaf=evaluateLeaf(before,c.branch,before.currentPlayer,id,model,old,actorStart);
                    if(!leaf.riskKnown||leaf.actorLethal||leaf.commanderLethal||leaf.tactical<reference.tactical-.15||leaf.score<=reference.score+1e-10)continue;
                    const alternative:Evaluation={...reference,...leaf,branch:c.branch,state:c.state,plan:[{state:JSON.stringify(after),action:follow}],freeAttacks:c.freeAttacks,complete:true};
                    const audit=auditSearchRisks(e,{traces:[alternative]});witnessActions+=audit.witnessActions;
                    const replay=e.clone();for(const action of [trace.action,follow]){assert.ok(replay.getLegalActions(replay.getState().currentPlayer).some(a=>encodeAction(a)===encodeAction(action)));assert.ok(!replay.step(action).info.includes('非法动作'));}assert.equal(hash(replay.getState()),hash(c.state));
                    class Shadow extends ModelBattleSearchAI{
                        override evaluateCandidate(engine:GameEngine,player:number,action:Action,index=-1):Evaluation{const original=super.evaluateCandidate(engine,player,action,index);return encodeAction(action)===encodeAction(trace.action)?{...alternative,index,nodes:original.nodes}:original;}
                    }
                    const shadow=new Shadow(model,old),selected=shadow.getAction(e,before.currentPlayer),d=shadow.lastDecision;
                    leafGaps++;const selectedPlan=d.traces.find((v:any)=>encodeAction(v.action)===encodeAction(selected))?.plan,nextActual=rows[row.i+1]?.code;
                    const actionSequenceWouldChange=encodeAction(selected)!==row.code||!!(d.planCommitted&&selectedPlan?.length&&encodeAction(selectedPlan[0].action)!==nextActual);
                    if(causalOnly&&!actionSequenceWouldChange)continue;
                    const control=new ModelBattleSearchAI(model,old);assert.equal(encodeAction(control.getAction(e,before.currentPlayer)),row.code,'实际策略基线必须精确重现');
                    const result={slot:slotId,row:row.i,beforeHash:row.beforeHash,state:before,root:trace.action,originalPlan:trace.plan,alternativePlan:[{action:follow}],original:{score:reference.score,tactical:reference.tactical,net:reference.net,actorLethal:reference.actorLethal,commanderLethal:reference.commanderLethal},alternative:{score:leaf.score,tactical:leaf.tactical,net:leaf.net,actorLethal:leaf.actorLethal,commanderLethal:leaf.commanderLethal},audit,oldSelected:row.code,shadowSelected:encodeAction(selected),shadowReason:d.reason,shadowPlanCommitted:d.planCommitted,shadowSelectedPlan:selectedPlan,nextActual,actionSequenceWouldChange,scope:'离线完整叶子对照；不算教师专家、棋力或性能通过'};
                    cases.push(result);save(prefix+'/cases.json',cases);break;
                }
            }
        }
        assert.ok(!e.step(row.action).info.includes('非法动作'));assert.equal(hash(e.getState()),row.afterHash);
        if(cases.length>=3)break;
        if(scanned&&scanned%50===0)save(prefix+'/live.json',{scanned,alternatives,cases:cases.length});
    }
}
const report={passed:true,phase,scanned,alternatives,leafGaps,causalOnly,cases:cases.length,witnessActions,coverageGap:cases.length>0,modelSha256:sha(fs.readFileSync(path.join(DIR,'teacher-model.json'))),casesPath:prefix+'/cases.json',sourceSha256:sha(fs.readFileSync(new URL(import.meta.url))),scope:'允许不斩杀威胁者的攻击/治疗等原已枚举完结；只查真实完整叶子更高且安全的遗漏，不按对战胜负拟合参数'};save(prefix+'/report.json',report);console.log(report);
