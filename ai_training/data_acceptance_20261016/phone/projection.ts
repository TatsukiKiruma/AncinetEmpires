import { createHash } from 'node:crypto';
import { createGameStateFromEmbeddedConfig, parseEmbeddedGameConfig } from '../../../tools/apk_game_get_validate';
import { APK_STATUS_ID_TO_TYPE, APK_UNIT_ID_TO_CLASS } from '../../../src/game/apk_compat';
import { getEffectiveStats, hasAbility } from '../../../src/game/abilities';
import { isCommanderUnit } from '../../../src/game/rule_config';
import { createApkReplayRecord, type ApkReplayActionRecord, type ApkReplayEventType } from '../../../src/game/apk_replay';
import type { GameState, Unit } from '../../../src/game/types';
import { readNativeConfig } from '../native_reader/reader';
import type { NativeSnapshot, NativeUnit, NativeGameConfig } from '../native_reader/types';

export const projectionSchema = 'native-sd-semantic-projection-v1';
export const sha = (value: Uint8Array|string) => createHash('sha256').update(value).digest('hex');
export const json = (value: unknown) => JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
export const hash = (value: unknown) => sha(json(value));

// 原生config根与C1258d内嵌对象使用相同序列化；只包装空元数据以复用现有权威导入器。
export function importedConfig(bytes: Buffer) {
  const config = readNativeConfig(bytes);
  if (!config) throw Error('原生config为空');
  const prefix=Buffer.alloc(19);prefix.writeInt32BE(365703,0);
  prefix.fill(1,5,9);prefix.fill(1,17,19);
  const wrapped=Buffer.concat([prefix,bytes.subarray(4),Buffer.alloc(8)]);
  const parsed=parseEmbeddedGameConfig(wrapped,{startOffset:wrapped.length} as never);
  return {native:config, embedded:parsed};
}

function requireMatrix<T>(rows: (T[]|null)[]|null,label:string):T[][] {
  if(!rows || rows.some(r=>r===null))throw Error(`${label}含空矩阵`);
  return rows as T[][];
}

function fromUnit(raw:NativeUnit,id:string,config:ReturnType<typeof importedConfig>['embedded']):Unit {
  const unitClass=APK_UNIT_ID_TO_CLASS[raw.a];
  const definition=config.unitDefinitions.find(d=>d.apkUnitId===raw.a);
  if(!unitClass||!definition)throw Error(`未知原生兵种${raw.a}`);
  const type=raw.g>>12, duration=raw.g&4095;
  if(type!==0&&!APK_STATUS_ID_TO_TYPE[type])throw Error(`未知原生状态${type}`);
  const u:Unit={id,ownerId:raw.b,unitClass,pos:{x:raw.c.a,y:raw.c.b},hp:raw.e,
    maxHp:definition.baseMaxHp,level:raw.derived.n as Unit['level'],exp:raw.d,
    hasActed:raw.i,hasMoved:raw.i,movementRemaining:raw.f,
    hasBeenSupportedThisTurn:raw.j,apkUnitId:raw.a,apkUnitCode:raw.m??undefined};
  if(type)u.status={type:APK_STATUS_ID_TO_TYPE[type],remainingTicks:duration};
  if(raw.f<getEffectiveStats(u).move)u.hasMoved=true;
  // 原生j同时承担已支援与城堡占领/突击行动锁，不能当成单一“被支援”事实。
  if(hasAbility(u,'assault_troop'))u.hasPostAttackMoved=raw.i&&raw.j;
  return u;
}

