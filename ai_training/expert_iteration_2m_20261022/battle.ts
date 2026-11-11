/** 独立对局采样器：实际动作与反扑分别落盘，截断不产生胜负标签。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { OriginalApkLikeHardAI } from '../../src/game/ai/original_apk_like_hard_ai';
import { DualStreamModel as NewModel } from '../../src/ai_runtime/dual_v3/model_runtime';
import { DualStreamModel as OldModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { NeuralBeamSearchAI } from '../../src/ai_runtime/dual_v3/beam_search';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { softPriors } from '../../src/ai_runtime/dual_v3/search_policy';
import { ReachabilityContext } from '../../src/ai_runtime/dual_v2/reachability';
import type { GameState } from '../../src/game/types';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=(v:any)=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const job=read(path.resolve(process.argv[2])),out=path.resolve(process.argv[3]);
if(fs.existsSync(path.join(out,'started.json')))throw Error('每次尝试必须使用独立目录');fs.mkdirSync(out,{recursive:true});
const save=(n:string,v:any)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2));
const append=(n:string,v:any)=>{const disk=fs.statfsSync(out);if(disk.bavail*disk.bsize<12*1024**3)throw Error('可用空间低于12GiB，保留当前证据并停止');const fd=fs.openSync(path.join(out,n),'a');try{fs.writeSync(fd,gzipSync(JSON.stringify(v)+'\n',{level:1}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
let rngValue=job.seed>>>0;const rng=()=>{rngValue=(Math.imul(rngValue,1664525)+1013904223)>>>0;return rngValue/4294967296;};
const initial:GameState=job.initial??createApkSkirmishGameState(parseAppApkSkirmishMap(job.map),{mode:'SD',mapName:job.map,setup:job.setup});
const engine=new GameEngine(initial,{applyInitialTurnStart:false}),players=initial.players.filter(p=>p.isAlive).map(p=>p.id),self=players[job.seat];
save('started.json',{job,initial,self,at:new Date().toISOString()});
const hard=new OriginalApkLikeHardAI({rng});
function policy(prefix:string,mode:string,witness:boolean){
    const meta=read(prefix+'.json'),raw=fs.readFileSync(prefix+'.bin'),Model=meta.model==='dual-stream-v3-2m-v1'?NewModel:OldModel;
    const model=new Model(meta,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),modelVersion=crypto.createHash('sha256').update(raw).digest('hex');
    const expected=path.resolve(prefix)===path.resolve(job.modelPrefix)?job.expectedModelSha256:job.expectedOpponentSha256;
    if(expected&&modelVersion!==expected)throw Error('对局模型身份与预登记不一致');
    const parent=path.dirname(prefix),headBias=fs.existsSync(path.join(parent,'head-calibration.json'))?read(path.join(parent,'head-calibration.json')).headBias:undefined;
    const valueCalibration=fs.existsSync(path.join(parent,'value-config.json'))?read(path.join(parent,'value-config.json')):undefined;
    const onWitness=(w:any)=>{if(witness)append('witnesses.jsonl.gz',w);};
    const ai=mode==='frozen'?new DualStreamTurnSearchAI(model as OldModel,{budgetMs:780,maxNodes:220,beamWidth:6,maxUnits:3,headBias,valueCalibration,onWitness}):new NeuralBeamSearchAI(model,{modelVersion,budgetMs:job.budgetMs??4000,headBias,valueCalibration,onWitness,intermediateValue:job.intermediateValue,leafMode:job.leafMode});
    if(mode==='pure')return {modelVersion,getAction(e:GameEngine,p:number){const state=e.getState(),legal=e.getLegalActions(p).filter(a=>a.type!=='surrender'),context=new ReachabilityContext(state),observation=encodeDualObservation(state,legal,context),output=model.forward(observation),prior=softPriors(state,legal,context);let best=0;for(let i=1;i<legal.length;i++)if(output.logits[i]+prior[i]+(headBias?.[observation.actions.pointers[i*5+2]]??0)>output.logits[best]+prior[best]+(headBias?.[observation.actions.pointers[best*5+2]]??0))best=i;return legal[best];},telemetry:{pureIncludesSoftTacticalPrior:true}};
    return {modelVersion,getAction:(e:GameEngine,p:number)=>ai.getAction(e,p),get telemetry(){return ai.telemetry;}};
}
const modelAI=policy(path.resolve(job.modelPrefix),job.mode??'search',true),opponent=job.opponent==='Original-APKlikeAI-Hard'?hard:policy(path.resolve(job.opponentPrefix??job.modelPrefix),job.opponentMode??'search',true);
const started=performance.now(),cpu=process.cpuUsage(),rootTimes:number[]=[],queueTimes:number[]=[],opponentTimes:number[]=[];let steps=0,roots=0,nodes=0,overBudget=0,over4000=0,error:string|null=null,stop='action_truncation';
const semanticTrajectory=crypto.createHash('sha256');
try{
    for(;steps<(job.maxSteps??4000);steps++){
        const state=engine.getState();if(state.winner!==null){stop='natural';break;}
        if(state.turn-initial.turn>=(job.maxRounds??120)){stop='round_truncation';break;}
        if(performance.now()-started>(job.maxWallMs??20000000)){stop='wall_truncation';break;}
        const side=state.currentPlayer===self?'model':'opponent',ai=side==='model'?modelAI:opponent,start=performance.now(),action=ai.getAction(engine,state.currentPlayer),elapsed=performance.now()-start;
        if(!engine.hasLegalAction(state.currentPlayer,action))throw Error('实际对局动作未通过权威合法检查');
        const telemetry:any=ai.telemetry;
        if(side==='model'){
            if(telemetry.queued)queueTimes.push(elapsed);else{rootTimes.push(elapsed);roots++;nodes+=telemetry.nodes??0;overBudget+=Number(elapsed>(job.budgetMs??4000));over4000+=Number(elapsed>4000);}
        }else opponentTimes.push(elapsed);
        const result=engine.step(action);if(result.info.includes('非法动作'))throw Error('权威引擎拒绝实际动作');
        semanticTrajectory.update(`${state.currentPlayer}:${encodeAction(action)}\n`);
        append('actions.jsonl.gz',{step:steps,player:state.currentPlayer,side,action,code:encodeAction(action),beforeHash:hash(state),afterHash:hash(result.state),elapsedMs:elapsed,telemetry});
        if(steps%50===0)console.log(JSON.stringify({id:job.id,steps,roots,nodes,elapsedSeconds:(performance.now()-started)/1000}));
    }
    if(engine.getState().winner!==null)stop='natural';
}catch(e){error=String(e);stop='error';}
const final=engine.getState(),winner=final.winner,natural=stop==='natural'&&winner!==null;
const distribution=(a:number[])=>{a.sort((a,b)=>a-b);const q=(p:number)=>a.length?a[Math.floor((a.length-1)*p)]:null;return {count:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1)};};
const result={id:job.id,job,self,steps,roots,nodes,overBudget,over4000,winner:natural?winner:null,rawWinner:winner,natural,stop,error,
    outcome:natural?(winner===-1?'draw':winner===getAllianceId(initial,self)?'win':'loss'):stop,
    finalHash:hash(final),openingCanonicalSha256:ruleStateHash(initial),semanticTrajectorySha256:semanticTrajectory.digest('hex'),trajectorySha256:fs.existsSync(path.join(out,'actions.jsonl.gz'))?crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'actions.jsonl.gz'))).digest('hex'):null,
    elapsedSeconds:(performance.now()-started)/1000,cpu:process.cpuUsage(cpu),memory:process.memoryUsage(),rootLatency:distribution(rootTimes),queueLatency:distribution(queueTimes),opponentLatency:distribution(opponentTimes),hardTelemetry:hard.telemetry,modelVersion:modelAI.modelVersion};
save('result.json',result);console.log(JSON.stringify(result));if(error)process.exitCode=1;
