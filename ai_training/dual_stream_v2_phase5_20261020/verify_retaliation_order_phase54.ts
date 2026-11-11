import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { retaliationFirst } from '../../src/ai_runtime/dual_v2/retaliation_order';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { DIR, read, save, sha } from './common';

const source = 'phase54-audit/v5-deep-r2/engineering60', output = 'phase54-audit/v5-deep-r3/retaliation-order-equivalence.json';
assert.ok(!fs.existsSync(path.join(DIR, output)), '不能覆盖等价验证');
const plan = read(`${source}/plan.json`), samples: any[] = [], types = new Set<string>();
let prefixActions = 0, oldMs = 0, newMs = 0;
for (const slot of plan.slots) {
    assert.ok(slot.trainSplit, '精确排序验证只读工程训练初态');
    const engine = new GameEngine(read(slot.initialPath));
    const rows = gunzipSync(fs.readFileSync(path.join(DIR, source, 'games', slot.id, 'actions.jsonl.gz'))).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    for (const row of rows) {
        if (row.i > 180) break;
        assert.equal(stateHash(engine.getState()), row.beforeHash);
        if ([0, 5, 15, 35, 46, 70, 120, 180].includes(row.i)) {
            const before = engine.getState(), legal = engine.getLegalActions(before.currentPlayer).filter(a => a.type !== 'surrender');
            legal.forEach(a => types.add(a.type));
            let started = performance.now();
            const old = tacticalActionPriors(before, legal).map((p, i) => ({ ...p, action: legal[i] })).filter(p => !p.forbidden).sort((a, b) => Number(b.immediate > 0) - Number(a.immediate > 0) || b.immediate - a.immediate || b.prior - a.prior)[0];
            const elapsedOld = performance.now() - started; oldMs += elapsedOld; started = performance.now();
            const chosen = retaliationFirst(engine), elapsedNew = performance.now() - started; newMs += elapsedNew;
            assert.equal(chosen && encodeAction(chosen.action), old && encodeAction(old.action), `${slot.id}:${row.i}`);
            assert.equal(chosen?.immediate, old?.immediate); assert.equal(chosen?.score, old?.prior);
            assert.deepEqual(engine.getState(), before);
            samples.push({ slot: slot.id, i: row.i, beforeHash: row.beforeHash, action: chosen && encodeAction(chosen.action), oldMs: elapsedOld, newMs: elapsedNew });
        }
        const actual = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code);
        assert.ok(actual, '前缀必须strict合法');
        assert.equal(stateHash(engine.step(actual).state), row.afterHash); prefixActions++;
    }
}
assert.ok(samples.length >= 350);
const runtime = Object.fromEntries(['retaliation_order','retaliation_paths','retaliation_combat','tactical_prior'].map(name => [`src/ai_runtime/dual_v2/${name}.ts`, sha(fs.readFileSync(path.join(DIR, `../../src/ai_runtime/dual_v2/${name}.ts`)))]));
save(output, { passed: true, scope: '工程60个训练初态的原strict前缀；新旧同状态首选、直接收益和完整prior逐项等价且不改变状态/RNG；诊断耗时不代替正式SLA', states: samples.length, initialStates: plan.slots.length, prefixActions, actionTypes: [...types], oldMs, newMs, runtime, samples });
console.log(JSON.stringify({ states: samples.length, prefixActions, oldMs, newMs }));
