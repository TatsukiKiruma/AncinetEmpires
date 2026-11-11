import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r21',folder=path.join(here,'revisions',revision),stamp=Date.now(),old=path.join(here,'revisions/r21/model_battle_search_ai.ts.before.snapshot'),checks=[];
for(const mode of ['red','green']){
    const file=path.join(here,`safe-completion-${mode}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,'safe_completion_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:file,plugins:mode==='red'?[{name:'冻结R20贪心后续',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const p=spawnSync(process.execPath,[file],{encoding:'utf8',windowsHide:true,env:{...process.env,STAGE5_SAFE_COMPLETION_RECEIPT:mode==='green'?`revisions/${revision}/safe-completion-real-witness.json`:''}});fs.writeFileSync(file+'.log',p.stdout+p.stderr,{flag:'wx'});
    assert.equal(p.status,mode==='red'?1:0,p.stdout+p.stderr);if(mode==='red')assert.match(p.stderr,/已枚举的攻击削弱致死威胁者后安全/);checks.push({mode,status:p.status,log:path.relative(here,file+'.log')});
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');const report={passed:true,checks,oldCoreSha256:sha(old),coreSha256:sha(path.join(here,'model_battle_search_ai.ts')),recoverySha256:sha(path.join(here,'completion_recovery.ts')),testSha256:sha(path.join(here,'safe_completion_regression.ts'))};fs.writeFileSync(path.join(folder,'safe-completion-red-green-gate.json'),JSON.stringify(report),{flag:'wx'});console.log(report);
