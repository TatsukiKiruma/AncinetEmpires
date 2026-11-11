import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AncientEmpiresEnv as HistoricalObservationEnv} from './env';
import {readEpisode,makeEnv,sha,verifyFreeze,clone} from '../legacy2500_recovery_20261014_090431/recovery_core';
const out=path.dirname(fileURLToPath(import.meta.url)),prior=path.resolve(out,'../legacy2500_recovery_20261014_090431');
verifyFreeze();
const index=fs.readFileSync(path.join(prior,'episode_index.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const selected=[];
for(const map of [...new Set(index.filter((e:any)=>e.players===2).map((e:any)=>e.mapName))])for(const plan of ['sd-normal','sd-small-advantage-endgame','sd-low-gold','sd-high-gold','sd-high-unit-limit']){
 const list=index.filter((e:any)=>e.mapName===map&&e.planId===plan).sort((a:any,b:any)=>a.steps-b.steps);if(list.length)selected.push(list[0]);if(plan==='sd-normal'&&list.length>1)selected.push(list[Math.floor(list.length/2)]);
}
const results=[];
for(const meta of selected){const e=readEpisode(meta),modes=[];for(const legacy of [false,true]){const current=makeEnv(e,legacy).reset(e.seed);const view=new HistoricalObservationEnv({initialState:clone(current.state),seed:e.seed,maxPlies:e.maxPlies});const observation=view.getObservation();modes.push({legacy,currentHash:sha(current.observation),historicalHash:sha(observation),matches:sha(observation)===e.initialObservationHash});}results.push({...meta,modes});}
fs.writeFileSync(path.join(out,'initial_probe.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({episodes:results.length,currentInitHistoricalCodecPass:results.filter(r=>r.modes[0].matches).length,legacyInitHistoricalCodecPass:results.filter(r=>r.modes[1].matches).length,examples:results.slice(0,3).map(r=>({id:r.id,modes:r.modes}))}));
