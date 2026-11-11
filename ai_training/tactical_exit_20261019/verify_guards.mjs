import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),mode=process.argv[2]??'red',stamp=Date.now(),archive=path.join(here,mode==='red'?'revisions/r2':'revisions/r3');
fs.mkdirSync(archive,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),old=path.join(here,'revisions/r2/model_battle_search_ai.ts.snapshot'),current=path.join(here,'model_battle_search_ai.ts');
const errors={recruit:/新兵存在未展开的合法部署move时/,combat:/普通占村不能以更低真实战斗净值/,protection:/原高价单位仍致死时/};
let reference=path.join(here,'guard-r2-reference.mjs');
if(mode==='red'){
    if(!fs.existsSync(old)){const expected=JSON.parse(fs.readFileSync(path.join(here,'source-freeze-teacher-r2.json'),'utf8')).files['ai_training/tactical_exit_20261019/model_battle_search_ai.ts'].sha256;assert.equal(sha(current),expected);fs.writeFileSync(old,fs.readFileSync(current),{flag:'wx'});}
    await build({entryPoints:[path.join(here,'guard_regressions.ts')],bundle:true,platform:'node',format:'esm',outfile:reference,plugins:[{name:'历史R2守卫回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]});
}
const checks=[];
for(const [name,expected] of Object.entries(errors)){
    const args=mode==='red'?[reference,name]:['ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/guard_regressions.ts',name];
    const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true}),log=`guard-${name}-${mode}-${stamp}.log`;fs.writeFileSync(path.join(archive,log),r.stdout+r.stderr,{flag:'wx'});
    if(mode==='red'){assert.equal(r.status,1,name);assert.match(r.stderr,expected);}else assert.equal(r.status,0,name);
    checks.push({name,expectedFailure:mode==='red',status:r.status,log});
}
const result={passed:true,mode,checks,sourceSha256:sha(mode==='red'?old:current),testSha256:sha(path.join(here,'guard_regressions.ts'))};fs.writeFileSync(path.join(here,`guard-${mode}-proof.json`),JSON.stringify(result),{flag:'wx'});console.log(result);
