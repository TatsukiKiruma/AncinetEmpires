import fs from 'node:fs';
import path from 'node:path';
import inspector from 'node:inspector';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { read,save,DIR,hash,sha } from './io';
const phase='teacher-r17',slot='expanded-teacher_search-r6-s1',plan=read('teacher-battle-plan.json'),base=path.join(DIR,phase+'-battles/slots',slot),result=read(path.join(base,'result.json'));assert.ok(read(path.join(base,'strict-replay.json')).passed);
const profilePrefix='revisions/r18/profiles/'+(process.argv[2]??String(Date.now()));assert.ok(!fs.existsSync(path.join(DIR,profilePrefix)),'剖析输出必须独立命名，拒绝覆盖');
const bytes=fs.readFileSync(path.join(base,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),chosen=rows.find(r=>r.side==='model'&&r.search?.preferredPolicyEvaluated&&r.ms>=650)??rows.filter(r=>r.side==='model'&&r.search?.preferredPolicyEvaluated).sort((a,b)=>b.ms-a.ms)[0];
const engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path));for(const row of rows){assert.equal(hash(engine.getState()),row.beforeHash);if(row.i===chosen.i)break;engine.step(row.action);assert.equal(hash(engine.getState()),row.afterHash);}
const model=read('teacher-model.json'),old=read('old-schema.json'),session=new inspector.Session();session.connect();const post=(name:string)=>new Promise<any>((resolve,reject)=>session.post(name as any,(e,r)=>e?reject(e):resolve(r)));
save(profilePrefix+'/state.json',{state:engine.getState(),beforeHash:chosen.beforeHash,slot,row:chosen.i,originalMs:chosen.ms,logSha256:sha(bytes)});
const times:number[]=[];await post('Profiler.enable');await post('Profiler.start');
for(let i=0;i<5;i++){const ai=new ModelBattleSearchAI(model,old),start=performance.now(),action=ai.getAction(engine,engine.getState().currentPlayer);times.push(performance.now()-start);assert.equal(encodeAction(action),chosen.code);}
const profile=(await post('Profiler.stop')).profile;session.disconnect();save(profilePrefix+'/root.cpuprofile',profile);
const hits=new Map<string,number>();for(const n of profile.nodes){const key=n.callFrame.functionName+' '+n.callFrame.url;hits.set(key,(hits.get(key)??0)+(n.hitCount??0));}
const report={passed:true,slot,row:chosen.i,originalMs:chosen.ms,singleProcessTimes:times,beforeHash:chosen.beforeHash,focusSourceSha256:sha(fs.readFileSync(new URL('./focus_threat.ts',import.meta.url))),topSamples:[...hits].sort((a,b)=>b[1]-a[1]).slice(0,25),scope:'实际已strict慢帧的单进程CPU剖析，不替代四进程面板耗时'};save(profilePrefix+'/report.json',report);console.log(report);
