import assert from 'node:assert/strict';
import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {ModelBattleSearchAI} from './model_battle_search_ai';
import {legalActions,infer} from './policy_runtime';
import {coverSafeRecruitment} from './safe_recruitment_coverage';
import {auditSearchRisks} from './audit_search_risks';
import {read,hash,save} from './io';
const fixture=read('revisions/r22/coverage-probe-1792424960789/cases.json')[0],model=read('teacher-model.json'),old=read('old-schema.json'),engine=new GameEngine(fixture.state),initial=hash(engine.getState());
const root=infer(engine,legalActions(engine),model,old),prior=hash(root),oldIndexes=fixture.originalRootCodes.map((code:string)=>root.x.codes.indexOf(code));assert.ok(oldIndexes.every((i:number)=>i>=0));
const next=coverSafeRecruitment(engine.getState(),root,oldIndexes,6);assert.deepEqual(next.slice(0,6),oldIndexes.slice(0,6));assert.deepEqual(oldIndexes,fixture.originalRootCodes.map((code:string)=>root.x.codes.indexOf(code)));
assert.equal(next.length,12);assert.equal(root.x.codes[next[11]],fixture.newRootCode);assert.equal(hash(root),prior,'覆盖只能读取已编码特征，不能改写网络输入、先验或默认');
// 单独保留原Top12覆盖修复的回归；默认Top16由容量回归与全量共同候选证明验收。
const ai=new ModelBattleSearchAI(model,old,{topK:12}),memory:any={},selected=ai.getAction(engine,fixture.state.currentPlayer,root.x.actions,root,memory),decision=ai.lastDecision;
assert.equal(encodeAction(selected),fixture.newRootCode,'收尾必须覆盖已知安全且可生产性的招募，不能因原代表致死而选择wait');
assert.equal(decision.preferred,fixture.oldSelected);assert.ok(decision.planCommitted&&decision.reason.startsWith('Takeover'));
assert.ok(decision.branchPolicyCalls===0&&decision.rootFeatureEncodes===1&&decision.rootPolicyCalls===1&&decision.proposalPolicyCalls===1&&decision.nodes<=300);
assert.deepEqual(decision.traces.slice(0,6).map((v:any)=>encodeAction(v.action)),fixture.originalRootCodes.slice(0,6));assert.ok(decision.traces.length<=12);
const audit=auditSearchRisks(engine,decision),branch=engine.clone();assert.ok(!branch.step(selected).info.includes('非法动作'));const committed:string[]=[];
while(memory.queue?.length){const action=ai.getAction(branch,fixture.state.currentPlayer,legalActions(branch),undefined,memory);assert.equal(ai.lastDecision.reason,'已验证同单位连动');assert.ok(!branch.step(action).info.includes('非法动作'));committed.push(encodeAction(action));}
assert.equal(hash(engine.getState()),initial);
const after=branch.getState();for(const unit of fixture.state.units.filter((u:any)=>u.ownerId===fixture.state.currentPlayer)){const present=after.units.find(u=>u.id===unit.id);if(present)assert.equal(present.hasActed,unit.hasActed,'新兵连动不得跳过未行动队友');}
const report={passed:true,fixture:fixture.slot,row:fixture.row,preferred:decision.preferred,selected:encodeAction(selected),committed,decisionNodes:decision.nodes,branchPolicyCalls:decision.branchPolicyCalls,originalSixPreserved:true,rootInputsAndPriorUnchanged:true,audit,scope:'根覆盖真实遗漏红绿回归，不代表完整实战胜率'};
if(process.env.STAGE5_RECRUITMENT_COVERAGE_RECEIPT)save(process.env.STAGE5_RECRUITMENT_COVERAGE_RECEIPT,report);console.log(report);
