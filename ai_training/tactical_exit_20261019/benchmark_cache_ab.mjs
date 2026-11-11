import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),stamp=Date.now(),read=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8')),sha=x=>createHash('sha256').update(x).digest('hex');
const variants={};
for(const name of ['r17','r18']){
    const out=path.join(here,`cache-ab-${name}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'benchmark_root_entry.ts')],bundle:true,platform:'node',format:'esm',outfile:out,plugins:name==='r17'?[{name:'冻结R17缓存参考',setup(b){b.onLoad({filter:/tactical_exit_20261019[\\/]focus_threat\.ts$/},args=>({contents:fs.readFileSync(path.join(here,'revisions/r18/focus_threat.ts.before.snapshot'),'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    variants[name]=await import(pathToFileURL(out));
}
const model=read('teacher-model.json'),old=read('old-schema.json'),states=[...read('browser-states.json').map(v=>v.state),read('revisions/r17/slow-root-state.json').state,read('teacher-r16-root-coverage-gate.json').state],samples=[];
for(const [i,state] of states.entries()){
    let expected;
    for(let repeat=0;repeat<4;repeat++)for(const name of (repeat%2?['r18','r17']:['r17','r18'])){
        const v=variants[name].run(state,model,old),identity=sha(JSON.stringify([v.code,v.decision]));expected??=identity;assert.equal(identity,expected,'完整选择与搜索元数据必须相同');
        samples.push({state:i,stateHash:sha(JSON.stringify(state)),repeat,variant:name,ms:v.ms,decisionHash:identity,code:v.code});
    }
}
const quantile=(xs,q)=>[...xs].sort((a,b)=>a-b)[Math.ceil(q*xs.length)-1],groups={};
for(const name of ['r17','r18']){const x=samples.filter(s=>s.variant===name&&s.repeat>0).map(s=>s.ms);groups[name]={count:x.length,p50:quantile(x,.5),p95:quantile(x,.95),p99:quantile(x,.99),totalMs:x.reduce((a,b)=>a+b,0)};}
const report={passed:true,createdAt:new Date().toISOString(),scope:'同一进程环境中交替运行冻结缓存与当前缓存；只作因果性能诊断，不替代固定四进程面板门禁',rootStates:states.length,allDecisionsExact:true,groups,samples,teacherModelSha256:sha(fs.readFileSync(path.join(here,'teacher-model.json'))),referenceFocusSha256:sha(fs.readFileSync(path.join(here,'revisions/r18/focus_threat.ts.before.snapshot'))),focusSha256:sha(fs.readFileSync(path.join(here,'focus_threat.ts'))),geometryEqualSha256:sha(fs.readFileSync(path.join(here,'geometry_equal.ts')))};
fs.writeFileSync(path.join(here,`revisions/r18/cache-ab-${stamp}.json`),JSON.stringify(report),{flag:'wx'});console.log(JSON.stringify({...report,samples:undefined}));
