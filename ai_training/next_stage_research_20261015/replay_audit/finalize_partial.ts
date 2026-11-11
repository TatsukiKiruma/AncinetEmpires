import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parseRemoteReplay} from '../../../tools/apk_game_get_validate';
const out='ai_training/next_stage_research_20261015/replay_audit';
const inventory=JSON.parse(await readFile(`${out}/static-inventory.json`,'utf8'));
const sequential=JSON.parse(await readFile(`${out}/current-results.json`,'utf8'));
const target=JSON.parse(await readFile(`${out}/targeted-results.json`,'utf8'));
// 首轮计数器误用了中文字符串，因此该字段必须留空，不把错误的零继续传播。
const byHash=new Map(sequential.map((r:any)=>[r.sha256,{...r,terminalIgnored:null,terminalIgnoredVerified:false}]));
for(const r of target.completed)byHash.set(r.sha256,{...r,terminalIgnored:null,terminalIgnoredVerified:false});
const supplement=JSON.parse(await readFile(`${out}/supplement-results.json`,'utf8'));
for(const r of supplement.completed)byHash.set(r.sha256,{...r,terminalIgnoredVerified:true});
const rows=[...byHash.values()] as any[];
const historical=JSON.parse(await readFile('docs/apk-analysis/apk-evidence-fixes-20261013/per-replay-results.json','utf8'));
const old=new Map(historical.map((r:any)=>[r.sha256,r]));
const accepted=rows.filter(r=>r.strictSuccess);
const outcomes=[];
for(const r of accepted){let event=r.terminalEvent??null;
 if(r.finalWinner!==null&&r.firstTerminalRecord!==null&&!event){const p=await parseRemoteReplay(r.file,{inputs:[],rootDir:'',outPath:null,json:false,mode:'SD',maxRecords:100000,offset:0,limit:null,uniqueOffset:null,uniqueLimit:null,dedupe:true,allowAmbiguousRecruit:false,strictTerrain:false,forceExecuteReplayActions:false});event=p.actions[r.firstTerminalRecord]?.eventType??null;}
 outcomes.push({file:r.file,sha256:r.sha256,projectWinner:r.finalWinner,projectTerminalCause:r.finalWinner===null?'无规则终局':event==='SURRENDER'?'投降触发规则终局':'其他动作触发规则终局',terminalEvent:event,nativeOutcomeVerified:false});}
