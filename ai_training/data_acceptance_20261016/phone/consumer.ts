import { mkdirSync, existsSync, readFileSync, writeFileSync, createWriteStream, renameSync, statSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { createGzip, gunzipSync } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { GameEngine } from '../../../src/game/engine';
import { getLegalActions } from '../../../src/game/rules';
import { encodeAction } from '../../../src/game/env';
import { canonicalActionOrderV16, CANDIDATE_ORDERING_ID_V16 } from '../../../src/game/ai/action_ordering';
import { expandApkReplayRecordToProjectActions, createRecordExpansionOptions } from '../../../src/game/apk_replay';
import { readNativeSnapshot } from '../native_reader/reader';
import { projectSnapshot, comparableState, nativeRecord, differences, hash, sha, json, projectionSchema } from './projection';
import { semanticActionCodes } from './semantic_actions';

// 输入协议是长度前缀JSON头和各文件字节，stdout只写逐局收据，避免与归档流混合。
class Input {
  iterator=process.stdin[Symbol.asyncIterator]();buffer=Buffer.alloc(0);offset=0;
  async take(n:number):Promise<Buffer|null>{
    const out=Buffer.allocUnsafe(n);let copied=0;
    while(copied<n){
      if(this.offset===this.buffer.length){const next=await this.iterator.next();if(next.done){if(!copied)return null;throw Error('输入流截断');}this.buffer=Buffer.from(next.value);this.offset=0;}
      const size=Math.min(n-copied,this.buffer.length-this.offset);
      this.buffer.copy(out,copied,this.offset,this.offset+size);copied+=size;this.offset+=size;
    }return out;
  }
}
interface Job {id:string;parentId:string;map:string;seed:number;expectedActions:number;globalOffset:number;archive:string;files:{name:string;bytes:number}[];kind:string;sourceIdentity:string}
const out=path.resolve(process.argv[2]);mkdirSync(path.join(out,'receipts'),{recursive:true});mkdirSync(path.join(out,'candidate_shards'),{recursive:true});
const reader=new Input();
while(true){
  const length=await reader.take(4);if(!length)break;
  const hlen=length.readUInt32BE();if(hlen>1000000)throw Error('输入头过大');
  const job=JSON.parse((await reader.take(hlen))!.toString()) as Job;
  if(!/^s\d{4}(-c\d{4})?$/.test(job.id))throw Error('输入局标识异常');
  const files:Record<string,Buffer>={};for(const item of job.files)files[item.name]=(await reader.take(item.bytes))!;
  const resultPath=path.join(out,'receipts',job.id+'.json');
  const inputHash=hash({job,files:Object.entries(files).map(([name,b])=>[name,sha(b)])});
  if(existsSync(resultPath)){
    const saved=JSON.parse(readFileSync(resultPath,'utf8'));if(saved.inputHash!==inputHash)throw Error(`已有收据身份变化${job.id}`);
    process.stdout.write(json({id:job.id,resumed:true,...saved.summary})+'\n');continue;
  }
  const start=performance.now();let failure:any=null,checked=0,atomic=0,frameCount=0,observedActions=0;
  let initialHash:string|null=null,finalHash:string|null=null,firstFrameHash:string|null=null,nativeWinner:number|null=null;
  let expectedEnd:any=null,actualEnd:any=null,initialState:any=null;
  let frameFormatError:string|null=null;
  const shardPath=path.join(out,'candidate_shards',job.id+'.jsonl.gz');
  const partial=shardPath+'.partial';
  if(existsSync(partial)||existsSync(shardPath))throw Error(`未完成产物需要显式恢复处理，拒绝覆盖${job.id}`);
  const zip=createGzip({level:1});const sink=createWriteStream(partial,{flags:'wx'});const done=pipeline(zip,sink);
  const emit=async(value:unknown)=>{if(!zip.write(json(value)+'\n'))await once(zip,'drain');};
  const decode=(name:string)=>{const b=files[name]??files[name+'.gz'];if(!b)throw Error(`缺文件${name}`);return files[name]?b:gunzipSync(b);};
  try{
    const config=files['config.bin'];if(!config)throw Error('缺原始config，续跑必须引用父config');
    const initial=readNativeSnapshot(files['initial.bin']);const final=readNativeSnapshot(files['final.bin']);
    initialHash=sha(files['initial.bin']);finalHash=sha(files['final.bin']);nativeWinner=final.components.e!.h;
    initialState=projectSnapshot(initial,config,job.map);
    const engine=new GameEngine(initialState,{applyInitialTurnStart:false,disableAutoAdvanceWhenNoMeaningfulAction:true});
    const initialDiff=differences(comparableState(engine.getState()),comparableState(initialState));
    if(initialDiff.length)throw Error('构造器改变原生投影快照:'+json(initialDiff));
    const raw=decode('actions.jsonl').toString('utf8').trim();
    const actions=raw?raw.split('\n').map(line=>JSON.parse(line)):[];observedActions=actions.length;
    if(actions.length!==job.expectedActions)throw Error('动作数与封存清单不一致');
    for(let i=0;i<actions.length;i++){
      if(actions[i].index!==i||(actions[i].global_index??job.globalOffset+i)!==job.globalOffset+i||actions[i].ai_seed!==job.seed+(job.globalOffset+i)*104729)throw Error(`动作序号/种子连续性错误${i}`);
    }
    const records=actions.map(a=>nativeRecord(a.fields));
    const frames=decode('states.bin');let pos=0;
    const frameList:{offset:number;length:number}[]=[];
    while(pos<frames.length){
      if(pos+4>frames.length){frameFormatError='状态长度前缀被截断';break;}
      const len=frames.readInt32BE(pos);pos+=4;
      if(len<=0||len>32*1024*1024||pos+len>frames.length){frameFormatError='状态帧长度越界';break;}
      frameList.push({offset:pos,length:len});pos+=len;
    }
    frameCount=frameList.length;if(frameFormatError||frameCount!==actions.length)throw Error(frameFormatError??'状态帧数与动作数不一致');
    const getFrame=(i:number)=>{const f=frameList[i];return frames.subarray(f.offset,f.offset+f.length);};
    if(frameCount)firstFrameHash=sha(getFrame(0));
    const initVsFirst=frameCount?differences(comparableState(initialState),comparableState(projectSnapshot(readNativeSnapshot(getFrame(0)),config,job.map))):[];
    if(initVsFirst.length)throw Error('initial与首动作状态语义不同:'+json(initVsFirst));
    await emit({kind:'header',schema:'native-project-compact-candidate-v1',projectionSchema,candidateOrderingId:CANDIDATE_ORDERING_ID_V16,
      parentId:job.parentId,segmentId:job.id,inputHash,source:job.archive,globalOffset:job.globalOffset,
      initialState,applyInitialTurnStart:false,trainingStarted:false,eligibility:'以release-index为准；本分片是待验候选'});
    for(let i=0;i<records.length;i++){
      const before=engine.getState();
      const nativeBefore=projectSnapshot(readNativeSnapshot(getFrame(i)),config,job.map);
      const beforeDiff=differences(comparableState(before),comparableState(nativeBefore));
      if(beforeDiff.length){failure={category:'before_state_mismatch',macro:i,globalIndex:job.globalOffset+i,differences:beforeDiff};break;}
      const notices:any[]=[];
      let expanded;
      try{
        expanded=expandApkReplayRecordToProjectActions(records[i],before,createRecordExpansionOptions(records,i,{
          allowAmbiguousRecruitDeployFirstMatch:false,onNotice:n=>{notices.push(n);throw Error('拒绝信息损失:'+n.reason);}}));
      }catch(e){failure={category:'macro_expansion_rejected',macro:i,globalIndex:job.globalOffset+i,message:String(e),notices,record:records[i]};break;}
      if(!expanded.length){failure={category:'empty_macro',macro:i};break;}
      let stepFailure=false;
      for(let k=0;k<expanded.length;k++){
        const s=engine.getState(),ordered=canonicalActionOrderV16(engine.getLegalActions(s.currentPlayer)),codes=ordered.map(o=>o.code),code=encodeAction(expanded[k]),index=codes.indexOf(code);
        if(engine.isTerminal()||index<0){failure={category:'strict_illegal_action',macro:i,subAction:k,globalIndex:job.globalOffset+i,code,record:records[i],state:s,legal:codes};stepFailure=true;break;}
        const beforeHash=hash(s),result=engine.step(expanded[k]);
        if(result.info.includes('非法动作')||result.info==='Game already ended'){failure={category:'step_rejected',macro:i,message:result.info};stepFailure=true;break;}
        await emit({kind:'action',macro:job.globalOffset+i,subAction:k,macroAtoms:expanded.length,weight:1/expanded.length,
          actor:s.currentPlayer,alliance:s.rules?.alliances?.[s.currentPlayer]??s.currentPlayer,turn:s.turn,
          code,index,legalCount:codes.length,legalHash:hash(codes),beforeHash,afterHash:hash(result.state),
          labelOrigin:'native_macro_commitment',independentNativeQuery:false,admission:'pending_parent_release',valueMask:false,returnMask:false});
        atomic++;
      }
      if(stepFailure)break;
      const expected=projectSnapshot(i+1<records.length?readNativeSnapshot(getFrame(i+1)):final,config,job.map);
      const mismatch=differences(comparableState(engine.getState()),comparableState(expected));
      if(mismatch.length){failure={category:'native_transition_mismatch',macro:i,globalIndex:job.globalOffset+i,record:records[i],differences:mismatch};break;}
      const actual=engine.getState();
      const actualLegal=semanticActionCodes(actual,getLegalActions(actual,actual.currentPlayer));
      const expectedLegal=semanticActionCodes(expected,getLegalActions(expected,expected.currentPlayer));
      if(json(actualLegal)!==json(expectedLegal)){
        failure={category:'projected_candidate_set_mismatch',macro:i,globalIndex:job.globalOffset+i,record:records[i],
          actualCount:actualLegal.length,expectedCount:expectedLegal.length,
          onlyActual:actualLegal.filter(c=>!expectedLegal.includes(c)).slice(0,12),onlyExpected:expectedLegal.filter(c=>!actualLegal.includes(c)).slice(0,12)};break;
      }
      checked++;
    }
    expectedEnd=comparableState(projectSnapshot(final,config,job.map));actualEnd=comparableState(engine.getState());
  }catch(e){failure??={category:'parse_or_projection_error',message:e instanceof Error?e.message:String(e)};}
  const transitionAccepted=!failure&&checked===job.expectedActions;
  const summary={transitionAccepted,checkedMacros:checked,atomicActions:atomic,expectedActions:job.expectedActions,observedActions,frameCount,
    nativeWinner,policyEligible:false,valueEligible:false,returnEligible:false,
    projectedCandidateSetsCompared:true,nativeJavaCandidateOracleCompared:false,
    maxAdmissibleGlobalMacroExclusive:job.globalOffset+checked,elapsedSeconds:(performance.now()-start)/1000};
  await emit({kind:'footer',summary,failure,labels:'父局接续链及完整转移/原生结果校验结束后，由release-index单独决定资格'});
  zip.end();await done;renameSync(partial,shardPath);
  writeFileSync(resultPath,json({id:job.id,parentId:job.parentId,kind:job.kind,inputHash,sourceIdentity:job.sourceIdentity,
    archive:job.archive,initialHash,finalHash,firstFrameHash,summary,failure,
    finalSemanticHash:expectedEnd?hash(expectedEnd):null,projectFinalSemanticHash:actualEnd?hash(actualEnd):null,
    candidateShard:path.relative(out,shardPath).replaceAll('\\','/'),shardBytes:statSync(shardPath).size})+'\n',{flag:'wx'});
  process.stdout.write(json({id:job.id,...summary})+'\n');
}
