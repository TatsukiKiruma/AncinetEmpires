import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),lane=Number(process.argv[2]??0),stamp=Date.now(),sha=b=>createHash('sha256').update(b).digest('hex'),read=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8')),variants={},bindings={};
for(const [name,freeze] of [['baseline','teacher-r20'],['optimized','r21-performance-only']]){
    const frozen=read('source-freeze-'+freeze+'.json').files,file=path.join(here,`r21-performance-proof-${name}-${lane}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'benchmark_root_entry.ts')],bundle:true,platform:'node',format:'esm',outfile:file,plugins:[{name:'完整冻结性能版本',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{const item=frozen[path.relative(repo,args.path).split(path.sep).join('/')];if(!item)return;const bytes=fs.readFileSync(path.join(here,item.snapshot));assert.equal(sha(bytes),item.sha256);return {contents:bytes.toString(),loader:args.path.endsWith('.json')?'json':'ts',resolveDir:path.dirname(args.path)};});}}]});
    variants[name]=await import(pathToFileURL(file));bindings[name]={freeze,freezeSha256:sha(fs.readFileSync(path.join(here,'source-freeze-'+freeze+'.json'))),bundleSha256:sha(fs.readFileSync(file))};
}
const roots=gunzipSync(fs.readFileSync(path.join(here,`search-scale/roots-${lane}.jsonl.gz`))).toString().trim().split('\n').map(JSON.parse),model=read('teacher-model.json'),old=read('old-schema.json');let count=0,candidates=0,witnessActions=0;
for(const row of roots){
    const before=variants.baseline.run(row.state,model,old),after=variants.optimized.runProof(row.state,model,old);
    assert.deepEqual(after.code,before.code);assert.deepEqual(after.decision,before.decision,'纯性能变化必须保持完整候选、分数、计划及风险见证');
    count++;candidates+=after.decision.traces.length;witnessActions+=after.audit.witnessActions;
    if(count%10===0)fs.writeFileSync(path.join(here,`revisions/r21/performance-proof-${lane}.live.json`),JSON.stringify({count,total:roots.length,witnessActions}));
}
const report={passed:true,lane,roots:count,candidates,witnessActions,bindings,modelSha256:sha(fs.readFileSync(path.join(here,'teacher-model.json'))),allRootDecisionsAndTracesExact:true,allWitnessesReplayed:true,scope:'R20与R21纯性能冻结版本在同1557根的完整决策和风险见证对照，不含安全完结修复，不代表实战资格'};fs.writeFileSync(path.join(here,`revisions/r21/performance-proof-${lane}.json`),JSON.stringify(report),{flag:'wx'});console.log(report);
