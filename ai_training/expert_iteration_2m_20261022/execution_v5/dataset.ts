/** 训练流重新编码准入数据；完整继承14份排重索引，不写巨大dense特征缓存。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { gunzipSync,gzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { getAllianceId,isTeamEnabled } from '../../../src/game/rule_config';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { trainingValueTarget } from '../../../src/ai_runtime/dual_v3/value_target';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors, PRIOR_VERSION } from '../../../src/ai_runtime/dual_v3/search_policy';
import { nativeEntries, replayEntries, streamReplay, createLoaderStats, type SourceSample } from '../../dual_stream_v2_phase3_20261020/source_loader';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { gzipRows, sha, stateHash } from '../../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../../data_acceptance_20261016/replay/core';
import { nativeSamples, POLICY_NATIVE_RATE, VALUE_NATIVE_RATE, type TrainingSample } from '../native_source';
import { expertSamples } from './expert_source';
const executionDir=path.dirname(fileURLToPath(import.meta.url)),dir=path.resolve(executionDir,'..'),pre=path.join(dir,'../pretrain_preflight_20261022');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const split=process.argv[2]??'train', runId=process.argv[3]??'pilot', limit=Number(process.argv[4]??Infinity), skip=Number(process.argv[5]??0);
const sourceMode=process.argv[6]??'all';if(!['all','native-value','expert-only'].includes(sourceMode))throw Error('未知来源试验模式');
const expertManifest=process.argv[7], extraExclusion=path.join(executionDir,'seen-evaluation-exclusions.txt.gz');
if(!['train','dev'].includes(split)||!/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error('数据流参数无效');
const inherited=read(path.join(pre,'DATA_SPLITS.json')), excluded=new Set<string>();
for(const entry of inherited.exclusionIndexes) {
    const bytes=fs.readFileSync(entry.path); if(sha(bytes)!==entry.sha256) throw Error('历史排重SHA变化');
    for(const h of gunzipSync(bytes).toString().trim().split('\n')) if(h) excluded.add(h);
}
if(fs.existsSync(extraExclusion))for(const h of gunzipSync(fs.readFileSync(extraExclusion)).toString().trim().split('\n'))if(h)excluded.add(h);
const parents=new Map<string,any>(inherited.inherited.parentsUnchanged.map((r:any)=>[`${r.source}:${r.id}`,r]));
const native=nativeEntries(),nativeCounts=new Map<string,number>(),nativeValueCounts=new Map<string,number>();
for(const e of native){nativeCounts.set(e.parentId,(nativeCounts.get(e.parentId)??0)+e.admittedAtoms);if(e.valueEligible)nativeValueCounts.set(e.parentId,(nativeValueCounts.get(e.parentId)??0)+e.admittedAtoms);}
const mean=(m:Map<string,number>)=>[...m.values()].reduce((a,b)=>a+b,0)/Math.max(1,m.size);
const meanNative=mean(nativeCounts),meanNativeValue=mean(nativeValueCounts);
const phase3=read(inherited.inherited.phase3Manifest.path);
const replaySources=[...new Map([...replayEntries(),...phase3.newReplayEntries].map((e:any)=>[e.responseSha256,e])).values()] as any[];
const replayCounts=new Map<string,number>();
for(const e of replaySources){const group=parents.get(`replay:${e.responseSha256}`)?.group??e.responseSha256;let count=e.policyRows;if(count===undefined)count=read(path.join(e.root??path.join(dir,'../data_acceptance_20261016/replay'),'receipts',e.responseSha256+'.json')).policyRows;replayCounts.set(group,(replayCounts.get(group)??0)+(count??0));}
const meanReplay=mean(replayCounts),newHumanCounts=new Map<string,number>(inherited.newHuman.parents.map((p:any)=>[p.id,p.atomicActions])),meanNewHuman=mean(newHumanCounts);
const stats=createLoaderStats(), distribution:Record<string,number>={}, consumed:Record<string,{policy:number;value:number;source:string}>={};
const uniqueStates=new Set<string>(); let duplicateStates=0;
let seen=0,emitted=0,policyCount=0,valueCount=0,excludedByCanonical=0;
const validationGolds=new Set<number>(read(path.join(executionDir,'plan.json')).validationInitialGolds),actualGolds=new Set<number>();
const write=async(b:Buffer)=>{if(!process.stdout.write(b))await once(process.stdout,'drain');};
async function emit(sample:TrainingSample|SourceSample, source:string, policyMask=true) {
    if(emitted>=limit) return;
    const canonical=ruleStateHash(sample.state);if(excluded.has(canonical)){excludedByCanonical++;return;}
    if(split==='train'&&validationGolds.has(sample.state.rules.initialGold))throw Error('训练样本使用了历史验证专属配置');
    actualGolds.add(sample.state.rules.initialGold);if(uniqueStates.has(canonical)){duplicateStates++;return;}uniqueStates.add(canonical);
    seen++; if(seen<=skip)return;
    const state=sample.state, legal=sample.legalActions, context=new ReachabilityContext(state), observation=encodeDualObservation(state,legal,context);
    const target=observation.actions.sourceIndices.indexOf(sample.targetIndex); if(target<0)throw Error('动作没有因子化指针');
    const outcome=trainingValueTarget(state,observation.playerOrder,sample.valueMask,sample.winner), prior=softPriors(state,legal,context);
    const pack=packTensorBatch([observation],[{target,policyMask,valueMask:outcome.valueMask,valueTarget:outcome.target,weight:sample.weight}]);
    const parent=`${sample.source}:${sample.parentId}`, phase=state.turn<=5?'opening':state.turn<=15?'middle':'late';
    const perspective=outcome.valueMask?(sample.winner===-1?'draw':getAllianceId(state,state.currentPlayer)===sample.winner?'winner':'loser'):'unknown';
    const stratum=`${source}/${phase}/${perspective}/${state.players.filter(p=>isTeamEnabled(state,p.id)).length}p`;
    distribution[stratum]=(distribution[stratum]??0)+1;
    const entry=consumed[parent]??={policy:0,value:0,source}; entry.policy+=Number(policyMask);entry.value+=Number(outcome.valueMask);
    const targets=(sample as any).searchTarget as {code:string;score:number}[]|undefined;
    const targetScores=new Map<number,number>();
    for(const r of targets??[]){const legalIndex=legal.findIndex(a=>encodeAction(a)===r.code),index=observation.actions.sourceIndices.indexOf(legalIndex);if(index>=0&&Number.isFinite(r.score))targetScores.set(index,Math.max(targetScores.get(index)??-Infinity,r.score));}
    const sourceRow={id:`${parent}:${sample.macro}:${sample.subAction}`,parent,source,quality:source.includes('human')?2:source==='search-expert'?4:1,
        parentPolicyScale:source==='ordinary-native'?meanNative/Math.max(1,nativeCounts.get(sample.parentId)??1):source.startsWith('historical-')?meanReplay/Math.max(1,replayCounts.get(parents.get(`replay:${sample.parentId}`)?.group??sample.parentId)??1):source.startsWith('new-')?meanNewHuman/Math.max(1,newHumanCounts.get(sample.parentId)??1):((sample as TrainingSample).normalizationScale??1),
        parentValueScale:source==='ordinary-native'?meanNativeValue/Math.max(1,nativeValueCounts.get(sample.parentId)??1):sample.weight*((sample as TrainingSample).normalizationScale??1),
        prior:Array.from(observation.actions.sourceIndices,i=>prior[i]),priorVersion:PRIOR_VERSION,valueTargetVersion:'active-alliance-outcome-v1',stratum,currentBeforeHash:sample.currentBeforeHash,sourceBeforeHash:sample.sourceBeforeHash};
    if(targetScores.size>1)(sourceRow as any).searchTarget=[...targetScores].map(([index,score])=>({index,score}));
    const meta=Buffer.from(JSON.stringify({...pack.metadata,sources:[sourceRow]})), header=Buffer.alloc(8);header.writeUInt32LE(meta.length);header.writeUInt32LE(pack.bytes.length,4);
    await write(header);await write(meta);await write(pack.bytes);emitted++;policyCount+=Number(policyMask);valueCount+=Number(outcome.valueMask);
    if(emitted%1000===0)console.error(JSON.stringify({split,seen,emitted,policyCount,valueCount}));
}
if(expertManifest&&split==='train')for await(const sample of expertSamples(path.resolve(expertManifest),excluded)){await emit(sample,sample.origin,sample.policyMask);if(emitted>=limit)break;}
// 真人来源先流过，确保短程稳定性试验也能核验新增多人前缀；正式流没有总样本上限。
if(split==='train'&&sourceMode==='all') {
    const human=read(path.join(pre,'HUMAN_DATA_INDEX_FINAL.json')), admitted=new Map<string,any>();
    for await(const r of gzipRows(fs.readFileSync(human.policyFiles.admitted.path))) admitted.set(`${r.responseSha256}:${r.atomic}`,r);
    for(const parent of inherited.newHuman.parents) {
        const bytes=fs.readFileSync(parent.prefixPacket.path);if(sha(bytes)!==parent.prefixPacket.sha256)throw Error('前缀SHA变化');
        let engine:GameEngine|undefined;
        for await(const row of gzipRows(bytes)) {
            if(row.kind==='prefix'){engine=new GameEngine(row.initialState,row.engineOptions);continue;}
            if(row.kind!=='atomic')continue;
            if(!engine)throw Error('前缀缺少包头'); const state=engine.getState(), record=admitted.get(`${parent.responseSha256}:${row.atomic}`);
            if(!engine.hasLegalAction(state.currentPlayer,row.action))throw Error('真人前缀当前规则不合法');
            if(record&&emitted<limit) {
                if(ruleStateHash(state)!==record.canonicalBeforeHash||stateHash(state)!==record.sourceStateHash)throw Error('真人前态漂移');
                const legal=engine.getLegalActions(state.currentPlayer),targetIndex=legal.findIndex(a=>encodeAction(a)===row.actionCode);
                await emit({state,legalActions:legal,targetIndex,targetCode:row.actionCode,parentId:parent.id,source:'replay',weight:1/row.macroAtomicCount,
                    valueMask:false,winner:null,currentBeforeHash:stateHash(state),sourceBeforeHash:row.beforeHash,macro:row.macro,subAction:row.subAction},record.humanController?'new-human':'new-replay-ai');
            }
            engine.step(row.action);
        }
        if(emitted>=limit)break;
    }
}
// 历史真人响应保留既有父局及API家族分区；只取稳定20%样本，公开配额。
for(const entry of replaySources) {
    if(sourceMode!=='all')break;
    if(emitted>=limit)break;
    const parent=parents.get(`replay:${entry.responseSha256}`);if(parent?.split!==split)continue;
    let controllerTypes:number[]=[];
    for await(const r of gzipRows(fs.readFileSync(path.join(entry.root??path.join(dir,'../data_acceptance_20261016/replay'),entry.packet.path))))if(r.kind==='game'){controllerTypes=r.playerTypes??[];break;}
    for await(const sample of streamReplay(entry,excluded,stats)) {
        if(parseInt(sha('2m-human-v1:'+sample.currentBeforeHash).slice(0,8),16)/4294967296>=.2)continue;
        const controller=controllerTypes[sample.state.currentPlayer];
        await emit(sample,controller===1?'historical-human':controller===2?'historical-replay-ai':'historical-controller-unknown');if(emitted>=limit)break;
    }
}
for(const entry of native) {
    if(sourceMode==='expert-only')break;
    if(emitted>=limit)break;
    const parent=parents.get(`native:${entry.parentId}`);if(parent?.split!==split)continue;
    if(sourceMode==='native-value'&&!entry.valueEligible)continue;
    for await(const sample of nativeSamples(entry,excluded,stats)) {await emit(sample,'ordinary-native',sample.policyMask);if(emitted>=limit)break;}
}
const receipt={split,runId,sourceMode,seen,skip,emitted,policyCount,valueCount,distribution,consumed,stats,duplicateStates,excludedByCanonical,initialGolds:[...actualGolds].sort((a,b)=>a-b),exclusionCount:excluded.size,dataSplitsSha256:sha(fs.readFileSync(path.join(pre,'DATA_SPLITS.json'))),
    sampling:{nativePolicy:POLICY_NATIVE_RATE,nativeValue:VALUE_NATIVE_RATE,historicalReplayPolicy:.2,newHumanPrefix:1,perParentLimit:null,totalLimit:Number.isFinite(limit)?limit:null},priorVersion:PRIOR_VERSION,
    normalization:'原生父局和真人/API家族按准入原子期望量反比软加权；新专家按父局实际步数反比软加权；batch使用加权均值，不在每批重新除去父局权重。真人宏权重保留。',valueTargetVersion:'active-alliance-outcome-v1',
    missingSource:'新困难APK原生数据0/3000，未替代或伪造'};
const stateDirectory=path.join(executionDir,'state-receipts');fs.mkdirSync(stateDirectory,{recursive:true});
const stateFile=path.join(stateDirectory,`${runId}-${split}.txt.gz`);if(fs.existsSync(stateFile))throw Error('拒绝覆盖状态消费回执');
fs.writeFileSync(stateFile,gzipSync([...uniqueStates].sort().join('\n')+'\n'));
fs.mkdirSync(path.join(dir,'stream-receipts'),{recursive:true});const target=path.join(dir,'stream-receipts',`${runId}-${split}.json`);
if(fs.existsSync(target))throw Error('拒绝覆盖数据消费回执');fs.writeFileSync(target,JSON.stringify(receipt,null,2));
console.error(JSON.stringify({complete:true,split,emitted,policyCount,valueCount}));
