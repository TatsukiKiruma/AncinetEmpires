/** 只在无本轮运行锁时切换已封存的指定源码，用于同期旧实现I/O对照。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..'),mode=process.argv[2];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),manifestFile=path.join(dir,'SOURCE_SWITCH.json');
const absolute=relative=>{const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw Error('源码切换路径越界');return target;};
if(mode==='prepare'){
    if(fs.existsSync(manifestFile))throw Error('源码封存已存在，拒绝覆盖');
    const pairs=[['src/game/ai/runtime/apk_hard_compute.ts','apk_hard_compute.ts'],['src/game/ai/runtime/apk_hard_policy.generated.js','apk_hard_policy.generated.js'],['tools/apk_hard_native_transform.mjs','apk_hard_native_transform.mjs'],['tools/apk_hard_compute_transform.mjs','apk_hard_compute_transform.mjs'],['ai_training/gpu/hard_jobs.ts','hard_jobs.ts']];
    for(const section of ['native','parallel'])for(const name of fs.readdirSync(path.join(dir,'source_before',section)))if(/\.(ts|mjs|cpp|hpp|cmd|hip)$/.test(name))pairs.push(['ai_training/gpu/'+section+'/'+name,section+'/'+name]);
    for(const name of ['kernel.hip','hard_native.node'])pairs.push(['ai_training/gpu/native/build/'+name,'native/build/'+name]);
    const files=[];
    for(const [target,before] of pairs){const beforeFile=path.join(dir,'source_before',before),current=absolute(target);if(hash(beforeFile)===hash(current))continue;const candidate='source_candidate/'+target;fs.mkdirSync(path.dirname(path.join(dir,candidate)),{recursive:true});fs.copyFileSync(current,path.join(dir,candidate));files.push({target,before:'source_before/'+before,candidate,beforeSha256:hash(beforeFile),candidateSha256:hash(current)});}
    fs.writeFileSync(manifestFile,JSON.stringify({preparedAt:new Date().toISOString(),files},null,2));console.log(JSON.stringify({preparedFiles:files.length}));
}else{
    if(!['baseline','candidate','recover-candidate'].includes(mode))throw Error('需指定prepare／baseline／candidate');
    for(const name of fs.readdirSync(dir))if(fs.existsSync(path.join(dir,name,'RUNNING.lock')))throw Error('仍有本轮采集锁：'+name);
    const {files}=JSON.parse(fs.readFileSync(manifestFile,'utf8')),from=mode==='baseline'?'candidate':'before',to=mode==='baseline'?'before':'candidate';
    for(const item of files){const actual=hash(absolute(item.target));if(mode==='recover-candidate'){if(actual!==item.beforeSha256&&actual!==item.candidateSha256)throw Error('发现其他源码修改，拒绝恢复：'+item.target);}else if(actual!==item[from+'Sha256'])throw Error('发现源码修改，拒绝覆盖：'+item.target);}
    const copied=[];
    try{for(const item of files){fs.copyFileSync(path.join(dir,item[to]),absolute(item.target));copied.push(item);}for(const item of files)if(hash(absolute(item.target))!==item[to+'Sha256'])throw Error('切换后摘要不符：'+item.target);}
    catch(e){for(const item of copied.reverse())fs.copyFileSync(path.join(dir,item[from]),absolute(item.target));throw e;}
    fs.appendFileSync(path.join(dir,'SOURCE_SWITCHES.jsonl'),JSON.stringify({mode,files:files.length,time:new Date().toISOString()})+'\n');console.log(JSON.stringify({mode,verifiedFiles:files.length}));
}
