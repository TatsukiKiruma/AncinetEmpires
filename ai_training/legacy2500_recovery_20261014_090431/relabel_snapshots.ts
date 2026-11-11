import fs from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {OUT,ROOT,sha,verifyFreeze,encodeAndLabel,readEpisode,makeEnv} from './recovery_core';
import {computeStateHash} from './frozen/research/state_hash';
const freezeIdentity=verifyFreeze(),started=Date.now(),maxRows=Number(process.argv[2]??2000);
const base=path.join(ROOT,'ai_training/v19/out/data_scale_20261003');
const sourceAudit=JSON.parse(fs.readFileSync(path.join(ROOT,'ai_training/v19/review/data_scale_20261003/recovery_audit_v2/audit.json'),'utf8'));
const index=fs.readFileSync(path.join(OUT,'episode_index.jsonl'),'utf8').trim().split('\n').map(JSON.parse),byId=new Map(index.map((e:any)=>[e.id,e]));
const assets=JSON.parse(fs.readFileSync(path.join(OUT,'asset_inventory.json'),'utf8')).assets;
const files=['recovered_s0','recovered_s1','recovered_s2','recovered_s3','recovered_s4','recovered_retry'];
fs.mkdirSync(path.join(OUT,'candidate_rows'),{recursive:true});
const resultsFile=path.join(OUT,'snapshot_results.jsonl');
const finished=new Map(fs.existsSync(resultsFile)?fs.readFileSync(resultsFile,'utf8').trim().split('\n').filter(Boolean).map(l=>{const x=JSON.parse(l);return [x.snapshotId,x];}):[]);
const verifiedSources:any[]=[],pending:any[]=[];
for(const shard of files){const p=path.join(base,shard,'rows.jsonl');if(!fs.existsSync(p))continue;
 const digest=sha(fs.readFileSync(p)),expected=sourceAudit.checks.artifactHashes.find((e:any)=>e.shard===shard&&e.file==='rows.jsonl')?.expected??JSON.parse(fs.readFileSync(path.join(base,shard,'manifest.json'),'utf8')).artifactHashes['rows.jsonl'];
 if(digest!==expected)throw Error(`历史快照文件哈希不一致 ${shard}`);verifiedSources.push({path:path.relative(ROOT,p),sha256:digest,bytes:fs.statSync(p).size,verified:true});
 const lines=createInterface({input:fs.createReadStream(p)});let lineIndex=0;
 for await(const line of lines){const row=JSON.parse(line),pro=row.provenance,snapshotId=`${shard}:${lineIndex++}`,id=`${pro.sourceFile}:${pro.sourceLineIndex}`,meta=byId.get(id);if(!meta)throw Error(`缺少快照原局 ${id}`);
  // 此处只暂存完整历史状态及来源；不读取旧模型特征或旧教师目标用于新标签。
  pending.push({snapshotId,sourceSnapshot:path.relative(ROOT,p),sourceSnapshotFileSha256:digest,sourceSnapshotRecordSha256:sha(line),oldStateHash:row.stateHash,state:row.stateJson,pro,meta});
 }
}
fs.writeFileSync(path.join(OUT,'snapshot_source_inventory.json'),JSON.stringify({verifiedSources,rows:pending.length},null,2));
pending.sort((a,b)=>(a.meta.players===2?0:1)-(b.meta.players===2?0:1)||a.pro.stepIndex-b.pro.stepIndex||a.snapshotId.localeCompare(b.snapshotId));
let attempts=0;
for(const item of pending){const prior:any=finished.get(item.snapshotId);if(prior&&(prior.status!=='B_VALID_RELABELLED'||fs.existsSync(path.join(OUT,'candidate_rows',prior.file))))continue;if(attempts>=maxRows||Date.now()-started>4*3600000)break;
 const {meta,pro,state}=item,before=Date.now(),result:any={snapshotId:item.snapshotId,episodeId:meta.id,planId:meta.planId,mapName:meta.mapName,stepIndex:pro.stepIndex,sourceSnapshot:item.sourceSnapshot};
 try{
  if(pro.sourceRecordSha256!==meta.recordSha256)throw Error('原局逐记录哈希不一致');
  if(computeStateHash(state)!==item.oldStateHash)throw Error('完整历史状态哈希不一致');
  if(state.metadata?.apkMapName!==meta.mapName||state.metadata?.sdTrainingPlanId!==meta.planId)throw Error('场景来源错位');
  const e=readEpisode(meta),step=e.steps[pro.stepIndex];
  if(!step||state.turn!==step.turnBefore||state.currentPlayer!==step.playerId)throw Error('完整状态与原始步骤锚点不一致');
  const row=encodeAndLabel(state);
  // 未记录真实派生父局时，保守按整张地图合并；同地图所有课程、种子和相邻状态不跨集。
  const familyId=`legacy-map:${meta.mapName}`;
  const provenance={sourceEpisode:meta.id,sourceFile:meta.file,sourceFileSha256:assets.find((a:any)=>a.kind==='raw_episode'&&a.name===meta.file).sha256,sourceRecordSha256:meta.recordSha256,sourceLineIndex:meta.lineIndex,sourceStep:pro.stepIndex,sourceSnapshot:item.sourceSnapshot,sourceSnapshotFileSha256:item.sourceSnapshotFileSha256,sourceSnapshotRecordSha256:item.sourceSnapshotRecordSha256,originalStateHash:item.oldStateHash,freezeIdentity,initializationPolicy:'legacy-no-initial-income-v1',recoveryMethod:'historical_full_snapshot_independently_validated_and_relabelled',historicalFullReplayPassedUnderCurrentRules:false,eligibleForCurrentNormalOpening:false,category:'B',familyId,scenarioId:meta.scenarioId,mapName:meta.mapName,planId:meta.planId,seed:meta.seed,oldLabelsUsed:false,independentAcceptanceEligible:false};
  const file=sha(item.snapshotId)+'.json';fs.writeFileSync(path.join(OUT,'candidate_rows',file),JSON.stringify({...row,provenance,sampleId:item.snapshotId,gameId:familyId,mapName:meta.mapName,stepIndex:pro.stepIndex}));
  Object.assign(result,{status:'B_VALID_RELABELLED',file,inputHash:row.inputHash,stateHash:row.stateHash,targetActionIndex:row.targetActionIndex,familyId,candidateCount:row.candidateActions.length});
 }catch(err){Object.assign(result,{status:'QUARANTINE',error:String(err)});}
 result.elapsedMs=Date.now()-before;
 if(prior){if(prior.status!==result.status||prior.inputHash!==result.inputHash||prior.stateHash!==result.stateHash||prior.targetActionIndex!==result.targetActionIndex)throw Error('断点重建与已验证身份不符');}
 else fs.appendFileSync(resultsFile,JSON.stringify(result)+'\n');
 finished.set(item.snapshotId,result);attempts++;if(attempts%50===0)console.log(JSON.stringify({attempts,total:pending.length,elapsedMs:Date.now()-started}));
}
verifyFreeze();console.log(JSON.stringify({complete:finished.size===pending.length,processed:finished.size,total:pending.length,elapsedMs:Date.now()-started}));
