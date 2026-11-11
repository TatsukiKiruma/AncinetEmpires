import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PerformanceObserver } from 'node:perf_hooks';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { DIR, save, sha } from './common';

// 诊断专用：预分配时间数组，避免逐队列采样对象本身触发分配。
const starts = new Float64Array(100_000), ends = new Float64Array(100_000), queued = new Uint8Array(100_000);
let count = 0;
const events: { start: number; duration: number; kind: unknown }[] = [];
const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) events.push({ start: entry.startTime, duration: entry.duration, kind: (entry as any).detail?.kind });
});
observer.observe({ entryTypes: ['gc'] });
const original = DualStreamTurnSearchAI.prototype.getAction;
DualStreamTurnSearchAI.prototype.getAction = function(engine, player) {
    const index = count++;
    starts[index] = performance.now();
    try { return original.call(this, engine, player); }
    finally { ends[index] = performance.now(); queued[index] = Number(this.telemetry.queued); }
};
const target = path.join(DIR, process.env.LEAGUE_GC_TARGET === 'engineering' ? 'engineering_gen4_phase53.ts' : 'battle.ts');
process.argv[1] = target;
await import(pathToFileURL(target).href);
await new Promise(resolve => setImmediate(resolve));
observer.disconnect();
const slow = [];
for (let i = 0; i < count; i++) if (queued[i] && ends[i] - starts[i] >= .25) {
    slow.push({ index: i, start: starts[i], ms: ends[i] - starts[i], overlaps: events.filter(e => e.start < ends[i] && e.start + e.duration > starts[i]) });
}
const result = { calls: count, queueCalls: queued.subarray(0, count).reduce((sum, value) => sum + value, 0), timeOrigin: performance.timeOrigin, events, slow, actualRuntimeSha256: sha(fs.readFileSync(path.resolve(DIR, '../../src/ai_runtime/dual_v2/turn_search_ai.ts'))), executionArgs: process.execArgv, runtimeSource: fs.readFileSync(path.join(DIR, 'RUNTIME_REVISION.json'), 'utf8'), scope: '采样包含独立预热；仅用于GC与调用区间关联，正式时延仍以逐动作日志为准，不替代正式面板计时。timeOrigin支持跨进程GC与队列区间对齐' };
save(process.env.LEAGUE_GC_DIAGNOSTIC_OUTPUT ?? 'phase54-audit/gc-diagnostic.json', result);
console.log(JSON.stringify({ calls: count, slow, gcEvents: events.length }));
