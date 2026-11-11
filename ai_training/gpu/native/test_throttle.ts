/** 复现极小正延迟的定时器钳制，并验证恢复零延迟及打包边界。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../hard_jobs';
import {nextGpuThrottleDelay} from './throttle';
import {BatchClient} from '../parallel/client';
const timer=setTimeout(()=>{},1e-77);assert.equal((timer as any)._idleTimeout,1);clearTimeout(timer);
assert.equal(nextGpuThrottleDelay(.1,2),0);assert.equal(nextGpuThrottleDelay(1e-77,2),0);assert.equal(nextGpuThrottleDelay(0,51),.1);assert.equal(nextGpuThrottleDelay(1,Number.NaN),1);
let delay=0;for(let i=0;i<100;i++){delay=nextGpuThrottleDelay(delay,80);assert(delay<=50);}for(let i=0;i<20;i++)delay=nextGpuThrottleDelay(delay,0);assert.equal(delay,0);
const valid={positions:[[1,2]],enemyPositions:[],allyPositions:[],landingPositions:[],landingCount:1,defenses:[10],unitValue:20,maxRange:1,situation:null},pack=(input:any)=>(BatchClient.prototype as any).packScore(input);
assert.equal(pack(valid).length,11);assert.throws(()=>pack({...valid,defenses:[]}));assert.throws(()=>pack({...valid,positions:[[1,2,3]]}));
const result={passed:true,clampedTinyDelayMs:1,resetDelayMs:0,highSamples:100,recoverySamples:20,malformedScoreInputsRejected:2};fs.writeFileSync(path.join(ROOT,'ai_training/hard_replica_gpu_20261029/native_hotspots_v3/THROTTLE_TEST.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
