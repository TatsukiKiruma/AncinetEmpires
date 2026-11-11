import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'performance_query_cache'),old=path.join(here,'revisions/r3/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),checks=[];
for(const mode of ['red','green']){
    const bundle=path.join(here,`critical-${mode}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'critical_event_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R3候选覆盖回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true,env:{...process.env,STAGE5_CRITICAL_DEBUG:'',STAGE5_CRITICAL_RECEIPT:''}}),log=`critical-${mode}-${stamp}.log`;
    fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});
    if(mode==='red'){assert.equal(r.status,1);assert.match(r.stderr,/普通移动决策也必须覆盖合法的移动夺取敌城堡候选/);}else assert.equal(r.status,0,r.stderr);
    checks.push({mode,expectedFailure:mode==='red',status:r.status,log});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const result={passed:true,checks,oldSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),testSha256:sha(path.join(here,'critical_event_regression.ts'))};fs.writeFileSync(path.join(out,'critical-red-green-gate.json'),JSON.stringify(result),{flag:'wx'});console.log(result);
