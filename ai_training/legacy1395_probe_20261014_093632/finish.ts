import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readEpisode,makeEnv,sha,encodeAndLabel,verifyFreeze} from '../legacy2500_recovery_20261014_090431/recovery_core';
import {computeNetworkInputHash,computeStateHash,canonicalize} from '../legacy2500_recovery_20261014_090431/frozen/research/state_hash';
const out=path.dirname(fileURLToPath(import.meta.url)),prior=path.resolve(out,'../legacy2500_recovery_20261014_090431');
const read=(f:string)=>JSON.parse(fs.readFileSync(path.join(out,f),'utf8'));
const save=(f:string,v:any)=>fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2));
const selection=read('initial_probe.json'),results=fs.readFileSync(path.join(out,'replay_results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const cacheFiles=fs.readdirSync(out).filter(f=>/^rows_[0-9a-f]+\.jsonl$/.test(f));
const candidates=cacheFiles.flatMap(f=>fs.readFileSync(path.join(out,f),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
const initialRecovery=[];
for(const r of results.filter((r:any)=>r.verifiedTransitions===0)){const meta=selection.find((m:any)=>m.id===r.id);if(!meta.modes[1].matches)throw Error('初态身份未证实');try{const state=makeEnv(readEpisode(meta),true).reset(meta.seed).state,row=encodeAndLabel(state);candidates.push({...row,provenance:{sourceEpisode:r.id,sourceRecordSha256:meta.recordSha256,sourceStep:0,mapName:meta.mapName,planId:meta.planId,familyId:'legacy-map:'+meta.mapName,freezeIdentity:r.freezeIdentity,codecIdentity:r.codecIdentity,recoveryMethod:'verified-initial-state-only-current-relabel',initialization:'legacy-no-initial-income-v1',fullTrajectoryPassed:false,verifiedPrefixTransitions:0,oldLabelsUsed:false,independentAcceptanceEligible:false}});initialRecovery.push({id:r.id,status:'STATE_VALID_CURRENT_RELABEL',inputHash:row.inputHash});}catch(e){initialRecovery.push({id:r.id,status:'REJECT',error:String(e)});}}
save('initial_state_recovery.json',initialRecovery);
const groups=new Map<string,any[]>();for(const row of candidates){if(computeNetworkInputHash(row)!==row.inputHash||computeStateHash(row.stateJson)!==row.stateHash)throw Error('输入或状态身份变化');const g=groups.get(row.inputHash)??[];g.push(row);groups.set(row.inputHash,g);}
const oldRows=['train','validation'].flatMap(split=>fs.readFileSync(path.join(prior,'package',split+'.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
const oldInputs=new Set(oldRows.map(r=>r.inputHash)),priorVal=new Set(JSON.parse(fs.readFileSync(path.join(prior,'dedup_leakage.json'),'utf8')).validationFamilies);
const excluded=[],accepted=[];
for(const [inputHash,rows] of groups){const mechanics=new Set(rows.map(r=>{const state={...r.stateJson};delete state.metadata;return sha(canonicalize(state));})),targets=new Set(rows.map(r=>r.targetActionIndex));
 if(mechanics.size>1||targets.size>1){excluded.push({inputHash,reason:targets.size>1?'label_conflict':'non_metadata_encoding_collision',sourceEpisodes:rows.map(r=>r.provenance.sourceEpisode)});continue;}
 if(oldInputs.has(inputHash)){excluded.push({inputHash,reason:'already_in_prior_candidate_package',sourceEpisodes:rows.map(r=>r.provenance.sourceEpisode)});continue;}
 const r={...rows[0],allProvenance:rows.map(r=>r.provenance),stateIdentities:rows.map(r=>({stateHash:r.stateHash,provenance:r.provenance})),split:priorVal.has(rows[0].provenance.familyId)?'validation':'train',valueLossMask:false,valueTarget:null};
 const fresh=encodeAndLabel(r.stateJson);if(fresh.inputHash!==r.inputHash||fresh.targetActionIndex!==r.targetActionIndex)throw Error('重新编码/教师复验失败');accepted.push(r);
}
const pkg=path.join(out,'package');fs.mkdirSync(pkg,{recursive:true});
for(const split of ['train','validation']){const rows=accepted.filter(r=>r.split===split);fs.writeFileSync(path.join(pkg,split+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':''));}
const pass=results.filter((r:any)=>r.status==='STRICT_TRAJECTORY_PASS');
const summary={sampledEpisodes:results.length,maps:8,initialHashPass:selection.filter((m:any)=>m.modes[1].matches).length,strictFullPass:pass.length,strictFullPassEpisodes:pass.map((r:any)=>({id:r.id,steps:r.verifiedTransitions,naturalWinner:r.naturalWinner,timeout:r.timeout})),initialLegalFailure:results.filter((r:any)=>r.verifiedTransitions===0).length,laterFailure:results.filter((r:any)=>r.status==='STRICT_TRAJECTORY_FAIL'&&r.verifiedTransitions>0).length,totalVerifiedTransitions:results.reduce((s:number,r:any)=>s+r.verifiedTransitions,0),rawIndependentRows:candidates.length,newUniqueInputs:accepted.length,train:accepted.filter(r=>r.split==='train').length,validation:accepted.filter(r=>r.split==='validation').length,newSourceEpisodes:new Set(accepted.flatMap(r=>r.allProvenance.map((p:any)=>p.sourceEpisode))).size,excluded,elapsedReplayMs:results.reduce((s:number,r:any)=>s+r.elapsedMs,0),freezeIdentity:verifyFreeze(),initialization:'legacy-no-initial-income-v1',oldEpisodeObservationHashModified:false,ruleEngineModified:false,networkSchema:'spatial34_global20_actionSemantics53_v19',teacher:'R7冻结HeuristicAI；每状态一次getAction，输入hash固定随机种子，无额外外部rollout',priorPackageOverlapAfterExclusion:0,crossTaskR7Dedup:'尚未完成跨任务去重；本补充包不自动接入R7',splitPolicy:'沿用上一包地图家族划分；Duel等原包缺失地图归训练',notIndependentAcceptance:true,files:['train.jsonl','validation.jsonl'].map(file=>({file,bytes:fs.statSync(path.join(pkg,file)).size,sha256:sha(fs.readFileSync(path.join(pkg,file)))}))};
save('package/manifest.json',summary);
save('storage_decision.json',{decision:'保留1395局原始轨迹和压缩归档',reason:'48局中48局初态可可靠对齐、5局严格全轨迹通过，且多局前缀可提取独立有效状态；不能判为无法恢复且无价值',historicalFilesDeleted:[],newCacheDeleted:[],rule:'本轮只清理自己生成且已核验并入包的可再生逐行文件；不递归、不穿过junction',freeBytesAtStart:32766943232});
console.log(JSON.stringify(summary));
