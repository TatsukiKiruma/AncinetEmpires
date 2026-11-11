import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { hasAbility, isUndead } from '../../src/game/abilities';
import { requiresAuraCorrection } from './complete_tactics';
import { extractFeatures } from './complete_tactics';
import { extractFeatures as reference } from '../tactical_conditional_20261018/complete_tactics';
import { actorId } from './tactics';
import { nextOpponent } from './threat';
import { DIR, read, save, hash, sha } from './io';

const lane=Number(process.argv[2]??0),lanes=Number(process.argv[3]??1),selection=read('selection.json'),oldCount=read('old-schema.json').candidate.keys.length;
const source=path.resolve(DIR,'../data_acceptance_20261016/phone');
for(const [pi,parent] of selection.parents.entries()){
    if(pi%lanes!==lane)continue;
    const name=`data-final/${parent.parentId}.receipt.json`;
    if(fs.existsSync(path.join(DIR,name)))continue;
    const input=`data/${parent.parentId}.receipt.json`;
    while(!fs.existsSync(path.join(DIR,input)))await new Promise(r=>setTimeout(r,500));
    const receipt=read(input);assert.equal(sha(fs.readFileSync(receipt.path)),receipt.sha256);
    if(receipt.reusedFrozenV3){save(name,{...receipt,canonicalV3Threshold:true,thresholdChanges:0});continue;}
    const rows=gunzipSync(fs.readFileSync(receipt.path)).toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    let currentSegment='',engine:GameEngine|undefined,changed=0,checked=0,sampleCandidates=0;
    for(const [rowIndex,row] of rows.entries()){
        const segment=parent.segments.find((e:any)=>e.policyLabelEligible&&row.macro>=e.globalOffset&&row.macro<e.maxGlobalMacroExclusive);assert.ok(segment);
        if(segment.segmentId!==currentSegment){
            const checked=await inspectAndRead(source,segment),initial=structuredClone(checked.header.initialState),rules=initial.rules;
            if(rules.unitLimit!==undefined){rules.populationLimit=rules.unitLimit;delete rules.unitLimit;}rules.allowZeroPopulationRecruitAtLimit=true;
            for(const team of Object.values(rules.teams??{}) as any[])if(team.unitLimit!==undefined){team.populationLimit=team.unitLimit;delete team.unitLimit;}
            engine=new GameEngine(initial);currentSegment=segment.segmentId;
        }
        const before=engine!.getState();assert.equal(hash(before),row.beforeHash);
        if(requiresAuraCorrection(before)){
            for(let i=0;i<row.codes.length;i++){
                const action=decodeAction(row.codes[i])!,branch=engine!.clone(),after=branch.step(action).state,id=actorId(action,before,after),reply=nextOpponent(branch,before.currentPlayer);
                if(!reply.known||reply.branch.isTerminal())continue;
                const state=reply.branch.getState(),current=state.units.filter(u=>u.ownerId===state.currentPlayer);
                if(!current.some(u=>hasAbility(u,'cleansing_aura'))||!current.some(isUndead))continue;
                const actor=state.units.find(u=>u.id===id),features=new Map<number,number>(row.candidates[i]);
                const lethal=Number(!!actor&&(features.get(oldCount-4)??0)*128>=actor.hp);
                checked++;
                if((features.get(oldCount-3)??0)!==lethal){
                    changed++;features.set(oldCount-3,lethal);row.candidates[i]=[...features].sort((a,b)=>a[0]-b[0]);
                }
            }
        }
        if(rowIndex===Math.floor(rows.length/2)){
            const actions=row.codes.map(decodeAction),old=reference(engine!,actions),current=extractFeatures(engine!,actions);
            assert.deepEqual(current.old,old.old,'扩量中段旧特征不一致');assert.deepEqual(current.extra,old.extra,'扩量中段新特征不一致');
            for(let i=0;i<row.codes.length;i++){
                const sparse=new Map<number,number>(row.candidates[i]);
                assert.deepEqual(Array.from({length:10},(_,j)=>sparse.get(oldCount-10+j)??0),old.old[i],'缓存旧10维不一致');
                assert.deepEqual(Array.from({length:22},(_,j)=>sparse.get(oldCount+j)??0),old.extra[i],'缓存新22维不一致');
            }
            sampleCandidates=actions.length;
        }
        assert.ok(!engine!.step(decodeAction(row.codes[row.target])!).info.includes('非法动作'));
    }
    let output=receipt.path,digest=receipt.sha256;
    if(changed){
        output=path.join(DIR,`data-final/${parent.parentId}.jsonl.gz`);fs.mkdirSync(path.dirname(output),{recursive:true});
        fs.writeFileSync(output,gzipSync(rows.map(row=>JSON.stringify(row)).join('\n')+'\n',{level:3}),{flag:'wx'});digest=sha(fs.readFileSync(output));
    }
    save(name,{...receipt,path:output,sha256:digest,priorDataSha256:receipt.sha256,canonicalV3Threshold:true,thresholdChanges:changed,thresholdChecked:checked,sampleParity:{passed:true,candidates:sampleCandidates,maxFloat32Error:0}});
    console.log(JSON.stringify({parent:parent.parentId,rows:rows.length,checked,changed}));
}
