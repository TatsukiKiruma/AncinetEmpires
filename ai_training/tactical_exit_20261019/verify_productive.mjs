import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),revision=process.argv[2]??'r10',deploymentChanged=Number(revision.slice(1))>=12,out=path.join(here,'revisions',revision),old=path.join(here,'revisions/r9/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),checks=[],probes={};fs.mkdirSync(out,{recursive:true});
for(const mode of ['red','green'])for(const entry of ['productive_follow_regression.ts','productive_choice_probe.ts']){
    const bundle=path.join(here,`productive-${entry.slice(0,-3)}-${mode}-${stamp}.mjs`);await build({entryPoints:[path.join(here,entry)],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='red'?[{name:'R9生产性默认连动未提交回归',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true,env:{...process.env,STAGE5_PRODUCTIVE_RECEIPT:''}}),log=`productive-${entry}-${mode}-${stamp}.log`;fs.writeFileSync(path.join(out,log),r.stdout+r.stderr,{flag:'wx'});const expectedFailure=mode==='red'&&entry==='productive_follow_regression.ts';
    if(expectedFailure){assert.equal(r.status,1);assert.match(r.stderr,/已估值且安全有收益的默认同单位后续必须实际提交/);}else assert.equal(r.status,0,r.stderr);
    if(entry==='productive_choice_probe.ts')probes[mode]=JSON.parse(r.stdout.trim());checks.push({mode,entry,expectedFailure,status:r.status,log});
}
let changedPlans=0,changedRoots=0,changedLeaves=0;for(let i=0;i<probes.red.length;i++){const a=probes.red[i],b=probes.green[i];assert.ok(b.unchangedState);changedRoots+=Number(a.action!==b.action);changedLeaves+=Number(a.leafHash!==b.leafHash);if(!deploymentChanged){assert.equal(a.action,b.action);assert.equal(a.leafHash,b.leafHash);}if(JSON.stringify(a.plan)!==JSON.stringify(b.plan)){if(!deploymentChanged){assert.equal(a.plan.length,0);assert.ok(b.productiveFollowCommitted&&b.plan.length);}changedPlans++;}}
assert.ok(changedPlans>0);const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),result={passed:true,checks,states:probes.red.length,rootActionsAndLeafScoresExact:changedRoots===0&&changedLeaves===0,changedRoots,changedLeaves,changedPlans,oldCoreSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts'))};
result.sharedLeafSha256=sha(path.join(here,'leaf.ts'));result.scope=deploymentChanged?'生产性默认移动占村夹具的红绿回归通过；23状态仅作差异诊断，新兵部署与Veto守卫改变候选或选择，不沿用旧矩阵等价声明；不是完整历史版本实战复跑':'模块回归：红绿共享当前叶子模块，比较默认有效计划提交；不是完整历史版本实战复跑';
fs.writeFileSync(path.join(here,'productive-red-green-gate.json'),JSON.stringify(result));console.log(result);
