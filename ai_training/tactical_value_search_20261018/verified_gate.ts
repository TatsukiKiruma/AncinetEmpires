import assert from 'node:assert/strict';
import { createDemoState } from '../../src/game/demo_map';
import { GameEngine } from '../../src/game/engine';
import { friendlyEvents,verifiedTakeover } from './verified_events';
import { chooseBounded } from './search_verified';
import { read,save,hash } from './io';
import type { GameState,Unit } from '../../src/game/types';
const makeUnit=(id:string,ownerId:number,x:number,y:number,unitClass:Unit['unitClass']='soldier',hp=100):Unit=>({id,ownerId,pos:{x,y},unitClass,hp,maxHp:100,hasMoved:false,hasActed:false});
function fixture():GameState{
    const s=createDemoState();s.currentPlayer=0;s.players.forEach(p=>p.gold=0);s.map={width:8,height:8,tiles:Array.from({length:8},()=>Array.from({length:8},()=>({terrainId:6,ownerId:null})))};
    s.map.tiles[0][0]={terrainId:10,ownerId:0};s.map.tiles[7][7]={terrainId:10,ownerId:1};s.units=[makeUnit('own-command',0,0,1,'commander'),makeUnit('own-soldier',0,1,1),makeUnit('enemy-command',1,7,7,'commander'),makeUnit('enemy-soldier',1,7,6)];return s;
}
const s=fixture(),moving=new GameEngine(s),m0=moving.getState(),move=moving.getLegalActions(0).find(a=>a.type==='move'&&a.unitId==='own-soldier')!;assert.ok(move);moving.step(move);
const none=friendlyEvents(m0,m0,0,[],0),ordinary=friendlyEvents(m0,moving.getState(),0,[move],0);assert.equal(verifiedTakeover('move',none,ordinary),false);
const richer=fixture();richer.players[0].gold=2000;const recruiting=new GameEngine(richer),r0=recruiting.getState(),recruit=recruiting.getLegalActions(0).find(a=>a.type.startsWith('recruit_'))!;assert.ok(recruit);assert.ok(!recruiting.step(recruit).info.includes('非法动作'));
const recruited=friendlyEvents(r0,recruiting.getState(),0,[recruit],0);assert.equal(recruited.recruits,1);assert.equal(verifiedTakeover('move',none,recruited),false);assert.equal(verifiedTakeover('end_turn',none,recruited),true);
const combat=fixture();combat.units.find(u=>u.id==='own-soldier')!.pos={x:2,y:1};combat.units.find(u=>u.id==='enemy-command')!.pos={x:2,y:2};combat.units.find(u=>u.id==='enemy-command')!.hp=1;
const attacking=new GameEngine(combat),a0=attacking.getState(),attack=attacking.getLegalActions(0).find(a=>a.type==='attack'&&a.targetId==='enemy-command')!;assert.ok(attack);attacking.step(attack);const killed=friendlyEvents(a0,attacking.getState(),0,[attack],0);assert.equal(killed.enemyCommanderKills,1);assert.equal(verifiedTakeover('move',none,killed),true);
const castle=fixture();castle.units.find(u=>u.id==='enemy-command')!.pos={x:6,y:7};castle.units.find(u=>u.id==='own-command')!.pos={x:7,y:7};castle.map.tiles[6][6]={terrainId:10,ownerId:1};
const capturing=new GameEngine(castle),c0=capturing.getState(),capture=capturing.getLegalActions(0).find(a=>a.type==='capture')!;assert.ok(capture);capturing.step(capture);const captured=friendlyEvents(c0,capturing.getState(),0,[capture],0);assert.equal(captured.enemyCastlesCaptured,1);assert.equal(verifiedTakeover('move',none,captured),true);
const model=read('model-final.json'),old=read('old-schema.json'),states=read('browser-states.json'),decisions=[];
for(const index of [0,3,states.length-1]){
    const engine=new GameEngine(states[index].state),before=hash(engine.getState()),legal=engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender');
    const a=chooseBounded(engine,legal,model,old,'bounded'),b=chooseBounded(engine,legal,model,old,'bounded');assert.equal(hash(engine.getState()),before);assert.equal(a.search.selected,b.search.selected);assert.deepEqual(a.search.traces,b.search.traces);assert.ok(a.search.nodes<=48&&a.search.triggerProbes<=6);
    if(a.search.reason==='Takeover实际事件接管'){
        const primary=a.search.traces.find((t:any)=>t.code===a.search.preferred),selected=a.search.traces.find((t:any)=>t.code===a.search.selected),root=a.input.actions[a.input.codes.indexOf(a.search.preferred)];assert.ok(verifiedTakeover(root.type,primary.friendlyEvents,selected.friendlyEvents));
    }
    if(a.search.reason==='Veto危险否决'){
        const primary=a.search.traces.find((t:any)=>t.code===a.search.preferred),risk=a.input.focus[a.input.codes.indexOf(a.search.preferred)];assert.ok(risk[1]||risk[5]||primary.maxCommanderLost||primary.maxCriticalActorLost||primary.score===-4);
    }
    decisions.push({index,reason:a.search.reason,nodes:a.search.nodes,triggerProbes:a.search.triggerProbes});
}
save('verified-search-gate.json',{passed:true,actualEngineEventCases:4,rejectsOrdinaryMoveTakeover:true,recruitOnlyOverridesClosing:true,commanderKillAndEnemyCastleQualify:true,deterministic:true,sourceUnchanged:true,decisions});console.log({passed:true,decisions});
