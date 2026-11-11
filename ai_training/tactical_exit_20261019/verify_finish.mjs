import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'revisions',process.argv[2]??'r7'),old=path.join(here,'revisions/r6/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),checks=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green']){
    const bundle=path.join(here,`finish-${mode}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'finish_risk_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R6贪心完结风险回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true,env:{...process.env,STAGE5_FINISH_RECEIPT:''}}),log=`finish-${mode}-${stamp}.log`;fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});
    if(mode==='red'){assert.equal(r.status,1);assert.match(r.stderr,/同一根动作已有完整安全待机/);}else assert.equal(r.status,0,r.stderr);
    checks.push({mode,expectedFailure:mode==='red',status:r.status,log});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),result={passed:true,checks,oldSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),testSha256:sha(path.join(here,'finish_risk_regression.ts'))};
const receipt=path.join(here,'finish-red-green-gate.json');if(fs.existsSync(receipt))fs.copyFileSync(receipt,path.join(out,`previous-finish-gate-${stamp}.json`),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(receipt,JSON.stringify(result));console.log(result);
