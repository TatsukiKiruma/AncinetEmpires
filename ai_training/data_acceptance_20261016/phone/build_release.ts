import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectAndRead, confinedFile, type Admission } from './compact_reader';

// 只发布紧凑来源层索引；网络schema与训练授权始终保持关闭。
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const snapshot='snapshot_20261016_001729';
const full=path.join(here,'full_v6');
const final=process.argv.includes('--final');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const jsonl=(p:string)=>fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(v=>JSON.parse(v));
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function requireThat(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
const disk=fs.statfsSync(repo);requireThat(disk.bavail*disk.bsize>=12*1024**3,'磁盘水位不足，只停止自身发布');
function allocated(dir:string):number{
  let size=0;
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,item.name);if(item.isDirectory())size+=allocated(p);else size+=fs.lstatSync(p).size;
  }return size;
}
requireThat(allocated(path.dirname(here))<1.25*1024**3,'本研究累计输出已达1.25GiB，只停止自身发布');
const identity=read(path.join(full,'source-identity.json'));
for(const [file,digest] of Object.entries(identity.source))requireThat(sha(fs.readFileSync(path.join(repo,file)))===digest,`冻结源码变化：${file}`);
const inputHashes:Record<string,string>={};
function bind(file:string,expected?:string){
  const relative=path.relative(repo,path.resolve(here,file));
  const absolute=confinedFile(repo,relative),digest=sha(fs.readFileSync(absolute));
  requireThat(!expected||digest===expected,`输入SHA不匹配：${file}`);inputHashes[relative.replaceAll('\\','/')]=digest;
}
bind('endpoints/delivery-manifest.json');
for(const item of read(path.join(here,'endpoints/delivery-manifest.json')).files)bind('endpoints/'+item.file,item.sha256);
const endpointIdentity=read(path.join(here,'endpoints/source-identity.json'));
for(const [file,digest] of Object.entries(endpointIdentity.files))bind(path.relative(here,path.resolve(repo,file)),digest as string);
const bucketSummary=read(path.join(here,'endpoints/bucket-summary.json'));
requireThat(bucketSummary.passed&&bucketSummary.parents===3000,'人数配置分桶未通过');
for(const [file,digest] of Object.entries(bucketSummary.sourceSha256))bind(path.relative(here,path.resolve(repo,file)),digest as string);
const snapshotSummary=read(path.join(here,snapshot,'summary.json'));
for(const item of snapshotSummary.source_identity)bind(snapshot+'/'+item.copy,item.sha256);
const cyclePolicy=read(path.join(here,snapshot,'08_stalemate-policy.json'));
const cycleCutoffs=new Map<string,number>();
for(const [id,item] of Object.entries(cyclePolicy.confirmed) as [string,any][]){
  requireThat(item.details.confirmed===true&&item.details.natural_end===false&&item.details.outcome_label_eligible===false&&Number.isInteger(item.details.first_global_index),'循环隔离政策证据异常');
  cycleCutoffs.set(id,item.details.first_global_index);
}
const endpointSummary=read(path.join(here,'endpoints/audit-summary.json'));
requireThat(endpointSummary.snapshot===snapshot&&endpointSummary.allEndpointsAndLinksAccepted,'端点审计未覆盖冻结快照');
const endpoints=jsonl(path.join(here,'endpoints/segment-receipts.jsonl'));
const parents=jsonl(path.join(here,'endpoints/parent-outcomes.jsonl'));
const bucketsFile=path.join(here,'endpoints/parent-buckets.jsonl');
requireThat(fs.existsSync(bucketsFile),'缺少实际人数和配置模式分桶');
const buckets=new Map(jsonl(bucketsFile).map(v=>[v.parentId,v]));
const catalog=new Map(read(path.join(here,snapshot,'00_dataset-3000-index.json')).games.map((v:any)=>[v.id,v]));
const byParent=new Map<string,any[]>();
const records=new Map<string,any>();
requireThat(new Set(endpoints.map(e=>e.id)).size===endpoints.length,'重复分段ID');
requireThat(new Set(parents.map(p=>p.parentId)).size===parents.length&&buckets.size===parents.length,'重复或缺失父局ID');
requireThat(catalog.size===3000,'catalog父局数量异常');
for(const parent of parents){
  const b=buckets.get(parent.parentId),c:any=catalog.get(parent.parentId);
  requireThat(b&&c&&b.configSha256===parent.configSha256&&b.planId===c.planId&&b.planKind===c.planKind,'父局配置/计划分桶不一致');
  const config='full_v6/configs/'+parent.parentId+'.bin';
  if(final||fs.existsSync(path.join(here,config)))bind(config,b.configSha256);
}
for(const endpoint of endpoints){
  requireThat(endpoint.endpointAndLinkAccepted,`未通过端点：${endpoint.id}`);
  requireThat(buckets.get(endpoint.parentId)?.configSha256===endpoint.configSha256,'配置身份与人数分桶不一致');
  const group=byParent.get(endpoint.parentId)??[];group.push(endpoint);byParent.set(endpoint.parentId,group);
  const file=path.join(full,'receipts',endpoint.id+'.json');
  if(!fs.existsSync(file))continue;
  const r=read(file);
  requireThat(r.id===endpoint.id&&r.parentId===endpoint.parentId&&r.kind===endpoint.kind,'收据身份与端点不匹配');
  requireThat(r.sourceIdentity===identity.sourceId,'跨源码身份收据不得合并');
  requireThat(r.summary.expectedActions===endpoint.actions,'动作范围与固定端点不匹配');
  const count=r.summary.checkedMacros;
  requireThat(Number.isInteger(count)&&count>=0&&count<=endpoint.actions,'已闭合宏步数异常');
  requireThat(r.summary.maxAdmissibleGlobalMacroExclusive===endpoint.globalOffset+count,'宏步截止点异常');
  if(count>0||r.summary.transitionAccepted){
    requireThat(r.initialHash===endpoint.initialSha256&&r.finalHash===endpoint.finalSha256,'原生端点SHA与转换收据不一致');
    requireThat(r.summary.frameCount===endpoint.actions&&r.summary.observedActions===endpoint.actions,'已放行前缀缺完整输入帧边界');
    requireThat(r.summary.nativeWinner===endpoint.nativeH,'原生赢家投影不一致');
    requireThat(r.summary.projectedCandidateSetsCompared&&!r.summary.nativeJavaCandidateOracleCompared,'候选检查合同缺失');
  }
  if(r.summary.transitionAccepted)requireThat(!r.failure&&count===endpoint.actions&&r.finalSemanticHash===r.projectFinalSemanticHash,'完整转移资格与末态矛盾');
  records.set(endpoint.id,r);
}
requireThat(parents.length===3000&&endpoints.length===5012,'固定来源计数变化');
if(final)requireThat(records.size===endpoints.length,'还有未处理分段，不能发布最终全量收据');
if(final){
  const runs=fs.readdirSync(full).filter(n=>/^run-summary-.*\.json$/.test(n));
  const completed=runs.find(n=>{const r=read(path.join(full,n));return r.source_stable===true&&r.source_id===identity.sourceId&&r.all_requested_processed===true&&r.processed===endpoints.length;});
  if(completed)bind('full_v6/'+completed);
  // 各段已独立封存；合并以逐段覆盖和原始归档身份为凭，不重复读取已完成的states。
  for(const producer of fs.readdirSync(here).filter(n=>n==='full_v6'||/^shard_[a-z]_v6$/.test(n))){
    const file=path.join(here,producer,'source-identity.json');if(!fs.existsSync(file))continue;
    const source=read(file);
    requireThat(source.sourceId===identity.sourceId&&Object.keys(source.source).length===Object.keys(identity.source).length&&Object.entries(identity.source).every(([p,h])=>source.source[p]===h),'生产分片使用了不同冻结源码');
    bind(producer+'/source-identity.json');
    for(const name of fs.readdirSync(path.join(here,producer,'configs')).filter(n=>n.endsWith('.bin'))){
      const bucket=buckets.get(name.slice(0,-4));requireThat(bucket,'生产配置没有对应父局');
      bind(producer+'/configs/'+name,bucket.configSha256);
    }
    for(const name of fs.readdirSync(path.join(here,producer)).filter(n=>/^resource-execution-.*\.json$/.test(n))){
      const run=read(path.join(here,producer,name));
      requireThat(run.sourceStable&&run.baselineSourceIdentity===identity.sourceId&&run.resourceLimitBytes===1.25*1024**3&&run.cFreeBytesMin===12*1024**3,'资源派生执行尚未结束或身份不稳定');
      const driver=run.driverFile??'run_resource_budget.py';
      requireThat(['run_resource_budget.py','run_resource_budget_pending.py'].includes(driver),'未登记的资源派生器');
      requireThat(run.frozenDriverSha256===sha(fs.readFileSync(path.join(here,'run_phone.py')))&&run.resourceDriverSha256===sha(fs.readFileSync(path.join(here,driver))),'资源派生源码身份变化');
      for(const [file,digest] of Object.entries(run.newReceiptHashes))bind(producer+'/receipts/'+file,digest as string);
      for(const [file,digest] of Object.entries(run.skippedSealedReceiptHashes??{}))bind(producer+'/receipts/'+file,digest as string);
      bind(producer+'/'+name);
      bind(driver);
    }
    for(const name of fs.readdirSync(path.join(here,producer)).filter(n=>/^run-summary-.*\.json$/.test(n))){
      const run=read(path.join(here,producer,name));
      requireThat(run.source_stable===true&&run.source_id===identity.sourceId,'生产批次结束时源码身份不稳定');
      bind(producer+'/'+name);
    }
  }
  const archiveReports=fs.readdirSync(here).filter(n=>/^archive-integrity-.*\.json$/.test(n)).sort().reverse();
  const verified=archiveReports.find(n=>{const r=read(path.join(here,n));return r.accepted&&r.snapshot===snapshot&&r.endpointSourceId===endpointSummary.sourceId&&r.archives.length===endpointSummary.archives.length&&r.archives.every((a:any)=>typeof a.mtimeNs==='string');});
  requireThat(verified,'缺少已绑定端点身份的全部归档SHA复核');bind(verified);
  const report=read(path.join(here,verified));
  const archiveLookup=new Map(endpointSummary.archives.map((a:any)=>[a.archive,a]));
  for(const archive of report.archives){
    const expected:any=archiveLookup.get(archive.archive),stat=fs.statSync(confinedFile(repo,archive.archive),{bigint:true});
    requireThat(expected&&archive.sha256===expected.sha256&&archive.bytes===expected.bytes&&stat.size===BigInt(archive.bytes)&&stat.mtimeNs===BigInt(archive.mtimeNs),'封存归档在SHA复核后发生变化');
  }
}
const parentValues=new Map<string,boolean>();
for(const parent of parents){
  const group=byParent.get(parent.parentId)!;
  group.sort((a,b)=>a.globalOffset-b.globalOffset);
  requireThat(group[0].globalOffset===0,'父局缺原始起点');
  let offset=0,previous:string|null=null;
  for(const e of group){
    requireThat(e.globalOffset===offset&&(previous===null||e.initialSha256===previous),'端点组不连续');
    offset=e.globalEnd;previous=e.finalSha256;
  }
  requireThat(offset===parent.globalActions&&previous===parent.finalSha256,'父局最终端点不符');
  const allStrict=group.every(e=>records.get(e.id)?.summary.transitionAccepted===true);
  parentValues.set(parent.parentId,parent.endpointAndLineageAccepted&&parent.outcome==='natural_terminal'&&allStrict&&group.at(-1)!.nativeH===parent.nativeWinnerAlliance);
}
const parentLookup=new Map(parents.map(p=>[p.parentId,p]));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const published=path.join(here,(final?'release-':'checkpoint-')+stamp);
const out=published+'.partial';
fs.mkdirSync(out);
fs.mkdirSync(path.join(out,'parent_values'));
const valueEvidence=new Map<string,{path:string;sha256:string}>();
for(const parent of parents)if(parentValues.get(parent.parentId)){
  const name=`parent_values/${parent.parentId}.json`;
  const evidence={parentId:parent.parentId,sourceIdentity:identity.sourceId,
    endpointSourceIdentity:endpointSummary.sourceId,nativeWinningAllianceId:parent.nativeWinnerAlliance,
    outcomeKind:parent.outcome,allSegmentsStrict:true,segmentIds:byParent.get(parent.parentId)!.map(e=>e.id),
    finalNativeSha256:parent.finalSha256,globalActions:parent.globalActions,
    segmentReceiptHashes:byParent.get(parent.parentId)!.map(e=>({id:e.id,sha256:sha(fs.readFileSync(path.join(full,'receipts',e.id+'.json')))}))};
  const bytes=JSON.stringify(evidence)+'\n';fs.writeFileSync(path.join(out,name),bytes);
  valueEvidence.set(parent.parentId,{path:path.relative(here,path.join(published,name)).replaceAll('\\','/'),sha256:sha(bytes)});
}
const index=fs.openSync(path.join(out,'release-index.jsonl'),'wx');
const pending=fs.openSync(path.join(out,'pending.jsonl'),'wx');
const failures:Record<string,number>={},bucketTotals:Record<string,any>={};
const parentStats=new Map(parents.map(p=>[p.parentId,{parentId:p.parentId,
  plannedSegments:byParent.get(p.parentId)!.length,processedSegments:0,fullSegments:0,policyLabelMacros:0,
  policyLabelAtoms:0,valueLabelAtoms:0,quarantinedMacroTail:0,outcomeKind:p.outcome,
  configuredPlayerCount:buckets.get(p.parentId).configuredPlayerCount,configMode:buckets.get(p.parentId).configMode}]));
