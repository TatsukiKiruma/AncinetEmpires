import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),revision=process.argv[2]??'r19',baseline=process.argv[3]??'teacher-r18',stamp=Date.now(),read=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8')),sha=x=>createHash('sha256').update(x).digest('hex');
const frozen=read('source-freeze-'+baseline+'.json').files,variants={};
for(const name of ['baseline','current']){
    const out=path.join(here,`revision-ab-${name}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'benchmark_root_entry.ts')],bundle:true,platform:'node',format:'esm',outfile:out,plugins:name==='baseline'?[{name:'完整冻结依赖',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{const key=path.relative(repo,args.path).split(path.sep).join('/'),item=frozen[key];if(!item)return;const contents=fs.readFileSync(path.join(here,item.snapshot));assert.equal(sha(contents),item.sha256);return {contents:contents.toString(),loader:args.path.endsWith('.json')?'json':'ts',resolveDir:path.dirname(args.path)};});}}]:[]});
    variants[name]=await import(pathToFileURL(out));
}
const model=read('teacher-model.json'),old=read('old-schema.json'),states=[...read('browser-states.json').map(v=>v.state),read('revisions/r17/slow-root-state.json').state,read('teacher-r16-root-coverage-gate.json').state],samples=[];
for(const [i,state] of states.entries()){
    let expected;
    for(let repeat=0;repeat<4;repeat++)for(const name of (repeat%2?['current','baseline']:['baseline','current'])){
        const v=variants[name].run(state,model,old),identity=sha(JSON.stringify([v.code,v.decision]));expected??=identity;assert.equal(identity,expected,'全部选择及搜索元数据必须相同');samples.push({state:i,repeat,variant:name,ms:v.ms,decisionHash:identity});
    }
}
const quantile=(xs,q)=>[...xs].sort((a,b)=>a-b)[Math.ceil(q*xs.length)-1],groups={};for(const name of ['baseline','current']){const x=samples.filter(s=>s.variant===name&&s.repeat>0).map(s=>s.ms);groups[name]={count:x.length,p50:quantile(x,.5),p95:quantile(x,.95),totalMs:x.reduce((a,b)=>a+b,0)};}
const report={passed:true,createdAt:new Date().toISOString(),baselineFreezeSha256:sha(fs.readFileSync(path.join(here,'source-freeze-'+baseline+'.json'))),teacherModelSha256:sha(fs.readFileSync(path.join(here,'teacher-model.json'))),currentSources:Object.fromEntries(['benchmark_root_entry.ts','focus_threat.ts','movement_query_cache.ts','shared_single_threat.ts','combined_tactics.ts','leaf.ts','model_battle_search_ai.ts'].map(n=>[n,sha(fs.readFileSync(path.join(here,n)))])),scope:'同机交替完整冻结依赖的性能诊断，不替代正式四进程面板',allDecisionsExact:true,groups,samples};fs.writeFileSync(path.join(here,`revisions/${revision}/revision-ab-${stamp}.json`),JSON.stringify(report),{flag:'wx'});console.log(JSON.stringify({...report,samples:undefined}));
