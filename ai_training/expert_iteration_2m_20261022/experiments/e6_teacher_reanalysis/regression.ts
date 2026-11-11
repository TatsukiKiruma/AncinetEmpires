/** 105例重新编码对照旧冻结字节；另外核验环境mask、克隆和自然赢家视角。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../../src/game/engine';
import { AncientEmpiresEnv, encodeAction } from '../../../../src/game/env';
import { createDemoState } from '../../../../src/game/demo_map';
import { getAllianceId } from '../../../../src/game/rule_config';
import { encodeDualObservation } from '../../../../src/ai_runtime/dual_v2/encoder';
import { trainingValueTarget } from '../../../../src/ai_runtime/dual_v3/value_target';
import { ReachabilityContext } from '../../../../src/ai_runtime/dual_v2/reachability';
import { packTensorBatch } from '../../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { architectureFixtures } from '../../../dual_stream_v2_phase2_20261020/fixture_states';
import { HERE, R, read, writeNew, checkBudget } from './common';
import type { GameState } from '../../../../src/game/types';
checkBudget();
const real: GameState[] = JSON.parse(gunzipSync(fs.readFileSync(path.resolve(R, '../dual_stream_v2_phase2_20261020/real-states.json.gz'))).toString());
const late: { state: GameState }[] = read(path.resolve(R, '../dual_stream_v2_phase6_20261022/corpus/parity-states.json'));
const cases = [...real, ...late.map(r => r.state), ...architectureFixtures().map(r => r.state)];
const output = process.argv[2] ?? path.join(HERE, 'engineering/encoding-regression.json');
const old = fs.readFileSync(path.join(R, 'fixtures.frames')); let cursor = 0, count = 0, outcomes = 0, fixedMaskChecks = 0;
for (const initial of cases) {
    checkBudget();
    const engine = new GameEngine(initial, { applyInitialTurnStart: false }), state = engine.getState();
    if (engine.isTerminal()) continue;
    const legal = engine.getLegalActions(state.currentPlayer), context = new ReachabilityContext(state), obs = encodeDualObservation(state, legal, context);
    const target = new Float32Array(6); target[0] = 1;
    const pack = packTensorBatch([obs], [{ target: 0, policyMask: true, valueMask: false, valueTarget: target, weight: 1 }]);
    const ms = old.readUInt32LE(cursor), ps = old.readUInt32LE(cursor + 4); cursor += 8;
    cursor += ms; assert.deepEqual(pack.bytes, old.subarray(cursor, cursor + ps)); cursor += ps;
    assert.deepEqual(engine.clone().getState(), state);
    const mapped = Array.from(obs.actions.sourceIndices);
    // 公共因子化合同显式排除投降，其他权威合法动作必须一一保留。
    assert.equal(new Set(mapped).size, legal.filter(a => a.type !== 'surrender').length);
    assert.ok(mapped.every(i => i >= 0 && i < legal.length && legal[i].type !== 'surrender'));
    // 固定动作空间随棋盘面积平方增长，只在小棋盘核验该可选环境接口。
    // 全部105例仍逐字节核对权威编码、合法候选、指针及玩家有效槽。
    if (state.map.width * state.map.height <= 64 && state.units.length <= 16) {
        const env = new AncientEmpiresEnv({ initialState: state }), resetEngine = new GameEngine(state);
        assert.deepEqual(env.getState(), resetEngine.getState());
        assert.deepEqual(env.getLegalActions().map(encodeAction), resetEngine.getLegalActions(resetEngine.getState().currentPlayer).map(encodeAction));
        assert.ok(env.getActionMask().every(Boolean));
        assert.deepEqual(env.clone().getFixedActionMask(), env.getFixedActionMask()); fixedMaskChecks++;
    }
    for (const winner of [getAllianceId(state, state.currentPlayer), -1]) {
        const outcome = trainingValueTarget(state, obs.playerOrder, true, winner);
        assert.ok(outcome.valueMask); assert.ok(Math.abs(outcome.target.reduce((a, b) => a + b, 0) - 1) < 1e-6);
        outcome.target.forEach((p, slot) => { if (p > 0) assert.ok(obs.playerOrder.active[slot]); }); outcomes++;
    }
    assert.equal(trainingValueTarget(state, obs.playerOrder, false, null).valueMask, false); count++;
}
assert.equal(cursor, old.length); assert.equal(count, 105);
// 原105夹具最小为13x13，固定空间环境合同另用标准8x8演示状态核验。
const small = createDemoState(), smallEnv = new AncientEmpiresEnv({ initialState: small }), smallEngine = new GameEngine(small);
assert.deepEqual(smallEnv.getState(), smallEngine.getState());
assert.deepEqual(smallEnv.getLegalActions().map(encodeAction), smallEngine.getLegalActions(smallEngine.getState().currentPlayer).map(encodeAction));
assert.deepEqual(smallEnv.clone().getFixedActionMask(), smallEnv.getFixedActionMask());
assert.ok(smallEnv.getActionMask().every(Boolean)); fixedMaskChecks++;
assert.ok(fixedMaskChecks > 0);
writeNew(output, { passed: true, count, outcomeChecks: outcomes, legalMaskPointerCases: count, fixedMaskChecks, maskClone: true });
console.log(JSON.stringify({ passed: true, count, outcomes }));
