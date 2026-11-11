import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'performance_query_cache'),sourcePath=path.join(here,'group_model.ts'),before=fs.readFileSync(sourcePath,'utf8');
let after=before.replace(/const input = (\[\.\.\.ctx, .*?Array\(o\.c\)\.fill\(0\)\]);/,'const input = gradient ? $1 : [];').replace('for(const [i,v] of candidate) input[o.k+3*h+i]=v;','if(gradient)for(const [i,v] of candidate) input[o.k+3*h+i]=v;');assert.notEqual(after,before);
fs.writeFileSync(path.join(out,'group_model.ts.before'),before,{flag:'wx'});fs.writeFileSync(path.join(out,'group_model.ts.proposed'),after,{flag:'wx'});
for(const [name,text] of [['old',before],['proposed',after]])await build({stdin:{contents:text,sourcefile:sourcePath,resolveDir:here,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:path.join(out,`group-${name}.mjs`)});
const old=(await import(pathToFileURL(path.join(out,'group-old.mjs')).href)).forwardGroup,next=(await import(pathToFileURL(path.join(out,'group-proposed.mjs')).href)).forwardGroup,model=JSON.parse(fs.readFileSync(path.join(here,'teacher-model.json'),'utf8')),inputs=JSON.parse(fs.readFileSync(path.join(here,'inputs.json'),'utf8'));
for(const input of inputs)for(const gradient of [false,true])assert.deepEqual(next(input,model,gradient),old(input,model,gradient));
// 同一进程交替计时，微基准不替代最终面板的完整决策计时。
for(let warm=0;warm<3;warm++)for(const input of inputs){old(input,model);next(input,model);}
const times={old:[],proposed:[]};
for(let repeat=0;repeat<10;repeat++)for(const input of inputs)for(const [name,fn] of repeat%2?[['proposed',next],['old',old]]:[['old',old],['proposed',next]]){const t=performance.now();fn(input,model);times[name].push(performance.now()-t);}
const q=values=>{values.sort((a,b)=>a-b);return Object.fromEntries([['p50',.5],['p95',.95],['p99',.99]].map(([k,p])=>[k,values[Math.ceil(p*values.length)-1]]));};
const result={passed:true,states:inputs.length,forwardAndAllGradientsByteEquivalent:true,modelUnchanged:true,old:q(times.old),proposed:q(times.proposed),beforeSha256:createHash('sha256').update(before).digest('hex'),proposedSha256:createHash('sha256').update(after).digest('hex')};fs.writeFileSync(path.join(out,'forward-allocation-gate.json'),JSON.stringify(result),{flag:'wx'});console.log(result);
