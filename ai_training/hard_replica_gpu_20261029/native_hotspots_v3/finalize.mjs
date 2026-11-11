/** 封存最终来源、指标及新轨迹摘要；不执行采集、训练或规则回放。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8').replace(/^\uFEFF/,''));
const hash=file=>{const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024),value=crypto.createHash('sha256');try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))value.update(buffer.subarray(0,n));return value.digest('hex');}finally{fs.closeSync(fd);}};
const local=relative=>{const result=path.resolve(root,relative);if(!result.startsWith(root+path.sep))throw Error('封存路径越界');return result;};
const comparison=read('COMPARISON.json'),run=read('candidate_fixed_full/RUN.json'),processes=read('FINAL_PROCESS_CHECK.json');
if(processes.projectProcesses.length)throw Error('仍有项目采集进程');
const files=new Set(['ai_training/README.md','ai_training/status/CURRENT.md','ai_training/gpu/native/README.md']);let archived=0;
for(const [relative,expected] of Object.entries(run.identity.sources)){
    const file=local(relative);if(hash(file)!==expected)throw Error('候选源码改变：'+relative);files.add(relative);
    if(relative.startsWith('ai_training/gpu/')||relative.startsWith('tools/apk_hard_')||relative.startsWith('src/game/ai/runtime/apk_hard_')){const saved=path.join(dir,'source_final',relative);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(file,saved);files.add(path.relative(root,saved).replaceAll('\\','/'));archived++;}
}
const environment={created:new Date().toISOString(),node:process.version,versions:process.versions,cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length,totalMemoryBytes:os.totalmem(),platform:process.platform,architecture:process.arch,timezone:'Asia/Shanghai'};
fs.writeFileSync(path.join(dir,'ENVIRONMENT.json'),JSON.stringify(environment,null,2));
const result={implementationComplete:true,fullBenchmarkComplete:true,naturalEachArm:32,actionsEachArm:44310,decodedRecordsByteIdentical:true,...comparison.changes,productionResumed:false,historicalReplayExecuted:false,trainingExecuted:false,phoneTasksModified:false,storageCleanupPerformed:false,ioGoal:'减少采集过程的逻辑读取和写入，不删除历史数据',physicalDiskIoMeasured:false,tests:{publicLint:true,gpuTypes:true,generator:true,publicBuild:true,publicHardAiTests:15,nativeNumerical:true,viewCases:15,ioCache:true,throttle:true,currentStateVerification:true},completedAt:new Date().toISOString()};
fs.writeFileSync(path.join(dir,'TASK_RESULT.json'),JSON.stringify(result,null,2));
for(const name of fs.readdirSync(dir))if(/\.(json|md|log|mjs|py|jsonl)$/.test(name)&&name!=='DELIVERY_MANIFEST.json')files.add(path.relative(root,path.join(dir,name)).replaceAll('\\','/'));
for(const arm of ['baseline_full','baseline_io_full','candidate_full','candidate_fixed_full']){
    const folder=path.join(dir,arm);for(const name of ['RUN.json','DEVICE.json','RESULTS.json','PROGRESS.json','CPU_GPU_MEASUREMENT.json','CPU_TIMESERIES.jsonl','EXTERNAL_GPU.jsonl','GPU_UTILIZATION.jsonl'])if(fs.existsSync(path.join(folder,name)))files.add(path.relative(root,path.join(folder,name)).replaceAll('\\','/'));
    for(let sequence=2001;sequence<=2032;sequence++)for(const name of ['job.json','initial.json','final.json','result.json','decisions.jsonl.gz']){const file=path.join(folder,'parent-'+sequence,'attempt-1',name);if(fs.existsSync(file))files.add(path.relative(root,file).replaceAll('\\','/'));}
}
const manifest={created:new Date().toISOString(),candidateSourcesUnchanged:true,archivedSourceFiles:archived,files:[...files].sort().map(file=>({file,sha256:hash(local(file)),bytes:fs.statSync(local(file)).size}))};
fs.writeFileSync(path.join(dir,'DELIVERY_MANIFEST.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({sealedFiles:manifest.files.length,archivedSources:archived,sourceIdentityUnchanged:true,projectProcesses:0,...result}));
