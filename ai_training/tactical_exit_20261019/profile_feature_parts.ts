import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { legalActions } from './policy_runtime';
import { extractFeatures } from './combined_tactics';
import { read,save,DIR,hash } from './io';
const plan=read('teacher-battle-plan.json'),frames=read('performance_query_cache/slow-frames.json').results,results=[];
for(const frame of frames){
    const slot=plan.slots.find((v:any)=>v.id===frame.id),engine=new GameEngine(read(plan.maps[slot.mapIndex].path));
    const rows=gunzipSync(fs.readFileSync(path.join(DIR,`teacher-r3-battles/slots/${slot.id}/actions.jsonl.gz`))).toString().trim().split('\n').map(v=>JSON.parse(v));for(const row of rows.slice(0,frame.i))engine.step(row.action);
    if(hash(engine.getState())!==frame.stateHash)throw Error('帧不一致');save(`performance_query_cache/slow-state-${frame.id}.json`,engine.getState());
    const t=performance.now(),x=extractFeatures(engine,legalActions(engine));const result={id:frame.id,total:performance.now()-t,stats:x.stats};results.push(result);console.log(result);
}
save('performance_query_cache/feature-parts.json',results);
