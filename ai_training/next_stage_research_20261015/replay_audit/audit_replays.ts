import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseRemoteReplay } from '../../../tools/apk_game_get_validate';
import { parseMaybeEncryptedC1270o } from '../../../tools/apk_game_get_report';
import { validateApkReplay } from '../../../src/game/apk_replay';

// 本脚本只读取已有响应并复验，不连接手机或网络，不导出账号、昵称及令牌。
const root = process.cwd();
const out = path.join(root, 'ai_training/next_stage_research_20261015/replay_audit');
await mkdir(out, { recursive: true });
const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const digest = (v: unknown) => hash(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x));
async function walk(dir: string): Promise<string[]> {
  const rows = await readdir(dir, {withFileTypes: true});
  return (await Promise.all(rows.map(x => x.isDirectory() ? walk(path.join(dir,x.name)) : /^game_get_.*\.bin$/i.test(x.name) ? [path.join(dir,x.name)] : []))).flat().sort();
}
function safeIdentity(bytes: Uint8Array) {
  // 对象头与 nullable 字符串布局严格沿用现有 apk_game_get_report，标识仅保存散列。
  const b = Buffer.from(bytes); let p = 5;
  const int = () => { const x=b.readInt32BE(p); p+=4; return x; };
  const nullable = () => { if(b[p++]) return null; const n=b.readUInt16BE(p);p+=2;const x=b.subarray(p,p+n);p+=n;return hash(x); };
  const room = nullable(); const owner = nullable();
  const en = () => b[p++] ? null : int();
  en();en();p+=8;
  const players: {slot:number,idHash:string|null,labelHash:string|null}[]=[];
  if(!b[p++]) {const n=int();if(n<0||n>32)throw Error('玩家数异常');for(let i=0;i<n;i++){if(b[p++])continue;players.push({slot:int(),idHash:nullable(),labelHash:nullable()});}}
  return {gameIdHash:room,ownerIdHash:owner,players};
}
const startedAt = new Date().toISOString();
const historical = JSON.parse(await readFile(path.join(root,'docs/apk-analysis/apk-evidence-fixes-20261013/summary.json'),'utf8'));
const sourcePaths = Object.keys(historical.sourceHashes);
const hashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async f=>[f,hash(await readFile(path.join(root,f)))])));
const sourceBefore=await hashes();
const sourceChanges=sourcePaths.filter(f=>sourceBefore[f]!==historical.sourceHashes[f]).map(f=>({path:f,historical:historical.sourceHashes[f],current:sourceBefore[f]}));
const paths=(await Promise.all(['mitm_replay','cloud'].map(d=>walk(path.join(root,'captures',d))))).flat();
const inventory=[];const seen=new Map<string,string>();const results=[];
for(const f of paths){const b=await readFile(f);const sha256=hash(b);const s=await stat(f);const relative=path.relative(root,f).replaceAll('\\','/');
inventory.push({file:relative,sha256,bytes:b.length,mtime:s.mtime.toISOString(),duplicateOf:seen.get(sha256)??null});
if(seen.has(sha256))continue;seen.set(sha256,relative);
const start=performance.now();
try {
const top=parseMaybeEncryptedC1270o(b);
const base={inputs:[],rootDir:'',outPath:null,json:false,mode:'SD' as const,maxRecords:100000,offset:0,limit:null,uniqueOffset:null,uniqueLimit:null,dedupe:true,allowAmbiguousRecruit:false,strictTerrain:true,forceExecuteReplayActions:false,rejectInformationLoss:true};
let parsed=await parseRemoteReplay(f,base);
const scenario=parsed.config.scenarioCode;
const mode=scenario==='SO'?'SO':'SD';
if(mode==='SO')parsed=await parseRemoteReplay(f,{...base,mode});
const identity=safeIdentity(parsed.gameObjectBytes);
const validation=validateApkReplay(parsed.initialState,parsed.actions,{rejectInformationLoss:true,stopOnFirstError:true,forceExecuteReplayActions:false,disableAutoAdvanceWhenNoMeaningfulAction:true,applyInitialTurnStart:true,expansionOptions:{allowAmbiguousRecruitDeployFirstMatch:false}});
const events:Record<string,number>={};for(const a of parsed.actions)events[a.eventType]=(events[a.eventType]??0)+1;
const firstTerminal=validation.steps.find(x=>x.done&&!x.error);
const final=validation.finalState;
const row={file:relative,sha256,...identity,responseSchemaVersion:top.parsed.version,topRemainingBytes:parsed.topRemainingBytes,replayRemainingBytes:parsed.replayArray.remainingBytes,scenario,mode,roomStatus:parsed.config.status,roomType:parsed.config.roomType,currentStep:parsed.config.currentStep,replaySplitIndex:parsed.config.replaySplitIndex,records:parsed.actions.length,actionHash:digest(parsed.actions),initialSeedHash:digest({state:parsed.initialState,seed:parsed.config.seed}),mapHash:digest(parsed.config.map),terrainMapHash:digest({width:parsed.config.map.width,height:parsed.config.map.height,terrain:parsed.config.map.terrainValues}),width:parsed.config.map.width,height:parsed.config.map.height,playerTypes:parsed.config.playerTypes,alliances:parsed.config.allianceByTeam,activePlayers:parsed.stateSummary.activeTeamIds,initialUnitClasses:parsed.initialState.units.reduce((a:Record<string,number>,u)=>{a[u.unitClass]=(a[u.unitClass]??0)+1;return a;},{}),events,stateSummary:parsed.stateSummary,strictSuccess:validation.success,evidence:validation.evidence,executedRecords:validation.executedRecordCount,expandedActions:validation.expandedActionCount,firstError:validation.firstError,firstErrorRecord:validation.steps.find(x=>x.error)?.recordIndex??null,firstTerminalRecord:firstTerminal?.recordIndex??null,terminalIgnored:validation.steps.filter(x=>x.info==='Game already ended').length,finalWinner:final.winner,finalTurn:final.turn,elapsedMs:performance.now()-start};
results.push(row);
await writeFile(path.join(out,'current-results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({n:results.length,file:path.basename(f),pass:validation.success,records:parsed.actions.length,ms:Math.round(row.elapsedMs)}));
} catch(e) {results.push({file:relative,sha256,parseError:e instanceof Error?e.message:String(e)});console.log(JSON.stringify({n:results.length,file:path.basename(f),error:true}));}
}
const counts=(values:unknown[])=>Object.fromEntries([...new Set(values.map(String))].map(v=>[v,values.filter(x=>String(x)===v).length]));
const groups=(key:string)=>{const m=new Map<string,string[]>();for(const r of results){const v=(r as any)[key];if(!v)continue;const arr=m.get(v)??[];arr.push(r.file);m.set(v,arr);}return [...m].filter(([,a])=>a.length>1).map(([identity,files])=>({identity,files}));};
const valid=results.filter((r:any)=>r.strictSuccess) as any[];
const sourceAfter=await hashes();
const summary={startedAt,finishedAt:new Date().toISOString(),scope:'只读既有响应；严格合法动作、拒绝信息损失；无原生状态比较',files:paths.length,uniqueSha256:seen.size,duplicatePaths:paths.length-seen.size,sourceBefore,sourceAfter,sourceStable:digest(sourceBefore)===digest(sourceAfter),historicalRulesRevision:historical.rulesRevision,sourceChanges,byDirectory:counts(inventory.map(x=>x.file.split('/')[1])),parseErrors:results.filter((x:any)=>x.parseError).length,strictPassed:valid.length,strictFailed:results.length-valid.length,records:results.reduce((n,r:any)=>n+(r.records??0),0),strictAcceptedRecords:valid.reduce((n,r)=>n+r.records,0),strictAcceptedExpandedActions:valid.reduce((n,r)=>n+r.expandedActions,0),scenario:counts(results.map((x:any)=>x.scenario)),schemaVersion:counts(results.map((x:any)=>x.responseSchemaVersion)),statuses:counts(results.map((x:any)=>x.roomStatus)),strictByScenario:counts(valid.map(x=>x.scenario)),strictWinnerPresent:valid.filter(x=>x.finalWinner!==null).length,strictWinnerNull:valid.filter(x=>x.finalWinner===null).length,strictSurrenderPresent:valid.filter(x=>x.events.SURRENDER).length,strictTerminalWithoutSurrender:valid.filter(x=>x.finalWinner!==null&&!x.events.SURRENDER).length,playerTypePatterns:counts(results.map((x:any)=>JSON.stringify(x.playerTypes))),activePlayerCounts:counts(results.map((x:any)=>x.activePlayers?.length)),distinctTerrainMaps:new Set(results.map((x:any)=>x.terrainMapHash)).size,gameIdDuplicateGroups:groups('gameIdHash'),actionDuplicateGroups:groups('actionHash'),initialSeedDuplicateGroups:groups('initialSeedHash'),failed:results.filter((x:any)=>!x.strictSuccess).map((x:any)=>({file:x.file,sha256:x.sha256,scenario:x.scenario,records:x.records,firstError:x.firstError,firstErrorRecord:x.firstErrorRecord,parseError:x.parseError}))};
await writeFile(path.join(out,'inventory.json'),JSON.stringify(inventory,null,2));
await writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
