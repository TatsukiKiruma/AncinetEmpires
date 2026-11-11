import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r13',out=path.join(here,'revisions',revision),old=path.join(here,'revisions/r12/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),checks=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green']){
    const bundle=path.join(here,`commander-health-${mode}-${stamp}.mjs`);await build({entryPoints:[path.join(here,'commander_health_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R12指挥官替普通单位承压回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true}),expectedFailure=mode==='red',log=`commander-health-${mode}-${stamp}.log`;fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});assert.equal(r.status,expectedFailure?1:0,r.stderr);if(expectedFailure)assert.match(r.stderr,/不能通过把指挥官从安全位置送去/);checks.push({mode,expectedFailure,status:r.status,log});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),receipt={passed:true,checks,oldCoreSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),guardSha256:sha(path.join(here,'commander_health_guard.ts')),addsReplySearch:false,scope:'Veto逐指挥官见证后剩余HP不退化，现有系数与24节点预算不变'};fs.writeFileSync(path.join(here,'commander-health-red-green-gate.json'),JSON.stringify(receipt));console.log(receipt);
