import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),stamp=Date.now(),out=path.join(here,`cache-regression-${stamp}.mjs`),revision=process.argv[2]??'r18';
await build({entryPoints:[path.join(here,'cache_regression.ts')],bundle:true,platform:'node',format:'esm',outfile:out,plugins:[{name:'冻结R17风险参考',setup(b){b.onLoad({filter:/focus_reference\.ts$/},()=>({contents:fs.readFileSync(path.join(here,'revisions/r18/focus_threat.ts.before.snapshot'),'utf8'),loader:'ts',resolveDir:here}));}}]});
const r=spawnSync(process.execPath,[out,revision],{encoding:'utf8',windowsHide:true});fs.writeFileSync(out+'.log',r.stdout+r.stderr,{flag:'wx'});console.log(r.stdout);assert.equal(r.status,0,r.stderr);