export function projectSnapshot(snapshot:NativeSnapshot, configBytes:Buffer, mapName:string):GameState {
  const board=snapshot.components.d, players=snapshot.components.e;
  if(!board||!players||!players.c||!players.i||!players.k||!players.l||!players.s)throw Error('原生规则状态缺字段');
  const config=importedConfig(configBytes), terrain=requireMatrix(board.c,'地形');
  if(hash(config.native.b)!==hash(snapshot.components.c))throw Error('快照运行定义与原config不一致，须独立验收');
  if(hash(config.native.d)!==hash(players.c))throw Error('快照实时规则与原config不一致，须独立验收');
  if(json(config.native.j)!==json(players.k))throw Error('实时联盟变化尚未映射');
  if(json(config.native.k)!==json(players.m))throw Error('实时单位上限变化尚未映射');
  if(players.n?.some(v=>v!==null))throw Error('实时队伍招募列表覆盖尚未映射');
  // 快照中的地形归属和玩家数组是实时状态，禁止从manifest重建并重复结算开局。
  config.embedded.map.terrainValues=terrain.flatMap(col=>col);
  config.embedded.map.width=board.a;config.embedded.map.height=board.b;
  config.embedded.allianceByTeam=[...players.k];
  const defaults={inputs:[],rootDir:'',outPath:null,json:false,mode:'SD',maxRecords:100000,offset:0,limit:null,
    uniqueOffset:null,uniqueLimit:null,dedupe:true,allowAmbiguousRecruit:false,strictTerrain:true,forceExecuteReplayActions:false,rejectInformationLoss:true};
  const state=createGameStateFromEmbeddedConfig(config.embedded,[],defaults as never,mapName).state;
  state.turn=players.g;state.currentPlayer=players.e;state.winner=players.h<0?null:players.h;
  const units=requireMatrix(board.e,'单位');
  state.units=[];state.graves=[];
  const commanderIds:Record<number,string>={};
  for(let x=0;x<board.a;x++)for(let y=0;y<board.b;y++){
    const raw=units[x][y];
    if(raw){const u=fromUnit(raw,`native_u${state.units.length}`,config.embedded);state.units.push(u);if(raw.k)commanderIds[raw.b]=u.id;}
    const grave=board.d?.[x]?.[y];
    if(grave===undefined||grave===null)throw Error('墓碑矩阵缺字段');
    if((grave>>12)>=0)state.graves.push({id:`native_g${x}_${y}`,pos:{x,y},remainingTurns:grave>>12,ownerId:grave&4095});
  }
  if(players.d){
    const raw=players.d;
    const u=fromUnit(raw,'native_pending',config.embedded);
    const occupant=state.units.find(v=>v.pos.x===u.pos.x&&v.pos.y===u.pos.y);
    u.apkPendingRecruitSource=occupant?'commander_castle':'empty_castle';
    state.units.push(u);state.pendingUnitId=u.id;if(raw.k)commanderIds[raw.b]=u.id;
  }
  // 空城堡招募后的选中单位在棋盘上，只有堆叠招募才进入players.d；运行态a=1保留待部署选择。
  const runtime=snapshot.components.f;
  if(!players.d&&runtime?.a===1&&runtime.c){
    const selected=state.units.find(u=>u.pos.x===runtime.c!.a&&u.pos.y===runtime.c!.b);
    if(!selected||selected.ownerId!==players.e||selected.hasActed)throw Error('运行态选中单位不能映射pending');
    selected.apkPendingRecruitSource='empty_castle';state.pendingUnitId=selected.id;
  }
  state.nextUnitId=state.units.length;state.nextGraveId=1000;
  // SD按兵种认定指挥官；绑定当前实体ID会让重招募的新ID被误判，只有原生指定异兵种才需要覆盖。
  state.rules!.commanderUnitIds=Object.fromEntries(Object.entries(commanderIds).filter(([,id])=>state.units.find(u=>u.id===id)?.unitClass!=='commander'));
  state.rules!.alliances=Object.fromEntries(players.k.map((a,i)=>[i,a]));
  state.players=players.i.map((type,id)=>({id,type})).filter(p=>p.type!==0||config.native.i?.[p.id]!==0)
    .map(({id,type})=>{
      const base=config.embedded.unitDefinitions.find(d=>d.apkUnitId===players.c!.v)?.cost;
      if(base===undefined||(players.s![id]-base)%100!==0)throw Error('指挥官价格到阵亡次数不能无损映射');
      const reserve=players.r?.[id];
      return {id,gold:players.l![id],isAlive:type!==0&&type!==5,commanderDeathCount:(players.s![id]-base)/100,
        ...(reserve?{commanderReserveLevel:reserve.derived.n as Unit['level'],commanderReserveExp:reserve.d}:{})};
    });
  const activeAlliances=state.players.filter(p=>p.isAlive).map(p=>state.rules!.alliances![p.id]);
  if(new Set(activeAlliances).size!==activeAlliances.length)throw Error('队友跨回合行动资源尚不能无损规范化');
  state.apkScriptState={booleans:{},integers:{}};
  for(const entry of players.a?.a??[]){
    if(!entry.key||!entry.value)throw Error('脚本变量键或值为空');
    if(entry.key.startsWith('#')&&!['#S','#SC','#SN','#GS'].includes(entry.key))throw Error(`尚未验收的原生内部变量${entry.key}`);
    if(entry.key==='#SC'&&entry.value.b!=='SD')throw Error('原生快照模式不是SD');
    if(!entry.key.startsWith('#')){
      if(entry.value.a===0)state.apkScriptState.booleans![entry.key]=entry.value.b as boolean;
      else if(entry.value.a===1)state.apkScriptState.integers![entry.key]=entry.value.b as number;
      else throw Error(`项目无法表达脚本变量${entry.key}`);
    }
  }
  state.metadata!.apkMapName=mapName;
  return state;
}

