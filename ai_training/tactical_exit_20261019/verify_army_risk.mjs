import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'revisions/r11'),stamp=Date.now(),checks=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green']){
    const bundle=path.join(here,`army-risk-${mode}-${stamp}.mjs`);await build({entryPoints:[path.join(here,'army_risk_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R10军力成本风险回归',setup(b){b.onLoad({filter:/(model_battle_search_ai|leaf)\.ts$/},args=>({contents:fs.readFileSync(path.join(here,'revisions/r10',path.basename(args.path)+'.snapshot'),'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    for(const test of ['double','capital','future','veto','before']){
        const r=spawnSync(process.execPath,[bundle,test],{encoding:'utf8',windowsHide:true}),log=`army-risk-${test}-${mode}-${stamp}.log`;fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});const expectedFailure=mode==='red'&&test!=='before';
        if(expectedFailure){assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stderr,/实际阵亡已计入净战损|高价值标记必须按行动前|未来行动单位致死惩罚|低现存军力的正净值交换/);}else assert.equal(r.status,0,r.stderr);
        checks.push({mode,test,expectedFailure,status:r.status,log});
    }
}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),result={passed:true,checks,currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),currentLeafSha256:sha(path.join(here,'leaf.ts')),oldCoreSha256:sha(path.join(here,'revisions/r10/model_battle_search_ai.ts.snapshot')),oldLeafSha256:sha(path.join(here,'revisions/r10/leaf.ts.snapshot'))};fs.writeFileSync(path.join(here,'army-risk-red-green-gate.json'),JSON.stringify(result));console.log(result);
