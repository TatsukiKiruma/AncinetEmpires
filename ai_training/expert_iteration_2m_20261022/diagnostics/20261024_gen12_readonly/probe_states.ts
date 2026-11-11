/** 只读重建少量已完成轨迹，用权威编码导出诊断探针；不启动对局或训练。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../../src/game/engine';
import { encodeAction } from '../../../../src/game/env';
import { getAllianceId } from '../../../../src/game/rule_config';
import { encodeDualObservation } from '../../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../../src/ai_runtime/dual_v2/reachability';
import { trainingValueTarget } from '../../../../src/ai_runtime/dual_v3/value_target';
import { softPriors } from '../../../../src/ai_runtime/dual_v3/search_policy';
import { packTensorBatch } from '../../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { gzipJsonRows } from '../../execution_v4/gzip_rows';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const manifest=read(path.join(root,'execution_v5/generations/gen_02/expert-manifest.json'));
const seed=manifest.games.slice(0,131).map((g:any)=>g.directory) as string[];
const added=manifest.games.slice(131).map((g:any)=>g.directory) as string[];
const selection:{group:string;directory:string}[]=[];
function choose(group:string,dirs:string[],opponent:string,count:number){
    const filtered=dirs.filter(d=>read(path.join(d,'result.json')).job.opponent===opponent);
    for(let i=0;i<count;i++)selection.push({group,directory:filtered[Math.floor(i*filtered.length/count)]});
}
choose('seed-hard',seed,'Original-APKlikeAI-Hard',4);
choose('seed-history',seed,'historical',2);
choose('seed-self',seed,'self',2);
choose('added-hard',added,'Original-APKlikeAI-Hard',4);
choose('added-history',added,'historical',4);
for(const kind of ['historical','hard']){
    const base=path.join(root,'execution_v5/validation-cache',kind);
    const panel=fs.readdirSync(base).find(n=>n.startsWith('0a71b10c75a9'))!;
    const dirs=fs.readdirSync(path.join(base,panel),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>path.join(base,panel,d.name));
    for(let i=0;i<4;i++)selection.push({group:`development-${kind}`,directory:dirs[Math.floor(i*dirs.length/4)]});
}
const meanSteps=manifest.games.reduce((s:number,g:any)=>s+read(path.join(g.directory,'result.json')).steps,0)/manifest.games.length;
const output=path.join(here,'probes-v2.frames');
if(fs.existsSync(output))throw Error('诊断探针已经存在，拒绝覆盖');
const fd=fs.openSync(output,'wx'),records:any[]=[];
try{
for(const selected of selection){
    const result=read(path.join(selected.directory,'result.json')),started=read(path.join(selected.directory,'started.json'));
    const engine=new GameEngine(started.initial,{applyInitialTurnStart:false});
    const picks=new Set([0,...[.1,.3,.6,.9].map(q=>Math.floor(result.steps*q))]);
    for await(const row of gzipJsonRows(path.join(selected.directory,'actions.jsonl.gz'))){
        if(picks.has(row.step)){
            const state=engine.getState(),legal=engine.getLegalActions(state.currentPlayer),context=new ReachabilityContext(state);
            if(!engine.hasLegalAction(state.currentPlayer,row.action))throw Error('探针动作不合法');
            const observation=encodeDualObservation(state,legal,context),targetIndex=legal.findIndex(a=>encodeAction(a)===row.code);
            const target=observation.actions.sourceIndices.indexOf(targetIndex);
            const reliable=Boolean(result.natural&&result.winner!==null),outcome=trainingValueTarget(state,observation.playerOrder,reliable,result.winner);
            const winning=reliable&&getAllianceId(state,state.currentPlayer)===result.winner;
            const hard=started.job.opponent==='Original-APKlikeAI-Hard'&&row.side==='opponent';
            const targetScores=new Map<number,number>();
            for(const c of row.telemetry?.candidates??[]){
                const legalIndex=legal.findIndex(a=>encodeAction(a)===c.rootAction),index=observation.actions.sourceIndices.indexOf(legalIndex);
                if(index>=0&&Number.isFinite(c.score))targetScores.set(index,Math.max(targetScores.get(index)??-Infinity,c.score));
            }
            const comparison=targetScores.size>1,policyMask=hard||winning||comparison;
            const legalPrior=softPriors(state,legal,context),prior=Array.from(observation.actions.sourceIndices,i=>legalPrior[i]);
            const source={id:`${started.job.id}:${row.step}`,parent:started.job.id,source:hard?'project-hard-demonstration':comparison?'search-expert':winning?'natural-winner-demonstration':'value-only',
                quality:!hard&&comparison?4:1,parentPolicyScale:meanSteps,parentValueScale:meanSteps/Math.max(1,result.steps),prior,
                ...(comparison?{searchTarget:[...targetScores].map(([index,score])=>({index,score}))}:{})};
            const pack=packTensorBatch([observation],[{target,policyMask,valueMask:outcome.valueMask,valueTarget:outcome.target,weight:1/Math.max(1,result.steps)}]);
            const meta=Buffer.from(JSON.stringify({...pack.metadata,sources:[source]})),head=Buffer.alloc(8);
            head.writeUInt32LE(meta.length);head.writeUInt32LE(pack.bytes.length,4);fs.writeSync(fd,head);fs.writeSync(fd,meta);fs.writeSync(fd,pack.bytes);
            records.push({id:source.id,group:selected.group,directory:selected.directory,step:row.step,turn:state.turn,side:row.side,player:state.currentPlayer,self:started.self,winner:result.winner,
                winning:reliable?winning:null,policyMask,valueMask:outcome.valueMask,source:source.source,action:row.action.type,legal:legal.length,priorMin:Math.min(...prior),priorMax:Math.max(...prior),
                playerIds:observation.playerOrder.playerIds,target:Array.from(outcome.target),actionCodes:Array.from(observation.actions.sourceIndices,i=>encodeAction(legal[i]))});
        }
        engine.step(row.action);
        if(row.step>Math.max(...picks))break;
    }
    console.log(JSON.stringify({completedGame:started.job.id,group:selected.group,probes:records.length}));
}
}finally{fs.closeSync(fd);}
fs.writeFileSync(path.join(here,'probes-v2.json'),JSON.stringify({qualification:'确定性分层诊断子集，训练和开发轨迹分别标识，不能当作新独立验证。',records},null,2));
