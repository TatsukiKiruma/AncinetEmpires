import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r17',out=path.join(here,'revisions',revision),old=path.join(here,'revisions/r16/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),checks=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green']){
    const bundle=path.join(here,`root-capacity-${mode}-${stamp}.mjs`);await build({entryPoints:[path.join(here,'root_capacity_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'原六根缺失安全防守连动',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true}),expectedFailure=mode==='red',log=`root-capacity-${mode}-${stamp}.log`;fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});assert.equal(r.status,expectedFailure?1:0,r.stderr);if(expectedFailure)assert.match(r.stderr,/根候选容量必须覆盖真实安全/);checks.push({mode,expectedFailure,status:r.status,log});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),receipt={passed:true,checks,oldCoreSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),budgetSha256:sha(path.join(here,'search_budget.ts')),scope:'有界扩容保留原六根，覆盖实际缺失的完整安全防守解；不是实战增益证明'};fs.writeFileSync(path.join(here,'root-capacity-red-green-gate.json'),JSON.stringify(receipt));console.log(receipt);