// 对比字段来自原生可观察规则状态；ID由TS运行时生成，不按数组或ID相等判断实体一致。
export function comparableState(state:GameState){
  const units=state.units.map(u=>({type:u.unitClass,owner:u.ownerId,x:u.pos.x,y:u.pos.y,hp:u.hp,
    exp:u.exp??0,level:u.level??0,acted:u.ownerId===state.currentPlayer?u.hasActed:null,
    move:u.ownerId===state.currentPlayer?(u.movementRemaining??getEffectiveStats(u).move):null,
    status:u.status?{type:u.status.type,duration:u.status.remainingTicks??u.status.remainingTurns??0}:null,
    supportLock:u.ownerId===state.currentPlayer?(Boolean(u.hasBeenSupportedThisTurn)||Boolean(u.hasActed&&(hasAbility(u,'castle_capturer')||hasAbility(u,'assault_troop')))):null,
    commander:isCommanderUnit(state,u),pending:u.id===state.pendingUnitId,code:u.apkUnitCode??null})).sort((a,b)=>json(a).localeCompare(json(b)));
  return {turn:state.turn,currentPlayer:state.currentPlayer,winner:state.winner,
    tiles:state.map.tiles.map(row=>row.map(t=>({terrain:t.apkTerrainId,owner:t.ownerId}))),units,
    players:state.players.map(p=>({id:p.id,gold:p.gold,alive:p.isAlive,deaths:p.commanderDeathCount,
      reserveExp:state.units.some(u=>u.ownerId===p.id&&u.hp>0&&isCommanderUnit(state,u))?null:(p.commanderReserveExp??null),alliance:state.rules?.alliances?.[p.id]??p.id})).sort((a,b)=>a.id-b.id),
    graves:(state.graves??[]).map(g=>({x:g.pos.x,y:g.pos.y,owner:g.ownerId,duration:g.remainingTurns})).sort((a,b)=>a.x-b.x||a.y-b.y),
    script:state.apkScriptState??{booleans:{},integers:{}}};
}

export function nativeRecord(fields:Record<string,number|string>):ApkReplayActionRecord{
  const pos=(a:string,b:string)=>Number(fields[a])>=0&&Number(fields[b])>=0?{x:Number(fields[a]),y:Number(fields[b])}:null;
  return createApkReplayRecord({source:pos('a','b'),moveTo:pos('c','d'),postMoveTo:pos('e','f'),target:pos('g','h'),
    recruitUnitId:Number(fields.i),eventType:String(fields.j) as ApkReplayEventType});
}

export function differences(a:unknown,b:unknown,path='',out:{path:string,actual:unknown,expected:unknown}[]=[]){
  if(json(a)===json(b))return out;
  if(out.length>=16)return out;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))differences((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],path?`${path}.${key}`:key,out);
  }else out.push({path,actual:a,expected:b});
  return out;
}
