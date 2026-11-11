import assert from 'node:assert/strict';
import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {ModelBattleSearchAI} from './model_battle_search_ai';
import {auditSearchRisks} from './audit_search_risks';
import {legalActions} from './policy_runtime';
import {COMPLETION_RECHECK_LIMIT} from './completion_recovery';
import {read,save,hash} from './io';
const fixture=read('revisions/r21-resume1/retained-deployment-probe-1792422308984/cases.json')[0],model=read('teacher-model.json'),old=read('old-schema.json');
const engine=new GameEngine(fixture.state),before=hash(engine.getState()),ai=new ModelBattleSearchAI(model,old),leaf=ai.evaluateCandidate(engine,fixture.state.currentPlayer,fixture.root);
assert.equal(before,fixture.beforeHash);
assert.ok(leaf.complete&&leaf.riskKnown&&!leaf.actorLethal&&!leaf.commanderLethal,'部署内部已经执行的治疗可解除指挥官致死风险，不能丢弃整个合法部署');
assert.ok(leaf.finishRecovery&&leaf.completionRechecks!>0&&leaf.completionRechecks!<=COMPLETION_RECHECK_LIMIT);
assert.ok(leaf.score>=fixture.alternative.score-1e-10&&leaf.tactical>=fixture.rejectedGreedy.tactical-.15);
assert.equal(leaf.nodes,fixture.enumeratedSteps.length,'安全恢复不得新增己方引擎节点');
const audit=auditSearchRisks(engine,{traces:[leaf]}),memory:any={},decisionAI=new ModelBattleSearchAI(model,old),selected=decisionAI.getAction(engine,fixture.state.currentPlayer,undefined,undefined,memory),decision=decisionAI.lastDecision;
assert.equal(encodeAction(selected),fixture.shadowSelected);assert.notEqual(encodeAction(selected),fixture.oldSelected);assert.ok(decision.planCommitted&&decision.branchPolicyCalls===0&&decision.nodes<=300);
const fullAudit=auditSearchRisks(engine,decision),branch=engine.clone();assert.ok(!branch.step(selected).info.includes('非法动作'));
const committed:string[]=[];
for(let i=0;i<2;i++){
    const follow=decisionAI.getAction(branch,fixture.state.currentPlayer,legalActions(branch),undefined,memory);assert.equal(decisionAI.lastDecision.reason,'已验证同单位连动');
    assert.ok(!branch.step(follow).info.includes('非法动作'));committed.push(encodeAction(follow));
}
assert.equal(committed[0],encodeAction(fixture.alternative.plan[0].action));assert.equal(committed[1],encodeAction(fixture.alternative.plan[1].action));assert.equal(hash(engine.getState()),before);
const report={passed:true,fixture:fixture.slot,row:fixture.row,originalSelected:fixture.oldSelected,selected:encodeAction(selected),committed,completionRechecks:leaf.completionRechecks,maximumRechecksPerRoot:COMPLETION_RECHECK_LIMIT,candidateNodes:leaf.nodes,decisionNodes:decision.nodes,branchPolicyCalls:decision.branchPolicyCalls,audit,fullAudit,scope:'完整部署内部实际遗漏的治疗因果红绿，不代表实战胜率'};
if(process.env.STAGE5_DEPLOYMENT_COMPLETION_RECEIPT)save(process.env.STAGE5_DEPLOYMENT_COMPLETION_RECEIPT,report);console.log(report);
