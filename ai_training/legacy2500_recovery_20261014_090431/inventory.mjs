import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(out,'../..');
const archive=path.join(root,'ai_training/training_runs/server_archive_20260913/dataset');
const rawDir=path.join(root,'ai_training/training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced');
const manifest=JSON.parse(fs.readFileSync(path.join(archive,'manifest.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2));
const assets=[],episodes=[],missing=[];
for(const s of manifest.shards){const p=path.join(archive,s.path),exists=fs.existsSync(p);assets.push({kind:'hashed_feature',...s,exists,actualBytes:exists?fs.statSync(p).size:null,hashStatus:'尚未重算'});if(!exists)missing.push({kind:'feature',path:s.path});}
const expected=new Map();
for(const s of manifest.shards){const m=s.path.match(/checkpoints\/(.+)-e(\d+)-(\d+)\//);if(m)expected.set(m[1]+'.jsonl',Math.max(expected.get(m[1]+'.jsonl')??0,Number(m[3])+1));}
for(const source of manifest.sources.filter(s=>s.path.endsWith('.jsonl'))){
 const name=path.posix.basename(source.path),p=path.join(rawDir,name);
 if(!fs.existsSync(p)){assets.push({kind:'raw_episode',name,exists:false,expectedEpisodes:expected.get(name)});missing.push({kind:'raw_file',name,expectedEpisodes:expected.get(name)});continue;}
 const h=crypto.createHash('sha256');let pending=Buffer.alloc(0),offset=0,lineIndex=0;
 function line(b,span){const text=b.toString('utf8').trim();if(text){const e=JSON.parse(text),planId=e.scenario.id.split(':')[1],summary=e.summary;
 episodes.push({id:`${name}:${lineIndex}`,file:name,lineIndex,offset,bytes:b.length,recordSha256:sha(Buffer.from(text)),scenarioId:e.scenario.id,planId,mapName:e.scenario.mapName,seed:e.seed,players:e.players.length,steps:e.steps.length,initialObservationHash:e.initialObservationHash,summary,termination:summary.timeout?'timeout':summary.stoppedByMaxSteps?'max_steps':summary.stoppedByStagnation?'stagnation':summary.terminal?'terminal':'other'});lineIndex++;}offset+=span;}
 for await(const chunk of fs.createReadStream(p)){h.update(chunk);pending=Buffer.concat([pending,chunk]);let from=0,at;while((at=pending.indexOf(10,from))>=0){line(pending.subarray(from,at),at-from+1);from=at+1;}pending=pending.subarray(from);}
 if(pending.length)line(pending,pending.length);
 const actualSha256=h.digest('hex');assets.push({kind:'raw_episode',name,exists:true,bytes:fs.statSync(p).size,sha256:actualSha256,archiveExpectedSha256:source.sha256,archiveHashMatches:actualSha256===source.sha256,episodes:lineIndex,expectedEpisodes:expected.get(name)});
 if(lineIndex<(expected.get(name)??0))missing.push({kind:'raw_records',name,present:lineIndex,expected:expected.get(name),missing:expected.get(name)-lineIndex,note:'仅确认数量差额；除非前缀身份有额外证据，不将缺失身份伪定位为末尾行'});
 console.log(JSON.stringify({file:name,episodes:lineIndex,archiveHashMatches:actualSha256===source.sha256}));
}
fs.writeFileSync(path.join(out,'episode_index.jsonl'),episodes.map(e=>JSON.stringify(e)).join('\n')+'\n');
save('asset_inventory.json',{manifestSha256:sha(fs.readFileSync(path.join(archive,'manifest.json'))),archiveSummary:manifest.summary,assets,expected:Object.fromEntries(expected)});
save('missing_assets.json',missing);
// 覆盖场景、地图、人数、终止类型及长度桶；固定散列打破并列，保证可重现。
const selected=[],covered=new Set();
const tags=e=>[`plan:${e.planId}`,`map:${e.mapName}`,`players:${e.players}`,`termination:${e.termination}`,`length:${e.steps<2000?'short':e.steps<10000?'medium':'long'}`,`plan-end:${e.planId}:${e.termination}`,`players-length:${e.players}:${e.steps<2000?'short':e.steps<10000?'medium':'long'}`];
const candidates=[...episodes].sort((a,b)=>sha(a.id).localeCompare(sha(b.id)));
while(selected.length<Math.min(100,episodes.length)){let best=null,bestScore=-1;for(const e of candidates){if(selected.includes(e))continue;const score=tags(e).filter(t=>!covered.has(t)).length*1000+(e.players===2?2:0);if(score>bestScore){bestScore=score;best=e;}}selected.push(best);tags(best).forEach(t=>covered.add(t));}
save('selection_100.json',{method:'贪心分层覆盖+固定 SHA256 排序；不足100时优先双人',selected,covered:[...covered]});
save('inventory_summary.json',{rawEpisodes:episodes.length,rawSteps:episodes.reduce((s,e)=>s+e.steps,0),expectedEpisodes:[...expected.values()].reduce((a,b)=>a+b,0),featureFiles:assets.filter(a=>a.kind==='hashed_feature').length,featureBytes:assets.filter(a=>a.kind==='hashed_feature').reduce((s,a)=>s+(a.actualBytes??0),0),byPlan:count('planId'),byMap:count('mapName'),byPlayers:count('players'),byTermination:count('termination')});
function count(key){const counts={};for(const e of episodes)counts[e[key]]=(counts[e[key]]??0)+1;return counts;}
console.log(JSON.stringify({finished:true,episodes:episodes.length,selected:selected.length}));
