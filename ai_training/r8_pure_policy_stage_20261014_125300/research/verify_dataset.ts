import fs from 'node:fs';import zlib from 'node:zlib';import readline from 'node:readline';
import {GameEngine,features,inputHash,hash,encodeAction} from './common';import {policy} from './policy';
const stage='ai_training/r8_pure_policy_stage_20261014_125300';const dataset=process.argv[2];
async function main(){const rows:any[]=[];const seen=new Map<string,number>();let total=0;
 for(const split of ['train','val']){
  const lines=readline.createInterface({input:fs.createReadStream(`${stage}/data/${dataset}/${split}.jsonl.gz`).pipe(zlib.createGunzip()),crlfDelay:Infinity});
  for await(const line of lines){const s=JSON.parse(line);total++;const n=(seen.get(s.gameId)??0)+1;seen.set(s.gameId,n);const sem=s.candidateSemantics[s.targetActionIndex];
   if(total%50!==0&&n>2&&sem[13]<.5)continue;
   const e=new GameEngine(s.stateJson),legal=e.getLegalActions(s.stateJson.currentPlayer),errors=[];
   if(hash(s.stateJson)!==s.stateHash)errors.push('stateHash');
   if(JSON.stringify(legal.map(encodeAction))!==JSON.stringify(s.actionCodes))errors.push('合法动作顺序');
   if(inputHash(features(e.getState(),legal))!==s.inputHash)errors.push('从原状态重编码');
   const p=policy(s.teacher,s.teacherSeed,s.playerId);const a=p.act(structuredClone(s.stateJson),structuredClone(legal));if(encodeAction(a)!==s.actionCodes[s.targetActionIndex])errors.push('冻结教师重算');
   rows.push({game:s.gameId,step:s.stepIndex,map:s.mapName,split,errors});
  }
 }
 const report={dataset,totalRows:total,checkedRows:rows.length,games:seen.size,passed:rows.every(x=>!x.errors.length),rows};fs.writeFileSync(`${stage}/evidence/verify_${dataset}.json`,JSON.stringify(report,null,2));console.log({...report,rows:undefined});if(!report.passed)process.exitCode=1;
}main();
