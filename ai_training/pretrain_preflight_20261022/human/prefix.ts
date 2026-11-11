import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { ENGINE_OPTIONS, controller, digest, privateIdentity, ruleStateHash, stepStrict, strictExpand } from '../../data_acceptance_20261016/replay/core';
import { stateHash } from '../../dual_stream_v2_phase1_20261020/io';
import { save, sha } from './io';
import { parse } from './validation';

export function verifyPrefix(parsed: Awaited<ReturnType<typeof parse>>, rows: any[], excluded: ReadonlySet<string>) {
  const [header, ...rest] = rows, end = rest.pop();
  assert.equal(header.kind, 'prefix'); assert.equal(end.kind, 'end');
  assert.equal(header.responseSha256, parsed.sha256);
  assert.equal(header.rawActionIdentity, digest(parsed.actions));
  // JSON会省略undefined键；沿用规范摘要语义，同时保留全部实值字段和数组顺序。
  assert.equal(digest(header.initialState), digest(parsed.initialState)); assert.deepEqual(header.engineOptions, ENGINE_OPTIONS);
  assert.equal(header.wholeReplayAccepted, false);
  assert.equal(header.valueMask, false); assert.equal(header.returnMask, false);
  const engine = new GameEngine(parsed.initialState, ENGINE_OPTIONS);
  let state = engine.getState(), atomic = 0, macro = -1, subAction = 0, expanded: ReturnType<typeof strictExpand> = [];
  const identity = privateIdentity(parsed.gameObjectBytes);
  let policy = 0, humanPolicy = 0;
  for (const row of rest) {
    if (row.macro !== macro) {
      if (macro >= 0) assert.equal(subAction, expanded.length);
      for (let skipped = macro + 1; skipped < row.macro; skipped++) assert.equal(strictExpand(parsed.actions, skipped, state).length, 0);
      assert.ok(row.macro > macro);
      macro = row.macro; expanded = strictExpand(parsed.actions, macro, state); subAction = 0;
    }
    assert.equal(row.kind, 'atomic'); assert.equal(row.atomic, atomic++);
    assert.equal(row.macroRecordHash, digest(parsed.actions[macro]));
    assert.equal(row.macroAtomicCount, expanded.length);
    assert.equal(row.subAction, subAction++);
    assert.equal(row.beforeHash, ruleStateHash(state));
    assert.equal(row.sourceStateHash, stateHash(state));
    const action = expanded[row.subAction];
    assert.equal(digest(row.action), digest(action));
    assert.deepEqual(row.controller, controller(state, identity, parsed.config.playerTypes));
    const legal = engine.getLegalActions(state.currentPlayer);
    const eligible = !['end_turn', 'surrender'].includes(action.type)
      && legal.some(candidate => !['end_turn', 'surrender'].includes(candidate.type))
      && !excluded.has(stateHash(state)) && !excluded.has(ruleStateHash(state));
    assert.equal(row.prefixPolicyEligible, eligible);
    assert.equal(row.valueMask, false); assert.equal(row.returnMask, false); assert.equal(row.nativeOutcomeVerified, false);
    const strict = stepStrict(engine, state, action); state = strict.result.state;
    assert.equal(row.actionCode, strict.actionCode); assert.equal(row.candidateIndex, strict.candidateIndex);
    assert.equal(row.candidateCount, strict.candidateCount); assert.equal(row.candidateHash, strict.candidateHash);
    assert.equal(row.afterHash, ruleStateHash(state));
    if (eligible) { policy++; if (row.controller.type === 1) humanPolicy++; }
  }
  assert.equal(end.atomicActions, atomic); assert.equal(end.finalStateHash, ruleStateHash(state));
  assert.equal(end.eligiblePolicyActions, policy); assert.equal(end.eligibleHumanPolicyActions, humanPolicy);
  assert.equal(end.valueMask, false); assert.equal(end.returnMask, false);
  return { passed: true, atomicActions: atomic, eligiblePolicyActions: policy, eligibleHumanPolicyActions: humanPolicy,
    finalStateHash: ruleStateHash(state), mappingReexpandedFromRaw: true, orderedCandidateVerified: true, stateChainVerified: true,
    nativeStateCompared: false, valueMask: false, returnMask: false };
}

export async function sealPrefix(file: string, parsed: Awaited<ReturnType<typeof parse>>, atoms: any[], failure: any, excluded: ReadonlySet<string>) {
  const eligiblePolicyActions = atoms.filter(row => row.prefixPolicyEligible).length;
  const eligibleHumanPolicyActions = atoms.filter(row => row.prefixPolicyEligible && row.controller.type === 1).length;
  const rows = [{ kind: 'prefix', schema: 'human_strict_prefix_candidate_v1', responseSha256: parsed.sha256,
    rawActionIdentity: digest(parsed.actions), initialState: parsed.initialState, engineOptions: ENGINE_OPTIONS,
    wholeReplayAccepted: false, valueMask: false, returnMask: false, nativeOutcomeVerified: false }, ...atoms,
  { kind: 'end', atomicActions: atoms.length, eligiblePolicyActions, eligibleHumanPolicyActions,
    finalStateHash: atoms.at(-1)?.afterHash ?? ruleStateHash(new GameEngine(parsed.initialState, ENGINE_OPTIONS).getState()),
    tailQuarantine: failure, valueMask: false, returnMask: false }];
  const compressed = gzipSync(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  // 压缩证据只写本次独立attempt；随后从实存压缩字节重新读取并逐前态重建。
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, compressed, { flag: 'wx' });
  const actual = await readFile(file);
  const verification = verifyPrefix(parsed, gunzipSync(actual).toString().trim().split('\n').map(line => JSON.parse(line)), excluded);
  await save(file + '.verification.json', verification, true);
  return { path: file, sha256: sha(actual), bytes: actual.length, ...verification };
}
