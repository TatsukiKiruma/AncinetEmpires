import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { infer,legalActions } from './policy_runtime';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { read,save,DIR,hash } from './io';
const plan=read('teacher-battle-plan.json'),model=read('teacher-model.json'),old=read('old-schema.json'),slow=[];
for(const slot of plan.slots.filter((s:any)=>s.model==='teacher_search'&&s.panel==='expanded')){
    const rows=gunzipSync(fs.readFileSync(path.join(DIR,`teacher-r3-battles/slots/${slot.id}/actions.jsonl.gz`))).toString().trim().split('\n').map(v=>JSON.parse(v));
    const row=rows.filter((v:any)=>v.side==='model').sort((a:any,b:any)=>b.ms-a.ms)[0];slow.push({slot,rows,row});
}
slow.sort((a,b)=>b.row.ms-a.row.ms);const results=[];
for(const {slot,rows,row} of slow.slice(0,6)){
    const engine=new GameEngine(read(plan.maps[slot.mapIndex].path));for(const item of rows.slice(0,row.i))engine.step(item.action);
    if(hash(engine.getState())!==row.beforeHash)throw Error('慢帧身份不符');
    const legal=legalActions(engine),t=performance.now(),root=infer(engine,legal,model,old),rootMs=performance.now()-t;
    const ai=new ModelBattleSearchAI(model,old),u=performance.now();ai.getAction(engine,slot.seat,legal,root,{});const searchMs=performance.now()-u;
    const result={id:slot.id,i:row.i,stateHash:row.beforeHash,candidates:legal.length,units:engine.getState().units.length,r3Ms:row.ms,rootMs,searchMs,totalMs:rootMs+searchMs,reason:ai.lastDecision.reason,nodes:ai.lastDecision.nodes};results.push(result);save('performance_query_cache/slow-frames.live.json',results);console.log(result);
}
save('performance_query_cache/slow-frames.json',{diagnosticOnly:true,concurrency:1,results});
