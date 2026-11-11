import fs from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {OUT,ROOT,sha,verifyFreeze} from './recovery_core';
import {computeNetworkInputHash,computeStateHash} from './frozen/research/state_hash';
const read=(f:string)=>JSON.parse(fs.readFileSync(path.join(OUT,f),'utf8'));
const lines=(f:string)=>fs.readFileSync(path.join(OUT,f),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const save=(f:string,v:any)=>fs.writeFileSync(path.join(OUT,f),JSON.stringify(v,null,2));
const freezeIdentity=verifyFreeze(),results=lines('snapshot_results.jsonl'),post=read('post_validation.json'),postPassed=new Set(post.results.filter((r:any)=>r.passed).map((r:any)=>r.snapshotId));
const validatedSourceEpisodes=new Set(results.filter((r:any)=>r.status==='B_VALID_RELABELLED'&&postPassed.has(r.snapshotId)).map((r:any)=>r.episodeId));
const groups=new Map<string,any[]>();
for(const result of results){if(result.status!=='B_VALID_RELABELLED'||!postPassed.has(result.snapshotId))continue;const row=read('candidate_rows/'+result.file);row.teacher.budget='单次 getAction，完整合法候选；保留教师原生内部评估，不追加外部rollout';if(computeNetworkInputHash(row)!==row.inputHash||computeStateHash(row.stateJson)!==row.stateHash)throw Error('候选行身份失败');if(row.provenance.freezeIdentity!==freezeIdentity)throw Error('冻结合同错位');const g=groups.get(row.inputHash)??[];g.push(row);groups.set(row.inputHash,g);}
const duplicates=[],collisions=[],conflicts=[],accepted=[];
const parent=new Map<string,string>();
function find(x:string):string{if(!parent.has(x))parent.set(x,x);if(parent.get(x)!==x)parent.set(x,find(parent.get(x)!));return parent.get(x)!;}
function union(a:string,b:string){a=find(a);b=find(b);if(a!==b)parent.set(a<b?b:a,a<b?a:b);}
for(const [inputHash,rows] of groups){const stateHashes=[...new Set(rows.map(r=>r.stateHash))],targets=[...new Set(rows.map(r=>r.targetActionIndex))];const brief={inputHash,snapshotIds:rows.map(r=>r.sampleId),stateHashes,targets};
 if(rows.length>1)duplicates.push(brief);
 if(stateHashes.length>1){const paths=new Set<string>();
  function diff(a:any,b:any,p:string){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p?p+'.'+k:k);}else paths.add(p);}
  for(const row of rows.slice(1))diff(rows[0].stateJson,row.stateJson,'');
  const metadataOnly=[...paths].every(p=>p.startsWith('metadata.'));
  collisions.push({...brief,differentStatePaths:[...paths],metadataOnly,quarantined:!metadataOnly,meaning:'不同完整状态映射为相同真实网络输入；非纯元数据差异隔离，不能等同SHA碰撞'});
  if(!metadataOnly)continue;
 }
 if(targets.length>1){conflicts.push(brief);continue;}
 const family=rows[0].provenance.familyId;for(const row of rows)union(family,row.provenance.familyId);
 accepted.push({...rows[0],allProvenance:rows.map(r=>r.provenance),allStateHashes:stateHashes});
}
const roots=[...new Set(accepted.map(r=>find(r.provenance.familyId)))].sort((a,b)=>sha(a).localeCompare(sha(b)));
const valRoots=new Set(roots.slice(0,Math.max(1,Math.floor(roots.length*.2))));
const packageDir=path.join(OUT,'package');fs.mkdirSync(packageDir,{recursive:true});
const train=[],validation=[],stateIndex=[];
for(const row of accepted){row.familyId=find(row.provenance.familyId);row.split=valRoots.has(row.familyId)?'validation':'train';(row.split==='train'?train:validation).push(row);
 for(const stateHash of row.allStateHashes)stateIndex.push({stateHash,inputHash:row.inputHash,representativeSampleId:row.sampleId,sourceRefs:row.allProvenance.filter((p:any)=>p.originalStateHash===stateHash).map((p:any)=>({sourceEpisode:p.sourceEpisode,sourceStep:p.sourceStep,sourceSnapshotRecordSha256:p.sourceSnapshotRecordSha256})),split:row.split,familyId:row.familyId});}
