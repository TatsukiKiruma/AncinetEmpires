import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { infer,legalActions } from './policy_runtime';
import { retaliation } from './leaf';
import { auditSearchRisks } from './audit_search_risks';
import { read,save } from './io';
import type { Action,GameState,Unit } from '../../src/game/types';
const fixtures=read('browser-states.json'),source=fixtures[0].state as GameState,units:Unit[]=fixtures.flatMap((v:any)=>v.state.units),model=read('teacher-model.json'),old=read('old-schema.json');
const tile=(key:string)=>structuredClone(source.map.tiles.flat().find(t=>getTileTerrainKey(t)===key)!);
function unit(kind:string,id:string,ownerId:number,x:number,y:number,hp=100):Unit{return {...units.find(u=>u.unitClass===kind)!,id,ownerId,pos:{x,y},hp,level:0,exp:0,hasMoved:false,hasActed:false,hasPostAttackMoved:false,apkStatic:false};}
function fixture(){
    const s=structuredClone(source);s.map={width:12,height:12,tiles:Array.from({length:12},()=>Array.from({length:12},()=>({...tile('road'),ownerId:null})))};
    s.map.tiles[0][0]={...tile('castle'),ownerId:0};s.map.tiles[11][11]={...tile('castle'),ownerId:1};s.map.tiles[2][0]={...tile('town'),ownerId:1};
    s.units=[{...unit('commander','己方指挥官',0,5,5,70),hasMoved:true,hasActed:true},unit('commander','敌方指挥官',1,11,11),unit('soldier','远端士兵',0,0,1),unit('archer','防守弓手',0,6,3),unit('soldier','敌甲',1,6,5),unit('soldier','敌乙',1,5,6)];
    s.players.forEach(p=>{p.gold=0;p.isAlive=true;});s.currentPlayer=0;s.pendingUnitId=undefined;s.winner=null;return s;
}
function prepared(engine:GameEngine,select:(a:Action)=>boolean){
    const legal=legalActions(engine),root=infer(engine,legal,model,old),primary=root.x.actions.findIndex(select),defence=root.x.actions.findIndex(a=>a.type==='attack'&&a.attackerId==='防守弓手'&&a.targetId==='敌甲');
    assert.ok(primary>=0&&defence>=0);root.out.best=primary;root.prior=root.prior.map((_,i)=>i===primary?0:i===defence?-1:-100-i);return {legal,root};
}
const engine=new GameEngine(fixture()),p=prepared(engine,a=>a.type==='move'&&a.unitId==='防守弓手'&&a.to.x===6&&a.to.y===1),ai=new ModelBattleSearchAI(model,old);
const before=retaliation(engine,0),primary=ai.evaluateCandidate(engine,0,p.root.x.actions[p.root.out.best]),defenceIndex=p.root.x.actions.findIndex(a=>a.type==='attack'&&a.attackerId==='防守弓手'&&a.targetId==='敌甲'),defence=ai.evaluateCandidate(engine,0,p.root.x.actions[defenceIndex]);
assert.ok(before.risks.some(r=>r.commander&&r.lethal));assert.ok(primary.complete&&primary.commanderLethal&&!primary.actorLethal);assert.ok(defence.complete&&defence.riskKnown&&!defence.commanderLethal&&!defence.actorLethal);assert.equal(primary.actor,defence.actor);
const action=ai.getAction(engine,0,p.legal,p.root,{});
const chosen=ai.lastDecision.traces.find((v:any)=>encodeAction(v.action)===encodeAction(action));
assert.ok(chosen&&chosen.actor===primary.actor&&chosen.complete&&chosen.riskKnown&&!chosen.commanderLethal&&!chosen.actorLethal&&chosen.score>=defence.score-1e-10,'当前行动者自身已有可验证防守连动，不能按既有危险延后否决而消耗它');
// 扩量策略可能发现更高分的同单位移动攻击；核验真实完结与安全，不锁定旧攻击坐标。
const completed=engine.clone();assert.ok(!completed.step(action).info.includes('非法动作'));for(const step of chosen.plan)assert.ok(!completed.step(step.action).info.includes('非法动作'));assert.equal(completed.getState().units.find(u=>u.id===primary.actor)?.hasActed,true);assert.equal(completed.getState().units.find(u=>u.id==='远端士兵')?.hasActed,false);
assert.match(ai.lastDecision.reason,/Veto/);assert.equal(ai.lastDecision.preservesActingDefender,true);const audit=auditSearchRisks(engine,ai.lastDecision),result={passed:true,selected:encodeAction(action),reason:ai.lastDecision.reason,audit};
if(process.env.STAGE5_DEFENDER_RECEIPT)save(process.env.STAGE5_DEFENDER_RECEIPT,result);console.log(result);
