import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { infer,legalActions } from './policy_runtime';
import { read,save,hash,DIR } from './io';
// 离线诊断完整候选覆盖；运行搜索器仍受原Top6与同单位24节点上限约束。
const plan=read('teacher-battle-plan.json'),model=read('teacher-model.json'),old=read('old-schema.json');
const cases=[['expanded-teacher_search-r0-s0',1],['expanded-teacher_search-r4-s0',21],['expanded-teacher_search-r4-s1',3]] as const;
const results=[];
for(const [id,at] of cases){
    const slot=plan.slots.find((v:any)=>v.id===id),engine=new GameEngine(read(plan.maps[slot.mapIndex].path));
    const rows=gunzipSync(fs.readFileSync(path.join(DIR,`teacher-r3-battles/slots/${id}/actions.jsonl.gz`))).toString().trim().split('\n').map(v=>JSON.parse(v));
    for(const row of rows.slice(0,at))engine.step(row.action);
    if(hash(engine.getState())!==rows[at].beforeHash)throw Error('诊断帧身份不符');
    const actions=legalActions(engine),root=infer(engine,actions,model,old),ai=new ModelBattleSearchAI(model,old),start=performance.now();
    const evaluations=actions.map((action,index)=>{const v=ai.evaluateCandidate(engine,slot.seat,action,index);return {code:encodeAction(action),prior:root.prior[index],plan:v.plan.map(p=>encodeAction(p.action)),net:v.net,score:v.score,tactical:v.tactical,complete:v.complete,cmdLethal:v.commanderLethal,actorLethal:v.actorLethal,known:v.riskKnown};});
    const safe=evaluations.filter(v=>v.complete&&v.known&&!v.cmdLethal&&!v.actorLethal).sort((a,b)=>b.score-a.score);
    const result={id,at,stateHash:hash(engine.getState()),preferred:root.x.codes[root.out.best],r3Selected:rows[at].code,safe:safe.slice(0,10),all:evaluations,milliseconds:performance.now()-start};
    results.push(result);save('performance_query_cache/veto-coverage.live.json',results);console.log({...result,all:undefined});
}
save('performance_query_cache/veto-coverage.json',{diagnosticOnly:true,results});