for(const [name,rows] of [['train',train],['validation',validation]] as const)fs.writeFileSync(path.join(packageDir,name+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':''));
fs.writeFileSync(path.join(packageDir,'state_index.jsonl'),stateIndex.map(r=>JSON.stringify(r)).join('\n')+'\n');
const trainHashes=new Set(train.map(r=>r.inputHash)),trainFamilies=new Set(train.map(r=>r.familyId));
if(validation.some(r=>trainHashes.has(r.inputHash)||trainFamilies.has(r.familyId)))throw Error('跨集合泄漏');
const provenanceIndex=new Map<string,any>();
for(const row of accepted)for(const p of row.allProvenance){const summary=provenanceIndex.get(p.sourceEpisode)??{rows:0,inputHashes:new Set(),splits:new Set()};summary.rows++;summary.inputHashes.add(row.inputHash);summary.splits.add(row.split);provenanceIndex.set(p.sourceEpisode,summary);}
for(const record of provenanceIndex.values())if(record.splits.size!==1)throw Error('原始对局跨集');
const replay=lines('replay_results.jsonl'),index=lines('episode_index.jsonl'),byId=new Map(replay.map((r:any)=>[r.id,r]));
const finalEpisodes=index.map((e:any)=>{const audit=byId.get(e.id),p=provenanceIndex.get(e.id);return {...e,category:validatedSourceEpisodes.has(e.id)?'B':audit?.current.status==='PASS'?'A':'D',strictCurrentReplayPassed:audit?.current.status==='PASS',legacyStrictReplayPassed:audit?.legacy?.status==='PASS',failure:audit?.current.error??null,verifiedTransitions:audit?.current.verifiedSteps??0,usableRows:p?.rows??0,uniqueInputs:p?.inputHashes.size??0,split:p?[...p.splits][0]:null,interpretation:p?'仅完整历史快照独立验证与新标注可用，非旧轨迹恢复':validatedSourceEpisodes.has(e.id)?'B：完整状态独立验证通过，但该局所有候选因人口上限编码碰撞隔离，最终发布0行':'D：初态严格检查已失败；进一步旧观测版本适配及状态恢复未完成，不能仅凭哈希不兼容宣布永久不可恢复'};});
fs.writeFileSync(path.join(OUT,'episode_results.jsonl'),finalEpisodes.map(e=>JSON.stringify(e)).join('\n')+'\n');
const oldInventory=read('asset_inventory.json'),archives=read('archive_audit.json'),archivedMembers=new Map();
for(const a of archives.archives)for(const m of a.members)archivedMembers.set(m.path,{archive:a.archive,sha256:m.sha256,bytes:m.bytes,passed:m.passed});
for(const a of oldInventory.assets)if(a.kind==='hashed_feature'){a.expandedExists=a.exists;const m=archivedMembers.get(a.path);a.exists=!!m;a.storage=m?'tar.xz_member':'missing';a.archive=m?.archive;a.hashStatus=m?.passed?'当前逐字节核验通过':'失败';a.actualBytes=m?.bytes??null;}
save('asset_inventory.json',oldInventory);save('missing_assets.json',read('missing_assets.json').filter((r:any)=>r.kind!=='feature'||!archivedMembers.has(r.path)));
const inventory=read('inventory_summary.json');inventory.featureBytes=oldInventory.assets.filter((a:any)=>a.kind==='hashed_feature').reduce((s:number,a:any)=>s+(a.actualBytes??0),0);inventory.featureStorage='三份tar.xz压缩包，未解包落盘';save('inventory_summary.json',inventory);
const byScenario=[];
for(const [file,expected] of Object.entries(oldInventory.expected)){const planId=file.replace('-episodes.jsonl',''),episodes=finalEpisodes.filter((e:any)=>e.file===file),snap=results.filter((r:any)=>r.planId===planId),inputs=new Set<string>();for(const row of accepted)if(row.allProvenance.some((p:any)=>p.planId===planId))inputs.add(row.inputHash);
 byScenario.push({planId,archiveEpisodes:expected,rawEpisodes:episodes.length,missingRawEpisodes:Number(expected)-episodes.length,A:episodes.filter((e:any)=>e.category==='A').length,B:episodes.filter((e:any)=>e.category==='B').length,C:episodes.filter((e:any)=>e.category==='C').length,D:episodes.filter((e:any)=>e.category==='D').length,snapshots:snap.length,uniqueInputs:inputs.size,discardReasons:count(snap.filter((r:any)=>r.status!=='B_VALID_RELABELLED').map((r:any)=>r.error)),recommendedUse:inputs.size?'历史无首次收入课程；新H0策略硬标签；禁用value；非独立验收':'只留档；缺少原始状态或不满足当前入口校验'});}
for(const s of byScenario){s.C=s.missingRawEpisodes;(s as any).encodingCollisionRows=collisions.filter((c:any)=>c.quarantined).flatMap((c:any)=>c.snapshotIds).filter((id:string)=>results.find((r:any)=>r.snapshotId===id)?.planId===s.planId).length;}
save('scenario_report.json',byScenario);
const cross:any={checkedAt:new Date().toISOString(),status:'尚未完成跨任务去重',reason:'R7仍在运行；当前快照不能替代其最终训练清单',files:[],inputOverlaps:[],manifestFiles:[]};
const r7=path.join(ROOT,'ai_training/r7_training_stage_20261014_083500'),data=path.join(r7,'artifacts/data');
if(fs.existsSync(data))for(const f of fs.readdirSync(data).filter(f=>f.endsWith('.jsonl'))){const p=path.join(data,f),before=fs.statSync(p),digest=createHash('sha256');let n=0,parseErrors=0,compared=0,actualBytes=0;
 if(before.size){const stream=fs.createReadStream(p,{end:before.size-1});stream.on('data',chunk=>{digest.update(chunk);actualBytes+=chunk.length;});for await(const line of createInterface({input:stream})){try{const r=JSON.parse(line);n++;const inputHash=r.inputHash??(r.spatial&&r.global&&r.candidateSemantics?computeNetworkInputHash(r):null);if(inputHash){compared++;if(groups.has(inputHash))cross.inputOverlaps.push({file:f,line:n,inputHash});}}catch{parseErrors++;}}}
 const after=fs.statSync(p);cross.files.push({path:path.relative(ROOT,p),boundedPrefixBytes:actualBytes,prefixSha256:digest.digest('hex'),rows:n,compared,parseErrors,stable:before.size===after.size&&before.mtimeMs===after.mtimeMs,note:'固定读取开始时的字节前缀；运行中增长与末行未写完均不冒充最终清单'});}
for(const f of ['configs/dev_manifest.json','configs/final_manifest.json']){const p=path.join(r7,f);if(fs.existsSync(p))cross.manifestFiles.push({path:path.relative(ROOT,p),sha256:sha(fs.readFileSync(p)),kind:'评估登记清单；不包含可供实际输入去重的训练行'});}
save('cross_task_overlap.json',cross);
save('dedup_leakage.json',{numericInputHash:'与R7相同：Float32空间/全局/候选语义字节+有序坐标；不包含教师分数或状态ID',rawValidRows:[...groups.values()].reduce((s,r)=>s+r.length,0),packagedSourceRows:accepted.reduce((s,r)=>s+r.allProvenance.length,0),uniqueInputs:accepted.length,duplicates,encodingCollisions:collisions,conflicts,quarantinedConflictInputs:conflicts.length,quarantinedSemanticCollisionInputs:collisions.filter((c:any)=>c.quarantined).length,trainValidationInputOverlap:0,trainValidationFamilyOverlap:0,sourceEpisodeCrossSplit:0,familyPolicy:'同地图的所有原局/派生课程/种子保守合并；跨地图同输入再合并，避免未记录父局导致泄漏',families:roots,validationFamilies:[...valRoots],crossTaskStatus:cross.status});
save('package/schema.json',{schemaId:'spatial34_global20_actionSemantics53_v19',spatial:{dtype:'float32',shape:[34,20,20],flattenedLength:13600},global:{dtype:'float32',shape:[20]},candidates:{order:'冻结GameEngine.getLegalActions原顺序，与R7一致',actorCoords:'N×2，空坐标[-1,-1]',landingCoords:'N×2',targetCoords:'N×2',semantics:'N×53 float32'},target:'targetActionIndex，固定输入哈希种子的冻结HeuristicAI单次getAction',valueLossMask:false,valueTarget:null,source:'allProvenance保留所有重复来源；stateJson为代表完整状态，allStateHashes及state_index保留状态身份',freezeIdentity,initializationPolicy:'legacy-no-initial-income-v1',eligibleForCurrentNormalOpening:false,independentAcceptanceEligible:false});
const manifest={kind:'legacy2500-independent-candidate-package',version:1,createdAt:new Date().toISOString(),freezeIdentity,encoderSchema:'spatial34_global20_actionSemantics53_v19',ruleVersion:read('freeze_manifest.json').ruleVersion,sourceEpisodes:1395,archiveEpisodes:2500,strictCurrentReplayPass:finalEpisodes.filter((e:any)=>e.category==='A').length,usableSourceEpisodes:provenanceIndex.size,rawValidRows:[...groups.values()].reduce((s,r)=>s+r.length,0),uniqueInputs:accepted.length,train:train.length,validation:validation.length,families:roots.length,categoryCounts:count(finalEpisodes.map((e:any)=>e.category)),missingRawEpisodes:2500-index.length,snapshotsExamined:results.length,snapshotsQuarantined:results.filter((r:any)=>r.status!=='B_VALID_RELABELLED'||!postPassed.has(r.snapshotId)).length,teacher:'R7冻结HeuristicAI；每局面1次getAction；种子由真实输入哈希前32位派生；不使用旧奖励或赢家',crossTaskDedup:cross.status,eligibleForR7AutomaticIngestion:false,trainingStarted:false,sourceRole:'历史课程候选，允许后续独立实验使用；不构成新独立验收集',files:['train.jsonl','validation.jsonl','state_index.jsonl','schema.json'].map(file=>({file,bytes:fs.statSync(path.join(packageDir,file)).size,sha256:sha(fs.readFileSync(path.join(packageDir,file)))}))};
Object.assign(manifest,{independentlyValidSourceEpisodes:validatedSourceEpisodes.size,packagedSourceRows:accepted.reduce((s,r)=>s+r.allProvenance.length,0),quarantinedSemanticCollisionInputs:collisions.filter((c:any)=>c.quarantined).length,archiveCategoryCounts:{A:0,B:validatedSourceEpisodes.size,C:2500-index.length,D:index.length-validatedSourceEpisodes.size},classificationNote:'C仅为缺少原始轨迹的1105局；D含已确定初态不兼容但未完成进一步状态恢复的其余局；B中的2局全部因编码碰撞隔离，最终包来源48局'});
save('package/manifest.json',manifest);console.log(JSON.stringify(manifest));
function count(items:string[]){const counts:any={};for(const k of items)counts[k]=(counts[k]??0)+1;return counts;}
