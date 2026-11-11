/** 固定槽位共享队列；STOP只阻止新派发，已派发任务排空。 */
export interface DispatchEvent { index: number; lane: number; active: number; pending: number; at: number }
export interface DispatchHooks {
    shouldDispatch?: () => boolean;
    onStart?: (event: DispatchEvent) => void;
    onFinish?: (event: DispatchEvent) => void;
}
export async function dispatchQueue<T, R>(tasks: readonly T[], slots: number,
    execute: (task: T, index: number, lane: number) => Promise<R>,
    onResult?: (result: R, index: number) => void, hooks: DispatchHooks = {}) {
    let next = 0, active = 0, failure: unknown, stopped = false;
    const results: R[] = Array(tasks.length);
    const lanes = Array.from({length: slots}, (_, lane) => (async () => {
        while (next < tasks.length && !failure && !stopped) {
            try {
                if (hooks.shouldDispatch && !hooks.shouldDispatch()) { stopped = true; break; }
                const index = next++; active++;
                try {
                    hooks.onStart?.({index,lane,active,pending:tasks.length-next,at:Date.now()});
                    results[index] = await execute(tasks[index], index, lane);
                    onResult?.(results[index], index);
                } finally {
                    active--;
                    hooks.onFinish?.({index,lane,active,pending:tasks.length-next,at:Date.now()});
                }
            } catch (error) { failure = error; }
        }
    })());
    await Promise.all(lanes);
    if (failure) throw failure;
    return {results, stopped, dispatched:next};
}

export type ScheduledJob = {block:number; index:number; transportJobId:number; job:any};
/** 编号先按原计划确定；排序字段绝不进入worker的job身份。 */
export function orderedJobs(plans: any[][]): ScheduledJob[] {
    return plans.flatMap((jobs,block)=>jobs.map((job,index)=>({block,index,transportJobId:block*20+index+1,job})))
        .sort((a,b)=>b.job.players-a.job.players || a.block-b.block || a.index-b.index);
}
