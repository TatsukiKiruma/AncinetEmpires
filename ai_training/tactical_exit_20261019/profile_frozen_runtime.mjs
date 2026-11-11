import fs from 'node:fs';
import path from 'node:path';
import inspector from 'node:inspector';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),phase=process.argv[2]??'teacher-r20',slot=process.argv[3]??'expanded-teacher_search-r6-s0',stamp=Date.now(),read=n=>JSON.parse(fs.readFileSync(path.resolve(here,n),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),prefix=path.join(here,'revisions/r21/profile-'+stamp);
fs.mkdirSync(prefix);fs.copyFileSync(fileURLToPath(import.meta.url),path.join(prefix,'source.mjs.snapshot'));const frozen=read('source-freeze-'+phase+'.json').files,output=path.join(prefix,'runtime.mjs');
await build({entryPoints:[path.join(here,'benchmark_root_entry.ts')],bundle:true,platform:'node',format:'esm',outfile:output,plugins:[{name:'冻结实际版本',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{const item=frozen[path.relative(repo,args.path).split(path.sep).join('/')];if(!item)return;const bytes=fs.readFileSync(path.join(here,item.snapshot));assert.equal(sha(bytes),item.sha256);return {contents:bytes.toString(),loader:args.path.endsWith('.json')?'json':'ts',resolveDir:path.dirname(args.path)};});}}]});
const runtime=await import(pathToFileURL(output)),base=phase+'-battles/slots/'+slot;assert.ok(read(base+'/strict-replay.json').passed);const result=read(base+'/result.json'),rows=gunzipSync(fs.readFileSync(path.join(here,base,'actions.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(JSON.parse),chosen=rows.filter(r=>r.side==='model'&&r.search?.preferredPolicyEvaluated).sort((a,b)=>b.ms-a.ms)[0];
// 复放也通过冻结模块，防止诊断期间的公共源码更改串入旧版本。
const {GameEngine}=await import(pathToFileURL(output));
const stateEntry=path.join(prefix,'state.ts');fs.writeFileSync(stateEntry,`export {GameEngine} from ${JSON.stringify(path.join(repo,'src/game/engine.ts').replaceAll('\\','/'))};`);
await build({entryPoints:[stateEntry],bundle:true,platform:'node',format:'esm',outfile:path.join(prefix,'state.mjs'),plugins:[{name:'冻结引擎',setup(b){b.onLoad({filter:/\.ts$/},args=>{const item=frozen[path.relative(repo,args.path).split(path.sep).join('/')];if(item)return {contents:fs.readFileSync(path.join(here,item.snapshot),'utf8'),loader:'ts',resolveDir:path.dirname(args.path)};});}}]});
const E=(await import(pathToFileURL(path.join(prefix,'state.mjs')))).GameEngine,e=new E(read(read('teacher-battle-plan.json').maps[result.slot.mapIndex].path));for(const row of rows){assert.equal(sha(JSON.stringify(e.getState())),row.beforeHash);if(row.i===chosen.i)break;e.step(row.action);}
const state=e.getState(),model=read('teacher-model.json'),old=read('old-schema.json');fs.writeFileSync(path.join(prefix,'state.json'),JSON.stringify({state,row:chosen.i,originalMs:chosen.ms,slot}));
const session=new inspector.Session();session.connect();const post=name=>new Promise((resolve,reject)=>session.post(name,(e,r)=>e?reject(e):resolve(r)));await post('Profiler.enable');await post('Profiler.start');const times=[];
for(let i=0;i<5;i++){const v=runtime.run(state,model,old);assert.equal(v.code,chosen.code);times.push(v.ms);}const profile=(await post('Profiler.stop')).profile;session.disconnect();fs.writeFileSync(path.join(prefix,'root.cpuprofile'),JSON.stringify(profile));
const hits=new Map();for(const n of profile.nodes){const key=n.callFrame.functionName+' '+n.callFrame.url;hits.set(key,(hits.get(key)??0)+(n.hitCount??0));}const report={passed:true,phase,slot,row:chosen.i,originalMs:chosen.ms,times,topSamples:[...hits].sort((a,b)=>b[1]-a[1]).slice(0,30),runtimeSha256:sha(fs.readFileSync(output)),scope:'失败轨迹实际慢帧的冻结CPU诊断，不是资格面板'};fs.writeFileSync(path.join(prefix,'report.json'),JSON.stringify(report));console.log(report);
