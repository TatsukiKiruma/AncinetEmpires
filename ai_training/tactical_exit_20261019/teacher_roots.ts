import path from 'node:path';
import assert from 'node:assert/strict';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { read,save,DIR,hash } from './io';
const selection=read('selection.json'),dev=new Set(selection.parents.filter((p:any)=>p.split==='validation').map((p:any)=>p.parentId));
const maps=read('final-battle-plan.json').maps,evalHashes=new Set(maps.map((m:any)=>hash(read(m.path)))),parents=selection.parents.filter((p:any)=>p.split==='train').sort((a:any,b:any)=>hash('stage5-expert:'+a.parentId).localeCompare(hash('stage5-expert:'+b.parentId)));
const roots:any[]=[],seen=new Set<string>();
for(const parent of parents){
    if(roots.length>=40)break;assert.ok(!dev.has(parent.parentId));
    const entry=parent.segments.find((e:any)=>e.policyLabelEligible&&e.admittedAtoms>60);if(!entry)continue;
    const source=path.resolve(DIR,'../data_acceptance_20261016/phone'),checked=await inspectAndRead(source,entry),initial=structuredClone(checked.header.initialState),rules=initial.rules;
    if(rules.unitLimit!==undefined){rules.populationLimit=rules.unitLimit;delete rules.unitLimit;}rules.allowZeroPopulationRecruitAtLimit=true;
    for(const team of Object.values(rules.teams??{}) as any[])if(team.unitLimit!==undefined){team.populationLimit=team.unitLimit;delete team.unitLimit;}
    const engine=new GameEngine(initial,{disableAutoAdvanceWhenNoMeaningfulAction:true});let prefix=0,captured=false;
    await inspectAndRead(source,entry,row=>{
        if(captured)return;const s=engine.getState(),meaningful=engine.getLegalActions(s.currentPlayer).some(a=>a.type!=='end_turn'&&a.type!=='surrender'),key=hash(s);
        if(prefix>=40+roots.length%5&&s.turn<=15&&s.winner===null&&s.units.length>=4&&meaningful&&!evalHashes.has(key)&&!seen.has(key)){
            const i=roots.length,file=`expert-initial/root-${i}.json`;save(file,s);roots.push({index:i,parent:parent.parentId,prefix,stateHash:key,path:path.resolve(DIR,file),source:entry,opponent:i%2?'apk_like':'heuristic',opponentSeed:2026101905+i,seat:s.currentPlayer});seen.add(key);captured=true;return;
        }
        const a=decodeAction(row.code);assert.ok(a);assert.ok(!engine.step(a).info.includes('非法动作'));prefix++;
    });
}
assert.equal(roots.length,40);save('expert-roots.json',{roots,trainOnly:true,devOverlap:0,evaluationStateOverlap:0,selectionSeed:2026101905});console.log({roots:roots.length});
