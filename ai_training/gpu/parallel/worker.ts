/** 每个对局保留独立AI记忆、随机数和权威引擎。 */
import fs from 'node:fs';
import path from 'node:path';
import {parentPort,workerData} from 'node:worker_threads';
import {GameEngine} from '../../../src/game/engine';
import {encodeAction,mulberry32} from '../../../src/game/env';
import {OriginalApkLikeHardAI} from '../../../src/game/ai/original_apk_like_hard_ai';
import {createJobStateWithAssets,hash} from '../hard_jobs';
import {BatchClient} from './client';
import {DecisionRecordWriter} from './record_writer';
const nativeModule=workerData.native?await import('../native/binding'):undefined;
const nativeCompute=nativeModule?.nativeCompute;
const client=workerData.backend==='gpu'?new BatchClient(!!workerData.native,nativeModule?.packDistanceField):null;
parentPort!.on('message',({job,directory,attempt,maxActions,verify,probe})=>{
    const started=performance.now();let steps=0,stop='error',error:string|null=null;
    let engine:GameEngine|null=null;
    const writer=directory?new DecisionRecordWriter(path.join(directory,'decisions.jsonl.gz'),workerData.compactRecords?(workerData.recordChunkBytes??128*1024):0):null;
    const ais=new Map<number,OriginalApkLikeHardAI>(),shadows=new Map<number,OriginalApkLikeHardAI>();
    const streams=new Map<number,{actual:number;shadow:number}>();
    const nativeBefore=nativeModule?{...nativeModule.nativeQueries}:null;
    const requests=client?.requests??0,hits=client?.hits??0;
    client?.cache.clear();
    client?.ranges.clear();
    client?.fields.clear();
    try {
        const initial=createJobStateWithAssets(job,workerData.mapAssets);
        if(directory)fs.writeFileSync(path.join(directory,'initial.json'),JSON.stringify({projectStateSha256:hash(initial),projectState:initial,requestedInitialStateSha256:job.initialStateSha256}));
        engine=new GameEngine(initial,{applyInitialTurnStart:false});
        for(const p of initial.players.filter(p=>p.isAlive)){
            const seed=(job.seed^Math.imul(p.id+1,0x9e3779b9))>>>0;
            const counts={actual:0,shadow:0};streams.set(p.id,counts);const actualRng=mulberry32(seed),shadowRng=mulberry32(seed);
            ais.set(p.id,new OriginalApkLikeHardAI({rng:verify?()=>{counts.actual++;return actualRng();}:actualRng,compute:{nativeCompute,distanceField:workerData.gpuDistance?client?.distanceField:undefined,distanceFieldThreshold:workerData.distanceThreshold,populationLimit:job.setup.unitLimit,movementBatch:client?.compute,movementRange:workerData.gpuRange?client?.movementRange:undefined,verifyMovementBatch:!!verify}}));
            if(verify)shadows.set(p.id,new OriginalApkLikeHardAI({rng:()=>{counts.shadow++;return shadowRng();},compute:{populationLimit:job.setup.unitLimit}}));
        }
        stop='action_truncation';
        for(;steps<(maxActions??job.maxActions);steps++){
            const state=engine.getState();
            if(state.winner!==null){stop='natural';break;}
            if(Atomics.load(new Int32Array(workerData.stop),0)){stop='stopped';break;}
            if((performance.now()-started)/1000>job.maxEffectiveSeconds){stop='wall_truncation';break;}
            if(steps%100===0)parentPort!.postMessage({type:'progress',sequence:job.executionSequence,steps});
            const ai=ais.get(state.currentPlayer)!;
            const action=ai.getAction(engine,state.currentPlayer);client?.assertHealthy();nativeModule?.assertNativeHealthy();
            const shadow=shadows.get(state.currentPlayer);
            if(shadow&&(encodeAction(action)!==encodeAction(shadow.getAction(engine,state.currentPlayer))||hash(ai.telemetry)!==hash(shadow.telemetry)))throw Error('当前新状态CPU/GPU决策或回退不一致');
            const stream=streams.get(state.currentPlayer)!;if(verify&&stream.actual!==stream.shadow)throw Error('当前新状态随机流消耗不同');
            if(!engine.hasLegalAction(state.currentPlayer,action))throw Error('困难AI返回非法动作');
            if(probe){stop='probe';steps++;break;}
            const result=engine.step(action);
            if(result.info.includes('非法动作'))throw Error('权威引擎拒绝动作');
            writer?.append(JSON.stringify({step:steps,before:state,action,afterSha256:hash(result.state),telemetry:ai.telemetry})+'\n');
        }
        if(engine.getState().winner!==null)stop='natural';
    }catch(e){error=String(e);stop='error';}
    try{writer?.close();}catch(e){error=String(e);stop='error';}
    const final=engine?.getState();
    const result={executionSequence:job.executionSequence,parentId:job.parentId,category:job.category,players:job.actualPlayerCount,attempt,steps,stop,natural:stop==='natural',winner:stop==='natural'?final?.winner:null,error,wallSeconds:(performance.now()-started)/1000,finalSha256:final?hash(final):null,source:client?'project-apk-hard-replica-gpu':'project-apk-hard-replica-cpu',verifyCurrentDecisions:!!verify,historicalReplay:'disabled_by_user',gpuRequests:(client?.requests??0)-requests,cacheHits:(client?.hits??0)-hits,telemetry:Object.fromEntries([...ais].map(([id,ai])=>[id,ai.telemetry]))};
    Object.assign(result,{nativeQueries:nativeModule?Object.fromEntries(Object.entries(nativeModule.nativeQueries).map(([key,value])=>[key,value-(nativeBefore as any)[key]])):null,randomStreamCounts:verify?Object.fromEntries(streams):null,cacheStats:client?.stats(),recording:writer?.summary()});
    if(directory){fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));if(final)fs.writeFileSync(path.join(directory,'final.json'),JSON.stringify(final));}
    parentPort!.postMessage({type:'result',result});
});
parentPort!.postMessage({type:'ready'});
