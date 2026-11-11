import fs from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';

export interface Admission {
  segmentId:string;parentId:string;receipt:string;candidateShard:string;shardSha256:string;
  inputHash:string;sourceIdentity:string;globalOffset:number;maxGlobalMacroExclusive:number;
  policyLabelEligible:boolean;modelSchemaAccepted:false;valueEligible:boolean;returnEligible:false;
  nativeWinningAllianceId:number|null;outcomeKind:string;
  valueEvidence?:{path:string;sha256:string};
}

export function confinedFile(root:string,relative:string):string{
  const resolved=path.resolve(root,relative),boundary=path.resolve(root);
  if(resolved!==boundary&&!resolved.startsWith(boundary+path.sep))throw Error('数据引用越过本研究phone目录');
  const real=fs.realpathSync(resolved),realBoundary=fs.realpathSync(boundary);
  const normalize=(v:string)=>process.platform==='win32'?v.toLowerCase():v;
  if(normalize(real)!==normalize(realBoundary)&&!normalize(real).startsWith(normalize(realBoundary)+path.sep))throw Error('数据引用经链接越过本研究phone目录');
  return resolved;
}

// 使用同一份压缩字节进行预检和发布，损坏尾部或CRC失败时不会先泄漏部分标签。
async function* rows(bytes:Buffer){
  const source=Readable.from([bytes]),unzip=createGunzip();
  const completion=pipeline(source,unzip);completion.catch(()=>{});
  const decoder=new StringDecoder('utf8');let pending='';
  try{
    for await(const chunk of unzip){
      pending+=decoder.write(chunk as Buffer);
      let end:number;
      while((end=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,end);pending=pending.slice(end+1);
        if(line)yield JSON.parse(line);
      }
      if(pending.length>8*1024*1024)throw Error('紧凑分片单行超过内存预算');
    }
    pending+=decoder.end();if(pending)yield JSON.parse(pending);
    await completion;
  }finally{source.destroy();unzip.destroy();await completion.catch(()=>{});}
}

