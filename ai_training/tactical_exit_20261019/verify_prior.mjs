import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'revisions',process.argv[2]??'r8'),old=path.join(here,'revisions/r7/policy_runtime.ts.snapshot'),stamp=Date.now(),checks=[],probes={};fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green'])for(const entry of ['hierarchical_prior_regression.ts','policy_choice_probe.ts']){
    const bundle=path.join(here,`prior-${entry.slice(0,-3)}-${mode}-${stamp}.mjs`);
    await build({entryPoints:[path.join(here,entry)],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R7联合概率与分层解码不一致回归',setup(b){b.onLoad({filter:/policy_runtime\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true,env:{...process.env,STAGE5_PRIOR_RECEIPT:''}}),log=`prior-${entry}-${mode}-${stamp}.log`;fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});
    const expectedFailure=mode==='red'&&entry==='hierarchical_prior_regression.ts';if(expectedFailure){assert.equal(r.status,1);assert.match(r.stderr,/搜索候选先验必须与主策略分层首选一致/);}else assert.equal(r.status,0,r.stderr);
    if(entry==='policy_choice_probe.ts')probes[mode]=JSON.parse(r.stdout.trim());checks.push({mode,entry,expectedFailure,status:r.status,log});
}
assert.equal(probes.red.length,probes.green.length);let changed=0;
for(let i=0;i<probes.red.length;i++){
    const a=probes.red[i],b=probes.green[i];for(const key of ['inputHash','outputHash','argmax'])assert.equal(a[key],b[key]);assert.deepEqual(a.prior,b.jointPrior);changed+=Number(JSON.stringify(a.prior)!==JSON.stringify(b.prior));
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),result={passed:true,checks,states:probes.red.length,unchangedPolicyInput:true,unchangedForwardAndArgmax:true,changedSearchPriors:changed,oldPolicyRuntimeSha256:sha(old),currentPolicyRuntimeSha256:sha(path.join(here,'policy_runtime.ts')),currentSha256:sha(path.join(here,'model_battle_search_ai.ts'))};
const receipt=path.join(here,'prior-red-green-gate.json');if(fs.existsSync(receipt))fs.copyFileSync(receipt,path.join(out,`previous-prior-gate-${stamp}.json`),fs.constants.COPYFILE_EXCL);fs.writeFileSync(receipt,JSON.stringify(result));console.log(result);
