import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r24',stamp=Date.now(),old=path.join(here,'revisions/r24/search_budget.ts.before.snapshot'),checks=[];
for(const mode of ['red','green']){
    const file=path.join(here,`top16-capacity-${mode}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'top16_capacity_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:file,plugins:mode==='red'?[{name:'冻结原Top12预算',setup(b){b.onLoad({filter:/search_budget\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const p=spawnSync(process.execPath,[file],{encoding:'utf8',windowsHide:true,env:{...process.env,STAGE5_TOP16_RECEIPT:mode==='green'?`revisions/${revision}/top16-capacity-real-witness.json`:''}});fs.writeFileSync(file+'.log',p.stdout+p.stderr,{flag:'wx'});
    assert.equal(p.status,mode==='red'?1:0,p.stdout+p.stderr);if(mode==='red')assert.match(p.stderr,/原Top12之外的真实安全攻击必须被新增容量覆盖/);checks.push({mode,status:p.status,log:path.relative(here,file+'.log')});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={passed:true,checks,oldBudgetSha256:sha(old),coreSha256:sha(path.join(here,'model_battle_search_ai.ts')),budgetSha256:sha(path.join(here,'search_budget.ts')),testSha256:sha(path.join(here,'top16_capacity_regression.ts')),originalTwelvePreserved:true};fs.writeFileSync(path.join(here,'revisions',revision,'top16-capacity-red-green-gate.json'),JSON.stringify(report),{flag:'wx'});console.log(report);
