import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),r1=path.join(here,'revisions/r1'),r2=path.join(here,'revisions/r2');
fs.mkdirSync(r2,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const old=path.join(r1,'model_battle_search_ai.ts.snapshot'),reference=path.join(here,'regression-r1-reference.mjs');
// 仅在独立束中替换历史搜索类，活动源码和已提交轨迹均不改写。
await build({entryPoints:[path.join(here,'regressions.ts')],bundle:true,platform:'node',format:'esm',outfile:reference,plugins:[{name:'历史R1队列回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]});
function run(args,name){const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(name.includes('red')?r1:r2,name),r.stdout+r.stderr,{flag:'wx'});return r;}
const red=run([reference],'queue-regression-red.log');assert.equal(red.status,1);assert.match(red.stderr,/未触发守卫不得排入推演wait覆盖新兵移动/);
const green=run(['ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/regressions.ts'],'queue-regression-green.log');assert.equal(green.status,0);
const types=run(['ai_training/run.mjs','node','../node_modules/typescript/bin/tsc','--noEmit','-p','tactical_exit_20261019/tsconfig.json'],'queue-typecheck.log');assert.equal(types.status,0);
const result={passed:true,redFailedForExpectedQueueDefect:true,greenPassed:true,typecheckPassed:true,coreSha256:sha(path.join(here,'model_battle_search_ai.ts')),r1CoreSha256:sha(old),testSha256:sha(path.join(here,'regressions.ts')),referenceSha256:sha(reference),coefficientsAndBudgetUnchanged:true};
fs.writeFileSync(path.join(here,'r2-ready.json'),JSON.stringify(result),{flag:'wx'});console.log(result);
