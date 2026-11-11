import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync,gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../../src/game/ai/apk_like_ai';
import { getAllianceId } from '../../src/game/rule_config';
import { chooseBounded,type SearchMemory } from './search';
import { infer,legalActions } from './policy_runtime';
import { stateSummary } from './value_state';
import { read,save,DIR,hash,quantiles } from './io';
import { auditSearchRisks } from './audit_search_risks';
import { rejectPcGames } from './device_protocol';

const mode=process.argv[2]??'play',lane=Number(process.argv[3]??0),lanes=Number(process.argv[4]??1),model=read('teacher-model.json'),old=read('old-schema.json');
if(mode!=='replay')rejectPcGames();
const teacherModelHash=hash(model);
assert.ok(read('teacher-gate.json').passed,'搜索教师未通过门禁，禁止进入在线纠错采样');
for(const [i,root] of read('expert-roots.json').roots.entries()){
    if(i%lanes!==lane)continue;
    const prefix=`expert-games/${i}`,initial=read(root.path);assert.equal(hash(initial),root.stateHash);
    if(mode==='replay'){
        const result=read(prefix+'/result.json'),engine=new GameEngine(initial),rows=gunzipSync(fs.readFileSync(path.join(DIR,prefix,'actions.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(v=>JSON.parse(v));
        const riskWitnessAudit={branches:0,targets:0,witnessActions:0,lethalWitnesses:0,baselineProjections:0};
        for(const row of rows){assert.equal(hash(engine.getState()),row.beforeHash);const legal=legalActions(engine);assert.equal(hash(legal.map(encodeAction)),row.legalHash);assert.ok(legal.some(a=>encodeAction(a)===row.code));const audited=auditSearchRisks(engine,row.search);for(const k of Object.keys(riskWitnessAudit) as (keyof typeof riskWitnessAudit)[])riskWitnessAudit[k]+=audited[k];assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);}
        assert.equal(rows.length,result.actions);assert.equal(hash(engine.getState()),result.finalHash);save(prefix+'/strict-replay.json',{passed:true,actions:rows.length,riskWitnessAudit});continue;
    }
    if(fs.existsSync(path.join(DIR,prefix,'result.json')))continue;
    fs.mkdirSync(path.join(DIR,prefix),{recursive:true});const handle=fs.openSync(path.join(DIR,prefix,'actions.jsonl'),'wx'),samples=fs.openSync(path.join(DIR,prefix,'samples.jsonl'),'wx');
    let rng=root.opponentSeed>>>0;const random=()=>{rng=(1664525*rng+1013904223)>>>0;return rng/4294967296;};
    const opponent=root.opponent==='apk_like'?new ApkLikeAI(random):new HeuristicAI(random),engine=new GameEngine(initial),memory:SearchMemory={},times:number[]=[];
    const started=performance.now();let actions=0,teacherActions=0,corrections=0,collected=0,classification='error',error:any=null;
    try{
        while(true){
            const s=engine.getState();if(engine.isTerminal()){classification=s.winner===-1?'natural_draw':s.winner===getAllianceId(s,root.seat)?'natural_win':'natural_loss';break;}
            if(actions>=2000){classification='action_truncation';break;}if(performance.now()-started>600000){classification='wall_truncation';break;}
            const legal=legalActions(engine),own=s.currentPlayer===root.seat,t=performance.now();
            const selected=own?chooseBounded(engine,legal,model,old,'teacher_search',Number.MAX_SAFE_INTEGER,memory):null;
            const action=selected?.action??opponent.getAction(engine,s.currentPlayer,legal),ms=performance.now()-t;if(own)times.push(ms);
            if(ms>30000){classification='decision_timeout';break;}
            let sample:any=null;
            if(selected){
                teacherActions++;const correction=selected.search.changed||selected.search.preferredPolicyEvaluated===false;
                if(correction||teacherActions%8===0){
                    const actual=selected.input as any,rootPolicy=actual.tokens?null:infer(engine,legal,model,old),x=actual.tokens?actual:rootPolicy!.x;
                    const target=x.codes.indexOf(encodeAction(action)),preferred=actual.tokens?selected.search.preferred:rootPolicy!.x.codes[rootPolicy!.out.best];assert.ok(target>=0);
                    const changed=preferred!==encodeAction(action);corrections+=Number(changed);collected++;
                    sample={...x,actions:undefined,extra:undefined,focus:undefined,valueSummary:stateSummary(engine),valueMask:false,valueTarget:null,target,weight:changed?2.:.5,
                        parent:root.parent,turn:s.turn,macro:actions,subAction:0,macroLength:1,type:action.type,source:'stage5-search-expert',game:i,prefix:root.prefix,beforeHash:hash(s),legalHash:hash(x.codes),defaultCode:preferred,teacherCode:encodeAction(action),corrected:changed,reason:selected.search.reason,teacherModelHash};
                }
            }
            const beforeHash=hash(s),result=engine.step(action);assert.ok(!result.info.includes('非法动作'));
            fs.writeSync(handle,JSON.stringify({i:actions,action,code:encodeAction(action),beforeHash,afterHash:hash(result.state),legalHash:hash(legal.map(encodeAction)),ms,search:selected?.search??null})+'\n');
            if(sample){sample.afterHash=hash(result.state);fs.writeSync(samples,JSON.stringify(sample)+'\n');}
            actions++;if(actions%32===0)save(prefix+'/live.json',{actions,teacherActions,corrections,collected,turn:result.state.turn,seconds:(performance.now()-started)/1000});
        }
    }catch(e){error=String(e);classification='error';}finally{fs.closeSync(handle);fs.closeSync(samples);}
    for(const name of ['actions','samples'])fs.writeFileSync(path.join(DIR,prefix,name+'.jsonl.gz'),gzipSync(fs.readFileSync(path.join(DIR,prefix,name+'.jsonl'))));
    save(prefix+'/result.json',{root,classification,error,actions,teacherActions,corrections,collected,finalHash:hash(engine.getState()),winner:engine.getState().winner,latency:quantiles(times),seconds:(performance.now()-started)/1000,teacherModelHash});console.log({i,classification,actions,corrections,collected});
}
