import {readFile,writeFile} from 'node:fs/promises';
import {parseRemoteReplay} from '../../../tools/apk_game_get_validate';
import {validateApkReplay} from '../../../src/game/apk_replay';
const out='ai_training/next_stage_research_20261015/replay_audit';
const inv=JSON.parse(await readFile(`${out}/static-inventory.json`,'utf8'));
const chosen=[...inv.rows.filter((r:any)=>r.scenario==='SO'),...inv.rows.filter((r:any)=>/40c8012d422b5ba1579edd78|e9648915cc5f975129d3a4d3/.test(r.file))];
const results=[];const startedAt=new Date().toISOString();
// 本补充仅验证三个SO和两个云批次修复代表，保留独立结果，不覆盖定向长局。
for(const row of chosen){const begin=performance.now();const parsed=await parseRemoteReplay(row.file,{inputs:[],rootDir:'',outPath:null,json:false,mode:row.scenario==='SO'?'SO':'SD',maxRecords:100000,offset:0,limit:null,uniqueOffset:null,uniqueLimit:null,dedupe:true,allowAmbiguousRecruit:false,strictTerrain:true,forceExecuteReplayActions:false});
const v=validateApkReplay(parsed.initialState,parsed.actions,{rejectInformationLoss:true,forceExecuteReplayActions:false,expansionOptions:{allowAmbiguousRecruitDeployFirstMatch:false}});const t=v.steps.find(x=>x.done&&!x.error);
results.push({file:row.file,sha256:row.sha256,scenario:row.scenario,records:row.records,strictSuccess:v.success,evidence:v.evidence,executedRecords:v.executedRecordCount,expandedActions:v.expandedActionCount,firstError:v.firstError,firstErrorRecord:v.steps.find(x=>x.error)?.recordIndex??null,finalWinner:v.finalState.winner,finalTurn:v.finalState.turn,firstTerminalRecord:t?.recordIndex??null,terminalEvent:t?.eventType??null,terminalIgnored:v.steps.filter(x=>x.info==='Game already ended').length,elapsedMs:performance.now()-begin});
await writeFile(`${out}/supplement-results.json`,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),completed:results},null,2));console.log(JSON.stringify({file:row.file,pass:v.success,records:v.executedRecordCount}));}
