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
const cases:Record<string,()=>unknown>={
    remote(){
        const engine=new GameEngine(fixture()),p=prepared(engine,a=>a.type==='move'&&a.unitId==='远端士兵'&&a.to.x===0&&a.to.y===2),ai=new ModelBattleSearchAI(model,old),before=retaliation(engine,0);
        assert.ok(before.risks.some(r=>r.commander&&r.lethal),'构造必须原本已有可重放的指挥官致死风险');
        const candidate=ai.evaluateCandidate(engine,0,p.root.x.actions[p.root.out.best]),branch=candidate.branch;
        assert.ok(candidate.commanderLethal&&candidate.complete);assert.equal(branch.getState().units.find(u=>u.id==='防守弓手')!.hasActed,false);
        const defend=branch.getLegalActions(0,{unitId:'防守弓手',onlyAttacks:true}).find(a=>a.type==='attack'&&a.targetId==='敌甲')!;assert.ok(defend);branch.step(defend);
        assert.ok(!retaliation(branch,0).risks.some(r=>r.commander&&r.lethal),'默认完整单位行动后，原防守队友仍能合法解除风险');
        const action=ai.getAction(engine,0,p.legal,p.root,{});
        assert.equal(encodeAction(action),p.root.x.codes[p.root.out.best],'远端无害完整行动未制造新危险，不应把既有指挥官风险归因于它而提前接管防守队友');
        const audit=auditSearchRisks(engine,ai.lastDecision);return {selected:encodeAction(action),reason:ai.lastDecision.reason,audit};
    },
    end(){
        const engine=new GameEngine(fixture()),p=prepared(engine,a=>a.type==='end_turn'),ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,0,p.legal,p.root,{});
        assert.notEqual(action.type,'end_turn','真正提交换手的默认动作仍必须否决');assert.match(ai.lastDecision.reason,/Veto/);
        return {selected:encodeAction(action),reason:ai.lastDecision.reason,audit:auditSearchRisks(engine,ai.lastDecision)};
    },
    commander(){
        const s=fixture();s.units[0].hasMoved=false;s.units[0].hasActed=false;const engine=new GameEngine(s),p=prepared(engine,a=>a.type==='wait'&&a.unitId==='己方指挥官'),ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,0,p.legal,p.root,{});
        assert.notEqual(encodeAction(action),p.root.x.codes[p.root.out.best],'指挥官自己在危险位置完结行动仍必须否决');assert.match(ai.lastDecision.reason,/Veto/);
        return {selected:encodeAction(action),reason:ai.lastDecision.reason,audit:auditSearchRisks(engine,ai.lastDecision)};
    },
};
const names=process.argv[2]?[process.argv[2]]:Object.keys(cases),results=Object.fromEntries(names.map(name=>[name,cases[name]() ]));
if(process.env.STAGE5_CAUSAL_RECEIPT)save(process.env.STAGE5_CAUSAL_RECEIPT,{passed:true,results});console.log({passed:true,results});