// 失败宏步已写的候选行不能越过收据截止点；每个宏步必须完整且总权重为1。
export async function inspectAndRead(root:string,entry:Admission,emit?:(row:any)=>Promise<void>|void){
  const receipt=JSON.parse(fs.readFileSync(confinedFile(root,entry.receipt),'utf8'));
  if(receipt.inputHash!==entry.inputHash||receipt.sourceIdentity!==entry.sourceIdentity)throw Error('收据身份不匹配');
  const bound=receipt.summary.maxAdmissibleGlobalMacroExclusive;
  if(!Number.isInteger(bound)||entry.maxGlobalMacroExclusive>bound||entry.maxGlobalMacroExclusive<entry.globalOffset)throw Error('放行范围超出已闭合宏步');
  const filename=confinedFile(root,entry.candidateShard);
  if(fs.statSync(filename).size>64*1024*1024)throw Error('单分片压缩内存预算超限');
  const bytes=fs.readFileSync(filename),checksum=createHash('sha256').update(bytes).digest('hex');
  if(checksum!==entry.shardSha256)throw Error('分片SHA不一致');
  let header:any=null,footer:any=null,prevAfter:string|null=null,admitted=0,allRows=0;
  let nextMacro=entry.globalOffset,nextSub=0,macroAtoms=0,macroWeight=0;
  let playerAlliances=new Map<number,number>();
  for await(const row of rows(bytes)){
    if(row.kind==='header'){
      if(header||footer)throw Error('重复分片头或头尾次序异常');header=row;
      if(row.inputHash!==entry.inputHash||row.parentId!==entry.parentId||row.segmentId!==entry.segmentId)throw Error('分片头身份不匹配');
      if(row.schema!=='native-project-compact-candidate-v1'||row.candidateOrderingId!=='actionCode-codepoint-asc-v1'||row.globalOffset!==entry.globalOffset)throw Error('分片schema或候选顺序合同不匹配');
      prevAfter=createHash('sha256').update(JSON.stringify(row.initialState)).digest('hex');
      playerAlliances=new Map(row.initialState.players.map((p:any)=>[p.id,row.initialState.rules?.alliances?.[p.id]??p.id]));
    }else if(row.kind==='action'){
      if(!header||footer)throw Error('分片行次序错误');allRows++;
      if(row.macro>=entry.maxGlobalMacroExclusive)continue;
      if(row.macro!==nextMacro||row.subAction!==nextSub||!Number.isInteger(row.macroAtoms)||row.macroAtoms<=0)throw Error('宏步或原子序号异常');
      if(nextSub===0)macroAtoms=row.macroAtoms;
      if(row.macroAtoms!==macroAtoms||row.subAction>=macroAtoms||!Number.isFinite(row.weight)||Math.abs(row.weight-1/macroAtoms)>1e-12)throw Error('宏动作展开合同异常');
      if(!Number.isInteger(row.actor)||!Number.isInteger(row.alliance)||!playerAlliances.has(row.actor)||playerAlliances.get(row.actor)!==row.alliance)throw Error('行动方与联盟映射异常');
      if(!Number.isInteger(row.index)||!Number.isInteger(row.legalCount)||row.index<0||row.index>=row.legalCount)throw Error('候选索引越界');
      if(typeof row.code!=='string'||row.code.length===0||row.labelOrigin!=='native_macro_commitment'||row.independentNativeQuery!==false)throw Error('动作或标签来源合同异常');
      if(![row.beforeHash,row.afterHash,row.legalHash].every(v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)))throw Error('状态或候选摘要格式异常');
      if(prevAfter!==null&&row.beforeHash!==prevAfter)throw Error('原子状态摘要链不连续');
      prevAfter=row.afterHash;admitted++;nextSub++;macroWeight+=row.weight;
      if(nextSub===macroAtoms){
        if(Math.abs(macroWeight-1)>1e-12)throw Error('宏步总权重不等于1');
        nextMacro++;nextSub=0;macroWeight=0;
      }
    }else if(row.kind==='footer'){if(footer||(!header&&(!receipt.failure||allRows>0)))throw Error('分片尾部次序异常');footer=row;}
    else throw Error('未知分片行');
  }
  if(!footer||(!header&&entry.maxGlobalMacroExclusive!==entry.globalOffset))throw Error('缺少分片完整头尾');
  if(JSON.stringify(footer.summary)!==JSON.stringify(receipt.summary)||JSON.stringify(footer.failure)!==JSON.stringify(receipt.failure))throw Error('分片尾部与收据不一致');
  if(allRows!==receipt.summary.atomicActions)throw Error('分片原子行数与收据不一致');
  const expected=entry.maxGlobalMacroExclusive-entry.globalOffset;
  if(nextMacro!==entry.maxGlobalMacroExclusive||nextSub!==0)throw Error('放行宏步缺失或不完整');
  if(entry.valueEligible&&(!entry.policyLabelEligible||!Number.isInteger(entry.nativeWinningAllianceId)||entry.outcomeKind!=='natural_terminal'))throw Error('结果标签资格合同异常');
  if(entry.valueEligible){
    if(![...playerAlliances.values()].includes(entry.nativeWinningAllianceId!)||!entry.valueEvidence)throw Error('缺少合法赢家或父局结果证据');
    const evidenceBytes=fs.readFileSync(confinedFile(root,entry.valueEvidence.path));
    if(createHash('sha256').update(evidenceBytes).digest('hex')!==entry.valueEvidence.sha256)throw Error('父局结果证据SHA不匹配');
    const evidence=JSON.parse(evidenceBytes.toString());
    if(evidence.parentId!==entry.parentId||evidence.sourceIdentity!==entry.sourceIdentity||evidence.nativeWinningAllianceId!==entry.nativeWinningAllianceId||evidence.outcomeKind!=='natural_terminal'||evidence.allSegmentsStrict!==true||!evidence.segmentIds.includes(entry.segmentId))throw Error('父局结果证据未覆盖当前分段');
    if(!Array.isArray(evidence.segmentReceiptHashes)||evidence.segmentReceiptHashes.length!==evidence.segmentIds.length||new Set(evidence.segmentIds).size!==evidence.segmentIds.length)throw Error('父局结果证据缺少逐段身份');
    let priorFinal:string|null=null,lastWinner:number|null=null;
    for(let i=0;i<evidence.segmentIds.length;i++){
      const ident=evidence.segmentIds[i],boundReceipt=evidence.segmentReceiptHashes[i];
      if(!/^s\d{4}(-c\d{4})?$/.test(ident)||boundReceipt.id!==ident)throw Error('父局结果分段身份异常');
      const raw=fs.readFileSync(confinedFile(root,`full_v6/receipts/${ident}.json`));
      if(createHash('sha256').update(raw).digest('hex')!==boundReceipt.sha256)throw Error('父局结果依赖收据SHA变化');
      const linked=JSON.parse(raw.toString());
      if(linked.parentId!==entry.parentId||linked.sourceIdentity!==entry.sourceIdentity||linked.summary.transitionAccepted!==true||linked.failure!==null||linked.summary.checkedMacros!==linked.summary.expectedActions||linked.finalSemanticHash!==linked.projectFinalSemanticHash||(priorFinal!==null&&linked.initialHash!==priorFinal))throw Error('父局结果依赖分段未完整通过');
      priorFinal=linked.finalHash;lastWinner=linked.summary.nativeWinner;
    }
    if(lastWinner!==entry.nativeWinningAllianceId)throw Error('父局最终原生赢家不符');
  }
  if(emit&&entry.policyLabelEligible){
    for await(const row of rows(bytes))if(row.kind==='action'&&row.macro<entry.maxGlobalMacroExclusive){
      await emit({...row,policyLabelEligible:true,modelSchemaAccepted:false,
        valueMask:entry.valueEligible,outcomeTarget:entry.valueEligible?(row.alliance===entry.nativeWinningAllianceId?1:-1):null,
        returnMask:false,parentId:entry.parentId,segmentId:entry.segmentId,labelOrigin:'native_macro_commitment',
        independentNativeQuery:false,observationConvention:'continuous-ts-chain-v1'});
    }
  }
  return {segmentId:entry.segmentId,admittedAtoms:admitted,admittedMacros:expected,allCandidateAtoms:allRows,
    gzipComplete:true,sha256:checksum,header,footer};
}
