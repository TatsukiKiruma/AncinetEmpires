import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';
import { getLegalActions } from '../../../src/game/rules';
import { readNativeSnapshot } from '../native_reader/reader';
import { comparableState, importedConfig, nativeRecord, projectSnapshot } from './projection';
import { semanticActionCodes } from './semantic_actions';

const fixture=(name:string)=>fs.readFileSync(fileURLToPath(new URL('../native_reader/fixtures/'+name,import.meta.url)));
const snapshot=()=>readNativeSnapshot(fixture('initial.bin'));

test('完整config包装复用现有导入器，快照不得重复发首回合收益',()=>{
  const c=importedConfig(fixture('config.bin'));
  assert.deepEqual(c.embedded.allianceByTeam,[1,2,3,4,5,6]);
  const s=projectSnapshot(snapshot(),fixture('config.bin'),'test');
  assert.equal(s.players[0].gold,500);
  const engine=new GameEngine(s,{applyInitialTurnStart:false,disableAutoAdvanceWhenNoMeaningfulAction:true});
  assert.deepEqual(comparableState(engine.getState()),comparableState(s));
});

test('未知内部变量、实时规则变化与未知联盟语义必须阻断',()=>{
  const a=snapshot();a.components.e!.a!.a.push({key:'#MVOunit0',value:{a:1,b:0}});
  assert.throws(()=>projectSnapshot(a,fixture('config.bin'),'x'),/内部变量/);
  const b=snapshot();b.components.e!.c!.h=9;
  assert.throws(()=>projectSnapshot(b,fixture('config.bin'),'x'),/实时规则/);
  const c=snapshot();c.components.e!.k![0]=2;
  assert.throws(()=>projectSnapshot(c,fixture('config.bin'),'x'),/联盟/);
});

test('相同局面更换实体ID不改变合法动作语义集合，原地坐标变化会改变',()=>{
  const a=projectSnapshot(snapshot(),fixture('config.bin'),'x');
  const b=structuredClone(a);b.units.forEach((u,i)=>u.id='other_'+i);
  assert.deepEqual(semanticActionCodes(a,getLegalActions(a,a.currentPlayer)),semanticActionCodes(b,getLegalActions(b,b.currentPlayer)));
  b.units.find(u=>u.ownerId===b.currentPlayer)!.pos.x=0;
  assert.notDeepEqual(semanticActionCodes(a,getLegalActions(a,a.currentPlayer)),semanticActionCodes(b,getLegalActions(b,b.currentPlayer)));
});

test('突击行动锁差异不能由已行动布尔掩盖，合法集合必须拒绝',()=>{
  const a=projectSnapshot(snapshot(),fixture('config.bin'),'x');
  a.units=[{id:'wolf',ownerId:0,unitClass:'wolf',pos:{x:3,y:3},hp:100,maxHp:100,hasMoved:true,hasActed:true,movementRemaining:3,hasPostAttackMoved:false}];
  const b=structuredClone(a);b.units[0].hasPostAttackMoved=true;
  assert.notDeepEqual(semanticActionCodes(a,getLegalActions(a,0)),semanticActionCodes(b,getLegalActions(b,0)));
});

test('复合NONE招募与三个坐标域无损映射',()=>{
  const r=nativeRecord({a:2,b:3,c:4,d:5,e:6,f:7,g:8,h:9,i:19,j:'NONE'});
  assert.deepEqual(r.source,{x:2,y:3});assert.deepEqual(r.postMoveTo,{x:6,y:7});
  assert.equal(r.recruitUnitId,19);assert.equal(r.eventType,'NONE');
});
