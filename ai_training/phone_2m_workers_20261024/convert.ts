import { createReadStream,createWriteStream,readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip,createGzip,gunzipSync } from 'node:zlib';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { createRecordExpansionOptions,expandApkReplayRecordToProjectActions } from '../../src/game/apk_replay';
import { readNativeSnapshot } from '../data_acceptance_20261016/native_reader/reader';
import { nativeRecord,projectSnapshot } from '../data_acceptance_20261016/phone/projection';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../src/ai_runtime/dual_v2/reachability';
import { trainingValueTarget } from '../../src/ai_runtime/dual_v3/value_target';
import { softPriors } from '../../src/ai_runtime/dual_v3/search_policy';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';

const here=path.dirname(fileURLToPath(import.meta.url));
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const sha=(x:Uint8Array|string)=>createHash('sha256').update(x).digest('hex');
const save=(p:string,v:unknown)=>{writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');renameSync(p+'.tmp',p);};
async function* frames(file:string){
 const src=createReadStream(file),unzip=createGunzip();src.on('error',e=>unzip.destroy(e));src.pipe(unzip);
 let data=Buffer.alloc(0),size:number|null=null;
 try{for await(const chunk of unzip){data=Buffer.concat([data,chunk]);while(true){if(size===null){if(data.length<4)break;size=data.readInt32BE();data=data.subarray(4);if(size<=0||size>67108864)throw Error('快照帧长度无效');}if(data.length<size)break;const frame=Buffer.from(data.subarray(0,size));data=data.subarray(size);size=null;yield frame;}}if(size!==null||data.length)throw Error('快照流截断');}
 finally{src.destroy();unzip.destroy();}
}

async function convert(p:any){
 const outdir=path.join(here,'data');mkdirSync(outdir,{recursive:true});
 const target=path.join(outdir,p.parentId+'.frames.gz'),receipt=path.join(outdir,p.parentId+'.json');
 if(existsSync(receipt))return load(receipt);
 const config=readFileSync(path.join(p.directory,'config.bin')),result=load(path.join(p.directory,'result.json'));
 const rows=gunzipSync(readFileSync(path.join(p.directory,'actions.jsonl.gz'))).toString('utf8').trim().split('\n').map(s=>JSON.parse(s));
 const records=rows.map(r=>nativeRecord(r.fields));
 const output=createWriteStream(target+'.pending',{flags:'wx'}),gzip=createGzip({level:3});gzip.pipe(output);
 let samples=0,macros=0,policy=0,value=0,candidates=0,maxCandidates=0,maxEntities=0,rawBytes=0;
 const shapes:Record<string,number>={};
 const emit=async(data:Buffer)=>{rawBytes+=data.length;if(!gzip.write(data))await once(gzip,'drain');};
 try{
  for await(const bytes of frames(path.join(p.directory,'states.bin.gz'))){
   const index=macros++,state=projectSnapshot(readNativeSnapshot(bytes),config,p.map);
   const engine=new GameEngine(state,{applyInitialTurnStart:false,disableAutoAdvanceWhenNoMeaningfulAction:true});
   const actions=expandApkReplayRecordToProjectActions(records[index],state,createRecordExpansionOptions(records,index,{allowAmbiguousRecruitDeployFirstMatch:false,onNotice:n=>{throw Error('标签无法无损映射：'+JSON.stringify(n));}}));
   for(let sub=0;sub<actions.length;sub++){
    const current=engine.getState(),legal=engine.getLegalActions(current.currentPlayer),code=encodeAction(actions[sub]);
    const legalIndex=legal.findIndex(a=>encodeAction(a)===code);
    if(legalIndex<0)throw Error(`候选编码无法映射标签 ${index}/${sub}/${code}`);
    const context=new ReachabilityContext(current),observation=encodeDualObservation(current,legal,context);
    const targetIndex=observation.actions.sourceIndices.indexOf(legalIndex);
    if(targetIndex<0)throw Error('因子化候选缺少标签');
    const outcome=trainingValueTarget(current,observation.playerOrder,Boolean(result.naturalEnd&&!result.truncationReason),result.winnerAlliance??result.winnerMask);
    const packed=packTensorBatch([observation],[{target:targetIndex,policyMask:true,valueMask:outcome.valueMask,valueTarget:outcome.target,weight:1}]);
    const prior=softPriors(current,legal,context);
    const source={parentId:p.parentId,macro:index,subAction:sub,map:p.map,path:rows[index].path,code,prior:Array.from(observation.actions.sourceIndices,i=>prior[i]),quality:1};
    const meta=Buffer.from(JSON.stringify({...packed.metadata,sources:[source]})),head=Buffer.alloc(8);head.writeUInt32LE(meta.length);head.writeUInt32LE(packed.bytes.length,4);
    await emit(head);await emit(meta);await emit(packed.bytes);
    samples++;policy++;value+=Number(outcome.valueMask);candidates+=observation.actions.sourceIndices.length;
    maxCandidates=Math.max(maxCandidates,observation.actions.sourceIndices.length);maxEntities=Math.max(maxEntities,observation.entityIndexMap.entities.length);
    const shape=`${observation.width}x${observation.height}`;shapes[shape]=(shapes[shape]||0)+1;
    // 仅生成同一宏动作内部后续标签所需中间态；宏之间直接读取原始快照，不进行重放验收。
    if(sub+1<actions.length)engine.step(actions[sub]);
   }
   if(macros%500===0)console.log(JSON.stringify({phase:'encoding',parent:p.parentId,macros,samples}));
  }
  gzip.end();await once(output,'finish');
  if(macros!==p.actions||samples!==p.knownAtomicActions)throw Error(`已有样本位置计数不能映射：${macros}/${samples}/${p.knownAtomicActions}`);
  renameSync(target+'.pending',target);
  const report={parentId:p.parentId,map:p.map,samples,policyLabels:policy,valueLabels:value,candidates,maxCandidates,maxEntities,shapes,rawBytes,compressedBytes:statSync(target).size,sha256:sha(readFileSync(target)),sourceGroupId:p.groupId,sourceArtifacts:p.files,conversionOnly:true,newStrictReplayExecuted:false};
  save(receipt,report);return report;
 }catch(error){gzip.destroy();output.destroy();save(path.join(outdir,p.parentId+'.quarantine.json'),{parentId:p.parentId,error:String(error),conversionOnly:true});throw error;}
}

async function main(){
 const split=load(path.join(here,'SPLIT.json')),reports=[];
 for(const p of split.pilot){reports.push(await convert(p));console.log(JSON.stringify({phase:'encoded_parent',done:reports.length,parent:p.parentId,samples:reports.at(-1).samples,compressedBytes:reports.at(-1).compressedBytes}));}
 const total=reports.reduce((a,r)=>a+r.samples,0);
 save(path.join(here,'DATASET.json'),{schema:'phone-2m-pilot-tensors-v1',parents:reports.length,samples:total,policyLabels:reports.reduce((a,r)=>a+r.policyLabels,0),valueLabels:reports.reduce((a,r)=>a+r.valueLabels,0),updates:Math.ceil(total/8),tailBatch:total%8||8,compressedBytes:reports.reduce((a,r)=>a+r.compressedBytes,0),reports,splitSha256:sha(readFileSync(path.join(here,'SPLIT.json'))),protocolSha256:sha(readFileSync(path.join(here,'PROTOCOL.json')))});
}
main().catch(e=>{console.error(e);process.exitCode=1;});
