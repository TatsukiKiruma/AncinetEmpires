/** 预编译权威模块为一个worker源码包；每个原始import.meta.url保持原路径含义。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),sources={};
const result=await esbuild.build({absWorkingDir:root,entryPoints:[path.join(dir,'../parallel/worker.ts')],bundle:true,platform:'node',format:'cjs',target:'node22',write:false,metafile:true,minify:false,plugins:[{name:'保留原模块路径',setup(build){
    // 训练兼容桥包含仅CLI使用的顶层await，计算模块直接复用同一公共实现。
    build.onResolve({filter:/apk_resource_crypto$/},({path:request,importer})=>request==='../tools/apk_resource_crypto'&&importer===path.join(root,'ai_training/gpu/hard_jobs.ts')?{path:path.join(root,'tools/apk_resource_crypto.ts')}:undefined);
    build.onLoad({filter:/\.(ts|tsx|mjs|js)$/},async({path:file})=>{
    const raw=fs.readFileSync(file);sources[path.relative(root,file).replaceAll('\\','/')]=hash(raw);let source=raw.toString('utf8');
    if(file===path.join(root,'ai_training/gpu/parallel/worker.ts')){const anchor="const nativeModule=workerData.native?await import('../native/binding'):undefined;";if(source.split(anchor).length!==2)throw Error('worker打包锚点改变');source="import * as frozenNativeModule from '../native/binding';\n"+source.replace(anchor,'const nativeModule=frozenNativeModule;');}
    const loader=path.extname(file)==='.tsx'?'tsx':path.extname(file)==='.ts'?'ts':'js';const transformed=await esbuild.transform(source,{loader,target:'es2022',format:'esm',define:{'import.meta.url':JSON.stringify(pathToFileURL(file).href)}});return {contents:transformed.code,loader:'js',resolveDir:path.dirname(file)};
});}}]});
fs.mkdirSync(path.join(dir,'build'),{recursive:true});const code=result.outputFiles[0].contents;fs.writeFileSync(path.join(dir,'build/worker.cjs'),code);
fs.writeFileSync(path.join(dir,'build/worker.manifest.json'),JSON.stringify({esbuild:esbuild.version,nativeOnly:true,bundleSha256:hash(code),bytes:code.length,builderSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),sources},null,2));
console.log(JSON.stringify({bytes:code.length,sourceFiles:Object.keys(sources).length,bundleSha256:hash(code)}));
