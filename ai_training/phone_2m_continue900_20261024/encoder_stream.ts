import fs from 'node:fs';
import path from 'node:path';
import { createGunzip,gunzipSync } from 'node:zlib';
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

const work=process.env.AEII_CONTINUE_WORK||'/continue900';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const option=(name:string,defaultValue:number)=>{const i=process.argv.indexOf(name);return i<0?defaultValue:Number(process.argv[i+1]);};
const skip=option('--skip',0),limit=option('--limit',Infinity);
async function* frames(file:string){
 const input=fs.createReadStream(file),unzip=createGunzip();input.on('error',e=>unzip.destroy(e));input.pipe(unzip);
 let pending=Buffer.alloc(0),size:number|null=null;
 try{for await(const chunk of unzip){pending=Buffer.concat([pending,chunk]);while(true){if(size===null){if(pending.length<4)break;size=pending.readInt32BE(0);pending=pending.subarray(4);if(size<=0||size>67108864)throw Error('快照帧长度无效');}if(pending.length<size)break;const data=Buffer.from(pending.subarray(0,size));pending=pending.subarray(size);size=null;yield data;}}if(size!==null||pending.length)throw Error('快照流截断');}
 finally{input.destroy();unzip.destroy();}
}
async function write(bytes:Buffer){if(!process.stdout.write(bytes))await once(process.stdout,'drain');}
async function main(){
 if(!Number.isSafeInteger(skip)||skip<0||!(limit===Infinity||Number.isSafeInteger(limit)&&limit>0))throw Error('编码游标或检查数量无效');
 const plan=JSON.parse(fs.readFileSync(path.join(work,'PLAN.json'),'utf8'));
 let consumed=0,emitted=0,currentParent='',macro=-1;
 try{
  for(const parent of plan.inputs){
   currentParent=parent.parentId;
   if(consumed+parent.expectedSamples<=skip){consumed+=parent.expectedSamples;continue;}
   const directory=path.join(work,'inputs',parent.parentId);
   const read=(name:string)=>{const bytes=fs.readFileSync(path.join(directory,name));if(sha(bytes)!==parent.coreFiles[name].sha256)throw Error('原始输入摘要变化：'+name);return bytes;};
   const config=read('config.bin'),result=JSON.parse(read('result.json').toString('utf8'));
   const rows=gunzipSync(read('actions.jsonl.gz')).toString('utf8').trim().split('\n').map(s=>JSON.parse(s));
   const records=rows.map(r=>nativeRecord(r.fields));
   let local=0,macros=0;
   for await(const frame of frames(path.join(directory,'states.bin.gz'))){
    macro=macros++;const state=projectSnapshot(readNativeSnapshot(frame),config,parent.map);
    const engine=new GameEngine(state,{applyInitialTurnStart:false,disableAutoAdvanceWhenNoMeaningfulAction:true});
    const actions=expandApkReplayRecordToProjectActions(records[macro],state,createRecordExpansionOptions(records,macro,{allowAmbiguousRecruitDeployFirstMatch:false,onNotice:n=>{throw Error('标签不能无损编码：'+JSON.stringify(n));}}));
    for(let sub=0;sub<actions.length;sub++){
     if(consumed>=skip){
      const current=engine.getState(),legal=engine.getLegalActions(current.currentPlayer),code=encodeAction(actions[sub]);
      const sourceIndex=legal.findIndex(a=>encodeAction(a)===code);if(sourceIndex<0)throw Error(`动作标签未映射到编码候选 ${macro}/${sub}/${code}`);
      const context=new ReachabilityContext(current),observation=encodeDualObservation(current,legal,context),target=observation.actions.sourceIndices.indexOf(sourceIndex);
      if(target<0)throw Error('因子化标签索引缺失');
      const outcome=trainingValueTarget(current,observation.playerOrder,Boolean(result.naturalEnd&&!result.truncationReason),result.winnerAlliance??result.winnerMask);
      const packed=packTensorBatch([observation],[{target,policyMask:true,valueMask:outcome.valueMask,valueTarget:outcome.target,weight:1}]);
      const prior=softPriors(current,legal,context),source={parentId:parent.parentId,macro,subAction:sub,map:parent.map,path:rows[macro].path,code,prior:Array.from(observation.actions.sourceIndices,i=>prior[i]),quality:1};
      const meta=Buffer.from(JSON.stringify({...packed.metadata,sources:[source]})),head=Buffer.alloc(8);head.writeUInt32LE(meta.length);head.writeUInt32LE(packed.bytes.length,4);
      await write(head);await write(meta);await write(packed.bytes);emitted++;
      if(emitted>=limit){console.error(JSON.stringify({kind:'encoding_probe_complete',emitted,parentId:currentParent,macro}));return;}
     }
     consumed++;local++;
     // 只为同一宏内部后续标签生成中间态；宏之间读取原始快照，不执行独立重放校验。
     if(sub+1<actions.length)engine.step(actions[sub]);
    }
   }
   if(macros!==parent.actions||local!==parent.expectedSamples)throw Error(`保存的原子位置预算不能完整映射：${macros}/${local}/${parent.expectedSamples}`);
   console.error(JSON.stringify({kind:'parent_encoded',parentId:currentParent,ordinal:parent.trainingOrdinal,samples:local,emitted,cumulativePositions:consumed}));
  }
  console.error(JSON.stringify({kind:'authorized_stream_complete',consumed,emitted,skip}));
 }catch(error){
  const report={parentId:currentParent,macro,error:String(error),emitted,consumed,conversionOnly:true,strictReplayExecuted:false};
  fs.writeFileSync(path.join(work,'ENCODING_ERROR-'+Date.now()+'.json'),JSON.stringify(report,null,2)+'\n');throw error;
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
