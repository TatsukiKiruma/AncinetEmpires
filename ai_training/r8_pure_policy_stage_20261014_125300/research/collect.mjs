import {match,STAGE} from './supervisor.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
if(!JSON.parse(fs.readFileSync(path.join(STAGE,'evidence/gate_g1.json'))).passed)throw Error('G1未通过');
const maps=['Duel','Liberty Port','Swamplands','The Crossing','Icy Paths','Peak Island','Crossed swords'];
const start=Number(process.argv[2]??0),end=Number(process.argv[3]??12),tag=process.argv[4]??'base';
const model=process.argv[5]==='none'?undefined:process.argv[5];const summary=[];const maxSteps=Number(process.argv[6]??1200);
for(let g=start;g<end;g++)for(let m=0;m<maps.length;m++){
 const gameId=`${tag}_m${m}_g${g}`;const out=path.join(STAGE,'data/raw',gameId);
 const seed=x=>parseInt(crypto.createHash('sha256').update(`R8-data-v1|${tag}|${m}|${g}|${x}`).digest('hex').slice(0,8),16);
 const cfg={gameId,familyId:gameId,split:g<2?'val':'train',mapName:`(2) ${maps[m]}.aem`,candidateSeat:g%2,seeds:[seed(0),seed(1)],labelSeed:seed('label'),candidate:model?{type:'model',model}:{type:'heuristic'},collect:true,collectBoth:!model,recordInputs:true,maxSteps,maxWallSeconds:300,maxDecisionMs:1000};
 const r=fs.existsSync(out+'.json')?JSON.parse(fs.readFileSync(out+'.json')):await match(cfg,out);summary.push(r);console.log(gameId,r.outcome,r.steps);
}
fs.writeFileSync(path.join(STAGE,`data/collection_${tag}_${start}_${end}.json`),JSON.stringify(summary,null,2));
