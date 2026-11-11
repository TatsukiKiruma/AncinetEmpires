/** 多局采集与同并发对照入口；不训练、不重放，旧成功局只引用。 */
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {ROOT,JOBS,readJobs,fileSha,hash,preloadMapAssets} from '../hard_jobs';
import {GpuBroker} from './broker';
import type {NativeBroker} from '../native/broker';
import {loadSharedWorkerCode} from '../native/worker_bundle';
import {repeatBenchmarkJobs} from './repeated_jobs';
import {readCollectionInput} from './collection_input';
const args=process.argv.slice(2);
const arg=(key:string,fallback:string)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const workers=Number(arg('--workers','8')),backend=arg('--backend','gpu'),out=path.resolve(arg('--out',''));
const benchmark=args.includes('--benchmark'),verify=args.includes('--verify'),probe=args.includes('--probe');
const gpuRange=args.includes('--gpu-range');
const native=args.includes('--native');
const gpuDistance=args.includes('--gpu-distance'),compactRecords=args.includes('--compact-records'),distanceThreshold=Number(arg('--distance-threshold','32'));
const recordChunkBytes=Number(arg('--record-chunk-kib','128'))*1024;
if(!Number.isSafeInteger(recordChunkBytes)||recordChunkBytes<1024||recordChunkBytes>4*1024**2||args.includes('--record-chunk-kib')&&!compactRecords)throw Error('记录合并块需1—4096 KiB，且启用合并记录');
const sharedAssets=args.includes('--shared-assets');
const sharedWorkerCode=args.includes('--shared-worker-code');
if(sharedWorkerCode&&!native)throw Error('共享worker源码包仅用于已验证的原生模式');
if(gpuDistance&&!native||!Number.isInteger(distanceThreshold)||distanceThreshold<1||distanceThreshold>1024)throw Error('GPU距离场要求原生模式和1—1024阈值');
if(compactRecords&&!benchmark)throw Error('合并压缩目前只用于独立基准，不自动修改正式记录格式');
if(native&&(backend!=='gpu'||!gpuRange))throw Error('原生模式要求GPU评分及GPU移动搜索');
const singleBatch=args.includes('--single-batch');
const limit=Number(arg('--limit',benchmark?'42':'1000')),maxActions=args.includes('--max-actions')?Number(arg('--max-actions','0')):undefined;
const repeatFirst=Number(arg('--repeat-first','0'));
if(args.includes('--repeat-first')&&(!singleBatch||!benchmark||args.includes('--previous')||!Number.isInteger(repeatFirst)||repeatFirst<1||repeatFirst>limit||limit%repeatFirst!==0))throw Error('重复初态仅用于独立完整单批基准，局数须为基础局数整数倍');
if(!args.includes('--out')||!Number.isInteger(workers)||workers<1||workers>128||!['cpu','gpu'].includes(backend)||!Number.isInteger(limit)||limit<1||limit>1000||maxActions!==undefined&&(!Number.isInteger(maxActions)||maxActions<1))throw Error('参数无效：需独立--out；--workers 1—128，--backend cpu/gpu');
if(singleBatch&&(!benchmark||limit!==workers||maxActions!==undefined||probe))throw Error('单批完整测试要求benchmark、局数等于并发数，且不设动作截断或初态探测');
if(!benchmark&&(backend!=='gpu'||probe||maxActions))throw Error('正式采集要求GPU完整自然对局');
fs.mkdirSync(out,{recursive:true});
const save=(name:string,v:unknown)=>{const p=path.join(out,name);fs.writeFileSync(p+'.pending',JSON.stringify(v,null,2));for(let retry=0;;retry++){try{fs.renameSync(p+'.pending',p);break;}catch(e){if(retry>=20)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}};
const lock=path.join(out,'RUNNING.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});
const stop=new SharedArrayBuffer(4),pool:Worker[]=[],results=new Map<number,any>(),active=new Map<number,unknown>();
let broker:GpuBroker|NativeBroker|undefined,timer:ReturnType<typeof setInterval>|undefined;
const start=performance.now();let measuredStart=start,measurementStartedAt=Date.now(),maxActive=0,maxRssBytes=0;
try{
    const inputFile=args.includes('--jobs')?path.resolve(arg('--jobs','')):JOBS;
    if(args.includes('--jobs')&&(!benchmark||repeatFirst||args.includes('--previous')))throw Error('版本化补缺输入要求独立记录格式，禁止重复基准或旧版直接恢复');
    const collection=args.includes('--jobs')?readCollectionInput(inputFile):null;
    const originals=collection?.jobs??readJobs(),jobs=repeatFirst?repeatBenchmarkJobs(originals,repeatFirst,limit):originals.slice(0,limit),previous=arg('--previous','');
    if(jobs.length!==limit)throw Error('输入数量少于本批调度数量');
    const inherited=new Map<number,any>();let inheritedIdentity:unknown=null;
    if(previous){
        if(fs.existsSync(path.join(previous,'RUNNING.lock')))throw Error('旧采集仍持有运行锁');
        const run=JSON.parse(fs.readFileSync(path.join(previous,'RUN.json'),'utf8'));
        inheritedIdentity=run.identity;
        if(run.identity.jobsSha256!==fileSha(JOBS))throw Error('旧采集输入身份不同');
        for(const [name,sha] of Object.entries(run.identity.sources))if(fileSha(path.join(ROOT,name))!==sha)throw Error(`旧采集规则/源码身份改变：${name}`);
        for(const job of jobs){const f=path.join(previous,`parent-${job.executionSequence}/result.json`);if(fs.existsSync(f)){const r=JSON.parse(fs.readFileSync(f,'utf8'));inherited.set(job.executionSequence,r);if(r.natural)results.set(job.executionSequence,{...r,inheritedFrom:path.resolve(f),resultSha256:fileSha(f)});}}
    }
    if(!benchmark&&jobs.slice(0,42).some(j=>!results.get(j.executionSequence)?.natural))throw Error('正式并行采集需引用已通过的42局观察门禁');
    const sharedWorker=sharedWorkerCode?loadSharedWorkerCode():null;
    const sourceFiles=['src/game/ai/runtime/apk_hard_policy.generated.js','src/game/ai/runtime/apk_hard_compute.ts','tools/apk_hard_compute_transform.mjs','src/game/engine.ts','src/game/rules.ts','ai_training/gpu/hard_jobs.ts','ai_training/gpu/hard_score.hip',...fs.readdirSync(path.dirname(fileURLToPath(import.meta.url))).filter(n=>/\.(ts|mjs|py|hip)$/.test(n)).map(n=>'ai_training/gpu/parallel/'+n)];
    sourceFiles.push('tools/apk_hard_native_transform.mjs','tools/apk_hard_native_cache.mjs');
    if(native)sourceFiles.push(...fs.readdirSync(path.join(ROOT,'ai_training/gpu/native')).filter(n=>/\.(ts|mjs|cpp|hpp|cmd|hip)$/.test(n)).map(n=>'ai_training/gpu/native/'+n),'ai_training/gpu/native/build/kernel.hip','ai_training/gpu/native/build/hard_native.node');
    if(sharedWorker)sourceFiles.push(...Object.keys(sharedWorker.sources),'ai_training/gpu/native/build/worker.cjs','ai_training/gpu/native/build/worker.manifest.json');
    const identity={jobsSha256:fileSha(inputFile),inputFile,inheritedIdentity,sources:Object.fromEntries([...new Set(sourceFiles)].map(n=>[n,sharedWorker?.sources[n]??fileSha(path.join(ROOT,n))]))};
    const runFile=path.join(out,'RUN.json');
    if(fs.existsSync(runFile)){const prior=JSON.parse(fs.readFileSync(runFile,'utf8'));if(hash(prior.identity)!==hash(identity)||(prior.repeatFirst??0)!==repeatFirst||prior.backend!==backend||prior.benchmark!==benchmark||prior.maxActions!==maxActions||prior.probe!==probe||prior.verify!==verify||prior.gpuRange!==gpuRange||!!prior.singleBatch!==singleBatch||!!prior.native!==native||!!prior.gpuDistance!==gpuDistance||!!prior.compactRecords!==compactRecords||(prior.recordChunkBytes??128*1024)!==recordChunkBytes||!!prior.sharedAssets!==sharedAssets||!!prior.sharedWorkerCode!==sharedWorkerCode||(prior.distanceThreshold??32)!==distanceThreshold)throw Error('恢复身份变化，需新目录');}
    else save('RUN.json',{identity,workers,backend,benchmark,maxActions,probe,verify,gpuRange,native,gpuDistance,compactRecords,recordChunkBytes,distanceThreshold,sharedAssets,sharedWorkerCode,singleBatch,limit,repeatFirst,previous:previous?path.resolve(previous):null,source:`project-apk-hard-replica-${backend}`,nativeApkEquivalent:false,historicalReplay:false,training:false,created:new Date().toISOString()});
    if(repeatFirst)save('REPLICAS.json',jobs.map(j=>({executionSequence:j.executionSequence,sourceSequence:j.benchmarkSourceSequence,replica:j.benchmarkReplica,seed:j.seed,initialStateSha256:j.initialStateSha256,sourceJobSha256:hash(originals[j.benchmarkSourceSequence-originals[0].executionSequence])})));
    for(const job of jobs){const p=path.join(out,`parent-${job.executionSequence}/result.json`);if(fs.existsSync(p))results.set(job.executionSequence,JSON.parse(fs.readFileSync(p,'utf8')));}
    save('INHERITED.json',[...inherited.values()].map(r=>({sequence:r.executionSequence,attempt:r.attempt,natural:r.natural,previous})));
    const queue=jobs.filter(j=>{const r=results.get(j.executionSequence);return !r||['error','stopped'].includes(r.stop)&&r.attempt<3;});
    let completed=0,failed:Error|null=null;
    const summary=(phase:string)=>{maxRssBytes=Math.max(maxRssBytes,process.memoryUsage().rss);const rs=[...results.values()];save('PROGRESS.json',{phase,pid:process.pid,workers,backend,benchmark,natural:rs.filter(r=>r.natural).length,completedThisRun:completed,remaining:queue.length,active:[...active.values()],maxActive,maxRssBytes,measurementStartedAt,errors:rs.filter(r=>r.error).length,wallSeconds:(performance.now()-start)/1000,measuredSeconds:(performance.now()-measuredStart)/1000,gpu:broker?.stats,updated:new Date().toISOString()});};
    if(backend==='gpu'){const Broker=native?(await import('../native/broker')).NativeBroker:GpuBroker;broker=new Broker(Number(arg('--batch-wait-ms','0')),sample=>fs.appendFileSync(path.join(out,'GPU_UTILIZATION.jsonl'),JSON.stringify(sample)+'\n'));await broker.ready;save('DEVICE.json',broker.identity);}
    const ready:Promise<void>[]=[];
    if(sharedWorker)save('WORKER_CODE_IO.json',{bundleReadOperations:1,bundleReadBytes:sharedWorker.bytes,bundleSha256:sharedWorker.sha256,sourceValidationReads:Object.keys(sharedWorker.sources).length,workerSourceProvidedInMemory:true});
    const sharedMaps=sharedAssets?preloadMapAssets(jobs):null;if(sharedMaps)save('ASSET_IO.json',{mapFileReadOperations:sharedMaps.reads,mapFileReadBytes:sharedMaps.bytes,workersReadSharedMemory:true});
    for(let i=0;i<workers;i++){
        const memory=new SharedArrayBuffer(native?512*1024:16*1024*1024),w=new Worker(sharedWorker?.code??new URL('./worker.mjs',import.meta.url),{eval:!!sharedWorker,execArgv:sharedWorker?.execArgv,workerData:{memory,backend,stop,gpuRange,native,gpuDistance,distanceThreshold,compactRecords,recordChunkBytes,mapAssets:sharedMaps?.assets}});pool.push(w);
        ready.push(new Promise((resolve,reject)=>{w.once('error',reject);const onMessage=(m:any)=>{if(m.type==='ready'){w.off('message',onMessage);resolve();}};w.on('message',onMessage);}));
        w.on('message',m=>{if(m.type==='score')broker!.enqueue({data:m.data,memory});});
    }
    await Promise.all(ready);measuredStart=performance.now();measurementStartedAt=Date.now();
    await new Promise<void>((resolve,reject)=>{
        let busy=0;const dispatchedWorkers=new Set<number>();
        const finish=()=>{if(!busy)resolve();};
        const dispatch=(w:Worker,i:number)=>{
            if(failed||Atomics.load(new Int32Array(stop),0)||!queue.length||singleBatch&&dispatchedWorkers.has(i)){finish();return;}
            dispatchedWorkers.add(i);
            const job=queue.shift()!,seq=job.executionSequence,parent=path.join(out,`parent-${seq}`);fs.mkdirSync(parent,{recursive:true});
            const existing=fs.readdirSync(parent).filter(n=>/^attempt-\d+$/.test(n)).map(n=>Number(n.slice(8)));
            const attempt=Math.max(collection?.attemptOffsets[seq]??0,...existing,inherited.get(seq)?.attempt??0)+1;
            if(attempt>3){failed=Error(`父局${seq}已达到三次实际启动`);finish();return;}
            const directory=path.join(parent,`attempt-${attempt}`);fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'job.json'),JSON.stringify(job));
            busy++;maxActive=Math.max(maxActive,busy);active.set(i,{sequence:seq,attempt,steps:0});
            w.postMessage({job,directory:probe?null:directory,attempt,maxActions,verify,probe});
        };
        pool.forEach((w,i)=>{
            w.on('error',reject);
            w.on('exit',code=>{if(code&&active.has(i))reject(Error(`工作线程${i}异常退出${code}`));});
            w.on('message',m=>{
                try {
                if(m.type==='progress'){active.set(i,m);return;}
                if(m.type!=='result')return;
                busy--;active.delete(i);completed++;const r=m.result;
                results.set(r.executionSequence,r);save(`parent-${r.executionSequence}/result.json`,r);
                if(r.error){failed=Error(r.error);Atomics.store(new Int32Array(stop),0,1);}
                summary('collecting');dispatch(w,i);
                }catch(e){reject(e);}
            });
        });
        timer=setInterval(()=>{try{const disk=fs.statfsSync(out);if(fs.existsSync(path.join(out,'STOP'))||disk.bavail*disk.bsize<2*1024**3||broker?.failure){Atomics.store(new Int32Array(stop),0,1);if(broker?.failure)failed=broker.failure;}summary('collecting');}catch(e){reject(e);}},1000);
        pool.forEach(dispatch);if(!busy)resolve();
    });
    summary(failed?'error':Atomics.load(new Int32Array(stop),0)?'stopped':'complete');
    save('RESULTS.json',[...results.values()]);if(failed)throw failed;
}finally{if(timer)clearInterval(timer);Atomics.store(new Int32Array(stop),0,1);await Promise.all(pool.map(w=>w.terminate()));await broker?.close();fs.unlinkSync(lock);}