const hashes=Object.fromEntries(await Promise.all(Object.keys(inventory.summary.sourceHashes).map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const counts=(a:any[])=>Object.fromEntries([...new Set(a.map(String))].map(k=>[k,a.filter(x=>String(x)===k).length]));
const summary={generatedAt:new Date().toISOString(),identitySnapshotAt:inventory.summary.finishedAt,totalUniqueResponses:257,sequentialCompleted:sequential.length,targetedCompleted:target.completed.length,currentUniqueRevalidated:rows.length,currentPassed:accepted.length,currentFailed:rows.length-accepted.length,currentAcceptedRecords:accepted.reduce((n,r)=>n+r.records,0),currentAcceptedExpandedActions:accepted.reduce((n,r)=>n+r.expandedActions,0),currentAcceptedNotices:accepted.reduce((n,r)=>n+r.evidence.notices.length,0),currentAcceptedBypass:accepted.filter(r=>r.evidence.validationBypassed).length,currentAcceptedFullyConsumed:accepted.filter(r=>r.evidence.fullyConsumed).length,currentAcceptedTerminalIgnored:accepted.reduce((n,r)=>n+r.terminalIgnored,0),currentRevalidatedByScenario:counts(rows.map(r=>r.scenario)),projectOutcomeCategories:counts(outcomes.map(r=>r.projectTerminalCause)),sourceHashesAtFinish:hashes,sourceMatchesStaticIdentity:JSON.stringify(hashes)===JSON.stringify(inventory.summary.sourceHashes),all257CurrentlyRevalidated:rows.length===257,changedFromHistorical:rows.filter(r=>r.strictSuccess!==(old.get(r.sha256)as any)?.success).map(r=>({file:r.file,sha256:r.sha256,historicalSuccess:(old.get(r.sha256)as any)?.success,currentSuccess:r.strictSuccess})),failed:rows.filter(r=>!r.strictSuccess).map(r=>({file:r.file,sha256:r.sha256,firstError:r.firstError,firstErrorRecord:r.firstErrorRecord,records:r.records,executedRecords:r.executedRecords})),notRevalidated:inventory.rows.filter((r:any)=>!byHash.has(r.sha256)).map((r:any)=>({file:r.file,sha256:r.sha256,scenario:r.scenario,records:r.records,historicalSuccess:(old.get(r.sha256)as any)?.success})),outcomes};
Object.assign(summary,{supplementCompleted:supplement.completed.length,currentAcceptedTerminalIgnored:null,currentAcceptedTerminalIgnoredKnown:accepted.filter(r=>r.terminalIgnoredVerified).reduce((n,r)=>n+r.terminalIgnored,0),currentAcceptedTerminalIgnoredUnknownGames:accepted.filter(r=>!r.terminalIgnoredVerified).length,validationCounterCorrection:'详见counter-correction.json；旧前缀/target结果中该项零值无效，尚不能声称所有当前通过轨迹终局后忽略为零。'});
const graveSources=JSON.parse(await readFile('docs/apk-analysis/apk-grave-fix-20261013/sample-sources-0.json','utf8'));
const graveRows=(await Promise.all(['sample-0.jsonl','sample-1.jsonl'].map(async f=>(await readFile(`docs/apk-analysis/apk-grave-fix-20261013/${f}`,'utf8')).trim().split('\n').map(x=>JSON.parse(x))))).flat();
const graveDfe=JSON.parse(await readFile('docs/apk-analysis/apk-grave-fix-20261013/dfe-strict.json','utf8'));
const graveSourceMatch=Object.keys(hashes).every(k=>graveSources[k]===hashes[k])&&Object.keys(hashes).every(k=>graveDfe.sourceHashes[k]===hashes[k]);
Object.assign(summary,{currentIdentityMatchingHistoricalR4:{sourceHashesMatch:graveSourceMatch,rawHashesAllPresent:[...graveRows,graveDfe].every(r=>inventory.rows.some((x:any)=>x.sha256===r.sha256)),sampledGames:graveRows.length,dfeGames:1,records:graveRows.reduce((n,r)=>n+r.records,0)+graveDfe.records,passed:[...graveRows,graveDfe].filter(r=>r.success).length,terminalIgnored:[...graveRows,graveDfe].reduce((n,r)=>n+r.terminalIgnored,0),uniqueUnionWithTodayCurrentValidations:new Set([...rows.map(r=>r.sha256),...graveRows.map(r=>r.sha256),graveDfe.sha256]).size},currentResults:rows});
await writeFile(`${out}/current-audit-summary.json`,JSON.stringify(summary,null,2));
const artifacts=['audit_replays.ts','inventory_only.ts','summarize_static.mjs','targeted_strict.ts','supplement_strict.ts','finalize_partial.ts','static-inventory.json','static-statistics.json','current-results.json','targeted-results.json','supplement-results.json','current-audit-summary.json','counter-correction.json','REPLAY_FINDINGS.md'];
await writeFile(`${out}/EVIDENCE_MANIFEST.json`,JSON.stringify({generatedAt:new Date().toISOString(),artifacts:await Promise.all(artifacts.map(async f=>{const b=await readFile(`${out}/${f}`);return {file:f,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}))},null,2));
console.log(JSON.stringify({...summary,notRevalidatedCount:summary.notRevalidated.length,notRevalidated:undefined,outcomes:undefined},null,2));
