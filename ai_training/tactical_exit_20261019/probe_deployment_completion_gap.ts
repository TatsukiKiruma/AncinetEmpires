import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {calculateDamage} from '../../src/game/rules';
import {ModelBattleSearchAI,type Evaluation,type PlanStep} from './model_battle_search_ai';
import {evaluateLeaf} from './leaf';
import {auditSearchRisks} from './audit_search_risks';
import {read,save,hash,sha,DIR} from './io';
import type {Action,GameState} from '../../src/game/types';

const phase=process.argv[2]??'teacher-r21',gate=read(phase+'-gate.json');
assert.ok(!gate.passed&&gate.strictReplay,'只诊断已完整strict的失败面板；合格教师继续原闭环');
const frozen=read('source-freeze-'+phase+'.json');for(const [name,v] of Object.entries(frozen.files) as [string,{sha256:string}][])assert.equal(sha(fs.readFileSync(path.resolve(DIR,'../..',name))),v.sha256,'必须使用实际对战源码');
const model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json');
const output=`revisions/${phase.replace('teacher-','')}/deployment-completion-probe-${Date.now()}`,cases:any[]=[];let scanned=0,retainedAlternatives=0,betterSafeLeaves=0,witnessActions=0;
type OwnStep={branch:GameEngine;before:GameState;after:GameState;action:Action};
const folders=fs.readdirSync(path.join(DIR,phase+'-battles/slots')).filter(v=>v.includes('teacher_search')).sort((a,b)=>Number(b.startsWith('expanded'))-Number(a.startsWith('expanded'))||a.localeCompare(b));
for(const slot of folders){
    if(cases.length>=3)break;const base=phase+'-battles/slots/'+slot,result=read(base+'/result.json');if(result.classification==='natural_win'||result.classification==='natural_draw')continue;
    assert.ok(read(base+'/strict-replay.json').passed);assert.equal(result.modelHash,hash(model));
    const e=new GameEngine(read(plan.maps[result.slot.mapIndex].path)),rows=gunzipSync(fs.readFileSync(path.join(DIR,base,'actions.jsonl.gz'))).toString().trim().split('\n').map(v=>JSON.parse(v));
    for(const row of rows){
        assert.equal(hash(e.getState()),row.beforeHash);
        if(row.side==='model'&&row.search?.preferredPolicyEvaluated&&cases.length<3){
            for(const trace of row.search.traces??[]){
                if(cases.length>=3)break;
                if(trace.action.type!=='recruit_to_castle'||!trace.complete||!trace.riskKnown||!trace.actorLethal&&!trace.commanderLethal||!trace.plan.length)continue;
                const ai=new ModelBattleSearchAI(model,old),steps:OwnStep[]=[],rawStep=(ai as any).step.bind(ai);
                // 只记录原搜索实际已经执行的己方节点；风险和Value内部的对手step不算候选。
                (ai as any).step=(branch:GameEngine,action:Action)=>{const before=branch.getState(),after=rawStep(branch,action);steps.push({branch,before,after,action});return after;};
                const reference=ai.evaluateCandidate(e,e.getState().currentPlayer,trace.action,trace.index);assert.equal(reference.nodes,steps.length);assert.ok(Math.abs(reference.score-trace.score)<1e-9);scanned++;
                const start=e.getState(),player=start.currentPlayer,id=reference.actor!,afterRoot=steps[0].after,actorStart=afterRoot.units.find(u=>u.id===id)!;
                assert.ok(actorStart&&actorStart.apkPendingRecruitSource==='empty_castle');
                const currentPlan=reference.plan,move=currentPlan[0]?.action.type==='move'?currentPlan[0]:undefined,expectedPrefix=move?steps.find(v=>hash(v.before)===hash(afterRoot)&&encodeAction(v.action)===encodeAction(move.action))?.after:afterRoot;
                if(!expectedPrefix)continue;const completion=currentPlan[move?1:0]?.action;if(!completion)continue;
                for(const option of steps){
                    if(hash(option.before)!==hash(expectedPrefix)||encodeAction(option.action)===encodeAction(completion)||!['attack','capture','heal','summon','destroy_town','repair','support','wait'].includes(option.action.type))continue;
                    const finished=option.branch.isTerminal()||option.after.currentPlayer!==player||!option.branch.getLegalActions(player,{unitId:id,skipRecruitment:true}).some(a=>'unitId' in a&&a.unitId===id||'attackerId' in a&&a.attackerId===id||'healerId' in a&&a.healerId===id||'summonerId' in a&&a.summonerId===id||'supporterId' in a&&a.supporterId===id);
                    if(!finished)continue;retainedAlternatives++;
                    const leaf=evaluateLeaf(start,option.branch,player,id,model,old,actorStart);if(!leaf.riskKnown||leaf.actorLethal||leaf.commanderLethal||leaf.tactical<reference.tactical-.15||leaf.score<=reference.score+1e-10)continue;betterSafeLeaves++;
                    const alternativePlan:PlanStep[]=[...(move?[move]:[]),{state:JSON.stringify(option.before),action:option.action}],acting=option.action.type==='attack'?option.before.units.find(u=>u.id===id):undefined;
                    const freeAttacks=Number(!!acting&&option.action.type==='attack'&&calculateDamage(option.before,id,option.action.targetId)>0&&(option.after.units.find(u=>u.id===id)?.hp??0)>=acting.hp);
                    const alternative:Evaluation={...reference,...leaf,branch:option.branch,state:option.after,plan:alternativePlan,complete:true,freeAttacks,finishRecovery:{score:reference.score,riskKnown:reference.riskKnown,commanderLethal:reference.commanderLethal,actorLethal:reference.actorLethal,risks:reference.risks,plan:reference.plan}};
                    const audit=auditSearchRisks(e,{traces:[alternative]});witnessActions+=audit.witnessActions;
                    class Shadow extends ModelBattleSearchAI {override evaluateCandidate(engine:GameEngine,p:number,action:Action,index=-1){const control=super.evaluateCandidate(engine,p,action,index);return encodeAction(action)===encodeAction(trace.action)?{...alternative,index,nodes:control.nodes}:control;}}
                    const shadow=new Shadow(model,old),selected=shadow.getAction(e,player),d=shadow.lastDecision,chosen=d.traces.find((v:any)=>encodeAction(v.action)===encodeAction(selected)),nextActual=rows[row.i+1]?.code;
                    const causal=encodeAction(selected)!==row.code||!!(d.planCommitted&&chosen?.plan.some((v:any,j:number)=>encodeAction(v.action)!==rows[row.i+1+j]?.code));if(!causal)continue;
                    assert.equal(encodeAction(new ModelBattleSearchAI(model,old).getAction(e,player)),row.code,'原实际选择必须精确重现');
                    cases.push({slot,row:row.i,state:start,beforeHash:row.beforeHash,root:trace.action,originalPlan:trace.plan,alternativePlan:alternativePlan.map(v=>({action:v.action})),ownStepsActuallyEnumerated:steps.map(v=>({action:v.action,beforeHash:hash(v.before),afterHash:hash(v.after)})),original:{score:reference.score,tactical:reference.tactical,actorLethal:reference.actorLethal,commanderLethal:reference.commanderLethal},alternative:{score:leaf.score,tactical:leaf.tactical,actorLethal:leaf.actorLethal,commanderLethal:leaf.commanderLethal},oldSelected:row.code,shadowSelected:encodeAction(selected),shadowReason:d.reason,shadowPlanCommitted:d.planCommitted,shadowSelectedPlan:chosen?.plan,nextActual,audit});save(output+'/cases.json',cases);break;
                }
            }
        }
        assert.ok(!e.step(row.action).info.includes('非法动作'));assert.equal(hash(e.getState()),row.afterHash);
        if(cases.length>=3)break;if(scanned&&scanned%20===0)save(output+'/live.json',{scanned,retainedAlternatives,betterSafeLeaves,cases:cases.length});
    }
}
const report={passed:true,phase,scanned,retainedAlternatives,betterSafeLeaves,causalCases:cases.length,witnessActions,sourceSha256:sha(fs.readFileSync(new URL(import.meta.url))),modelSha256:sha(fs.readFileSync(path.join(DIR,'teacher-model.json'))),casesPath:output+'/cases.json',scope:'只检验空城新兵已执行但被即时贪心丢弃的完结；不新增己方节点，不算专家数据或棋力通过'};save(output+'/report.json',report);console.log(report);
