import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {match,STAGE,sha} from './supervisor.mjs';
// 两个不相交区间可并发采集；新数据全部为训练家族，验证集保持轮1锁定身份。
const [model,tag,startText,endText]=process.argv.slice(2),start=Number(startText),end=Number(endText);const modelHash=sha(model);
const maps=['Duel','Liberty Port','Swamplands','The Crossing','Icy Paths','Peak Island','Crossed swords'];const budget=JSON.parse(fs.readFileSync(path.join(STAGE,'identity/budget.json')));const worker=path.join(STAGE,'runs/dagger_worker.cjs');
for(let g=start;g<end;g++)for(let m=0;m<7;m++){
 if(Date.now()/1000>budget.trainDeadlineUnix)throw Error('训练数据采集截止');
 const gameId=`${tag}_m${m}_g${g}`,out=path.join(STAGE,'data/raw',gameId);const seed=x=>parseInt(crypto.createHash('sha256').update(`R8-dagger-v1|${tag}|${m}|${g}|${x}`).digest('hex').slice(0,8),16);
 const cfg={gameId,familyId:gameId,split:'train',mapName:`(2) ${maps[m]}.aem`,candidateSeat:g%2,seeds:[seed(0),seed(1)],labelSeed:seed('label'),candidate:{type:'model',model,expectedSha256:modelHash,rollInProbability:g<6?0:.2},collect:true,collectBoth:false,recordInputs:true,maxSteps:600,maxWallSeconds:300,maxDecisionMs:1000,collectionOnly:true};
 const r=fs.existsSync(out+'.json')?JSON.parse(fs.readFileSync(out+'.json')):await match(cfg,out,worker);console.log(gameId,r.outcome,r.steps,'roll-in',cfg.candidate.rollInProbability);
}
fs.writeFileSync(path.join(STAGE,`data/collection_${tag}_${start}_${end}_complete.json`),JSON.stringify({complete:true,modelHash,start,end,collectionOnly:true}),{flag:'wx'});
