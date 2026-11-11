import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,hash,sha } from './io';
const slot='apk_like-teacher_search-m0-s1',base=path.join(DIR,'teacher-r15-battles/slots',slot),result=read(path.join(base,'result.json')),plan=read('teacher-battle-plan.json'),bytes=fs.readFileSync(path.join(base,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path));
for(const row of rows){
    assert.equal(hash(engine.getState()),row.beforeHash);
    if(row.i===33){const preferred=row.search.traces.find((v:any)=>v.action.type==='recruit_to_castle'&&v.policyConfidence===0),chosen=row.search.traces.find((v:any)=>v.action.type==='recruit_to_castle'&&v.action.unitClass==='soldier');assert.ok(preferred&&chosen&&!chosen.complete&&chosen.deploymentDeferred&&!engine.getState().units.some(u=>u.id===chosen.actor));const audit=auditSearchRisks(engine,row.search);assert.equal(audit.legacyDeferredActorFlags,1);const r={passed:true,slot,row:33,beforeHash:row.beforeHash,logSha256:sha(bytes),preferred:row.search.preferred,selected:row.code,actorAbsentBefore:true,actualDeploymentStillUnfinished:true,audit,scope:'仅兼容旧新兵预分配ID标记；完整/延后状态、合法动作、HP与全部见证照常重放'};if(process.env.STAGE5_METADATA_COMPAT_RECEIPT)save(process.env.STAGE5_METADATA_COMPAT_RECEIPT,r);console.log(r);process.exit(0);}
    assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);
}
throw Error('旧标记反例缺失');
