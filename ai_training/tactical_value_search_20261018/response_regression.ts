import assert from 'node:assert/strict';
import { createDemoState } from '../../src/game/demo_map';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { movingThreat,beginThreatScope } from '../tactical_scale_20261018/threat';
import { focusThreat,beginFocusScope } from './focus_threat';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { infer,legalActions } from './policy_runtime';
import { read,save,hash } from './io';
import type { Action,GameState,Unit } from '../../src/game/types';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { evaluateLeaf } from './leaf';
function unit(id:string,ownerId:number,x:number,y:number,commander=false,hp=100):Unit{return {id,ownerId,unitClass:commander?'commander':'soldier',pos:{x,y},hp,maxHp:100,hasMoved:false,hasActed:false};}
function state(corridor=false):GameState{
    const s=createDemoState();s.currentPlayer=1;s.players.forEach(p=>p.gold=0);
    s.map.tiles=s.map.tiles.map(row=>row.map(()=>({terrainId:corridor?2:6,ownerId:null})));
    s.map.tiles[0][0]={terrainId:10,ownerId:0};s.map.tiles[7][7]={terrainId:10,ownerId:1};
    s.units=[unit('target',0,3,3,true,60),unit('enemy-command',1,7,7,true),unit('enemy-a',1,0,3),unit('enemy-b',1,3,0)];
    if(corridor){s.units[2].pos={x:2,y:1};s.units[3].pos={x:4,y:1};for(const [x,y] of [[2,1],[4,1],[3,1],[3,2],[3,3]])s.map.tiles[y][x]={terrainId:6,ownerId:null};}
    return s;
}
const open=new GameEngine(state()),target=open.getState().units.find(u=>u.id==='target')!;beginThreatScope();beginFocusScope();
const single=movingThreat(open,[target]).get(target.id)!,focus=focusThreat(open,target.id);
assert.ok(single.damage<target.hp);assert.equal(single.lethal,0);assert.equal(focus.lethal,1);assert.ok(focus.attackers>=2);
const witness=open.clone();for(const action of focus.witness){assert.ok(witness.getLegalActions(witness.getState().currentPlayer).some(a=>encodeAction(a)===encodeAction(action)));assert.ok(!witness.step(action).info.includes('非法动作'));}assert.ok(!witness.getState().units.some(u=>u.id==='target'));
const narrow=new GameEngine(state(true));beginFocusScope();const conflict=focusThreat(narrow,'target');assert.equal(conflict.attackers,1);assert.equal(conflict.lethal,0);assert.ok(conflict.relaxed>=60);
const lone=state();lone.units=lone.units.filter(u=>u.id!=='enemy-b');lone.units.find(u=>u.id==='target')!.hp=30;
const moving=new GameEngine(lone);beginThreatScope();const movingTarget=moving.getState().units.find(u=>u.id==='target')!,risk=movingThreat(moving,[movingTarget]).get('target')!;
const hit=risk.witness as {move:any;attack:any};assert.ok(hit.move);const probe=moving.clone();probe.step(hit.move);assert.equal(probe.getState().units.find(u=>u.id==='target')!.hp,30);probe.step(hit.attack);assert.ok(!probe.getState().units.some(u=>u.id==='target'));
const zero=state();zero.units=zero.units.filter(u=>u.id!=='enemy-b');zero.units.find(u=>u.id==='target')!.pos={x:7,y:4};zero.units.find(u=>u.id==='target')!.hp=30;zero.units.find(u=>u.id==='enemy-a')!.pos={x:0,y:0};zero.units.find(u=>u.id==='enemy-command')!.apkStatic=true;
zero.map.tiles.forEach(row=>row.forEach(t=>t.apkMoveCost=0));beginFocusScope();const zeroRisk=focusThreat(new GameEngine(zero),'target');assert.equal(zeroRisk.lethal,1);assert.ok(zeroRisk.witness.some(a=>a.type==='move'&&a.to.x+a.to.y>5));
const own=read('browser-states.json')[0].state,engine=new GameEngine(own),before=hash(engine.getState()),model=read(`numeric-model-${process.argv[2]??'initial'}.json`),old=read('old-schema.json');
const ai=new ModelBattleSearchAI(model,old,{maxNodes:48,friendlyRolloutSteps:3}),move=engine.getLegalActions(own.currentPlayer).find(a=>a.type==='move')!;
const evaluated=ai.evaluateCandidate(engine,own.currentPlayer,move);assert.equal(hash(engine.getState()),before);
let networkSteps=0;
for(const plan of evaluated.friendlyPlan){const b=new GameEngine(JSON.parse(plan.state)),legal=legalActions(b).filter(a=>a.type!=='end_turn'),p=infer(b,legal,model,old);assert.equal(p.x.codes[p.out.best],encodeAction(plan.action));networkSteps++;}
assert.ok(networkSteps>0);
// 集成反例沿用原生schema与规则，只在隔离状态副本上安排道路和部队。
const items=read('browser-states.json'),integrated=structuredClone(items[0].state) as GameState;
const road=integrated.map.tiles.flat().find(t=>getTileTerrainKey(t)==='road')!,castles=integrated.map.tiles.flat().filter(t=>getTileTerrainKey(t)==='castle');
const soldier=items.flatMap((v:any)=>v.state.units).find((u:Unit)=>u.unitClass==='soldier') as Unit;
const commander=integrated.units.find(u=>u.unitClass==='commander')!;
integrated.map={width:8,height:8,tiles:Array.from({length:8},()=>Array.from({length:8},()=>({...road,ownerId:null})))};
integrated.map.tiles[0][0]={...castles[0],ownerId:0};integrated.map.tiles[7][7]={...castles.at(-1)!,ownerId:1};
const shaped=(source:Unit,id:string,ownerId:number,x:number,y:number,hp=100):Unit=>({...source,id,ownerId,pos:{x,y},hp,hasMoved:false,hasActed:false});
integrated.units=[shaped(commander,'focus-own-command',0,3,3,60),shaped(commander,'focus-enemy-command',1,7,7),shaped(soldier,'focus-enemy-a',1,0,3),shaped(soldier,'focus-enemy-b',1,3,0)];
integrated.currentPlayer=0;integrated.pendingUnitId=undefined;integrated.players.forEach(p=>{p.gold=0;p.isAlive=true;});
const integratedEngine=new GameEngine(integrated),integratedEnd=integratedEngine.getLegalActions(0).find(a=>a.type==='end_turn')!;
const integratedAI=new ModelBattleSearchAI(model,old,{maxNodes:48,friendlyRolloutSteps:3}),integratedResult=integratedAI.evaluateCandidate(integratedEngine,0,integratedEnd);
const caught=integratedResult.responses.find(r=>new Set(r.actions.filter((a:Action)=>a.type==='attack').map((a:any)=>a.attackerId)).size>=2&&r.ownCommanderLost>0);
assert.ok(caught,'模型化BattleSearch的Maximin必须实际消费多单位致死回应');
// 同一次权威占城动作，从夺城方和失城方评估必须得到相反的实际净变化。
const captureState=structuredClone(integrated);captureState.units.find(u=>u.id==='focus-enemy-command')!.pos={x:6,y:7};
captureState.units.push(shaped(commander,'castle-capturer',0,7,7));captureState.map.tiles[6][6]={...castles.at(-1)!,ownerId:1};
const castleEngine=new GameEngine(captureState),castleBefore=castleEngine.getState(),capture=castleEngine.getLegalActions(0,{unitId:'castle-capturer'}).find(a=>a.type==='capture');assert.ok(capture);
assert.ok(!castleEngine.step(capture).info.includes('非法动作'));assert.equal(castleEngine.getState().map.tiles[7][7].ownerId,0);
assert.equal(evaluateLeaf(castleBefore,castleEngine,0,undefined,model,old).castles,1);assert.equal(evaluateLeaf(castleBefore,castleEngine,1,undefined,model,old).castles,-1);
const report={passed:true,singleDamage:single.damage,targetHp:target.hp,focusDamage:focus.damage,focusAttackers:focus.attackers,focusWitness:focus.witness,conflictingLanding:{relaxed:conflict.relaxed,greedy:conflict.damage,attackers:conflict.attackers,lethal:conflict.lethal},moveOnlyMissesKill:true,moveAttackKills:true,zeroCostDoesNotUseManhattanPrune:true,networkFriendlyStepsChecked:networkSteps,maximinCaughtCommanderFocusDeath:true,maximinResponse:caught,castleNetIsSymmetric:true,engineUnchanged:true};save('response-regression.json',report);save(`response-regression-${process.argv[2]??'initial'}.json`,report);console.log(report);
