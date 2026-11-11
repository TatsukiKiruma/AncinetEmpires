import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { infer,legalActions } from './policy_runtime';
import { auditSearchRisks } from './audit_search_risks';
import { read,save } from './io';
import type { GameState,Unit,UnitClass } from '../../src/game/types';
const source=read('browser-states.json')[0].state as GameState,model=read('teacher-model.json'),old=read('old-schema.json');
const tile=(key:string)=>structuredClone(source.map.tiles.flat().find(t=>getTileTerrainKey(t)===key)!);
function unit(kind:UnitClass,id:string,ownerId:number,x:number,y:number):Unit{return {unitClass:kind,id,ownerId,pos:{x,y},hp:100,maxHp:100,level:0,exp:0,hasMoved:false,hasActed:false,hasPostAttackMoved:false};}
function fixture(town:boolean){const s=structuredClone(source);s.map={width:12,height:12,tiles:Array.from({length:12},()=>Array.from({length:12},()=>({...tile('road'),ownerId:null})))};s.map.tiles[0][0]={...tile('castle'),ownerId:0};s.map.tiles[11][11]={...tile('castle'),ownerId:1};if(town)s.map.tiles[0][2]={...tile('town'),ownerId:1};s.units=[unit('commander','己方指挥官',0,1,0),unit('commander','敌方指挥官',1,11,11)];s.players.forEach(p=>{p.gold=p.id===0?500:0;p.isAlive=true;});s.currentPlayer=0;s.pendingUnitId=undefined;s.winner=null;return s;}
const mode=process.argv[2]??'capture',initial=fixture(mode==='capture');
if(mode==='stay')initial.units.push({...unit('soldier','残血敌军',1,0,1),hp:1});
if(mode==='assault'){initial.players.find(p=>p.id===0)!.gold=1000;initial.units[0].pos={x:0,y:11};initial.units.push({...unit('soldier','残血敌军',1,2,1),hp:1});}
const e=new GameEngine(initial),legal=legalActions(e),action=legal.find(a=>a.type==='recruit_to_castle'&&a.unitClass===(mode==='assault'?'wolf':'soldier'))!;assert.ok(action);
const ai=new ModelBattleSearchAI(model,old),v=ai.evaluateCandidate(e,0,action);
if(mode==='capture'){
    assert.ok(v.complete&&v.captures===1&&v.plan.some(p=>p.action.type==='move')&&v.plan.some(p=>p.action.type==='capture'),'空城新兵必须能在原预算内展开移动占村完整连动');
    const root=infer(e,legal,model,old),index=root.x.codes.indexOf(encodeAction(action));root.out.best=index;root.prior=root.prior.map((_,i)=>i===index?0:-1000-i);const memory:any={};assert.equal(encodeAction(ai.getAction(e,0,legal,root,memory)),encodeAction(action));assert.ok(ai.lastDecision.planCommitted);auditSearchRisks(e,ai.lastDecision);e.step(action);
    while(memory.queue?.length){const a=ai.getAction(e,0,legalActions(e),undefined,memory);assert.ok(!e.step(a).info.includes('非法动作'));}
    assert.equal(e.getState().map.tiles[0][2].ownerId,0);assert.equal(e.getState().units.find(u=>u.id==='己方指挥官')!.hasActed,false);
}else if(mode==='defer'){
    assert.ok(v.plan.length===0&&!v.complete&&v.deploymentDeferred,'未展开部署时必须按实际招募后状态估值，不得按未提交wait完结状态估值');
    const b=e.clone();b.step(action);assert.deepEqual(v.state,b.getState());assert.ok(v.state.units.find(u=>u.id===v.actor)&&!v.state.units.find(u=>u.id===v.actor)!.hasActed);
}else if(mode==='stay')assert.ok(v.complete&&v.enemyKills===1&&v.plan[0].action.type==='attack','新兵已有原地有效攻击时不能强迫移动或遗漏原地完结');
else if(mode==='assault'){
    assert.ok(v.complete&&v.enemyKills===1&&v.plan.some(p=>p.action.type==='move')&&v.plan.some(p=>p.action.type==='attack')&&v.plan.some(p=>p.action.type==='post_attack_move'),'新兵部署攻击后必须在原预算内完成突击二次移动');
    auditSearchRisks(e,{traces:[v]});
}
assert.ok(v.nodes<=25);const receipt={passed:true,mode,nodes:v.nodes,captures:v.captures,complete:v.complete,plan:v.plan.map(p=>encodeAction(p.action)),teammateStillReady:true};if(process.env.STAGE5_DEPLOYMENT_RECEIPT)save(process.env.STAGE5_DEPLOYMENT_RECEIPT,receipt);console.log(receipt);
