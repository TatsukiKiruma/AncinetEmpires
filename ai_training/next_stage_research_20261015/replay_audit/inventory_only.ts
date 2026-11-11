import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseRemoteReplay } from '../../../tools/apk_game_get_validate';
import { parseMaybeEncryptedC1270o } from '../../../tools/apk_game_get_report';
const root=process.cwd(),out=path.join(root,'ai_training/next_stage_research_20261015/replay_audit');
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const digest=(v:unknown)=>sha(JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x));
async function walk(d:string):Promise<string[]>{return(await Promise.all((await readdir(d,{withFileTypes:true})).map(x=>x.isDirectory()?walk(path.join(d,x.name)):/^game_get_.*\.bin$/i.test(x.name)?[path.join(d,x.name)]:[]))).flat().sort();}
function identity(bytes:Uint8Array){
 // 只保存身份散列；字段值不打印，字符串按原始 Java UTF 字节散列。
 const b=Buffer.from(bytes);let p=5;
 const int=()=>{const v=b.readInt32BE(p);p+=4;return v;};
 const str=()=>{if(b[p++])return null;const n=b.readUInt16BE(p);p+=2;const h=sha(b.subarray(p,p+n));p+=n;return h;};
 const gameIdHash=str(),ownerHash=str();const en=()=>b[p++]?null:int();en();en();p+=8;
 const players=[];if(!b[p++]){const n=int();if(n<0||n>32)throw Error('玩家数异常');for(let i=0;i<n;i++){if(b[p++])continue;players.push({arrayIndex:i,slotValue:int(),idHash:str(),labelHash:str()});}}
 return {gameIdHash,ownerHash,players};
}
const startedAt=new Date().toISOString(),seen=new Map<string,string>(),files=[],rows=[];
const historical=JSON.parse(await readFile('docs/apk-analysis/apk-evidence-fixes-20261013/summary.json','utf8'));
const sourceHashes=Object.fromEntries(await Promise.all(Object.keys(historical.sourceHashes).map(async f=>[f,sha(await readFile(f))])));
for(const f of(await Promise.all(['mitm_replay','cloud'].map(d=>walk(path.join(root,'captures',d))))).flat()){
 const b=await readFile(f),h=sha(b),rel=path.relative(root,f).replaceAll('\\','/'),s=await stat(f);files.push({file:rel,sha256:h,bytes:b.length,mtime:s.mtime.toISOString(),duplicateOf:seen.get(h)??null});if(seen.has(h))continue;seen.set(h,rel);
 const top=parseMaybeEncryptedC1270o(b);const parsed=await parseRemoteReplay(f,{inputs:[],rootDir:'',outPath:null,json:false,mode:'SD',maxRecords:100000,offset:0,limit:null,uniqueOffset:null,uniqueLimit:null,dedupe:true,allowAmbiguousRecruit:false,strictTerrain:false,forceExecuteReplayActions:false});
 const events:Record<string,number>={};for(const a of parsed.actions)events[a.eventType]=(events[a.eventType]??0)+1;
 const {metadata:_metadata,...state}=parsed.initialState;
 rows.push({file:rel,sha256:h,...identity(parsed.gameObjectBytes),schemaVersion:top.parsed.version,scenario:parsed.config.scenarioCode,status:parsed.config.status,roomType:parsed.config.roomType,topRemaining:parsed.topRemainingBytes,replayRemaining:parsed.replayArray.remainingBytes,records:parsed.actions.length,actionHash:digest(parsed.actions),initialSeedHash:digest({state,seed:parsed.config.seed}),mapHash:digest(parsed.config.map),terrainMapHash:digest({width:parsed.config.map.width,height:parsed.config.map.height,terrain:parsed.config.map.terrainValues}),width:parsed.config.map.width,height:parsed.config.map.height,playerTypes:parsed.config.playerTypes,alliances:parsed.config.allianceByTeam,activePlayers:parsed.stateSummary.activeTeamIds,events,initialUnitClasses:parsed.initialState.units.reduce((a:Record<string,number>,u)=>{a[u.unitClass]=(a[u.unitClass]??0)+1;return a;},{}),stateSummary:parsed.stateSummary,currentStep:parsed.config.currentStep,replaySplitIndex:parsed.config.replaySplitIndex});
}
const counts=(a:unknown[])=>Object.fromEntries([...new Set(a.map(String))].map(k=>[k,a.filter(x=>String(x)===k).length]));
const duplicate=(key:string)=>{const g=new Map<string,string[]>();for(const r of rows){const k=(r as any)[key];if(k===null)continue;g.set(k,[...(g.get(k)??[]),r.file]);}return [...g].filter(([,v])=>v.length>1).map(([hash,files])=>({hash,files}));};
const maps=new Map<string,any>();for(const r of rows){const m=maps.get(r.terrainMapHash)??{hash:r.terrainMapHash,width:r.width,height:r.height,games:0,records:0,scenarios:{}};m.games++;m.records+=r.records;m.scenarios[r.scenario??'null']=(m.scenarios[r.scenario??'null']??0)+1;maps.set(r.terrainMapHash,m);}
const players=new Map<string,{games:Set<string>,seats:number}>();for(const r of rows)for(const p of r.players){if(!p.idHash)continue;const v=players.get(p.idHash)??{games:new Set(),seats:0};v.games.add(r.gameIdHash??r.sha256);v.seats++;players.set(p.idHash,v);}
const summary={startedAt,finishedAt:new Date().toISOString(),files:files.length,uniqueSha:rows.length,duplicatePaths:files.length-rows.length,directoryFiles:counts(files.map(x=>x.file.split('/')[1])),directoryUnique:counts(rows.map(x=>x.file.split('/')[1])),records:rows.reduce((n,r)=>n+r.records,0),scenario:counts(rows.map(x=>x.scenario)),schemaVersion:counts(rows.map(x=>x.schemaVersion)),statuses:counts(rows.map(x=>x.status)),roomTypes:counts(rows.map(x=>x.roomType)),activePlayerCount:counts(rows.map(x=>x.activePlayers.length)),playerTypePatterns:counts(rows.map(x=>JSON.stringify(x.playerTypes))),distinctPlayers:players.size,playerGames:[...players].map(([idHash,v])=>({idHash,games:v.games.size,seats:v.seats})).sort((a,b)=>b.games-a.games),gameIdDuplicateGroups:duplicate('gameIdHash'),actionDuplicateGroups:duplicate('actionHash'),initialSeedDuplicateGroups:duplicate('initialSeedHash'),maps:[...maps.values()].sort((a,b)=>b.records-a.records),sourceHashes,sourceChanges:Object.keys(sourceHashes).filter(f=>sourceHashes[f]!==historical.sourceHashes[f]),allTopAndActionConsumed:rows.every(x=>x.topRemaining===0&&x.replayRemaining===0),nonzeroCurrentStep:rows.filter(x=>x.currentStep!==0).length,nonzeroSplitIndex:rows.filter(x=>x.replaySplitIndex!==0).length};
await writeFile(path.join(out,'static-inventory.json'),JSON.stringify({summary,files,rows},null,2));console.log(JSON.stringify(summary,null,2));