let macros=0,atoms=0,fullSegments=0,prefixSegments=0,zeroSegments=0,valueAtoms=0,cycleExcluded=0,shardBytes=0;
try{
  for(const endpoint of endpoints){
    const parent=parentLookup.get(endpoint.parentId)!,bucket=buckets.get(endpoint.parentId);
    requireThat(bucket,`缺少父局分桶：${endpoint.parentId}`);
    const r=records.get(endpoint.id);
    if(!r){fs.writeSync(pending,JSON.stringify({segmentId:endpoint.id,parentId:endpoint.parentId,reason:'PENDING_UNPROCESSED',assignedPartition:'pending'})+'\n');continue;}
    let cutoff=r.summary.maxAdmissibleGlobalMacroExclusive;
    // 只排除已有证据确认的循环尾部，不把停止或长局推断为平局。
    if(cycleCutoffs.has(endpoint.parentId)){
      const reduced=Math.max(endpoint.globalOffset,Math.min(cutoff,cycleCutoffs.get(endpoint.parentId)!));
      cycleExcluded+=cutoff-reduced;cutoff=reduced;
    }
    const eligible=cutoff>endpoint.globalOffset;
    const shard=path.relative(here,path.resolve(full,r.candidateShard)).replaceAll('\\','/');
    const shardFile=confinedFile(here,shard);
    const entry:Admission={segmentId:endpoint.id,parentId:endpoint.parentId,
      receipt:`full_v6/receipts/${endpoint.id}.json`,candidateShard:shard,shardSha256:sha(fs.readFileSync(shardFile)),
      inputHash:r.inputHash,sourceIdentity:r.sourceIdentity,globalOffset:endpoint.globalOffset,
      maxGlobalMacroExclusive:cutoff,policyLabelEligible:eligible,modelSchemaAccepted:false,
      valueEligible:eligible&&parentValues.get(endpoint.parentId)===true,returnEligible:false,
      nativeWinningAllianceId:parent.nativeWinnerAlliance,outcomeKind:parent.outcome,
      ...(eligible&&parentValues.get(endpoint.parentId)?{valueEvidence:valueEvidence.get(endpoint.parentId)}:{})};
    const inspected=await inspectAndRead(here,{...entry,...(entry.valueEvidence?{
      valueEvidence:{...entry.valueEvidence,path:entry.valueEvidence.path.replace(path.basename(published)+'/',path.basename(out)+'/')}}:{})});
    macros+=inspected.admittedMacros;atoms+=inspected.admittedAtoms;
    if(entry.valueEligible)valueAtoms+=inspected.admittedAtoms;
    shardBytes+=fs.statSync(shardFile).size;
    const category=r.failure?.category??'none';failures[category]=(failures[category]??0)+1;
    if(r.summary.transitionAccepted)fullSegments++;else if(eligible)prefixSegments++;else zeroSegments++;
    const parentStat=parentStats.get(endpoint.parentId)!;
    parentStat.processedSegments++;if(r.summary.transitionAccepted)parentStat.fullSegments++;
    parentStat.policyLabelMacros+=inspected.admittedMacros;parentStat.policyLabelAtoms+=inspected.admittedAtoms;
    if(entry.valueEligible)parentStat.valueLabelAtoms+=inspected.admittedAtoms;
    parentStat.quarantinedMacroTail+=endpoint.globalEnd-cutoff;
    const c:any=catalog.get(endpoint.parentId);
    const bucketKey=JSON.stringify({map:parent.map,plan:c.planId,kind:c.planKind,actualPlayers:bucket.configuredPlayerCount,mode:bucket.configMode});
    const total=bucketTotals[bucketKey]??={segments:0,full:0,prefix:0,zero:0,macros:0,atoms:0,valueAtoms:0};
    total.segments++;total[r.summary.transitionAccepted?'full':eligible?'prefix':'zero']++;
    total.macros+=inspected.admittedMacros;total.atoms+=inspected.admittedAtoms;if(entry.valueEligible)total.valueAtoms+=inspected.admittedAtoms;
    fs.writeSync(index,JSON.stringify({...entry,assignedPartition:eligible?'train':'quarantine',policyGateSatisfied:false,
      trainingAuthorized:false,nativeEndpointAndLineageAccepted:true,transitionAccepted:r.summary.transitionAccepted,
      nativeJavaCandidateOracleCompared:false,projectedCandidateSetsCompared:true,
      admittedMacros:inspected.admittedMacros,admittedAtoms:inspected.admittedAtoms,
      quarantinedMacroTail:endpoint.globalEnd-cutoff,failureCategory:r.failure?.category??null,
      actualBucket:bucket,map:parent.map,planId:c.planId,planKind:c.planKind,
      independentNativeQuery:false,labelOrigin:'native_macro_commitment',observationConvention:'continuous-ts-chain-v1',
      informationScope:'受限规则语义规范化；不代表原生网络观察完全相等；续段各自由其已验原生初态重建'})+'\n');
  }
}finally{fs.closeSync(index);fs.closeSync(pending);}
const parentRows=[...parentStats.values()].map(s=>({...s,
  allSegmentsProcessed:s.processedSegments===s.plannedSegments,
  fullyStrict:s.processedSegments===s.plannedSegments&&s.fullSegments===s.plannedSegments,
  valueEligible:parentValues.get(s.parentId),modelSchemaAccepted:false,returnEligible:false,
  assignedQualifiedPartition:s.policyLabelMacros>0?'train':s.processedSegments===s.plannedSegments?'quarantine':'pending'}));
