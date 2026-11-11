/** 有界缓存、合并记录完整性和共享地图身份；不执行对局回放。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {ByteCache} from '../parallel/byte_cache';
import {DecisionRecordWriter} from '../parallel/record_writer';
import {ROOT,readJobs,preloadMapAssets,createJobState,createJobStateWithAssets,hash} from '../hard_jobs';
const directory=path.join(ROOT,'ai_training/hard_replica_gpu_20261029/native_hotspots_v3/verify_io_writer_final');fs.mkdirSync(directory,{recursive:true});
const cache=new ByteCache<Uint8Array>(1024);for(let i=0;i<100;i++){cache.set(String(i),new Uint8Array(128),128);assert(cache.bytes<=1024);}assert(cache.evictions>0);assert.equal(cache.get('0'),undefined);cache.set('oversized',new Uint8Array(4096),4096);assert.equal(cache.get('oversized'),undefined);cache.clear();assert.equal(cache.bytes,0);
const records=Array.from({length:200},(_,step)=>JSON.stringify({step,text:'测试单位与地图状态'.repeat(200),state:Array(64).fill({row:2,col:3,team:'蓝队'})})+'\n');records.push(JSON.stringify({large:'独立大记录'.repeat(50000)})+'\n');
const oldFile=path.join(directory,'single.jsonl.gz'),newFile=path.join(directory,'compact.jsonl.gz');
if(fs.existsSync(oldFile)||fs.existsSync(newFile))throw Error('测试目录已存在记录，拒绝覆盖');
const single=new DecisionRecordWriter(oldFile),compact=new DecisionRecordWriter(newFile,128*1024);for(const line of records){single.append(line);compact.append(line);}single.close();compact.close();compact.close();assert.equal(single.fileOpens,1);assert.equal(compact.fileOpens,1);assert.throws(()=>compact.append('关闭后禁止写入'));
assert.equal(gunzipSync(fs.readFileSync(oldFile)).toString(),records.join(''));assert.equal(gunzipSync(fs.readFileSync(newFile)).toString(),records.join(''));assert(compact.members<single.members);assert(compact.compressedBytes<single.compressedBytes);
const jobs=readJobs().slice(0,32),shared=preloadMapAssets(jobs);assert.equal(shared.reads,new Set(jobs.map(j=>j.map)).size);for(const job of jobs)assert.equal(hash(createJobStateWithAssets(job,shared.assets)),hash(createJobState(job)));
const bytes=new Uint8Array(shared.assets[jobs[0].map]);bytes[0]^=1;try{assert.throws(()=>createJobStateWithAssets(jobs[0],shared.assets),/摘要不符/);}finally{bytes[0]^=1;}
const result={passed:true,cacheBound:1024,records:records.length,single:single.summary(),compact:compact.summary(),sharedMapReads:shared.reads,sharedMapBytes:shared.bytes,initialStatesMatched:32,tamperRejected:true};fs.writeFileSync(path.join(directory,'../IO_CACHE_TEST.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
