import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { unitArmy } from './leaf';
import { infer,legalActions } from './policy_runtime';
import { auditSearchRisks } from './audit_search_risks';
import { read,save } from './io';
import type { GameState,Unit,UnitClass } from '../../src/game/types';
const source=read('browser-states.json')[0].state as GameState,model=read('teacher-model.json'),old=read('old-schema.json');
const tile=(key:string)=>structuredClone(source.map.tiles.flat().find(t=>getTileTerrainKey(t)===key)!);
function unit(kind:UnitClass,id:string,ownerId:number,x:number,y:number,hp=100,level:Unit['level']=0):Unit{return {unitClass:kind,id,ownerId,pos:{x,y},hp,maxHp:100,level,exp:0,hasMoved:false,hasActed:false,hasPostAttackMoved:false};}
function fixture(hp=36){const s=structuredClone(source);s.map={width:12,height:12,tiles:Array.from({length:12},()=>Array.from({length:12},()=>({...tile('road'),ownerId:null})))};s.map.tiles[0][0]={...tile('castle'),ownerId:0};s.map.tiles[11][11]={...tile('castle'),ownerId:1};s.units=[unit('commander','己方指挥官',0,0,0),unit('commander','敌方指挥官',1,11,11),unit('ghost','残血幽灵',0,4,5,hp,3),unit('wolf','敌方狼',1,5,5)];s.players.forEach(p=>{p.gold=0;p.isAlive=true;});s.currentPlayer=0;s.pendingUnitId=undefined;s.winner=null;return s;}
const engine=new GameEngine(fixture()),legal=legalActions(engine),attack=legal.find(a=>a.type==='attack'&&a.attackerId==='残血幽灵'&&a.targetId==='敌方狼')!,safe=legal.find(a=>a.type==='move'&&a.unitId==='残血幽灵'&&a.to.x===0&&a.to.y===2)!,wait=legal.find(a=>a.type==='wait'&&a.unitId==='残血幽灵')!;assert.ok(attack&&safe&&wait);
const ai=new ModelBattleSearchAI(model,old),trade:any=ai.evaluateCandidate(engine,0,attack),retreat:any=ai.evaluateCandidate(engine,0,safe),future:any=ai.evaluateCandidate(engine,0,wait),capital=unitArmy({...engine.getState(),units:[engine.getState().units.find(u=>u.id==='残血幽灵')!]},0)-1;
assert.ok(trade.actorLost&&trade.actorLethal&&trade.enemyLoss>trade.ownLoss&&trade.net>0&&!trade.commanderLethal,'反例必须由权威反击造成实际阵亡，且真实军力交换为正');assert.ok(retreat.complete&&retreat.riskKnown&&!retreat.actorLethal&&!retreat.commanderLethal);assert.ok(capital<200);assert.ok(future.actorLethal&&!future.actorLost);
const baseline=(v:any)=>v.value*.25+v.tactical-.25*v.exposure-1.5*Number(v.commanderLethal),cases:Record<string,()=>void>={
    double(){assert.ok(Math.abs(trade.score-baseline(trade))<1e-12,'实际阵亡已计入净战损，不能再当未来阵亡额外扣一次固定0.35');},
    capital(){assert.equal(trade.highValueActor,false,'高价值标记必须按行动前当前折算军力判断，不能把残血单位当满血标价资产');},
    future(){const risk=future.risks.find((r:any)=>r.id==='残血幽灵');assert.ok(risk?.lethal&&risk.army>0);assert.ok(Math.abs(future.score-(baseline(future)-.35*risk.army/1024))<1e-12,'未来行动单位致死惩罚应按真实现存军力缩放');},
    veto(){const root=infer(engine,legal,model,old),index=root.x.codes.indexOf(encodeAction(attack));root.out.best=index;root.prior=root.prior.map((_,i)=>i===index?0:root.x.codes[i]===encodeAction(safe)?-1:-100-i);const choice=ai.getAction(engine,0,legal,root,{});assert.equal(encodeAction(choice),encodeAction(attack),'低现存军力的正净值交换不能被满血标价Veto掉');auditSearchRisks(engine,ai.lastDecision);},
    before(){const e=new GameEngine(fixture(100)),a=e.getLegalActions(0).find(a=>a.type==='attack'&&a.attackerId==='残血幽灵')!,v=ai.evaluateCandidate(e,0,a);assert.ok(v.highValueActor,'行动前确为高价值的单位不能因攻击后受伤而逃避保护');},
};
const selected=process.argv[2]?[process.argv[2]]:Object.keys(cases);for(const name of selected)cases[name]();const result={passed:true,cases:selected,capital,enemyLoss:trade.enemyLoss,ownLoss:trade.ownLoss,net:trade.net,score:trade.score,baseScore:baseline(trade)};if(!process.argv[2])save('army-risk-gate.json',result);console.log(result);
