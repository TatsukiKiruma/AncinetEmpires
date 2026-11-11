import {readFile,writeFile} from 'node:fs/promises';
const out='ai_training/next_stage_research_20261015/replay_audit';
const {summary,rows}=JSON.parse(await readFile(`${out}/static-inventory.json`,'utf8'));
const events={},unitInitialGames={},source={};const playerTypeIds={};
for(const r of rows){for(const [k,v]of Object.entries(r.events))events[k]=(events[k]??0)+v;
for(const k of Object.keys(r.initialUnitClasses))unitInitialGames[k]=(unitInitialGames[k]??0)+1;
for(const p of r.players){if(!p.idHash)continue;const type=r.playerTypes[p.arrayIndex];const x=playerTypeIds[p.idHash]??{types:{},games:new Set(),seats:0};x.types[type]=(x.types[type]??0)+1;x.games.add(r.gameIdHash);x.seats++;playerTypeIds[p.idHash]=x;}
const key=r.file.split('/')[1];const a=source[key]??{games:0,records:0,surrenderGames:0,pureSurrenderGames:0,computerSeatGames:0,humanOnlyGames:0,slots:{},activeSlots:{}};a.games++;a.records+=r.records;a.surrenderGames+=!!r.events.SURRENDER;a.pureSurrenderGames+=Object.keys(r.events).every(k=>k==='SURRENDER');a.computerSeatGames+=r.playerTypes.includes(2);a.humanOnlyGames+=!r.playerTypes.includes(2);for(const t of r.playerTypes)a.slots[t]=(a.slots[t]??0)+1;for(const i of r.activePlayers){const t=r.playerTypes[i];a.activeSlots[t]=(a.activeSlots[t]??0)+1;}source[key]=a;}
const sorted=[...rows].sort((a,b)=>a.records-b.records);
// 按 type=1 的身份建立对局连通分量，检查完全隔离玩家时可否得到足够多的组。
const parent=rows.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
const owner=new Map();for(let i=0;i<rows.length;i++)for(const p of rows[i].players){if(!p.idHash||rows[i].playerTypes[p.arrayIndex]!==1)continue;if(owner.has(p.idHash))parent[find(i)]=find(owner.get(p.idHash));else owner.set(p.idHash,i);}
const components=new Map();for(let i=0;i<rows.length;i++){const k=find(i),a=components.get(k)??[];a.push(rows[i].file);components.set(k,a);}
const artifact={generatedAt:new Date().toISOString(),events,unitInitialGames,source,recordQuantiles:{min:sorted[0].records,p25:sorted[Math.floor(sorted.length*.25)].records,p50:sorted[Math.floor(sorted.length*.5)].records,p75:sorted[Math.floor(sorted.length*.75)].records,p90:sorted[Math.floor(sorted.length*.9)].records,p95:sorted[Math.floor(sorted.length*.95)].records,max:sorted.at(-1).records},largest10GamesRecordShare:sorted.slice(-10).reduce((n,r)=>n+r.records,0)/summary.records,largestMapRecordShare:summary.maps[0].records/summary.records,largest5MapsRecordShare:summary.maps.slice(0,5).reduce((n,r)=>n+r.records,0)/summary.records,distinctTerrainIdentityMaps:summary.maps.length,players:Object.entries(playerTypeIds).map(([idHash,x])=>({idHash,types:x.types,games:x.games.size,seats:x.seats})).sort((a,b)=>b.games-a.games),pureSurrenderFiles:rows.filter(r=>Object.keys(r.events).every(k=>k==='SURRENDER')).map(r=>r.file)};
artifact.humanIdentityComponents=[...components.values()].map(files=>({games:files.length,files})).sort((a,b)=>b.games-a.games);
await writeFile(`${out}/static-statistics.json`,JSON.stringify(artifact,null,2));console.log(JSON.stringify({...artifact,players:artifact.players.slice(0,4),humanIdentityComponents:artifact.humanIdentityComponents.map(x=>x.games)},null,2));
