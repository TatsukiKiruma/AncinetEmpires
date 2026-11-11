import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync,gunzipSync } from 'node:zlib';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DIR,read,save,sha,hash } from './io';

const mode=process.argv[2]??'index',prefix='search-scale';
fs.mkdirSync(path.join(DIR,prefix),{recursive:true});
if(mode==='index'){
    const tag=process.argv[3],suffix=tag?'-'+tag:'';
    const hashes=new Set<string>(),logs:any[]=[];let actions=0;
    for(const folder of fs.readdirSync(DIR).filter(n=>n.endsWith('battles')).sort()){
        const slots=path.join(DIR,folder,'slots');if(!fs.existsSync(slots))continue;
        for(const name of fs.readdirSync(slots).sort()){
            const base=path.join(slots,name),resultFile=path.join(base,'result.json');if(!fs.existsSync(resultFile))continue;
            const r=JSON.parse(fs.readFileSync(resultFile,'utf8')),s=JSON.parse(fs.readFileSync(path.join(base,'strict-replay.json'),'utf8'));
            assert.ok(s.passed&&s.actions===r.actions,'已消费评测输入必须先完成实际动作strict');
            const file=path.join(base,'actions.jsonl.gz'),bytes=fs.readFileSync(file),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean);assert.equal(rows.length,r.actions);
            // 仅提取前态身份；评测动作和胜负均不进入校准监督。
            for(const line of rows)hashes.add(JSON.parse(line).beforeHash);
            actions+=rows.length;logs.push({path:path.relative(DIR,file).replaceAll('\\','/'),sha256:sha(bytes),actions:rows.length});
        }
    }
    const bytes=gzipSync(Buffer.from([...hashes].sort().join('\n')+'\n')),file=path.join(DIR,prefix,`evaluation-hashes${suffix}.txt.gz`);assert.ok(!fs.existsSync(file));fs.writeFileSync(file,bytes,{flag:'wx'});
    save(prefix+`/evaluation-index${suffix}.json`,{passed:true,tag:tag??null,uniqueStates:hashes.size,actions,logs,hashFileSha256:sha(bytes),inputIdentityOnly:true,protocolSha256:sha(fs.readFileSync(path.join(DIR,'search_scale_protocol.json')))});
    console.log({passed:true,logs:logs.length,actions,uniqueStates:hashes.size});
}else{
    assert.equal(mode,'roots');const lane=Number(process.argv[3]??0),lanes=Number(process.argv[4]??4),selection=read('selection.json'),index=read(prefix+'/evaluation-index.json');
    const bytes=fs.readFileSync(path.join(DIR,prefix,'evaluation-hashes.txt.gz'));assert.equal(sha(bytes),index.hashFileSha256);
    const evaluation=new Set(gunzipSync(bytes).toString().trim().split('\n')),parents=[...selection.parents].sort((a:any,b:any)=>a.parentId.localeCompare(b.parentId)),rows:any[]=[],coverage:any[]=[];
    let strictPrefixActions=0,excludedEvaluation=0;
    for(const [i,parent] of parents.entries()){
        if(i%lanes!==lane)continue;const phases=new Set<string>();let atoms=0,checked=0,skipped=0;
        for(const entry of parent.segments){
            if(phases.size===3)break;if(!entry.policyLabelEligible||!entry.admittedAtoms)continue;
            const source=path.resolve(DIR,'../data_acceptance_20261016/phone'),qualified=await inspectAndRead(source,entry),s=structuredClone(qualified.header.initialState),rules=s.rules;
            if(rules.unitLimit!==undefined){rules.populationLimit=rules.unitLimit;delete rules.unitLimit;}rules.allowZeroPopulationRecruitAtLimit=true;
            for(const team of Object.values(rules.teams??{}) as any[])if(team.unitLimit!==undefined){team.populationLimit=team.unitLimit;delete team.unitLimit;}
            const engine=new GameEngine(s,{disableAutoAdvanceWhenNoMeaningfulAction:true});
            await inspectAndRead(source,entry,row=>{
                if(phases.size===3)return;
                const state=engine.getState(),legal=engine.getLegalActions(state.currentPlayer),action=legal.find(a=>encodeAction(a)===row.code);assert.ok(action,'校准前缀必须通过当前权威合法性');
                const phase=state.turn<=5?'opening':state.turn<=15?'middle':'late',key=hash(state),meaningful=legal.some(a=>a.type!=='end_turn'&&a.type!=='surrender');
                if(atoms>=4&&!phases.has(phase)&&state.winner===null&&meaningful&&action.type!=='surrender'){
                    if(evaluation.has(key)){excludedEvaluation++;skipped++;}
                    else{
                        const id=parent.parentId+'-'+phase;rows.push({id,parent:parent.parentId,split:parent.split,phase,state,stateHash:key,label:row.code,weight:row.weight*(row.valueMask&&row.outcomeTarget===1?1.5:1),sourceBeforeHash:row.beforeHash,segment:entry.segmentId,prefixAtoms:atoms,sourceIdentity:entry.sourceIdentity,shardSha256:entry.shardSha256});phases.add(phase);
                    }
                }
                if(phases.size===3)return;assert.ok(!engine.step(action).info.includes('非法动作'));atoms++;checked++;strictPrefixActions++;
            });
        }
        coverage.push({parent:parent.parentId,split:parent.split,phases:[...phases],strictPrefixActions:checked,excludedEvaluation:skipped});
        if(coverage.length%10===0)save(prefix+`/roots-${lane}.live.json`,{parents:coverage.length,roots:rows.length,strictPrefixActions});
    }
    const output=path.join(DIR,prefix,`roots-${lane}.jsonl.gz`),packed=gzipSync(Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'));assert.ok(!fs.existsSync(output));fs.writeFileSync(output,packed,{flag:'wx'});
    save(prefix+`/roots-${lane}.receipt.json`,{passed:true,lane,lanes,roots:rows.length,parents:coverage.length,coverage,strictPrefixActions,excludedEvaluation,rootFileSha256:sha(packed),selectionSha256:sha(fs.readFileSync(path.join(DIR,'selection.json'))),protocolSha256:sha(fs.readFileSync(path.join(DIR,'search_scale_protocol.json'))),evaluationIndexSha256:sha(fs.readFileSync(path.join(DIR,prefix,'evaluation-index.json'))),sourceSha256:sha(fs.readFileSync(new URL(import.meta.url))),originalTrainDevLabelsOnly:true});
    console.log({passed:true,lane,parents:coverage.length,roots:rows.length,strictPrefixActions,excludedEvaluation});
}
