import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { evaluateLeaf,ledger } from './leaf';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
import { infer,legalActions } from './policy_runtime';
import { read,save } from './io';
import type { GameState,Unit,UnitClass } from '../../src/game/types';

const source=read('browser-states.json')[0].state as GameState,model=read('teacher-model.json'),old=read('old-schema.json');
const tile=(key:string)=>structuredClone(source.map.tiles.flat().find(t=>getTileTerrainKey(t)===key)!);
function unit(kind:UnitClass,id:string,ownerId:number,x:number,y:number,hp=100):Unit{return {unitClass:kind,id,ownerId,pos:{x,y},hp,maxHp:100,level:0,exp:0,hasMoved:false,hasActed:false,hasPostAttackMoved:false,apkStatic:false};}
const s=structuredClone(source);s.map={width:12,height:12,tiles:Array.from({length:12},()=>Array.from({length:12},()=>({...tile('road'),ownerId:null})))};
s.map.tiles[0][0]={...tile('castle'),ownerId:0};s.map.tiles[11][11]={...tile('castle'),ownerId:1};
s.units=[unit('commander','己方指挥官',0,0,0),unit('commander','敌方指挥官',1,11,11),unit('mermaid','行动人鱼',0,2,5,50),unit('dark_mage','敌法师',1,5,5,70)];
s.players.forEach(p=>{p.gold=0;p.isAlive=true;});s.currentPlayer=0;s.pendingUnitId=undefined;s.winner=null;
const engine=new GameEngine(s),root=engine.getLegalActions(0).find(a=>a.type==='move'&&a.unitId==='行动人鱼'&&a.to.x===4&&a.to.y===5)!;assert.ok(root);
const moved=engine.clone();moved.step(root);const follow=moved.getLegalActions(0,{unitId:'行动人鱼',skipRecruitment:true}),attack=follow.find(a=>a.type==='attack')!,wait=follow.find(a=>a.type==='wait')!;assert.ok(attack&&wait);
const bad=moved.clone();bad.step(attack);const good=moved.clone();good.step(wait);
const badLeaf=evaluateLeaf(s,bad,0,'行动人鱼',model,old),goodLeaf=evaluateLeaf(s,good,0,'行动人鱼',model,old);
// 当前半血人鱼的折算军力低于高价值门槛，同根后续仍须比较真实完整叶子。
assert.ok(ledger(moved.getState(),bad.getState(),0).net>0&&!badLeaf.highValueActor&&badLeaf.actorLethal);
assert.ok(goodLeaf.riskKnown&&!goodLeaf.actorLethal&&!goodLeaf.commanderLethal&&goodLeaf.score>badLeaf.score);
const result=new ModelBattleSearchAI(model,old).evaluateCandidate(engine,0,root);
assert.ok(result.complete&&!result.actorLethal&&!result.commanderLethal,'同一根动作已有完整安全待机，不能把贪心攻击的致死风险归咎于根移动');
assert.deepEqual(result.plan.map(p=>encodeAction(p.action)),[encodeAction(wait)]);
assert.ok(result.finishRecovery,'必须保留被拒绝后续的可重放风险见证');
const trace={...result,plan:result.plan.map(p=>({action:p.action}))},audit=auditSearchRisks(engine,{traces:[trace]});
const ai=new ModelBattleSearchAI(model,old),legal=legalActions(engine),prepared=infer(engine,legal,model,old),index=prepared.x.codes.indexOf(encodeAction(root)),memory:any={};
prepared.out.best=index;prepared.prior=prepared.prior.map((_,i)=>i===index?0:-100-i);
const chosen=ai.getAction(engine,0,legal,prepared,memory);assert.equal(encodeAction(chosen),encodeAction(root),'安全后续能保留原根移动');
assert.ok(ai.lastDecision.planCommitted&&memory.queue?.length===1);assert.match(ai.lastDecision.reason,/同单位安全完结纠正/);
const fullAudit=auditSearchRisks(engine,ai.lastDecision);engine.step(chosen);const queued=ai.getAction(engine,0,legalActions(engine),undefined,memory);assert.equal(encodeAction(queued),encodeAction(wait));assert.equal(ai.lastDecision.branchPolicyCalls,0);
const receipt={passed:true,root:encodeAction(root),selected:encodeAction(wait),badScore:badLeaf.score,goodScore:goodLeaf.score,nodes:result.nodes,audit,fullAudit};
if(process.env.STAGE5_FINISH_RECEIPT)save(process.env.STAGE5_FINISH_RECEIPT,receipt);console.log(receipt);
