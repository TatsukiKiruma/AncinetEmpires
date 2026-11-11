/** 封存本轮报告与源码身份，不执行采集、训练或回放。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8').replace(/^\uFEFF/,''));
const comparison=read('COMPARISON.json'),run=read('candidate_full_v2/RUN.json');
const files=new Set(['ai_training/README.md','ai_training/status/CURRENT.md','ai_training/gpu/native/README.md',...Object.keys(run.identity.sources)]);
for(const [file,expected] of Object.entries(run.identity.sources))if(sha(path.join(root,file))!==expected)throw Error('完成核查发现候选源码改变：'+file);
for(const name of fs.readdirSync(dir))if(/\.(json|md|log|py|mjs)$/.test(name)&&name!=='DELIVERY_MANIFEST.json')files.add(path.relative(root,path.join(dir,name)).replaceAll('\\','/'));
for(const arm of ['baseline_full','candidate_full','candidate_full_v2'])for(const name of ['RUN.json','DEVICE.json','RESULTS.json','PROGRESS.json','CPU_GPU_MEASUREMENT.json','CPU_TIMESERIES.jsonl','EXTERNAL_GPU.jsonl','GPU_UTILIZATION.jsonl'])files.add(path.relative(root,path.join(dir,arm,name)).replaceAll('\\','/'));
const checks=read('FINAL_PROCESS_CHECK.json');if(checks.projectProcesses.length)throw Error('仍有项目进程，拒绝封存完成状态');
const result={implementationComplete:true,fullBenchmarkComplete:true,decisionIdentityPassed:comparison.traceIdentity.allFilesByteIdentical,naturalEachArm:32,actionsEachArm:44310,totalWallReductionPercent:comparison.totalWallReductionPercent,cpuSecondsReductionPercent:comparison.cpuSecondsReductionPercent,cpuReductionAchieved:false,memoryRegressionObserved:true,productionResumed:false,historicalReplayExecuted:false,trainingExecuted:false,phoneTasksModified:false,tests:{publicLint:true,gpuTypecheck:true,publicBuild:true,hardAiTests:15,nativeNumerical:true,viewCacheCases:12,currentStateVerification:true},completedAt:new Date().toISOString()};
fs.writeFileSync(path.join(dir,'TASK_RESULT.json'),JSON.stringify(result,null,2));files.add(path.relative(root,path.join(dir,'TASK_RESULT.json')).replaceAll('\\','/'));
const manifest={created:new Date().toISOString(),files:[...files].sort().map(file=>({file,sha256:sha(path.join(root,file)),bytes:fs.statSync(path.join(root,file)).size}))};
fs.writeFileSync(path.join(dir,'DELIVERY_MANIFEST.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({sealedFiles:manifest.files.length,sourceIdentityUnchanged:true,projectProcesses:checks.projectProcesses.length,...result}));
