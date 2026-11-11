import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { encodeAction,decodeAction,calculateArmyValue } from '../../src/game/env';
import { extendFeatures,valueSummary } from './features';
import { DIR,read,save,sha,hash } from './io';

const selection=read('selection.json');let rows=0,winning=0,losing=0,unknown=0,parents=0,probes=0,replayedParents=0;
const armyByAtom:Record<string,number>={};
for(const [pi,parent] of selection.parents.entries()){
    const receipt=read(`data/${parent.parentId}.receipt.json`);assert.equal(sha(fs.readFileSync(receipt.path)),receipt.sha256);
    const records=gunzipSync(fs.readFileSync(receipt.path)).toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    for(const r of records){
        assert.equal(r.parent,parent.parentId);assert.ok(typeof r.valueMask==='boolean');assert.ok(r.valueMask?[1,-1].includes(r.valueTarget):r.valueTarget===null);assert.equal(r.valueSummary.length,24);
        rows++;if(!r.valueMask)unknown++;else if(r.valueTarget===1)winning++;else losing++;
    }
    // 每十个父局取中段状态重新生成新增特征，核对源资格和float32逐值可复现性。
    const wanted=pi%10===0?records[Math.floor(records.length/2)]:null,byAtom=new Map(records.map(r=>[`${r.macro}|${r.subAction}`,r]));
    const source=path.resolve(DIR,'../data_acceptance_20261016/phone');let found=false,matched=0;
    for(const entry of parent.segments){
        if(!entry.policyLabelEligible||!entry.admittedAtoms)continue;
        const checked=await inspectAndRead(source,entry),initial=structuredClone(checked.header.initialState),rules=initial.rules;
        if(rules.unitLimit!==undefined){rules.populationLimit=rules.unitLimit;delete rules.unitLimit;}rules.allowZeroPopulationRecruitAtLimit=true;
        for(const team of Object.values(rules.teams??{}) as any[])if(team.unitLimit!==undefined){team.populationLimit=team.unitLimit;delete team.unitLimit;}
        const engine=new GameEngine(initial,{disableAutoAdvanceWhenNoMeaningfulAction:true});
        await inspectAndRead(source,entry,row=>{
            const s=engine.getState(),action=decodeAction(row.code);assert.ok(action);
            const record=byAtom.get(`${row.macro}|${row.subAction}`);
            if(record){
                assert.equal(hash(s),record.beforeHash);assert.equal(row.valueMask,record.valueMask);assert.equal(row.outcomeTarget,record.valueTarget);assert.equal(record.codes[record.target],row.code);assert.equal(record.weight,row.weight);matched++;
                if(row.valueMask){const enemy=s.players.find(p=>p.id!==s.currentPlayer)!.id;armyByAtom[`${parent.parentId}|${row.macro}|${row.subAction}`]=(calculateArmyValue(s,s.currentPlayer)-calculateArmyValue(s,enemy))/1024;}
            }else{
                assert.equal(row.code,'end_turn');assert.ok(!engine.getLegalActions(s.currentPlayer).some(a=>a.type!=='end_turn'&&a.type!=='surrender'));
            }
            if(wanted&&!found&&row.macro===wanted.macro&&row.subAction===wanted.subAction){
                const legal=engine.getLegalActions(s.currentPlayer);
                const ordered=wanted.codes.map((c:string)=>legal.find(a=>encodeAction(a)===c)!);assert.ok(ordered.every(Boolean));
                const automatic=new GameEngine(s),focus=extendFeatures(automatic,ordered);
                wanted.candidates.forEach((c:[number,number][],j:number)=>{const values=new Map(c);focus[j].forEach((v,k)=>assert.equal(v,values.get(141+k)));});
                assert.deepEqual(valueSummary(s,focus),wanted.valueSummary);found=true;probes++;
            }
            assert.ok(!engine.step(action).info.includes('非法动作'));
        });
    }
    assert.equal(matched,records.length);if(wanted){assert.ok(found);parents++;}replayedParents++;save('data-audit.live.json',{replayedParents,probeParents:parents,probes,rows});
}
assert.equal(Object.keys(armyByAtom).length,winning+losing);save('army-baseline.json',{source:'公共calculateArmyValue，双方金币＋按生命比例加权的权威招募成本',armyByAtom});
save('data-audit.json',{passed:true,parents:selection.parents.length,strictReplayedParents:replayedParents,rows,winningLabels:winning,losingLabels:losing,maskedValueLabels:unknown,probeParents:parents,probes,maxFloat32Error:0,sourceValueEvidenceRechecked:true});
