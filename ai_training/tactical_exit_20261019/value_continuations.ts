import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync,gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../../src/game/ai/apk_like_ai';
import { getAllianceId } from '../../src/game/rule_config';
import { infer,legalActions } from './policy_runtime';
import { stateTokens,stateSummary } from './value_state';
import { DIR,read,save,sha,hash,quantiles } from './io';
const mode=process.argv[2]??'play',lane=Number(process.argv[3]??0),lanes=4,protocol=read('value-continuation-protocol.json'),roots=read('value-continuation-roots.json').roots,model=read('teacher-model.json'),old=read('old-schema.json');
assert.equal(protocol.samplingUsesSearch,false);assert.equal(protocol.policyTargetsCollected,false);assert.equal(sha(fs.readFileSync(path.join(DIR,'teacher-model.json'))),protocol.sourceModelSha256);
const frozen=read('source-freeze-value-continuations-v1.json');assert.ok(frozen.files['ai_training/tactical_exit_20261019/value_continuations.ts']);for(const [file,item] of Object.entries(frozen.files) as [string,{sha256:string}][])assert.equal(sha(fs.readFileSync(path.resolve(DIR,'../..',file))),item.sha256,'续弈源码必须匹配冻结身份');
for(const [i,root] of roots.entries()){
    if(i%lanes!==lane)continue;const prefix=`value-continuations/slots/${i}`,folder=path.join(DIR,prefix),initial=read(root.path);assert.equal(hash(initial),root.stateHash);
    if(mode==='replay'){
        const result=read(prefix+'/result.json'),e=new GameEngine(initial),samples=new Map<number,any>();for(const r of gunzipSync(fs.readFileSync(path.join(folder,'samples.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(v=>JSON.parse(v)))samples.set(r.i,r);
        const rows=gunzipSync(fs.readFileSync(path.join(folder,'actions.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(v=>JSON.parse(v));let checkedSamples=0;
        for(const r of rows){assert.equal(hash(e.getState()),r.beforeHash);const legal=legalActions(e);assert.equal(hash(legal.map(encodeAction)),r.legalHash);assert.ok(legal.some(a=>encodeAction(a)===r.code));const sample=samples.get(r.i);if(sample){const s=e.getState(),x=stateTokens(s,old);assert.equal(hash(s),sample.beforeHash);assert.deepEqual(x.tokens,sample.tokens);assert.deepEqual(x.groups,sample.groups);assert.deepEqual(stateSummary(e),sample.valueSummary);assert.equal(getAllianceId(s,s.currentPlayer),sample.perspectiveAlliance);checkedSamples++;}assert.ok(!e.step(r.action).info.includes('非法动作'));assert.equal(hash(e.getState()),r.afterHash);}
        assert.equal(hash(e.getState()),result.finalHash);assert.equal(rows.length,result.actions);assert.equal(checkedSamples,samples.size);save(prefix+'/strict-replay.json',{passed:true,actions:rows.length,samples:checkedSamples,actionsSha256:sha(fs.readFileSync(path.join(folder,'actions.jsonl.gz'))),samplesSha256:sha(fs.readFileSync(path.join(folder,'samples.jsonl.gz')))});continue;
    }
    assert.equal(mode,'play');if(fs.existsSync(path.join(folder,'result.json')))continue;fs.mkdirSync(folder,{recursive:true});
    const logs=fs.openSync(path.join(folder,'actions.jsonl'),'wx'),samples=fs.openSync(path.join(folder,'samples.jsonl'),'wx'),e=new GameEngine(initial),times:number[]=[];
    let rng=root.opponentSeed>>>0;const random=()=>{rng=(1664525*rng+1013904223)>>>0;return rng/4294967296;};
    const opponent=root.opponent==='apk_like'?new ApkLikeAI(random):new HeuristicAI(random),started=performance.now();let count=0,collected=0,classification='error',error:string|null=null;
    try{
        while(true){
            const state=e.getState();if(e.isTerminal()){classification=state.winner===-1?'natural_draw':state.winner===getAllianceId(state,root.seat)?'natural_win':'natural_loss';break;}
            if(count>=protocol.budgets.maxActions){classification='action_truncation';break;}if(performance.now()-started>=protocol.budgets.maxWallMs){classification='wall_truncation';break;}
            const legal=legalActions(e),own=state.currentPlayer===root.seat,rngBefore=rng,t=performance.now(),action=own?(()=>{const r=infer(e,legal,model,old);return r.x.actions[r.out.best];})():opponent.getAction(e,state.currentPlayer,legal),ms=performance.now()-t;
            if(own)times.push(ms);if(ms>protocol.budgets.maxDecisionMs){classification='decision_timeout';break;}if(performance.now()-started>=protocol.budgets.maxWallMs){classification='wall_truncation';break;}
            assert.ok(legal.some(a=>encodeAction(a)===encodeAction(action)));
            if(count%protocol.stateSampleEveryActions===0){const x=stateTokens(state,old);fs.writeSync(samples,JSON.stringify({i:count,parent:root.parent,turn:state.turn,beforeHash:hash(state),tokens:x.tokens,groups:x.groups,valueSummary:stateSummary(e),perspectiveAlliance:getAllianceId(state,state.currentPlayer),valueSplit:root.valueSplit,globalPartition:'train',source:'pure-policy-natural-value-continuation'})+'\n');collected++;}
            const result=e.step(action);assert.ok(!result.info.includes('非法动作'));fs.writeSync(logs,JSON.stringify({i:count,action,code:encodeAction(action),beforeHash:hash(state),afterHash:hash(result.state),legalHash:hash(legal.map(encodeAction)),rngBefore,rngAfter:rng,ms})+'\n');count++;
            if(count%32===0)save(prefix+'/live.json',{actions:count,samples:collected,turn:result.state.turn,seconds:(performance.now()-started)/1000});
        }
    }catch(ex){classification='error';error=String(ex);}finally{fs.closeSync(logs);fs.closeSync(samples);}
    for(const name of ['actions','samples'])fs.writeFileSync(path.join(folder,name+'.jsonl.gz'),gzipSync(fs.readFileSync(path.join(folder,name+'.jsonl'))),{flag:'wx'});
    const final=e.getState();save(prefix+'/result.json',{root,classification,error,actions:count,samples:collected,winner:final.winner,finalHash:hash(final),seconds:(performance.now()-started)/1000,latency:quantiles(times),searchUsed:false,policyTargetsCollected:false,sourceModelSha256:protocol.sourceModelSha256,protocolSha256:sha(fs.readFileSync(path.join(DIR,'value-continuation-protocol.json')))});console.log({game:i,classification,actions:count,samples:collected});
}
