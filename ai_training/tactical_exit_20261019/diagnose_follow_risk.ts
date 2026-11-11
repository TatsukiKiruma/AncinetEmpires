import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { evaluateLeaf,ledger } from './leaf';
import { read,save } from './io';
import type { GameState,Unit,UnitClass } from '../../src/game/types';

const source=read('browser-states.json')[0].state as GameState,model=read('teacher-model.json'),old=read('old-schema.json');
const tile=(key:string)=>structuredClone(source.map.tiles.flat().find(t=>getTileTerrainKey(t)===key)!);
function unit(kind:UnitClass,id:string,ownerId:number,x:number,y:number,hp=100):Unit{
    return {unitClass:kind,id,ownerId,pos:{x,y},hp,maxHp:100,level:0,exp:0,hasMoved:false,hasActed:false,hasPostAttackMoved:false,apkStatic:false};
}
const s=structuredClone(source);s.map={width:12,height:12,tiles:Array.from({length:12},()=>Array.from({length:12},()=>({...tile('road'),ownerId:null})))};
s.map.tiles[0][0]={...tile('castle'),ownerId:0};s.map.tiles[11][11]={...tile('castle'),ownerId:1};
s.units=[unit('commander','己方指挥官',0,0,0),unit('commander','敌方指挥官',1,11,11),unit('archer','行动弓手',0,2,5,50),unit('dragon','敌龙',1,6,5,50)];
s.players.forEach(p=>{p.gold=0;p.isAlive=true;});s.currentPlayer=0;s.pendingUnitId=undefined;s.winner=null;
const engine=new GameEngine(s),root=engine.getLegalActions(0).find(a=>a.type==='move'&&a.unitId==='行动弓手'&&a.to.x===4&&a.to.y===5)!;assert.ok(root);
const ai=new ModelBattleSearchAI(model,old),selected=ai.evaluateCandidate(engine,0,root),moved=engine.clone();moved.step(root);
const variants=moved.getLegalActions(0,{unitId:'行动弓手',skipRecruitment:true}).map(a=>{
    const b=moved.clone();b.step(a);const v=evaluateLeaf(engine.getState(),b,0,'行动弓手',model,old);
    return {action:encodeAction(a),hp:b.getState().units.find(u=>u.id==='行动弓手')?.hp,lightNet:ledger(moved.getState(),b.getState(),0).net,score:v.score,actorLethal:v.actorLethal,commanderLethal:v.commanderLethal,risks:v.risks};
});
const result={root:encodeAction(root),selected:{plan:selected.plan.map(p=>encodeAction(p.action)),score:selected.score,actorLethal:selected.actorLethal,commanderLethal:selected.commanderLethal},variants};save('diagnostic-follow-risk.json',result);console.log(JSON.stringify({...result,variants:variants.map(v=>({...v,risks:v.risks.map(r=>({id:r.id,hp:r.hp,damage:r.damage,lethal:r.lethal,witness:r.witness}))}))}));
for(const own of ['mermaid','dark_mage','paladin','elf','berserker','dragon'] as UnitClass[])for(const enemy of ['soldier','ghost','archer','dark_mage','paladin','elf','berserker','golem','dragon'] as UnitClass[])for(const hp of [30,50,70,100])for(const enemyHp of [30,50,70,100])for(const distance of [1,2]){
    const f=structuredClone(s);f.units[2]=unit(own,'行动弓手',0,2,5,hp);f.units[3]=unit(enemy,'敌龙',1,4+distance,5,enemyHp);
    const e=new GameEngine(f),a=e.getLegalActions(0).find(v=>v.type==='move'&&v.unitId==='行动弓手'&&v.to.x===4&&v.to.y===5);if(!a)continue;
    const m=e.clone();m.step(a);const wait=m.getLegalActions(0,{unitId:'行动弓手',skipRecruitment:true}).find(v=>v.type==='wait');if(!wait)continue;
    const attack=m.getLegalActions(0,{unitId:'行动弓手',skipRecruitment:true}).find(v=>v.type==='attack');if(!attack)continue;
    const b=m.clone();b.step(attack);if((b.getState().units.find(u=>u.id==='行动弓手')?.hp??0)>=hp||ledger(m.getState(),b.getState(),0).net<=0)continue;
    const w=m.clone();w.step(wait);const v=evaluateLeaf(e.getState(),b,0,'行动弓手',model,old),safe=evaluateLeaf(e.getState(),w,0,'行动弓手',model,old);
    if(v.actorLethal&&!safe.actorLethal&&!safe.commanderLethal&&safe.score>v.score){const found={own,enemy,hp,enemyHp,distance,root:encodeAction(a),attackScore:v.score,waitScore:safe.score,state:f};save('diagnostic-follow-counterexample.json',found);console.log('找到实际反例',JSON.stringify({...found,state:undefined}));process.exit(0);}
}
throw Error('本轮构造未发现反例，不据此修改搜索');
