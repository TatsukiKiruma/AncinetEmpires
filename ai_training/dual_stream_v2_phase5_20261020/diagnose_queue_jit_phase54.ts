import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { encodeAction } from '../../src/game/env';

const original = DualStreamTurnSearchAI.prototype.getAction;
let calls = 0;
// 仅诊断：标记慢调用位置，以便与V8优化/退优化日志对齐，不作为正式时延结果。
DualStreamTurnSearchAI.prototype.getAction = function(engine, player) {
    const index = calls++, start = performance.now();
    const action = original.call(this, engine, player);
    const ms = performance.now() - start;
    if (this.telemetry.queued && ms >= .25) console.log('队列慢调用 ' + JSON.stringify({ index, start, ms, code: encodeAction(action) }));
    return action;
};
await import('./diagnose_gc_phase54');
