import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {hasAbility} from '../../src/game/abilities';
import {calculateDamage} from '../../src/game/rules';
import {actorId} from '../tactical_scale_20261018/tactics';
import {ModelBattleSearchAI,type Evaluation,type PlanStep} from './model_battle_search_ai';
import {evaluateLeaf} from './leaf';
import {auditSearchRisks} from './audit_search_risks';
import {read,save,hash,sha,DIR} from './io';
import type {Action,GameState} from '../../src/game/types';

// 只在完整失败面板结束后诊断：突击二次移动的单军轻量排序是否丢弃了已执行的安全集火落点。
const phase=process.argv[2]??'teacher-r22',gate=read(phase+'-gate.json');assert.ok(!gate.passed&&gate.strictReplay&&gate.slots===150);
for(const [name,v] of Object.entries(read('source-freeze-'+phase+'.json').files) as [string,{sha256:string}][])assert.equal(sha(fs.readFileSync(path.resolve(DIR,'../..',name))),v.sha256);
const model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json'),output=`revisions/${phase.replace('teacher-','')}/assault-completion-probe-${Date.now()}`;
type Step={branch:GameEngine;before:GameState;after:GameState;action:Action;plan:PlanStep[]};
let roots=0,alternatives=0,safeGaps=0,witnessActions=0;const cases:any[]=[];
const folders=fs.readdirSync(path.join(DIR,phase+'-battles/slots')).filter(v=>v.includes('teacher_search')).sort((a,b)=>Number(b.startsWith('expanded'))-Number(a.startsWith('expanded'))||a.localeCompare(b));
for(const slot of folders){
    if(cases.length>=3)break;const base=phase+'-battles/slots/'+slot,result=read(base+'/result.json');if(!['natural_loss','action_truncation','wall_truncation'].includes(result.classification))continue;
    assert.ok(read(base+'/strict-replay.json').passed);assert.equal(result.modelHash,hash(model));
    const engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path)),rows=gunzipSync(fs.readFileSync(path.join(DIR,base,'actions.jsonl.gz'))).toString().trim().split('\n').map(v=>JSON.parse(v));
    for(const row of rows){
        const start=engine.getState();assert.equal(hash(start),row.beforeHash);
        if(row.side==='model'&&row.search?.preferredPolicyEvaluated&&cases.length<3)for(const trace of row.search.traces??[]){
            if(cases.length>=3)break;const actor=start.units.find(u=>u.id===trace.actor);
            if(!actor||!hasAbility(actor,'assault_troop')||!trace.complete||!trace.riskKnown||!trace.actorLethal&&!trace.commanderLethal&&!trace.finishRecovery)continue;
            if(!['attack','move'].includes(trace.action.type))continue;
            const ai=new ModelBattleSearchAI(model,old),steps:Step[]=[],paths=new Map<string,PlanStep[]>(),rawStep=(ai as any).step.bind(ai);
            (ai as any).step=(branch:GameEngine,action:Action)=>{
                const before=branch.getState(),after=rawStep(branch,action),prefix=paths.get(hash(before)),next=steps.length===0?[]:[...(prefix??[]),{state:JSON.stringify(before),action}];
                assert.ok(steps.length===0||prefix);paths.set(hash(after),next);steps.push({branch,before,after,action,plan:next});return after;
            };
            const reference=ai.evaluateCandidate(engine,start.currentPlayer,trace.action,trace.index);assert.equal(reference.nodes,steps.length);assert.ok(Math.abs(reference.score-trace.score)<1e-9);roots++;
            for(const option of steps.slice(1)){
                if(cases.length>=3)break;if(option.action.type!=='post_attack_move'||hash(option.after)===hash(reference.state))continue;
                const complete=option.branch.isTerminal()||option.after.currentPlayer!==start.currentPlayer||!option.branch.getLegalActions(start.currentPlayer,{unitId:actor.id,skipRecruitment:true}).some(a=>actorId(a,option.after,option.after)===actor.id);
                if(!complete)continue;alternatives++;
                const leaf=evaluateLeaf(start,option.branch,start.currentPlayer,actor.id,model,old,actor);
                if(!leaf.riskKnown||leaf.actorLethal||leaf.commanderLethal||leaf.tactical<reference.tactical-.15||leaf.score<=reference.score+1e-10)continue;safeGaps++;
                let freeAttacks=0;const own=engine.clone(),rootAction=trace.action as Action,rootAfter=own.step(rootAction).state;
                if(rootAction.type==='attack'){const u=start.units.find(u=>u.id===rootAction.attackerId);freeAttacks+=Number(!!u&&calculateDamage(start,u.id,rootAction.targetId)>0&&(rootAfter.units.find(v=>v.id===u.id)?.hp??0)>=u.hp);}
                for(const p of option.plan){const a=p.action,before=own.getState(),after=own.step(a).state;if(a.type==='attack'){const u=before.units.find(u=>u.id===a.attackerId);freeAttacks+=Number(!!u&&calculateDamage(before,u.id,a.targetId)>0&&(after.units.find(v=>v.id===u.id)?.hp??0)>=u.hp);}}
                const alternative:Evaluation={...reference,...leaf,branch:option.branch,state:option.after,plan:option.plan,freeAttacks,complete:true};
                const audit=auditSearchRisks(engine,{traces:[reference,alternative]});witnessActions+=audit.witnessActions;
                class Shadow extends ModelBattleSearchAI {override evaluateCandidate(e:GameEngine,p:number,a:Action,index=-1){const control=super.evaluateCandidate(e,p,a,index);return encodeAction(a)===encodeAction(trace.action)?{...alternative,index,nodes:control.nodes}:control;}}
                const shadow=new Shadow(model,old),selected=shadow.getAction(engine,start.currentPlayer),d=shadow.lastDecision,chosen=d.traces.find((v:any)=>encodeAction(v.action)===encodeAction(selected));
                const causal=encodeAction(selected)!==row.code||!!(d.planCommitted&&chosen?.plan.some((v:any,j:number)=>encodeAction(v.action)!==rows[row.i+1+j]?.code));if(!causal)continue;
                assert.equal(encodeAction(new ModelBattleSearchAI(model,old).getAction(engine,start.currentPlayer)),row.code);
                cases.push({slot,row:row.i,state:start,beforeHash:row.beforeHash,root:trace.action,original:{plan:trace.plan,score:reference.score,tactical:reference.tactical,actorLethal:reference.actorLethal,commanderLethal:reference.commanderLethal},alternative:{plan:option.plan.map(p=>({action:p.action})),score:leaf.score,tactical:leaf.tactical,actorLethal:leaf.actorLethal,commanderLethal:leaf.commanderLethal},enumeratedSteps:steps.map(v=>({action:v.action,beforeHash:hash(v.before),afterHash:hash(v.after)})),oldSelected:row.code,shadowSelected:encodeAction(selected),shadowReason:d.reason,shadowPlanCommitted:d.planCommitted,shadowPlan:chosen?.plan,audit});save(output+'/cases.json',cases);
            }
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);
        if(cases.length>=3)break;if(row.i%100===0)save(output+'/live.json',{slot,row:row.i,roots,alternatives,safeGaps,causalCases:cases.length});
    }
}
const report={passed:true,phase,roots,alternatives,safeGaps,causalCases:cases.length,witnessActions,sourceSha256:sha(fs.readFileSync(new URL(import.meta.url))),modelSha256:sha(fs.readFileSync(path.join(DIR,'teacher-model.json'))),casesPath:output+'/cases.json',scope:'只检查实际已执行突击完结分支，不新增己方候选；不作为专家或棋力通过'};save(output+'/report.json',report);console.log(report);
