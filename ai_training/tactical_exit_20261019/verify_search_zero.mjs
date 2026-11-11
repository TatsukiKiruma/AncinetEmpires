import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'revisions/r9'),old=path.join(here,'revisions/r8/model_battle_search_ai.ts.snapshot'),stamp=Date.now(),probes={};fs.mkdirSync(out,{recursive:true});
for(const mode of ['old','new']){
    const bundle=path.join(here,`zero-${mode}-${stamp}.mjs`);await build({entryPoints:[path.join(here,'search_choice_probe.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:mode==='old'?[{name:'R8零尺度等价',setup(b){b.onLoad({filter:/model_battle_search_ai\.ts$/},args=>({contents:fs.readFileSync(old,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
    const r=spawnSync(process.execPath,[bundle],{encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,`zero-${mode}-${stamp}.log`),r.stdout+r.stderr,{flag:'wx'});assert.equal(r.status,0,r.stderr);probes[mode]=JSON.parse(r.stdout.trim());
}
assert.deepEqual(probes.new,probes.old);assert.ok(probes.new.every(r=>r.unchangedState));const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),result={passed:true,states:probes.new.length,actionsPlansAndLeafScoresExact:true,oldCoreSha256:sha(old),currentSha256:sha(path.join(here,'model_battle_search_ai.ts')),priorWeight:0};
fs.writeFileSync(path.join(here,'search-zero-gate.json'),JSON.stringify(result));console.log(result);
