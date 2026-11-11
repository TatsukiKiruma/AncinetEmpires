import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { infer,legalActions } from './policy_runtime';
import { auditSearchRisks } from './audit_search_risks';
import { read,save } from './io';
import type { GameState,Unit,Action } from '../../src/game/types';
const states=read('browser-states.json'),raw=states[0].state as GameState,all:Unit[]=states.flatMap((v:any)=>v.state.units),model=read('teacher-model.json'),old=read('old-schema.json');
const tile=(kind:string)=>raw.map.tiles.flat().find(t=>getTileTerrainKey(t)===kind)!;
const unit=(kind:string,id:string,ownerId:number,x:number,y:number,hp=100):Unit=>({...all.find(u=>u.unitClass===kind)!,id,ownerId,pos:{x,y},hp,level:0,hasMoved:false,hasActed:false,hasPostAttackMoved:false,apkStatic:false});
function fixture(){const s=structuredClone(raw);s.map={width:12,height:12,tiles:Array.from({length:12},()=>Array.from({length:12},()=>({...tile('road'),ownerId:null})))};s.map.tiles[0][0]={...tile('castle'),ownerId:0};s.map.tiles[11][11]={...tile('castle'),ownerId:1};s.players.forEach(p=>{p.gold=0;p.isAlive=true;});s.currentPlayer=0;s.pendingUnitId=undefined;s.winner=null;s.units=[unit('commander','己方指挥官',0,0,0),unit('commander','敌方指挥官',1,11,11)];return s;}
function preferred(e:GameEngine,select:(a:Action)=>boolean,alternative:(a:Action)=>boolean){const legal=legalActions(e),root=infer(e,legal,model,old),index=root.x.actions.findIndex(select);assert.ok(index>=0);root.out.best=index;root.prior=root.prior.map((_,i)=>i===index?0:alternative(root.x.actions[i])?-1:-1000-i);return {legal,root};}
const cases:Record<string,()=>unknown>={
    recruit(){
        const s=fixture();s.players[0].gold=500;s.units[0].pos={x:1,y:0};const e=new GameEngine(s),p=preferred(e,a=>a.type==='wait'&&a.unitId==='己方指挥官',a=>a.type==='recruit_to_castle'&&a.unitClass==='soldier');
        const ai=new ModelBattleSearchAI(model,old),memory:any={},action=ai.getAction(e,0,p.legal,p.root,memory);assert.equal(action.type,'recruit_to_castle');assert.ok(ai.lastDecision.changed);
        assert.ok(!memory.queue?.length,'新兵存在未展开的合法部署move时，不能提交纯wait计划');
        const oldIds=new Set(e.getState().units.map(u=>u.id));e.step(action);const born=e.getState().units.find(u=>!oldIds.has(u.id))!;assert.ok(e.getLegalActions(0,{unitId:born.id}).some(a=>a.type==='move'));
        return {selected:encodeAction(action),deploymentMovePreserved:true};
    },
    combat(){
        const s=fixture();s.map.tiles[0][1]={...tile('town'),ownerId:1};s.units.push({...unit('soldier','己方战士',0,8,8,20),hasMoved:true},unit('soldier','敌方残兵',1,9,8,1),unit('soldier','敌方后卫',1,9,9),unit('soldier','敌方援兵',1,10,8));
        const e=new GameEngine(s),p=preferred(e,a=>a.type==='attack'&&a.attackerId==='己方战士'&&a.targetId==='敌方残兵',a=>a.type==='move'&&a.unitId==='己方指挥官'&&a.to.x===1&&a.to.y===0),ai=new ModelBattleSearchAI(model,old),action=ai.getAction(e,0,p.legal,p.root,{});
        assert.equal(encodeAction(action),p.root.x.codes[p.root.out.best],'普通占村不能以更低真实战斗净值接管确定的正净值攻击');
        return {selected:encodeAction(action),reason:ai.lastDecision.reason};
    },
    protection(){
        // 满血弓手现存军力250，两个三级敌兵可真实集火致死，确保仍检验高价值保护。
        const s=fixture();s.map.tiles[0][1]={...tile('town'),ownerId:1};s.units.push({...unit('archer','受威胁弓手',0,8,8,100),hasMoved:true},{...unit('soldier','敌方甲',1,9,8),level:3},{...unit('soldier','敌方乙',1,8,9),level:3});
        const e=new GameEngine(s),p=preferred(e,a=>a.type==='wait'&&a.unitId==='受威胁弓手',a=>a.type==='move'&&a.unitId==='己方指挥官'&&a.to.x===1&&a.to.y===0),ai=new ModelBattleSearchAI(model,old);ai.getAction(e,0,p.legal,p.root,{});
        assert.notEqual(ai.lastDecision.reason,'Veto可重放致死风险','原高价单位仍致死时，不能换观察目标宣称Veto避险');
        assert.ok(ai.lastDecision.traces.some((v:any)=>v.vetoProtection?.id==='受威胁弓手'&&v.vetoProtection.known&&v.vetoProtection.lethal),'必须实际检查原高价值单位，不能因它未达门槛而让保护回归空转');
        const audit=auditSearchRisks(e,ai.lastDecision);assert.ok(audit.lethalWitnesses>0);return {reason:ai.lastDecision.reason,audit};
    },
};
const selected=process.argv[2]?[process.argv[2]]:Object.keys(cases),results=Object.fromEntries(selected.map(k=>[k,cases[k]() ]));
if(!process.argv[2])save('guard-regression-gate.json',{passed:true,results});console.log({passed:true,results});
