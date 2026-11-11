/** 仅供完整并发基准：重复同一组输入，保留父局、随机种子和初态。 */
export function repeatBenchmarkJobs(jobs:any[],baseCount:number,total:number){
    if(!Number.isInteger(baseCount)||baseCount<1||baseCount>jobs.length||!Number.isInteger(total)||total<baseCount||total%baseCount!==0)throw Error('重复基准局数必须是基础局数的整数倍');
    return Array.from({length:total},(_,index)=>({...jobs[index%baseCount],executionSequence:jobs[0].executionSequence+index,benchmarkSourceSequence:jobs[index%baseCount].executionSequence,benchmarkReplica:Math.floor(index/baseCount)+1}));
}