fs.writeFileSync(path.join(out,'parent-acceptance.jsonl'),parentRows.map(r=>JSON.stringify(r)).join('\n')+'\n');
const coverage={basis:'union-of-sealed-segment-receipts-v1',snapshot,requestedSegments:endpoints.length,
  processedSegments:records.size,allRequestedProcessed:records.size===endpoints.length,
  sourceIdentity:identity.sourceId,archiveIdentityVerified:final,fullCompactIntegrityVerified:true,
  duplicateResumeScanRequired:false,trainingStarted:false,
  receipts:Object.fromEntries([...records].map(([id])=>[id,sha(fs.readFileSync(path.join(full,'receipts',id+'.json')))]))};
fs.writeFileSync(path.join(out,'union-completion.json'),JSON.stringify(coverage,null,2)+'\n');
for(const [file,digest] of Object.entries(identity.source))requireThat(sha(fs.readFileSync(path.join(repo,file)))===digest,`汇总期间冻结源码变化：${file}`);
for(const [file,digest] of Object.entries(inputHashes))requireThat(sha(fs.readFileSync(confinedFile(repo,file)))===digest,`汇总期间输入变化：${file}`);
const summary={schema:'native-source-label-release-v1',createdAt:new Date().toISOString(),snapshot,
  snapshotObservedAt:endpointSummary.snapshotObservedAt,requestedParents:parents.length,requestedSegments:endpoints.length,
  processedSegments:records.size,allRequestedProcessed:records.size===endpoints.length,finalRelease:final,
  sourceStable:true,sourceIdentity:identity.sourceId,endpointSourceIdentity:endpointSummary.sourceId,
  fullSegments,prefixSegments,zeroSegments,pendingSegments:endpoints.length-records.size,
  fullyStrictParents:parentRows.filter(p=>p.fullyStrict).length,
  policyLabelParents:parentRows.filter(p=>p.policyLabelMacros>0).length,
  firstProductTwoPlayerSD:{parents:parentRows.filter(p=>p.configuredPlayerCount===2&&p.configMode==='SD'&&p.policyLabelMacros>0).length,
    macros:parentRows.filter(p=>p.configuredPlayerCount===2&&p.configMode==='SD').reduce((n,p)=>n+p.policyLabelMacros,0),
    atoms:parentRows.filter(p=>p.configuredPlayerCount===2&&p.configMode==='SD').reduce((n,p)=>n+p.policyLabelAtoms,0),
    valueAtoms:parentRows.filter(p=>p.configuredPlayerCount===2&&p.configMode==='SD').reduce((n,p)=>n+p.valueLabelAtoms,0)},
  policyLabelMacros:macros,policyLabelAtoms:atoms,valueLabelAtoms:valueAtoms,
  valueEligibleParents:[...parentValues.values()].filter(Boolean).length,returnEligible:false,
  confirmedCycleExcludedMacros:cycleExcluded,candidateShardBytes:shardBytes,
  assignedQualifiedPartition:'train',existingTrainHoldout:false,trainingStarted:false,trainingAuthorized:false,
  modelSchemaAccepted:false,policyGateSatisfied:false,nativeJavaCandidateOracleCompared:false,
  compactIntegrity:'全部已处理gzip/CRC/SHA/头尾/原子摘要链/候选索引/宏组完整性及权重通过',
  failureCategories:failures,buckets:bucketTotals,
  independentEvaluation:'另备全新父局协议，本轮未生成或运行'};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({snapshot,
  inputHashes,
  parentValueEvidence:Object.fromEntries([...valueEvidence].map(([id,e])=>[id,e.sha256])),
  artifacts:Object.fromEntries(['release-index.jsonl','pending.jsonl','summary.json','parent-acceptance.jsonl','union-completion.json'].map(n=>[n,sha(fs.readFileSync(path.join(out,n)))])),
  tools:Object.fromEntries(['build_release.ts','compact_reader.ts'].map(n=>[n,sha(fs.readFileSync(path.join(here,n)))]))},null,2)+'\n');
requireThat(allocated(path.dirname(here))<=1.25*1024**3,'发布累计输出超过1.25GiB，保留未发布暂存目录');
fs.renameSync(out,published);
console.log(JSON.stringify({out:path.relative(repo,published),...Object.fromEntries(Object.entries(summary).filter(([k])=>k!=='buckets'))}));
