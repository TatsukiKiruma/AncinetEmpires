import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {calculateDamage} from '../../src/game/rules';
import {actorId} from '../tactical_scale_20261018/tactics';
import {ModelBattleSearchAI,type Evaluation,type PlanStep} from './model_battle_search_ai';
import {evaluateLeaf,ledger} from './leaf';
import {isProductiveFollow} from './plan_commit';
import {auditSearchRisks} from './audit_search_risks';
import {read,save,hash,sha,DIR} from './io';
import type {Action,GameState} from '../../src/game/types';

// 检查完整部署内部实际执行过的全部路径；不只检查最终返回的危险叶子。
const phase=process.argv[2]??'teacher-r21-resume1',gate=read(phase+'-gate.json');assert.ok(!gate.passed&&gate.strictReplay);
for(const [name,v] of Object.entries(read('source-freeze-'+phase+'.json').files) as [string,{sha256:string}][])assert.equal(sha(fs.readFileSync(path.resolve(DIR,'../..',name))),v.sha256);
const model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json'),output=`revisions/r21-resume1/retained-deployment-probe-${Date.now()}`;
type Step={branch:GameEngine;before:GameState;after:GameState;action:Action;plan:PlanStep[]};
let roots=0,emptyRoots=0,alternatives=0,unsafeGreedyPaths=0,safeOmissions=0,witnessActions=0;const cases:any[]=[];
const folders=fs.readdirSync(path.join(DIR,phase+'-battles/slots')).filter(v=>v.includes('teacher_search')).sort((a,b)=>Number(b.startsWith('expanded'))-Number(a.startsWith('expanded'))||a.localeCompare(b));
for(const slot of folders){
    if(cases.length>=3)break;const base=phase+'-battles/slots/'+slot,result=read(base+'/result.json');if(result.classification==='natural_win'||result.classification==='natural_draw')continue;
    assert.ok(read(base+'/strict-replay.json').passed);assert.equal(result.modelHash,hash(model));
    const engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path)),rows=gunzipSync(fs.readFileSync(path.join(DIR,base,'actions.jsonl.gz'))).toString().trim().split('\n').map(v=>JSON.parse(v));
    for(const row of rows){
        assert.equal(hash(engine.getState()),row.beforeHash);
        if(row.side==='model'&&row.search?.preferredPolicyEvaluated&&cases.length<3)for(const trace of row.search.traces??[]){
            if(cases.length>=3)break;if(trace.action.type!=='recruit_to_castle')continue;roots++;
            const ai=new ModelBattleSearchAI(model,old),steps:Step[]=[],paths=new Map<string,PlanStep[]>(),rawStep=(ai as any).step.bind(ai);
            (ai as any).step=(branch:GameEngine,action:Action)=>{
                const before=branch.getState(),after=rawStep(branch,action),prefix=paths.get(hash(before));
                const next=steps.length===0?[]:[...(prefix??[]),{state:JSON.stringify(before),action}];
                assert.ok(steps.length===0||prefix,'记录节点必须连接到已执行的根路径');paths.set(hash(after),next);steps.push({branch,before,after,action,plan:next});return after;
            };
            const reference=ai.evaluateCandidate(engine,engine.getState().currentPlayer,trace.action,trace.index);assert.equal(reference.nodes,steps.length);assert.ok(Math.abs(reference.score-trace.score)<1e-9);
            const start=engine.getState(),player=start.currentPlayer,id=reference.actor!,rootState=steps[0].after,actor=rootState.units.find(u=>u.id===id);
            if(!actor||actor.apkPendingRecruitSource!=='empty_castle'||!reference.deploymentMoveAvailable)continue;emptyRoots++;
            const groups=new Map<string,Step[]>();
            for(const step of steps.slice(1))if(['attack','capture','heal','summon','destroy_town','repair','support','wait'].includes(step.action.type)){
                const key=hash(step.before),group=groups.get(key)??[];group.push(step);groups.set(key,group);
            }
            const light=(step:Step)=>{const a=ledger(step.before,step.after,player),ready=(s:GameState)=>s.units.filter(u=>u.ownerId===player&&!u.hasActed).length;return a.net+.05*a.healingNet/1024+(a.goldSpent===0?.03*a.recruitedValue/1024:0)+.025*(ready(step.after)-ready(step.before))/32+.18*a.castles+.09*a.towns+.5*a.enemyCommanderKills;};
            const complete=(step:Step)=>step.branch.isTerminal()||step.after.currentPlayer!==player||!step.branch.getLegalActions(player,{unitId:id,skipRecruitment:true}).some(a=>actorId(a,step.after,step.after)===id);
            for(const group of groups.values()){
                let greedy=group[0];for(const v of group.slice(1))if(light(v)>light(greedy)+1e-10)greedy=v;
                if(!complete(greedy))continue;
                const rejected=evaluateLeaf(start,greedy.branch,player,id,model,old,actor);if(!rejected.riskKnown||!rejected.actorLethal&&!rejected.commanderLethal)continue;unsafeGreedyPaths++;
                for(const option of group){
                    if(cases.length>=3)break;if(option===greedy||!complete(option))continue;alternatives++;
                    const leaf=evaluateLeaf(start,option.branch,player,id,model,old,actor);
                    const freeAttacks=option.action.type==='attack'?Number(calculateDamage(option.before,id,option.action.targetId)>0&&(option.after.units.find(u=>u.id===id)?.hp??0)>=(option.before.units.find(u=>u.id===id)?.hp??0)):0;
                    if(!isProductiveFollow({...leaf,complete:true,plan:option.plan,freeAttacks})||leaf.tactical<rejected.tactical-.15||leaf.score<=reference.score+1e-10)continue;safeOmissions++;
                    const alternative:Evaluation={...reference,...leaf,branch:option.branch,state:option.after,plan:option.plan,complete:true,deploymentDeferred:undefined,freeAttacks,finishRecovery:undefined};
                    const audit=auditSearchRisks(engine,{traces:[reference,alternative]});witnessActions+=audit.witnessActions;
                    class Shadow extends ModelBattleSearchAI {override evaluateCandidate(e:GameEngine,p:number,a:Action,index=-1){const control=super.evaluateCandidate(e,p,a,index);return encodeAction(a)===encodeAction(trace.action)?{...alternative,index,nodes:control.nodes}:control;}}
                    const shadow=new Shadow(model,old),selected=shadow.getAction(engine,player),d=shadow.lastDecision,chosen=d.traces.find((v:any)=>encodeAction(v.action)===encodeAction(selected));
                    const causal=encodeAction(selected)!==row.code||!!(d.planCommitted&&chosen?.plan.some((v:any,j:number)=>encodeAction(v.action)!==rows[row.i+1+j]?.code));if(!causal)continue;
                    assert.equal(encodeAction(new ModelBattleSearchAI(model,old).getAction(engine,player)),row.code);
                    cases.push({slot,row:row.i,state:start,beforeHash:row.beforeHash,root:trace.action,returned:{score:reference.score,complete:reference.complete,deploymentDeferred:reference.deploymentDeferred,plan:reference.plan.map(v=>({action:v.action}))},rejectedGreedy:{plan:greedy.plan.map(v=>({action:v.action})),score:rejected.score,tactical:rejected.tactical,actorLethal:rejected.actorLethal,commanderLethal:rejected.commanderLethal},alternative:{plan:option.plan.map(v=>({action:v.action})),score:leaf.score,tactical:leaf.tactical,actorLethal:leaf.actorLethal,commanderLethal:leaf.commanderLethal},enumeratedSteps:steps.map(v=>({action:v.action,beforeHash:hash(v.before),afterHash:hash(v.after)})),oldSelected:row.code,shadowSelected:encodeAction(selected),shadowReason:d.reason,shadowPlanCommitted:d.planCommitted,shadowPlan:chosen?.plan,audit});save(output+'/cases.json',cases);
                }
            }
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);
        if(cases.length>=3)break;if(row.i%100===0)save(output+'/live.json',{slot,row:row.i,roots,emptyRoots,alternatives,unsafeGreedyPaths,safeOmissions,causalCases:cases.length});
    }
}
const report={passed:true,phase,roots,emptyRoots,alternatives,unsafeGreedyPaths,safeOmissions,causalCases:cases.length,witnessActions,sourceSha256:sha(fs.readFileSync(new URL(import.meta.url))),modelSha256:sha(fs.readFileSync(path.join(DIR,'teacher-model.json'))),casesPath:output+'/cases.json',scope:'完整部署内部已经执行的同前态后续分支因果检查；不新增己方节点，不作专家或棋力通过'};save(output+'/report.json',report);console.log(report);
