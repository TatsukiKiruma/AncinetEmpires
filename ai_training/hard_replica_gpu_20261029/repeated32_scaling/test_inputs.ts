/** 验证副本只改变基准编号，实际输入、初态与随机种子不变。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {repeatBenchmarkJobs} from '../../gpu/parallel/repeated_jobs';
import {readJobs,createJobState,hash} from '../../gpu/hard_jobs';
const original=readJobs(),initial=original.slice(0,32).map(j=>hash(createJobState(j)));
let checked=0;
for(const n of [32,64,128]){
    const jobs=repeatBenchmarkJobs(original,32,n);assert.equal(new Set(jobs.map(j=>j.executionSequence)).size,n);
    for(let i=0;i<n;i++){
        const {benchmarkSourceSequence,benchmarkReplica,...job}=jobs[i];
        assert.equal(benchmarkSourceSequence,original[i%32].executionSequence);assert.equal(benchmarkReplica,Math.floor(i/32)+1);
        assert.deepEqual({...job,executionSequence:benchmarkSourceSequence},original[i%32]);
        assert.equal(hash(createJobState(job)),initial[i%32]);checked++;
    }
}
assert.throws(()=>repeatBenchmarkJobs(original,32,65));assert.throws(()=>repeatBenchmarkJobs(original,0,32));
fs.writeFileSync('hard_replica_gpu_20261029/repeated32_scaling/INPUT_TEST.json',JSON.stringify({passed:true,checked,seedAndInitialStatePreserved:true},null,2));
console.log({passed:true,checked});
