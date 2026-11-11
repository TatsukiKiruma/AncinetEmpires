import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AncientEmpiresEnv,encodeAction} from './frozen/src/game/env';
import {GameEngine} from './frozen/src/game/engine';
import {getLegalActions} from './frozen/src/game/rules';
import {createApkSkirmishTrainingGameState,getApkSkirmishTrainingScenarios} from './frozen/src/game/apk_skirmish';
import {parseAppApkSkirmishMap} from './frozen/src/game/apk_skirmish_map_assets';
import {createSdTrainingGameState,deriveSdTrainingState,getPlanSetup,isDerivedSdPlan,parseSdPlanScenarioId,getSdTrainingPlanEntry} from './frozen/tools/sd_training_state_generator';
import {HeuristicAI} from './frozen/src/game/ai/heuristic_ai';
import {encodeGameStateSpatial,encodeCandidateActionsSpatialForSchema,SPATIAL_TENSOR_CHANNELS_V19,ENCODER_SCHEMA_ID_V19} from './frozen/src/game/ai/spatial_tensor_encoder';
import {computeNetworkInputHash,computeStateHash} from './frozen/research/state_hash';
import {Mulberry32PRNG} from './frozen/research/prng';
import {getApkTerrainConfig,mapSkirmishApkTerrainId} from './frozen/src/game/apk_terrain';
import {isCommanderUnit,getRuleConfig} from './frozen/src/game/rule_config';
import {getTileTerrainKey} from './frozen/src/game/terrain_rules';
export const OUT=path.dirname(fileURLToPath(import.meta.url));
export const ROOT=path.resolve(OUT,'../..');
export const RAW=path.join(ROOT,'ai_training/training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced');
export const sha=(v:any)=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export const clone=(s:any)=>JSON.parse(JSON.stringify(s));
export const plan=JSON.parse(fs.readFileSync(path.join(OUT,'frozen/plan.json'),'utf8'));
export function verifyFreeze(){const f=JSON.parse(fs.readFileSync(path.join(OUT,'freeze_manifest.json'),'utf8'));for(const e of f.local){if(sha(fs.readFileSync(path.join(OUT,e.path)))!==e.sha256)throw Error(`冻结源码改变 ${e.path}`);}return sha(fs.readFileSync(path.join(OUT,'freeze_manifest.json')));}
export function readEpisode(meta:any){const b=Buffer.alloc(meta.bytes),fd=fs.openSync(path.join(RAW,meta.file),'r');try{fs.readSync(fd,b,0,b.length,meta.offset);}finally{fs.closeSync(fd);}const text=b.toString('utf8').trim();if(sha(text)!==meta.recordSha256)throw Error('原始记录哈希变化');return JSON.parse(text);}
export function makeEnv(e:any,legacy=false){
 const parsed=parseSdPlanScenarioId(e.scenario.id);if(!parsed)throw Error('不支持的原始场景');
 const p=getSdTrainingPlanEntry(plan,parsed.planId),scenario=getApkSkirmishTrainingScenarios().find(s=>s.id===`SD:${parsed.mapName}`);if(!scenario)throw Error('缺少冻结场景');
 const map=parseAppApkSkirmishMap(parsed.mapName);let state;
 if(!legacy)state=createSdTrainingGameState(map,scenario,plan,p,e.seed);
 else {const base=createApkSkirmishTrainingGameState(map,scenario,{setup:getPlanSetup(plan,p),applyInitialTurnStart:false});
  state=isDerivedSdPlan(p)?deriveSdTrainingState(base,p,e.seed):base;
  if(!isDerivedSdPlan(p))state.metadata={...state.metadata,apkSkirmishTrainingScenarioId:e.scenario.id,sdTrainingPlanId:p.id,sdTrainingPlanKind:p.kind,sdTrainingSeed:e.seed};
 }
 return new AncientEmpiresEnv({initialState:state,seed:e.seed,maxPlies:e.maxPlies});
}
// 对历史状态独立检查结构、合法动作、mask、克隆及一条确定动作的转移一致性。
export function validateState(state:any){
 const fail=(m:string)=>{throw Error(`STATE_INVALID:${m}`);};
 if(!state.map||state.map.tiles.length!==state.map.height||state.map.tiles.some((r:any)=>r.length!==state.map.width))fail('地图维度');
 const ids=new Set(),pos=new Set(),players=new Set(state.players.map((p:any)=>p.id));
 if(players.size!==state.players.length||!players.has(state.currentPlayer))fail('玩家身份');
 for(const row of state.map.tiles)for(const tile of row){
  if(tile.ownerId!==null&&tile.ownerId!==undefined&&!players.has(tile.ownerId))fail('地形所有者');
  if(tile.apkTerrainId!==undefined){const config=getApkTerrainConfig(tile.apkTerrainId);if(!config||mapSkirmishApkTerrainId(tile.apkTerrainId)!==tile.terrainId)fail('地形映射与冻结规则不符');
   if(tile.apkTerrainKind!==undefined&&tile.apkTerrainKind!==config.kind)fail('过时地形类型');
   if(tile.apkMoveCost!==undefined&&tile.apkMoveCost!==config.moveCost)fail('过时地形移动代价');
  }
 }
 for(const p of state.players)if(!Number.isFinite(p.gold)||p.gold<0)fail('金币');
 for(const u of state.units){const k=`${u.pos.x},${u.pos.y}`;if(ids.has(u.id)||!players.has(u.ownerId)||!Number.isFinite(u.hp)||u.hp<=0||u.hp>u.maxHp||u.pos.x<0||u.pos.y<0||u.pos.x>=state.map.width||u.pos.y>=state.map.height)fail('单位身份位置血量');
  if(pos.has(k)){
   const stacked=state.units.filter((x:any)=>x.pos.x===u.pos.x&&x.pos.y===u.pos.y),pending=stacked.find((x:any)=>x.id===state.pendingUnitId),commander=stacked.find((x:any)=>x.id!==state.pendingUnitId),tile=state.map.tiles[u.pos.y][u.pos.x];
   // 冻结引擎明确允许指挥官城堡招募时短暂堆叠，不将合法 pending 状态误判为重叠错误。
   if(stacked.length!==2||!pending||!commander||pending.apkPendingRecruitSource!=='commander_castle'||pending.hasActed||pending.ownerId!==state.currentPlayer||commander.ownerId!==pending.ownerId||!isCommanderUnit(state,commander,pending.ownerId)||getTileTerrainKey(tile)!=='castle'||!getRuleConfig(state).commanderCastleRecruitUsesPending)fail('非合法招募堆叠');
  }
  ids.add(u.id);pos.add(k);
 }
 for(const grave of state.graves??[])if(grave.pos.x<0||grave.pos.y<0||grave.pos.x>=state.map.width||grave.pos.y>=state.map.height||grave.remainingTurns<0)fail('墓碑位置或寿命不合法');
 if(state.pendingUnitId&&!ids.has(state.pendingUnitId))fail('待行动单位');
 const before=computeStateHash(state),engine=new GameEngine(clone(state));
 if(engine.isTerminal())fail('终局不入策略数据');
 const legal=engine.getLegalActions(state.currentPlayer),direct=getLegalActions(clone(state),state.currentPlayer);
 if(sha(legal.map(encodeAction))!==sha(direct.map(encodeAction)))fail('规则/引擎动作不一致');
 if(!legal.length||new Set(legal.map(encodeAction)).size!==legal.length)fail('候选为空或重复');
 const env=new AncientEmpiresEnv({initialState:clone(state),maxPlies:1000000,seed:1}),r=env.reset(1);
 if(sha(r.legalActionCodes)!==sha(legal.map(encodeAction))||r.legalActionEntries.some((x:any)=>x.fixedActionIndex===null||!x.actionMask))fail('环境动作mask不一致');
 const cp=env.clone(),action=legal[0],er=env.stepAction(action),cr=cp.stepAction(action);engine.step(action);
 if(computeStateHash(er.state)!==computeStateHash(cr.state)||computeStateHash(er.state)!==computeStateHash(engine.getState())||er.reward!==cr.reward||er.done!==cr.done)fail('克隆/引擎转移不一致');
 if(computeStateHash(state)!==before)fail('输入状态被修改');
 return {checks:['结构','单位身份位置血量','当前合法动作','固定mask','环境克隆单步','引擎环境单步'],legalCount:legal.length};
}
export function encodeAndLabel(state:any){
 const validity=validateState(state),engine=new GameEngine(clone(state)),player=state.currentPlayer,legal=engine.getLegalActions(player);
 const enc=encodeGameStateSpatial(state,player,'v2',{channels:SPATIAL_TENSOR_CHANNELS_V19});
 const features=encodeCandidateActionsSpatialForSchema(state,player,legal,'v2',ENCODER_SCHEMA_ID_V19);
 const coord=(c:any)=>c?[c.x,c.y]:[-1,-1];
 const input={spatial:Array.from(enc.spatialTensor),global:Array.from(enc.globalFeatures),candidateActorCoords:features.map(f=>coord(f.actorCoord)),candidateLandingCoords:features.map(f=>coord(f.landingCoord)),candidateTargetCoords:features.map(f=>coord(f.targetCoord)),candidateSemantics:features.map(f=>Array.from(f.semantics))};
 const inputHash=computeNetworkInputHash(input as any),seed=parseInt(inputHash.slice(0,8),16),rng=new Mulberry32PRNG(seed),teacher=new HeuristicAI(()=>rng.next());
 const codes=legal.map(encodeAction),before=computeStateHash(engine.getState()),action=teacher.getAction(engine,player,legal),target=codes.indexOf(encodeAction(action));
 if(target<0||before!==computeStateHash(engine.getState()))throw Error('教师动作非法或修改状态');
 for(const values of [input.spatial,input.global,...input.candidateSemantics])if(values.some(x=>!Number.isFinite(x)))throw Error('编码非有限');
 return {...input,inputHash,stateHash:computeStateHash(state),stateJson:state,playerId:player,orderedActionCodes:codes,candidateActions:legal,targetActionIndex:target,labelSource:'R7-frozen-HeuristicAI',teacher:{seed,budget:'单次 getAction，完整合法候选；保留教师原生内部评估，不追加外部rollout',targetActionCode:codes[target]},encoderSchemaId:ENCODER_SCHEMA_ID_V19,valueLossMask:false,valueTarget:null,validity};
}
