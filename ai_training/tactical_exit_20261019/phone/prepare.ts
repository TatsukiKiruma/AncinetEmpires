import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { decisionFixture } from './runtime';
import { sha as browserSha } from './browser_io';
import { GameEngine } from '../../../src/game/engine';
import { evaluateValue } from '../value_state';
import { optimizationPlugin } from './encoding_optimization';
import { performancePlugin } from './performance_optimization';
import { borrowedPlugin } from './borrowed_optimization';
import { cowPlugin } from './cow_optimization';
import { movementPlugin } from './movement_optimization';
import { parallelPlugin } from './parallel_optimization';
import { kernelPlugin } from './kernel_optimization';

const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(here,'../..');
const target=path.resolve(process.argv[2]);assert.ok(target.startsWith(here+path.sep));
fs.mkdirSync(target,{recursive:true});
const read=(name:string)=>JSON.parse(fs.readFileSync(path.resolve(here,name),'utf8').replace(/^\uFEFF/,''));
const digest=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
const hashTests=['','abc','中文与手机😀','x'.repeat(55),'x'.repeat(56),'x'.repeat(64),'x'.repeat(1000)];
for(let i=0;i<100;i++)hashTests.push(Array.from({length:i*7},(_,j)=>String.fromCharCode((i*103+j*79)%65536)).join(''));
for(const text of hashTests)assert.equal(browserSha(text),digest(text));
const protocol=read('ACTIVE_DEVICE_PROTOCOL.json'),plan=read('teacher-phone-plan-v1.json');
assert.equal(protocol.phoneConcurrency,1);assert.equal(protocol.allowPcBattleExecution,false);assert.equal(plan.slots.length,120);
const modelFiles:Record<string,string>={hierarchical:'../tactical_scale_20261018/group-best.json',pure:'../tactical_value_search_20261018/model-final.json',teacher_search:'teacher-model.json'};
const models=Object.fromEntries(Object.entries(modelFiles).map(([arm,file])=>[arm,read(file)]));
for(const model of [...Object.values(models),read('base-policy-final.json')] as any[])for(const weights of [model.weights,model.valueWeights])if(weights)assert.ok(weights.every(Number.isFinite),'冻结模型存在非有限权重');
const old=read('old-schema.json'),states=read('browser-states.json').map((v:any)=>v.state),fixtures=[];
for(const [i,state] of states.entries())for(const arm of Object.keys(models))fixtures.push({id:`${i}-${arm}`,state,arm,expected:decisionFixture(state,models[arm],old,arm)});
const valueStates=states.map((state:any)=>({state,expected:evaluateValue(new GameEngine(state),models.teacher_search,old)}));
const config={plan,protocol,models,old,fixtures,valueStates,rootStates:[...states,read('teacher-r16-root-coverage-gate.json').state],
    maps:plan.maps.map((item:any)=>{const state=read(item.path);assert.equal(digest(JSON.stringify(state)),item.sha256);return state;}),hashTests:hashTests.map(text=>({text,sha256:digest(text)}))};
const io=path.join(here,'phone/browser_io.ts');
const optimize=process.argv.includes('--optimize-observation');
const parallel=process.argv.includes('--workers');
if(parallel)assert.ok(process.argv.includes('--borrowed')&&process.argv.includes('--cow'));
const plugins=(destination:string,parallelMain=false)=>[
    ...(process.argv.includes('--zero-kernels')?[kernelPlugin(destination)]:[]),
    ...(parallelMain?[parallelPlugin(repo,destination)]:[]),
    ...(process.argv.includes('--stable-movement')?[movementPlugin(repo,destination)]:[]),
    ...(optimize?[optimizationPlugin(repo,destination,process.argv.includes('--advanced-cow'))]:[]),
    ...(process.argv.includes('--optimize-perf-v5')?[performancePlugin(repo,destination)]:process.argv.includes('--token-identity')?[performancePlugin(repo,destination,false)]:[]),
    ...(process.argv.includes('--borrowed')?[borrowedPlugin(repo,destination,false,parallelMain)]:[]),
    ...(process.argv.includes('--cow')?[cowPlugin(repo,destination,process.argv.includes('--advanced-cow'),process.argv.includes('--readonly-legal'))]:[]),
    {name:'浏览器身份工具',setup(builder:any){builder.onResolve({filter:/\/(io|sources)$/},(args:any)=>{
        const file=path.resolve(args.resolveDir,args.path+'.ts');
        if(file===path.join(here,'../tactical_scale_20261018/sources.ts'))return {path:path.join(here,'../tactical_value_search_20261018/action_groups.ts')};
        if(file===path.join(here,'io.ts')||file===path.join(here,'../tactical_scale_20261018/io.ts'))return {path:io};
        return undefined;
    });}}];
