import fs from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {OUT,ROOT,readEpisode,makeEnv,sha,validateState} from './recovery_core';
const metas=fs.readFileSync(path.join(OUT,'episode_index.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const lines=createInterface({input:fs.createReadStream(path.join(ROOT,'ai_training/v19/out/data_scale_20261003/recovered_s0/rows.jsonl'))});
for await(const line of lines){const old=JSON.parse(line),p=old.provenance;if(p.stepIndex!==0)continue;const meta=metas.find(m=>m.file===p.sourceFile&&m.lineIndex===p.sourceLineIndex),e=readEpisode(meta),env=makeEnv(e,true),state=env.reset(e.seed).state;
 const differences:any[]=[];
 function diff(a:any,b:any,p:string){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p+'.'+k);}else differences.push({path:p,old:a,current:b});}
 diff(old.stateJson,state,'state');let validity;try{validity=validateState(old.stateJson);}catch(err){validity=String(err);}
 fs.writeFileSync(path.join(OUT,'initial_difference_evidence.json'),JSON.stringify({episode:meta.id,oldStateHash:sha(old.stateJson),currentStateHash:sha(state),differences,oldSnapshotCurrentValidity:validity},null,2));
 console.log(JSON.stringify({episode:meta.id,differenceCount:differences.length,differences:differences.slice(0,15),validity}));break;}
