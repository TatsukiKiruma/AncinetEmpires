import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r23',stamp=Date.now(),old=path.join(here,'revisions/r23/model_battle_search_ai.ts.before.snapshot'),checks=[];
for(const mode of ['red','green']){
    const file=path.join(here,`safe-recruitment-coverage-${mode}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'safe_recruitment_coverage_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:file,plugins:mode==='red'?[{name:'冻结R22未覆盖的安全招募',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const p=spawnSync(process.execPath,[file],{encoding:'utf8',windowsHide:true,env:{...process.env,STAGE5_RECRUITMENT_COVERAGE_RECEIPT:mode==='green'?`revisions/${revision}/safe-recruitment-coverage-real-witness.json`:''}});fs.writeFileSync(file+'.log',p.stdout+p.stderr,{flag:'wx'});
    assert.equal(p.status,mode==='red'?1:0,p.stdout+p.stderr);if(mode==='red')assert.match(p.stderr,/收尾必须覆盖已知安全且可生产性的招募/);checks.push({mode,status:p.status,log:path.relative(here,file+'.log')});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={passed:true,checks,oldCoreSha256:sha(old),coreSha256:sha(path.join(here,'model_battle_search_ai.ts')),coverageSha256:sha(path.join(here,'safe_recruitment_coverage.ts')),testSha256:sha(path.join(here,'safe_recruitment_coverage_regression.ts'))};fs.writeFileSync(path.join(here,'revisions',revision,'safe-recruitment-coverage-red-green-gate.json'),JSON.stringify(report),{flag:'wx'});console.log(report);
