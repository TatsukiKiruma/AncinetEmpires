/** 小于有效控制粒度的限流必须归零，避免浮点尾数持续触发至少1毫秒的定时器。 */
export function nextGpuThrottleDelay(delay:number,usage:number,target=50){
    if(!Number.isFinite(usage))return delay;
    if(usage>target)return Math.min(50,Math.max(.1,delay*1.4+.1));
    if(usage<target-5){const next=delay*.5;return next<.1?0:next;}
    return delay;
}
