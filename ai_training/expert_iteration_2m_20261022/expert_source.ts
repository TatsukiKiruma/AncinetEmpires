/** 只读取独立strict通过且有固定结果身份的新采样对局。 */
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { gzipRows, sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import type { TrainingSample } from './native_source';
export async function* expertSamples(manifestPath:string,excluded:ReadonlySet<string>):AsyncGenerator<TrainingSample&{searchTarget?:{code:string;score:number}[];origin:string}> {
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const meanSteps=manifest.games.reduce((n:number,e:any)=>n+JSON.parse(fs.readFileSync(path.join(e.directory,'result.json'),'utf8')).steps,0)/Math.max(1,manifest.games.length);
    for(const entry of manifest.games){
        const dir=path.resolve(entry.directory),resultRaw=fs.readFileSync(path.join(dir,'result.json')),strict=JSON.parse(fs.readFileSync(path.join(dir,'strict.json'),'utf8'));
        if(sha(resultRaw)!==entry.resultSha256||!strict.passed||strict.sourceResultSha256!==entry.resultSha256)throw Error('新采样结果与独立重放身份失配');
        const result=JSON.parse(resultRaw.toString()),started=JSON.parse(fs.readFileSync(path.join(dir,'started.json'),'utf8'));
        if(started.job.split!=='train'||result.error)throw Error('非训练父局或错误轨迹禁止混入专家数据');
        const engine=new GameEngine(started.initial,{applyInitialTurnStart:false});
        for await(const row of gzipRows(fs.readFileSync(path.join(dir,'actions.jsonl.gz')))){
            const state=engine.getState();if(stateHash(state)!==row.beforeHash)throw Error('新轨迹前态不一致');
            const legal=engine.getLegalActions(state.currentPlayer),targetIndex=legal.findIndex(a=>encodeAction(a)===row.code);if(targetIndex<0)throw Error('新轨迹当前规则不合法');
            const terminalReliable=result.natural&&result.winner!==null;
            const sample={state,legalActions:legal,targetIndex,targetCode:row.code,policyMask:true,valueMask:terminalReliable,winner:terminalReliable?result.winner:null,
                parentId:started.job.id,source:'replay' as const,weight:1/Math.max(1,result.steps),sourceBeforeHash:row.beforeHash,currentBeforeHash:row.beforeHash,macro:row.step,subAction:0,
                normalizationScale:meanSteps,origin:started.job.opponent==='Original-APKlikeAI-Hard'&&row.side==='opponent'?'project-hard-demonstration':'search-expert',
                searchTarget:row.telemetry?.candidates?.map((c:any)=>({code:c.rootAction,score:c.score}))};
            engine.step(row.action);
            if(excluded.has(row.beforeHash)||excluded.has(ruleStateHash(state)))continue;
            yield sample;
        }
        if(stateHash(engine.getState())!==result.finalHash)throw Error('新轨迹最终状态不一致');
    }
}
