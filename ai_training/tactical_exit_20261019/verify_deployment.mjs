import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r12',out=path.join(here,'revisions',revision),old=path.join(here,'revisions/r11/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),checks=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green'])for(const test of ['capture','defer','stay','assault']){
    const bundle=path.join(here,`deployment-${test}-${mode}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'deployment_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R11新兵部署与估值一致性回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle,test],{encoding:'utf8',windowsHide:true}),expectedFailure=mode==='red'&&test!=='stay',log=`deployment-${test}-${mode}-${stamp}.log`;
    fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});assert.equal(r.status,expectedFailure?1:0,r.stderr);
    if(expectedFailure)assert.match(r.stderr,test==='capture'?/空城新兵必须能/:test==='defer'?/未展开部署时必须/:/新兵部署攻击后必须/);
    checks.push({mode,test,expectedFailure,status:r.status,log});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');const result={passed:true,checks,oldCoreSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),deploymentSourceSha256:sha(path.join(here,'deployment_candidates.ts')),scope:'同一个权威引擎、原有24节点预算、无分支策略前向；比较新兵完整连动及实际叶子，不代表实战资格'};
fs.writeFileSync(path.join(here,'deployment-red-green-gate.json'),JSON.stringify(result));console.log(result);
