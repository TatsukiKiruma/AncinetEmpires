import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DIR,read,save,hash } from './io';

const known=new Set(read('../tactical_scale_20261018/selection.json').parents.map((p:any)=>p.parentId));
const parents=read('selection.json').parents.filter((p:any)=>p.split==='validation'&&!known.has(p.parentId));
const roots:any[]=[];
for(const parent of parents){
    if(roots.length>=10)break;
    for(const entry of parent.segments){
        if(!entry.policyLabelEligible||!entry.admittedAtoms)continue;
        const source=path.resolve(DIR,'../data_acceptance_20261016/phone'),checked=await inspectAndRead(source,entry),initial=structuredClone(checked.header.initialState);
        const rules=initial.rules;if(rules.unitLimit!==undefined){rules.populationLimit=rules.unitLimit;delete rules.unitLimit;}rules.allowZeroPopulationRecruitAtLimit=true;
        for(const team of Object.values(rules.teams??{}) as any[])if(team.unitLimit!==undefined){team.populationLimit=team.unitLimit;delete team.unitLimit;}
        const engine=new GameEngine(initial,{disableAutoAdvanceWhenNoMeaningfulAction:true});let prefix=0,picked:any=null;
        await inspectAndRead(source,entry,row=>{
            const s=engine.getState();
            if(!picked&&prefix>=48&&!engine.isTerminal()&&s.units.length>=4&&!s.pendingUnitId){picked={state:s,parent:parent.parentId,prefix,sourceShard:entry.candidateShard,sourceSha256:entry.shardSha256};}
            const action=engine.getLegalActions(s.currentPlayer).find(a=>encodeAction(a)===row.code);assert.ok(action);assert.ok(!engine.step(action).info.includes('非法动作'));prefix++;
        });
        if(picked){const name=`expanded-initial/root-${roots.length}.json`;assert.ok(!fs.existsSync(path.join(DIR,name)));save(name,picked.state);roots.push({...picked,state:undefined,path:path.join(DIR,name),sha256:hash(picked.state)});break;}
    }
}
assert.equal(roots.length,10);save('expanded-roots.json',{roots,source:'本次新增开发父局合法前缀；阶段3未纳入这些父局，但仍为已消费开发材料'});
