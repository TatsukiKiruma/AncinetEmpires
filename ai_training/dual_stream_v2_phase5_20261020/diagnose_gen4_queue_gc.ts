import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PerformanceObserver } from 'node:perf_hooks';
import { DIR, read, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import type { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';

// 固定真实失败前态并注入已合法的单步队列；不把诊断复测算成正式门禁通过。
const plan = read('generations/gen_04/league-plan.json'), targetHash = '5dc3605fccdd586f7b30d11c726918cc8c70a7583f38ad2503edc6b7659ac4f0';
let engine: GameEngine | undefined, target: any, source: string | undefined;
for (const slot of plan.slots) {
    const directory = path.join(DIR, 'generations/gen_04/games', slot.id);
    if (!fs.existsSync(path.join(directory, 'result.json'))) continue;
    const candidate = new GameEngine(read(slot.initialPath));
    for await (const row of gzipRows(fs.readFileSync(path.join(directory, 'actions.jsonl.gz')))) {
        if (row.beforeHash === targetHash) { engine = candidate; target = row; source = slot.id; break; }
        const action = candidate.getLegalActions(candidate.getState().currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action); candidate.step(action);
    }
    if (engine) break;
}
assert.ok(engine && target && source);
const state = engine.getState(), player = state.currentPlayer;
assert.equal(stateHash(state), targetHash);
const action = engine.getLegalActions(player).find(a => encodeAction(a) === target.code); assert.ok(action);
const ai = new DualStreamTurnSearchAI({} as DualStreamModel), head = { state, action, expectedStateHash: '诊断仅走完整前态与权威合法性快返' };
const gc: any[] = [], times: any[] = [], overlap: any[] = [];
const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) gc.push({ start: entry.startTime, end: entry.startTime + entry.duration, duration: entry.duration, detail: (entry as any).detail }); });
observer.observe({ entryTypes: ['gc'] });
for (let i = 0; i < 10000; i++) {
    // 在调用前制造与根搜索类似的短命快照分配，耗时明确不属于本次队列测量。
    if (i % 5 === 0) for (let n = 0; n < 40; n++) engine.getState();
    ai.memory.queue[0] = head;
    const start = performance.now(); const selected = ai.getAction(engine, player); const end = performance.now();
    assert.equal(selected, action); if (i >= 100) times.push({ i, start, end, ms: end - start });
    if (i % 100 === 0) await new Promise(resolve => setImmediate(resolve));
}
await new Promise(resolve => setImmediate(resolve)); observer.disconnect();
for (const step of times) if (step.ms >= .5) overlap.push({ ...step, gc: gc.filter(entry => entry.start < step.end && entry.end > step.start) });
const sorted = times.map(s => s.ms).sort((a,b) => a-b);
const receipt = { source, targetHash, originalMs: target.ms, samples: sorted.length, p50: sorted[Math.floor(sorted.length*.5)], p95: sorted[Math.floor(sorted.length*.95)], max: sorted.at(-1), outliers: overlap, gc, executionArgs: process.execArgv, runtimeSha256: sha(fs.readFileSync(path.resolve(DIR,'../../src/ai_runtime/dual_v2/turn_search_ai.ts'))), scope: '带GC关联的真实前态诊断，不能替换正式失败收据' };
save(process.env.LEAGUE_QUEUE_DIAG_OUTPUT ?? 'phase53-audit/gen4-queue-gc-diagnosis.json', receipt);
console.log(JSON.stringify({ samples: receipt.samples, p95: receipt.p95, max: receipt.max, outliers: overlap, gcEvents: gc.length }));
