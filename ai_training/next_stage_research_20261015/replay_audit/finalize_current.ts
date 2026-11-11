import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import {parseRemoteReplay} from '../../../tools/apk_game_get_validate';
const root=process.cwd(),out=path.join(root,'ai_training/next_stage_research_20261015/replay_audit');
const summary=JSON.parse(await readFile(path.join(out,'summary.json'),'utf8'));
if(summary.uniqueSha256!==257||summary.strictPassed+summary.strictFailed!==257||!summary.sourceStable)throw Error('尚未完成全量稳定身份复验');
const rows=JSON.parse(await readFile(path.join(out,'current-results.json'),'utf8'));
const staticRows=JSON.parse(await readFile(path.join(out,'static-inventory.json'),'utf8')).rows;
const historical=JSON.parse(await readFile(path.join(root,'docs/apk-analysis/apk-evidence-fixes-20261013/per-replay-results.json'),'utf8'));
const byHash=new Map(historical.map((r:any)=>[r.sha256,r]));
const candidate=rows.filter((r:any)=>r.strictSuccess),terminal=[];
for(const r of candidate){
 const s=staticRows.find((x:any)=>x.sha256===r.sha256);
 let terminalEvent=null;
 if(r.firstTerminalRecord!==null){const parsed=await parseRemoteReplay(path.join(root,r.file),{inputs:[],rootDir:'',outPath:null,json:false,mode:'SD',maxRecords:100000,offset:0,limit:null,uniqueOffset:null,uniqueLimit:null,dedupe:true,allowAmbiguousRecruit:false,strictTerrain:false,forceExecuteReplayActions:false});terminalEvent=parsed.actions[r.firstTerminalRecord]?.eventType??null;}
 terminal.push({file:r.file,sha256:r.sha256,records:r.records,finalWinner:r.finalWinner,finalTurn:r.finalTurn,terminalEvent,firstTerminalRecord:r.firstTerminalRecord,surrenderPresent:!!s.events.SURRENDER,projectTerminalCategory:r.finalWinner===null?'无规则终局':terminalEvent==='SURRENDER'?'投降触发规则终局':'其他动作触发规则终局',nativeOutcomeVerified:false});
}
const counts=(a:unknown[])=>Object.fromEntries([...new Set(a.map(String))].map(k=>[k,a.filter(x=>String(x)===k).length]));
const final={generatedAt:new Date().toISOString(),strictAcceptedGames:candidate.length,strictAcceptedRecords:candidate.reduce((n:number,r:any)=>n+r.records,0),strictAcceptedExpandedActions:candidate.reduce((n:number,r:any)=>n+r.expandedActions,0),strictAcceptedTotalNotices:candidate.reduce((n:number,r:any)=>n+r.evidence.notices.length,0),strictAcceptedBypass:candidate.filter((r:any)=>r.evidence.validationBypassed).length,strictAcceptedFullyConsumed:candidate.filter((r:any)=>r.evidence.fullyConsumed).length,strictAcceptedTerminalIgnored:candidate.reduce((n:number,r:any)=>n+r.terminalIgnored,0),terminalCategories:counts(terminal.map(r=>r.projectTerminalCategory)),terminalEventCounts:counts(terminal.map(r=>r.terminalEvent)),winnerCounts:counts(terminal.map(r=>r.finalWinner)),changedFromHistorical:rows.filter((r:any)=>r.strictSuccess!==(byHash.get(r.sha256)as any)?.success).map((r:any)=>({file:r.file,sha256:r.sha256,oldSuccess:(byHash.get(r.sha256)as any)?.success,currentSuccess:r.strictSuccess})),failed:summary.failed,outcomes:terminal};
await writeFile(path.join(out,'final-evidence.json'),JSON.stringify(final,null,2));
const artifacts=['audit_replays.ts','inventory_only.ts','summarize_static.mjs','finalize_current.ts','static-inventory.json','static-statistics.json','summary.json','current-results.json','final-evidence.json'];
await writeFile(path.join(out,'EVIDENCE_MANIFEST.json'),JSON.stringify({generatedAt:new Date().toISOString(),artifacts:await Promise.all(artifacts.map(async f=>{const b=await readFile(path.join(out,f));return {file:f,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}))},null,2));
console.log(JSON.stringify({...final,outcomes:undefined},null,2));
