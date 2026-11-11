import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {bridge} from './bridge';
import {readEpisode,clone,sha,verifyFreeze} from '../legacy2500_recovery_20261014_090431/recovery_core';
import {replayEpisodeDatasetItems} from '../legacy2500_recovery_20261014_090431/frozen/tools/strict_replay';
const out=path.dirname(fileURLToPath(import.meta.url)),meta=JSON.parse(fs.readFileSync(path.join(out,'initial_probe.json'),'utf8')).find((m:any)=>m.id==='sd-low-gold-episodes.jsonl:70'),e=readEpisode(meta);
const run=(episode:any)=>[...replayEpisodeDatasetItems(episode,bridge(episode),{observationMode:'none'})].length;
assert.equal(run(e),e.steps.length);
const cases:any[]=[['initialHash',(r:any)=>r.initialObservationHash='bad',/初始 observation hash/],['legalCount',(r:any)=>r.initialLegalActionCount++,/初始合法动作数/],['actionCode',(r:any)=>r.steps[0].actionCode='bad',/动作编码/],['reward',(r:any)=>r.steps[0].reward=999,/reward/],['done',(r:any)=>r.steps[0].done=!r.steps[0].done,/done/],['winner',(r:any)=>r.steps[0].winnerAfter=999,/winner/]];
for(const [,change,pattern] of cases){const altered=clone(e);change(altered);assert.throws(()=>run(altered),pattern);}
const env=bridge(e),reset=env.reset.bind(env);env.reset=((seed?:number)=>{const r=reset(seed);r.observation.players[0].gold++;return r;}) as any;
assert.throws(()=>[...replayEpisodeDatasetItems(e,env,{observationMode:'none'})],/初始 observation hash/);
fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({passed:true,actualHistoricalEpisode:e.scenario.id,actualHistoricalSteps:e.steps.length,negativeControls:cases.map(([name])=>name).concat('mutatedInitialGold'),freezeIdentity:verifyFreeze()},null,2));console.log('历史真实轨迹通过；七项负对照均拦截');