const built=await build({entryPoints:[path.join(here,process.argv.includes('--diagnostic')?'phone/probe_entry.ts':'phone/runtime.ts')],outfile:path.join(target,'runtime.js'),bundle:true,platform:'browser',format:'iife',globalName:'Stage5Phone',target:'chrome87',metafile:true,plugins:plugins(target,parallel)});
let workerBuilt;
if(parallel){
    const snapshots=path.join(target,'worker-snapshots');fs.mkdirSync(snapshots);
    workerBuilt=await build({entryPoints:[path.join(here,'phone/parallel_worker.ts')],outfile:path.join(target,'runtime-worker.js'),bundle:true,platform:'browser',format:'iife',target:'chrome87',metafile:true,plugins:plugins(snapshots)});
}
const sourceFiles=Object.fromEntries([...new Set([...Object.keys(built.metafile!.inputs),...Object.keys(workerBuilt?.metafile?.inputs??{})])].map(file=>[path.relative(repo,path.resolve(file)).split(path.sep).join('/'),digest(fs.readFileSync(file))]));
fs.writeFileSync(path.join(target,'config.json'),JSON.stringify(config),{flag:'wx'});
const manifest={preparedAt:new Date().toISOString(),bundleSha256:digest(fs.readFileSync(path.join(target,'runtime.js'))),configSha256:digest(fs.readFileSync(path.join(target,'config.json'))),sourceFiles,
    models:Object.fromEntries(Object.entries(modelFiles).map(([arm,file])=>[arm,{path:file,sha256:digest(fs.readFileSync(path.resolve(here,file)))}])),planSha256:digest(fs.readFileSync(path.join(here,'teacher-phone-plan-v1.json'))),
    hashParityTests:hashTests.length,decisionFixtures:fixtures.length,rootProbeStates:24,rootProbeMeasuredCalls:48,gamesStartedOnPc:0,phoneGatePassed:false,
    buildFlags:process.argv.slice(3),transformerSources:Object.fromEntries(fs.readdirSync(path.join(here,'phone')).filter(name=>name.endsWith('_optimization.ts')).map(name=>[name,digest(fs.readFileSync(path.join(here,'phone',name)))])),workerBundleSha256:parallel?digest(fs.readFileSync(path.join(target,'runtime-worker.js'))):undefined,workerProtocolSha256:parallel?digest(fs.readFileSync(path.join(here,'revisions/xiaomi_20261020/WORKER_RUNTIME_PROTOCOL.json'))):undefined,
    transformedSources:Object.fromEntries(fs.readdirSync(target,{recursive:true}).map(String).filter(name=>name.endsWith('.snapshot')).map(name=>[name,digest(fs.readFileSync(path.join(target,name)))])),
    observationOptimization:optimize,cowSnapshots:process.argv.includes('--cow'),cowSourceSha256:digest(fs.readFileSync(path.join(here,'phone/cow_optimization.ts'))),borrowedSnapshots:process.argv.includes('--borrowed'),borrowedSourceSha256:digest(fs.readFileSync(path.join(here,'phone/borrowed_engine.ts'))),performanceV5:process.argv.includes('--optimize-perf-v5'),performanceSourceSha256:digest(fs.readFileSync(path.join(here,'phone/performance_optimization.ts'))),preparerSha256:digest(fs.readFileSync(new URL(import.meta.url))),optimizationSourceSha256:digest(fs.readFileSync(path.join(here,'phone/encoding_optimization.ts'))),movementSourceSha256:digest(fs.readFileSync(path.join(here,'phone/movement_optimization.ts')))};
fs.writeFileSync(path.join(target,'ASSETS.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify({prepared:true,path:target,hashParityTests:hashTests.length,decisionFixtures:fixtures.length,dependencies:Object.keys(sourceFiles).length}));
