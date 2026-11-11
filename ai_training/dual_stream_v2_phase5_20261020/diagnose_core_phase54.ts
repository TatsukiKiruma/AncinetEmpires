import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { DIR, read, save, sha } from './common';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { loadParentValueModel } from './value_parent';

const base = 'phase54-audit/v5-deep-r2';
const outputBase = process.env.LEAGUE_PHASE54_ROOT ?? base;
assert.ok(fs.existsSync(path.join(DIR, base, 'gate-summary.json')), '正式面板与审计完成前不增加诊断负载');
const summary = read(`${base}/engineering60/audit-summary.json`);
const failure = summary.incomplete[0];
assert.ok(failure, '没有未完成核心链，不启动该诊断');
const started = read(`${failure.path}/started.json`), slot = started.slot;
assert.ok(slot.trainSplit, '性能调试只使用登记的工程训练初态');
const engine = new GameEngine(read(slot.initialPath));
const rows = gunzipSync(fs.readFileSync(path.join(DIR, failure.path, 'actions.jsonl.gz'))).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
for (const row of rows) {
    assert.equal(stateHash(engine.getState()), row.beforeHash);
    if (row.i === failure.i) break;
    const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code);
    assert.ok(action, '诊断前缀必须保持strict合法');
    const after = engine.step(action);
    assert.equal(stateHash(after.state), row.afterHash);
}
const plan = read(`${base}/engineering60/plan.json`), bytes = fs.readFileSync(path.join(DIR, plan.teacherModel + '.bin'));
assert.equal(sha(bytes), plan.teacherSha256);
const model = new DualStreamModel(read(plan.teacherModel + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const samples = [];
for (let repetition = 0; repetition < 3; repetition++) {
    const policy = new DualStreamTurnSearchAI(model, { ...plan.searchOptions, headBias: read(plan.teacherCalibration + '/head-calibration.json').headBias, valueCalibration: read(plan.teacherCalibration + '/value-config.json'), parentValueModel: loadParentValueModel(plan.teacherCalibration) });
    const timings: { method: string; ms: number; actor?: string; neural?: boolean; player?: number; units?: number }[] = [];
    const engineOperations = { clone: { calls: 0, ms: 0 }, step: { calls: 0, ms: 0 } };
    const prototype = GameEngine.prototype as any;
    const originalEngineMethods = { clone: prototype.clone, step: prototype.step };
    for (const method of ['clone', 'step'] as const) {
        prototype[method] = function(this: GameEngine, ...args: any[]) {
            const startedAt = performance.now();
            try { return originalEngineMethods[method].apply(this, args); }
            finally { engineOperations[method].calls++; engineOperations[method].ms += performance.now() - startedAt; }
        };
    }
    // 仅诊断实例记录各层包含耗时，额外采样开销不用于正式SLA或棋力结论。
    const instrumented = policy as any;
    for (const method of ['ranked', 'complete', 'retaliationRollout', ...(outputBase === base ? [] : ['retaliationFirst'])]) {
        const original = instrumented[method];
        instrumented[method] = function(this: any, ...args: any[]) {
            const startedAt = performance.now();
            try { return original.apply(this, args); }
            finally {
                const state = (method === 'ranked' || method === 'retaliationFirst' ? args[0] : args[0].engine).state;
                timings.push({ method, ms: performance.now() - startedAt, player: state.currentPlayer, units: state.units.length, actor: method === 'ranked' ? args[2] : undefined, neural: method === 'ranked' ? args[1] : undefined });
            }
        };
    }
    global.gc?.();
    const clone = engine.clone(), start = performance.now();
    let action: ReturnType<DualStreamTurnSearchAI['getAction']>;
    try { action = policy.getAction(clone, clone.getState().currentPlayer); }
    finally { Object.assign(prototype, originalEngineMethods); }
    const ms = performance.now() - start;
    samples.push({ repetition, ms, action: encodeAction(action), telemetry: policy.telemetry, timings, engineOperations });
}
const target = `${outputBase}/${process.env.LEAGUE_CORE_DIAGNOSTIC ?? 'core-diagnostic'}/profile.json`;
assert.ok(!fs.existsSync(path.join(DIR, target)), '不能覆盖既有诊断');
save(target, { scope: '独立三次热点诊断，含采样开销，不替代正式门禁；源码与工程训练前态均记录身份', sourceFailure: failure, beforeHash: stateHash(engine.getState()), modelSha256: sha(bytes), runtimeSha256: sha(fs.readFileSync(path.join(DIR, '../../src/ai_runtime/dual_v2/turn_search_ai.ts'))), samples });
console.log(JSON.stringify(samples.map(sample => ({ ms: sample.ms, retaliationComplete: sample.telemetry.retaliationComplete, attempts: sample.telemetry.retaliationAttempts }))));
