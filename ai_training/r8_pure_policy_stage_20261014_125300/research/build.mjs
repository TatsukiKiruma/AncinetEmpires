import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const stage='ai_training/r8_pure_policy_stage_20261014_125300';
for(const name of process.argv.slice(2).length?process.argv.slice(2):['worker']){
 const r=await esbuild.build({entryPoints:[`${stage}/research/${name}.ts`],bundle:true,platform:'node',format:'cjs',outfile:`${stage}/runs/${name}.cjs`,metafile:true,logLevel:'warning'});
 const outside=Object.keys(r.metafile.inputs).filter(p=>!path.resolve(p).startsWith(path.resolve(stage)+path.sep));
 if(outside.length)throw Error('冻结依赖逃逸 '+outside.join(','));
 fs.writeFileSync(`${stage}/identity/${name}_bundle_metafile.json`,JSON.stringify(r.metafile,null,2));
 console.log(name,Object.keys(r.metafile.inputs).length,'个输入全部位于研究目录');
}
