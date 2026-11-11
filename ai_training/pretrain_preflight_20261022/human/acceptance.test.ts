import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createDemoState } from '../../../src/game/demo_map';
import { GameEngine } from '../../../src/game/engine';
import { ENGINE_OPTIONS, digest, stepStrict } from '../../data_acceptance_20261016/replay/core';
import { historicalRelations, macroRelation, parentBinding, validResponseName, type Response, type Fingerprint } from './lineage';
import { ROOT, sha } from './io';
import { parse, strictReplay } from './validation';
import { verifyPrefix } from './prefix';

const fingerprint = (hashes: string[], initialStateHash = 'initial'): Fingerprint => ({ initialStateHash, macroHashes: hashes, rawActionIdentity: 'raw', fullContentIdentity: 'full' });
const response = (sha256: string, host: string, id: string): Response => ({ sha256, bytes: 1, paths: [], bindings: [parentBinding(host, id, 'report', 'metadata')] });

test('同host/API ID、跨host同ID及相同SHA分别排重，内嵌字段不参与证明', () => {
  const old = response('old-sha', 'A.Example', 'id');
  assert.equal(historicalRelations(response('new-sha', 'a.example', 'id'), [old]).sameHostApiParent.length, 1);
  assert.equal(historicalRelations(response('new-sha', 'b.example', 'id'), [old]).sameApiIdAcrossHosts.length, 1);
  assert.equal(historicalRelations(response('old-sha', 'b.example', 'other-id'), [old]).exactResponse.length, 1);
  assert.equal(historicalRelations(response('new-sha', 'a.example', 'other-id'), [old]).sameHostApiParent.length, 0);
});

test('同父局完整宏流、前缀、分叉及初态变化不会混为独立样本', () => {
  assert.equal(macroRelation(fingerprint(['a']), fingerprint(['a'])).relation, 'identical_macro_stream');
  assert.equal(macroRelation(fingerprint(['a']), fingerprint(['a', 'b'])).relation, 'left_prefix_of_right');
  assert.equal(macroRelation(fingerprint(['a', 'b']), fingerprint(['a'])).relation, 'right_prefix_of_left');
  assert.equal(macroRelation(fingerprint(['a', 'b']), fingerprint(['a', 'c'])).relation, 'divergent_macro_stream');
  assert.equal(macroRelation(fingerprint(['a']), fingerprint(['a'], 'other')).relation, 'different_initial_state');
});

test('下载文件名兼容旧ID摘要和新ID加内容摘要，但不接受不匹配内容', () => {
  assert.equal(validResponseName(`game_get_${sha('id').slice(0, 24)}.bin`, 'id', sha('body')), true);
  assert.equal(validResponseName(`game_get_${sha('id').slice(0, 24)}_${sha('body').slice(0, 24)}.bin`, 'id', sha('body')), true);
  assert.equal(validResponseName(`game_get_${sha('id').slice(0, 24)}_${sha('wrong').slice(0, 24)}.bin`, 'id', sha('body')), false);
});

test('终局后动作拒绝，不能由引擎静默忽略误增合格动作', () => {
  const state = createDemoState(); state.winner = 0;
  const engine = new GameEngine(state, ENGINE_OPTIONS);
  assert.throws(() => stepStrict(engine, engine.getState(), { type: 'end_turn' }), /终局后/);
});

test('历史真实SO响应完整strict重放、克隆和Value关闭回归', async () => {
  const parsed = await parse(path.join(ROOT, 'captures/mitm_replay/20260704_131004/game_get_20260704_132207_088.bin'));
  const result = strictReplay(parsed, new Set());
  assert.equal(result.success, true);
  assert.equal(result.fullyConsumed, true);
  assert.equal(result.forced, false);
  assert.ok(result.atomicActions > 0);
  assert.ok(result.eligiblePolicyActions <= result.policyActions);
  assert.equal(result.outcome.nativeOutcomeVerified, false);
  assert.equal(result.outcome.valueMask, false);
  assert.equal(result.outcome.returnMask, false);
  assert.equal(result.outcome.reliableNaturalTerminal, false);
  const atoms = result.atoms.slice(0, 6);
  const rows = [{ kind: 'prefix', responseSha256: parsed.sha256, rawActionIdentity: digest(parsed.actions), initialState: parsed.initialState,
    engineOptions: ENGINE_OPTIONS, wholeReplayAccepted: false, valueMask: false, returnMask: false }, ...atoms,
  { kind: 'end', atomicActions: atoms.length, eligiblePolicyActions: atoms.filter(row => row.prefixPolicyEligible).length,
    eligibleHumanPolicyActions: atoms.filter(row => row.prefixPolicyEligible && row.controller.type === 1).length,
    finalStateHash: atoms.at(-1)!.afterHash, valueMask: false, returnMask: false }];
  assert.equal(verifyPrefix(parsed, JSON.parse(JSON.stringify(rows)), new Set()).passed, true);
  const changedCandidate = structuredClone(rows); (changedCandidate[1] as any).candidateIndex++;
  assert.throws(() => verifyPrefix(parsed, changedCandidate, new Set()));
  const changedValue = structuredClone(rows); (changedValue[1] as any).valueMask = true;
  assert.throws(() => verifyPrefix(parsed, changedValue, new Set()));
});
