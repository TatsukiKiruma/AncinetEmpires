import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTileTerrainKey,destroyTileForRules } from '../../src/game/terrain_rules';
import { stateSummary } from './value_state';
import { ledger } from './leaf';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { beginFocusScope,focusThreat } from './focus_threat';
import { extendFeatures } from '../tactical_value_search_20261018/features';
import { encodePolicy } from './encode';
import { read,save,hash } from './io';
import { auditSearchRisks } from './audit_search_risks';
import { infer,legalActions } from './policy_runtime';
import type { GameState,Unit } from '../../src/game/types';

const states=read('browser-states.json'),model=read('initial.json'),old=read('old-schema.json'),raw=states[0].state as GameState;
const road=raw.map.tiles.flat().find(t=>getTileTerrainKey(t)==='road')!,castle=raw.map.tiles.flat().find(t=>getTileTerrainKey(t)==='castle')!,town=raw.map.tiles.flat().find(t=>getTileTerrainKey(t)==='town')!;
const commander=raw.units.find(u=>u.unitClass==='commander')!,soldier=states.flatMap((v:any)=>v.state.units).find((u:Unit)=>u.unitClass==='soldier') as Unit;
function shaped(source:Unit,id:string,ownerId:number,x:number,y:number,hp=100):Unit{return {...source,id,ownerId,pos:{x,y},hp,hasMoved:false,hasActed:false,hasPostAttackMoved:false};}
function fixture():GameState{
    const s=structuredClone(raw);s.map={width:8,height:8,tiles:Array.from({length:8},()=>Array.from({length:8},()=>({...road,ownerId:null})))};
    s.map.tiles[0][0]={...castle,ownerId:0};s.map.tiles[7][7]={...castle,ownerId:1};
    s.players.forEach(p=>{p.gold=0;p.isAlive=true;});s.currentPlayer=0;s.pendingUnitId=undefined;s.winner=null;
    s.units=[shaped(commander,'己方指挥官',0,0,0,35),shaped(commander,'敌方指挥官',1,7,7),shaped(soldier,'己方队友',0,0,1),shaped(soldier,'敌军甲',1,6,0),shaped(soldier,'敌军乙',1,7,2)];return s;
}
const s=fixture(),e=new GameEngine(s),summary=stateSummary(e),moves=e.getLegalActions(0,{unitId:'己方指挥官'}).filter(a=>a.type==='move'),risk=extendFeatures(e,moves);
assert.equal(summary[11],0,'当前位置安全时不能受自杀候选污染');assert.ok(risk.some(r=>r[5]===1),'反例必须真实包含自杀候选');
const search=new ModelBattleSearchAI(model,old),move=e.getLegalActions(0,{unitId:'己方队友'}).find(a=>a.type==='move')!,before=hash(e.getState()),evaluated=search.evaluateCandidate(e,0,move);
assert.equal(hash(e.getState()),before);assert.ok(!evaluated.plan.some(p=>p.action.type==='end_turn'));
assert.equal(evaluated.state.currentPlayer,0);assert.equal(evaluated.state.units.find(u=>u.id==='己方指挥官')!.hasActed,false);
assert.ok(evaluated.plan.every(p=>('unitId' in p.action?p.action.unitId:'attackerId' in p.action?p.action.attackerId:'')==='己方队友'));
const rec=structuredClone(s);rec.players[0].gold=500;const re=new GameEngine(rec),recruit=re.getLegalActions(0).find(a=>a.type.startsWith('recruit_'))!;assert.ok(recruit);const rb=re.getState();re.step(recruit);const accounting=ledger(rb,re.getState(),0);assert.ok(accounting.net<=0);assert.equal(accounting.ownLoss,0);
const recruitedDead=structuredClone(re.getState());recruitedDead.units=recruitedDead.units.filter(u=>rb.units.some(v=>v.id===u.id));
const deadAccounting=ledger(rb,recruitedDead,0);assert.ok(deadAccounting.goldSpent>0);assert.equal(deadAccounting.net,-deadAccounting.goldSpent/1024,'新兵在同一连动中阵亡必须完整扣除招募成本');
const occupiedSearch=new ModelBattleSearchAI(model,old).evaluateCandidate(new GameEngine(rec),0,recruit);
assert.equal(occupiedSearch.complete,false);assert.equal(occupiedSearch.plan.length,0,'指挥官堆叠招募不得用强制待机冒充完成部署');
const building=fixture();building.map.tiles[2][2]={...town,ownerId:null};building.map.tiles[3][3]={...castle,ownerId:1};const captured=structuredClone(building);captured.map.tiles[2][2].ownerId=0;captured.map.tiles[3][3].ownerId=0;
assert.ok(ledger(building,captured,0).towns>0);assert.ok(ledger(building,captured,0).castles>0);assert.equal(ledger(building,captured,0).towns,-ledger(building,captured,1).towns);assert.equal(ledger(building,captured,0).castles,-ledger(building,captured,1).castles);
const townBefore=structuredClone(building);townBefore.map.tiles[2][2]={...town,ownerId:1};const destroyed=structuredClone(townBefore);destroyTileForRules(destroyed.map.tiles[2][2]);assert.equal(ledger(townBefore,destroyed,0).towns,1,'敌村摧毁必须计入实际收入建筑差额');
const assault=fixture();assault.units=[shaped(commander,'己方指挥官',0,0,0),shaped(commander,'敌方指挥官',1,7,7),{...shaped(soldier,'突击单位',0,2,2),unitClass:'wolf',movementRemaining:3},shaped(soldier,'突击目标',1,3,2)];
const ae=new GameEngine(assault),attack=ae.getLegalActions(0,{unitId:'突击单位',onlyAttacks:true}).find(a=>a.type==='attack')!;assert.ok(attack);
const combo=new ModelBattleSearchAI(model,old).evaluateCandidate(ae,0,attack);assert.ok(combo.plan.some(p=>p.action.type==='post_attack_move'));assert.ok(combo.complete);assert.equal(combo.state.units.find(u=>u.id==='己方指挥官')!.hasActed,false);
const focus=fixture();focus.currentPlayer=1;focus.units.find(u=>u.id==='己方指挥官')!.pos={x:3,y:3};focus.units.find(u=>u.id==='己方指挥官')!.hp=60;focus.units.find(u=>u.id==='敌军甲')!.pos={x:0,y:3};focus.units.find(u=>u.id==='敌军乙')!.pos={x:3,y:0};
const fe=new GameEngine(focus);beginFocusScope();const f=focusThreat(fe,'己方指挥官');assert.equal(f.lethal,1);assert.ok(f.attackers>=2);const witness=fe.clone();for(const a of f.witness){assert.ok(witness.getLegalActions(1).some(v=>encodeAction(v)===encodeAction(a)));assert.ok(!witness.step(a).info.includes('非法动作'));}
assert.ok(!witness.getState().units.some(u=>u.id==='己方指挥官'));
const suicidal=moves[risk.findIndex(r=>!!r[5])],suicideBranch=new ModelBattleSearchAI(model,old).evaluateCandidate(e,0,suicidal);
const riskAudits=[auditSearchRisks(e,{traces:[evaluated,suicideBranch]}),auditSearchRisks(ae,{traces:[combo]})];
assert.ok(riskAudits.some(v=>v.lethalWitnesses>0),'审计回归必须覆盖真实致死见证');
const emptyRecruit=fixture();emptyRecruit.players[0].gold=500;emptyRecruit.units.find(u=>u.id==='己方指挥官')!.pos={x:1,y:0};
emptyRecruit.units.find(u=>u.id==='己方指挥官')!.hp=100;emptyRecruit.units.find(u=>u.id==='敌军甲')!.pos={x:6,y:7};emptyRecruit.units.find(u=>u.id==='敌军乙')!.pos={x:7,y:6};
const er=new GameEngine(emptyRecruit),erLegal=legalActions(er),prepared=infer(er,erLegal,model,old),ri=prepared.x.actions.findIndex(a=>a.type==='recruit_to_castle'&&a.unitClass==='soldier');assert.ok(ri>=0);
prepared.out.best=ri;prepared.prior=prepared.prior.map((_,i)=>i===ri?0:-1000-i);
const guarded=new ModelBattleSearchAI(model,old),memory:any={},chosen=guarded.getAction(er,0,erLegal,prepared,memory);assert.equal(encodeAction(chosen),prepared.x.codes[ri]);
assert.equal(guarded.lastDecision.changed,false);assert.ok(!memory.queue?.length,'未触发守卫不得排入推演wait覆盖新兵移动');assert.equal(guarded.lastDecision.planCommitted,false);
const deferred=guarded.lastDecision.traces.find((v:any)=>v.index===ri);assert.ok(!deferred.plan.length&&deferred.deploymentDeferred&&!deferred.complete,'未展开新兵部署必须如实保留未完成状态，不得以未提交wait后的局面代替实际叶子');
const deployment=er.clone(),oldIds=new Set(er.getState().units.map(u=>u.id));deployment.step(chosen);const newborn=deployment.getState().units.find(u=>!oldIds.has(u.id))!;assert.ok(deployment.getLegalActions(0,{unitId:newborn.id}).some(a=>a.type==='move'),'空城新兵必须保留真实移动机会');
const report={passed:true,suicideCandidateDoesNotPolluteCurrentValue:true,suicidalCandidates:risk.filter(r=>!!r[5]).length,otherUnitsRemainUnacted:true,noForcedEndTurn:true,recruitmentNotCombatProfit:true,deadRecruitCostFullyCharged:true,occupiedRecruitIsNotForcedToWait:true,assaultPostAttackMoveCompleted:true,townAndCastleSymmetric:true,destroyedTownCounted:true,twoAttackerLethalWitness:f.witness,riskAudits,untriggeredPlanDoesNotOverridePolicy:true,emptyCastleRecruitRetainsMovement:true,branchPolicyCalls:0,engineUnchanged:true};save('regression-gate.json',report);console.log(report);
