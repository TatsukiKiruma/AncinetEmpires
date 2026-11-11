import fs from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {createDecipheriv} from 'node:crypto';
import {OUT,ROOT,sha,readEpisode,makeEnv,validateState,verifyFreeze} from './recovery_core';
import {getRuleConfig} from './frozen/src/game/rule_config';
import {computeStateHash,canonicalize} from './frozen/research/state_hash';
import {APK_SCRIPT_DECRYPTION_INFO} from './frozen/src/game/apk_script_manifest';
import {parseApkAemMap} from './frozen/src/game/apk_map';
import {parseAppApkSkirmishMap} from './frozen/src/game/apk_skirmish_map_assets';
const index=fs.readFileSync(path.join(OUT,'episode_index.jsonl'),'utf8').trim().split('\n').map(JSON.parse),metas=new Map(index.map((e:any)=>[e.id,e]));
const maps=[];
const hex=(s:string)=>Buffer.from(s.replace(/\s+/g,''),'hex');
for(const name of new Set(index.map((e:any)=>e.mapName))){const file=path.join(ROOT,'APK/_analysis/unpack/assets/maps',name as string);if(!fs.existsSync(file)){maps.push({name,status:'MISSING_RAW_APK_MAP'});continue;}const bytes=fs.readFileSync(file),d=createDecipheriv('des-cbc',hex(APK_SCRIPT_DECRYPTION_INFO.keyHex),hex(APK_SCRIPT_DECRYPTION_INFO.ivHex)),plain=Buffer.concat([d.update(bytes),d.final()]);const raw=parseApkAemMap(plain),embedded=parseAppApkSkirmishMap(name as string);maps.push({name,source:path.relative(ROOT,file),encryptedSha256:sha(bytes),decryptedSha256:sha(plain),sameAsFrozenEmbedded:sha(canonicalize(raw))===sha(canonicalize(embedded))});}
fs.writeFileSync(path.join(OUT,'map_source_check.json'),JSON.stringify(maps,null,2));
if(maps.some((m:any)=>!m.sameAsFrozenEmbedded))throw Error('冻结地图未通过原始资源核对');
const valid=fs.readFileSync(path.join(OUT,'snapshot_results.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter((r:any)=>r.status==='B_VALID_RELABELLED');
const validation=[];
for(const r of valid){const row=JSON.parse(fs.readFileSync(path.join(OUT,'candidate_rows',r.file),'utf8')),state=row.stateJson,e=readEpisode(metas.get(r.episodeId)),initial=makeEnv(e,true).reset(e.seed).state;const errors=[];
 if(sha(canonicalize(getRuleConfig(state)))!==sha(canonicalize(getRuleConfig(initial))))errors.push('状态规则配置与冻结场景不一致');
 if(state.units.some((u:any)=>!state.players.find((p:any)=>p.id===u.ownerId)?.isAlive))errors.push('已淘汰玩家残留单位');
 if(!state.players.find((p:any)=>p.id===state.currentPlayer)?.isAlive)errors.push('当前玩家已淘汰');
 for(const grave of state.graves??[])if(grave.pos.x<0||grave.pos.y<0||grave.pos.x>=state.map.width||grave.pos.y>=state.map.height||grave.remainingTurns<0)errors.push('墓碑位置或寿命不合法');
 if(state.pendingUnitId){const unit=state.units.find((u:any)=>u.id===state.pendingUnitId);if(!unit||unit.ownerId!==state.currentPlayer)errors.push('待行动单位所有者不符');}
 validation.push({snapshotId:r.snapshotId,passed:!errors.length,errors});
}
const sources=JSON.parse(fs.readFileSync(path.join(OUT,'snapshot_source_inventory.json'),'utf8')).verifiedSources;
const failureEvidence=[];
for(const source of sources){const lines=createInterface({input:fs.createReadStream(path.join(ROOT,source.path))});let i=0;
 for await(const line of lines){const row=JSON.parse(line),state=row.stateJson,seen=new Set(),violations=[];for(const u of state.units){const pos=`${u.pos.x},${u.pos.y}`;if(u.hp>u.maxHp)violations.push({kind:'hp_above_max',unitId:u.id,hp:u.hp,maxHp:u.maxHp});if(u.hp<=0)violations.push({kind:'nonpositive_hp',unitId:u.id,hp:u.hp});if(seen.has(pos))violations.push({kind:'stacked_units_conservative_quarantine',unitId:u.id,pos,pendingUnitId:state.pendingUnitId});seen.add(pos);}if(violations.length)failureEvidence.push({source:source.path,lineIndex:i,recordSha256:sha(line),sourceEpisode:`${row.provenance.sourceFile}:${row.provenance.sourceLineIndex}`,sourceStep:row.provenance.stepIndex,violations});i++;}
}
fs.writeFileSync(path.join(OUT,'snapshot_failure_evidence.json'),JSON.stringify(failureEvidence,null,2));
fs.writeFileSync(path.join(OUT,'post_validation.json'),JSON.stringify({freezeIdentity:verifyFreeze(),checked:validation.length,results:validation,failed:validation.filter(x=>!x.passed).length},null,2));
console.log(JSON.stringify({maps:maps.length,checked:validation.length,failed:validation.filter(x=>!x.passed).length,failedSnapshotEvidence:failureEvidence.length}));
