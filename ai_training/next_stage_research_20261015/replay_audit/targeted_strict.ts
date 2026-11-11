import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parseRemoteReplay} from '../../../tools/apk_game_get_validate';
import {validateApkReplay} from '../../../src/game/apk_replay';
const out='ai_training/next_stage_research_20261015/replay_audit';
const inventory=JSON.parse(await readFile(`${out}/static-inventory.json`,'utf8'));
const identities=inventory.summary.sourceHashes;
// 只复验历史分歧、SO和云批次代表样本；总时间由父任务的硬截止控制。
const names=['20260704_132008_065','20260704_132050_078','20260704_132339_097','6efeed8bfd52d3428de39d32','dfe18a69c9affc588808e13e'];
const chosen=[...names.map(n=>inventory.rows.find((r:any)=>r.file.includes(n))),...inventory.rows.filter((r:any)=>r.scenario==='SO'),...['40c8012d422b5ba1579edd78','e9648915cc5f975129d3a4d3'].map(n=>inventory.rows.find((r:any)=>r.file.includes(n)))].filter(Boolean);
const results=[];const startedAt=new Date().toISOString();
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
for(const row of chosen){
 if(results.some(x=>x.sha256===row.sha256))continue;
 const start=performance.now();const parsed=await parseRemoteReplay(row.file,{inputs:[],rootDir:'',outPath:null,json:false,mode:row.scenario==='SO'?'SO':'SD',maxRecords:100000,offset:0,limit:null,uniqueOffset:null,uniqueLimit:null,dedupe:true,allowAmbiguousRecruit:false,strictTerrain:true,forceExecuteReplayActions:false});
 if(hash(await readFile(row.file))!==row.sha256)throw Error('原始响应身份变化');
 const v=validateApkReplay(parsed.initialState,parsed.actions,{rejectInformationLoss:true,stopOnFirstError:true,forceExecuteReplayActions:false,disableAutoAdvanceWhenNoMeaningfulAction:true,applyInitialTurnStart:true,expansionOptions:{allowAmbiguousRecruitDeployFirstMatch:false}});
 const terminal=v.steps.find(x=>x.done&&!x.error);
 const r={file:row.file,sha256:row.sha256,scenario:row.scenario,records:row.records,strictSuccess:v.success,evidence:v.evidence,executedRecords:v.executedRecordCount,expandedActions:v.expandedActionCount,firstError:v.firstError,firstErrorRecord:v.steps.find(x=>x.error)?.recordIndex??null,finalWinner:v.finalState.winner,finalTurn:v.finalState.turn,firstTerminalRecord:terminal?.recordIndex??null,terminalEvent:terminal?.eventType??null,terminalIgnored:v.steps.filter(x=>x.info==='Game already ended').length,elapsedMs:performance.now()-start};results.push(r);
 await writeFile(`${out}/targeted-results.json`,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),sourceHashes:identities,selected:chosen.map((x:any)=>x.file),completed:results},null,2));
 console.log(JSON.stringify({file:row.file,pass:r.strictSuccess,executed:r.executedRecords,ms:Math.round(r.elapsedMs)}));
}
const after=Object.fromEntries(await Promise.all(Object.keys(identities).map(async f=>[f,hash(await readFile(f))])));
await writeFile(`${out}/targeted-completion.json`,JSON.stringify({startedAt,finishedAt:new Date().toISOString(),sourceStable:JSON.stringify(identities)===JSON.stringify(after),sourceBefore:identities,sourceAfter:after,completed:results.length},null,2));
