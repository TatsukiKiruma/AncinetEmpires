/** 仅消费固定准入父局；败方无搜索比较的动作不作正向策略示范，截断关闭Value。 */
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { ruleStateHash } from '../../data_acceptance_20261016/replay/core';
import { sha,stateHash } from '../../dual_stream_v2_phase1_20261020/io';
import { gzipJsonRows } from '../execution_v4/gzip_rows';
import type { TrainingSample } from '../native_source';

export async function* expertSamples(manifestPath:string,excluded:ReadonlySet<string>):AsyncGenerator<TrainingSample&{searchTarget?:{code:string;score:number}[];origin:string}> {
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const meanSteps=manifest.games.reduce((sum:number,entry:any)=>sum+JSON.parse(fs.readFileSync(path.join(entry.directory,'result.json'),'utf8')).steps,0)/Math.max(1,manifest.games.length);
    for(const entry of manifest.games){
        const dir=path.resolve(entry.directory),raw=fs.readFileSync(path.join(dir,'result.json')),strict=JSON.parse(fs.readFileSync(path.join(dir,'strict.json'),'utf8'));
        if(sha(raw)!==entry.resultSha256||!strict.passed||strict.sourceResultSha256!==entry.resultSha256)throw Error('准入父局与独立strict结果身份失配');
        const result=JSON.parse(raw.toString()),started=JSON.parse(fs.readFileSync(path.join(dir,'started.json'),'utf8'));
        if(started.job.split!=='train'||result.error)throw Error('非训练或错误对局禁止准入');
        const actionFile=path.join(dir,'actions.jsonl.gz');if(sha(fs.readFileSync(actionFile))!==result.trajectorySha256)throw Error('准入动作流SHA变化');
        const engine=new GameEngine(started.initial,{applyInitialTurnStart:false});let actual=0;
        for await(const row of gzipJsonRows(path.join(dir,'actions.jsonl.gz'))){
            const state=engine.getState();if(stateHash(state)!==row.beforeHash)throw Error('专家轨迹前态失配');
            const legal=engine.getLegalActions(state.currentPlayer),targetIndex=legal.findIndex(action=>encodeAction(action)===row.code);if(targetIndex<0)throw Error('专家轨迹实际动作不合法');
            const target=(row.telemetry?.candidates??[]).filter((candidate:any)=>Number.isFinite(candidate.score)&&legal.some(action=>encodeAction(action)===candidate.rootAction)).map((candidate:any)=>({code:candidate.rootAction,score:candidate.score}));
            const terminalReliable=Boolean(result.natural&&result.winner!==null),winningDemonstration=terminalReliable&&getAllianceId(state,state.currentPlayer)===result.winner;
            const hardDemonstration=started.job.opponent==='Original-APKlikeAI-Hard'&&row.side==='opponent';
            const hasSearchComparison=new Set(target.map((candidate:any)=>candidate.code)).size>1,policyMask=hardDemonstration||winningDemonstration||hasSearchComparison;
            const sample={state,legalActions:legal,targetIndex,targetCode:row.code,policyMask,valueMask:terminalReliable,winner:terminalReliable?result.winner:null,parentId:started.job.id,source:'replay' as const,weight:1/Math.max(1,result.steps),sourceBeforeHash:row.beforeHash,currentBeforeHash:row.beforeHash,macro:row.step,subAction:0,normalizationScale:meanSteps,
                origin:hardDemonstration?'project-hard-demonstration':hasSearchComparison?'search-expert':winningDemonstration?'natural-winner-demonstration':'value-only',searchTarget:hasSearchComparison?target:undefined};
            engine.step(row.action);actual++;
            if((!policyMask&&!terminalReliable)||excluded.has(row.beforeHash)||excluded.has(ruleStateHash(state)))continue;
            yield sample;
        }
        if(actual!==result.steps||stateHash(engine.getState())!==result.finalHash)throw Error('专家轨迹长度或最终状态不一致');
    }
}
