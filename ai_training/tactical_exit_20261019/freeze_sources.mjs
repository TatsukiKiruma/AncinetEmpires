import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),name=process.argv[2]??'development';
const requested=process.argv.slice(3),entries=requested.length?requested:['prepare.ts','battle.ts','expert.ts','model_battle_search_ai.ts'];
const result=await build({entryPoints:entries.map(n=>path.join(here,n)),bundle:true,write:false,metafile:true,platform:'node',format:'esm',outdir:path.join(here,'unwritten-bundle')});
const files={};const store=path.join(here,'source-snapshots');fs.mkdirSync(store,{recursive:true});
for(const file of Object.keys(result.metafile.inputs)){
    const source=path.resolve(file);if(source.includes('node_modules'))continue;
    const data=fs.readFileSync(source),sha=createHash('sha256').update(data).digest('hex'),target=path.join(store,sha+'.snapshot');if(!fs.existsSync(target))fs.writeFileSync(target,data,{flag:'wx'});
    files[path.relative(root,source).replaceAll('\\','/')]={sha256:sha,snapshot:path.relative(here,target).replaceAll('\\','/')};
}
const output=path.join(here,'source-freeze-'+name+'.json');fs.writeFileSync(output,JSON.stringify({files,createdAt:new Date().toISOString()}),{flag:'wx'});console.log({files:Object.keys(files).length});
