import esbuild from 'esbuild';import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
const o=path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1');
const r=await esbuild.build({entryPoints:[path.join(o,'chain_probe.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(o,'chain_probe.cjs'),metafile:true});
const allowed=[o,path.resolve('ai_training/r8_pure_policy_stage_20261014_125300')];
for(const p of Object.keys(r.metafile.inputs))if(!allowed.some(a=>path.resolve(p).startsWith(path.resolve(a)+path.sep)))throw Error('依赖逃逸 '+p);
fs.writeFileSync(path.join(o,'bundle_manifest.json'),JSON.stringify(r.metafile,null,2),{flag:'wx'});
const child=spawn(process.execPath,[path.join(o,'chain_probe.cjs')],{stdio:'inherit'});const timer=setTimeout(()=>{child.kill();fs.writeFileSync(path.join(o,'external_timeout.json'),JSON.stringify({timeoutSeconds:540}));},540000);child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
