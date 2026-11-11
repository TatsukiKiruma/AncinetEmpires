import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r15',out=path.join(here,'revisions',revision),old=path.join(here,'revisions/r14/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),checks=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green']){
    const bundle=path.join(here,`veto-objective-${mode}-${stamp}.mjs`);await build({entryPoints:[path.join(here,'veto_objective_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R14同单位绝对优先覆盖更高叶子值回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true}),expectedFailure=mode==='red',log=`veto-objective-${mode}-${stamp}.log`;fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});assert.equal(r.status,expectedFailure?1:0,r.stderr);if(expectedFailure)assert.match(r.stderr,/Veto备选必须按风险调整后的叶子分选择/);checks.push({mode,expectedFailure,status:r.status,log});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),receipt={passed:true,checks,oldCoreSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),scope:'Veto按原叶子分排序；原有所有安全与净收益门槛不放宽；R14绝对同单位优先不采纳'};fs.writeFileSync(path.join(here,'veto-objective-red-green-gate.json'),JSON.stringify(receipt));console.log(receipt);
