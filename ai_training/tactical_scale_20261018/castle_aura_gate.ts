import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import type { GameState, Unit, UnitClass } from '../../src/game/types';
import { extractFeatures as reference } from '../tactical_conditional_20261018/complete_tactics';
import { extractFeatures } from './complete_tactics';
import { save } from './io';
const unit=(id:string,ownerId:number,unitClass:UnitClass,x:number,y:number,hp=100):Unit=>({id,ownerId,unitClass,pos:{x,y},hp,maxHp:100,hasMoved:false,hasActed:false});
const state:GameState={turn:3,currentPlayer:0,winner:null,map:{width:8,height:8,tiles:Array.from({length:8},()=>Array.from({length:8},()=>({terrainId:6 as const,ownerId:null as number|null})))},
    players:[0,1].map(id=>({id,gold:0,isAlive:true,commanderDeathCount:0})),units:[unit('actor',0,'soldier',3,3,60),unit('own',0,'commander',0,0),unit('enemy',1,'commander',7,7),unit('hit',1,'soldier',4,3),unit('elf',1,'elf',7,5),unit('skeleton',1,'skeleton',6,6)]};
state.map.tiles[3][3]={terrainId:10 as any,ownerId:1};
const engine=new GameEngine(state),actions=[{type:'wait' as const,unitId:'actor'}];
const old=reference(engine,actions),current=extractFeatures(engine,actions);
save('castle-aura-probe.json',{state,actions,old:old.old,current:current.old,extra:old.extra,passed:JSON.stringify(old.old)===JSON.stringify(current.old)});
assert.deepEqual(current.old,old.old);assert.deepEqual(current.extra,old.extra);
