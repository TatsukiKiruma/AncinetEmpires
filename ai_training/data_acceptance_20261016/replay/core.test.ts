import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../../../src/game/demo_map';
import { GameEngine } from '../../../src/game/engine';
import { createApkReplayRecord, validateApkReplay } from '../../../src/game/apk_replay';
import { parseRemoteReplay } from '../../../tools/apk_game_get_validate';
import { SCHEMA, ENGINE_OPTIONS, digest, ruleStateHash, strictExpand, stepStrict, stepLabels, controller, privateIdentity } from './core';
import { verifyRows } from './verify';
import { GzipLines, OUT } from './io';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

test('终局后的动作必须拒绝，不能误把Game already ended计为成功', () => {
  const state = createDemoState(); state.winner = 0;
  const engine = new GameEngine(state, ENGINE_OPTIONS);
  assert.throws(() => stepStrict(engine, engine.getState(), { type: 'end_turn' }), /终局后/);
});
test('占领被替换为待机的事件必须阻断，不可强行收录', () => {
  const state = createDemoState(), actor = state.units[0];
  state.map.tiles[actor.pos.y][actor.pos.x].ownerId = actor.ownerId;
  const record = createApkReplayRecord({ eventType: 'OCCUPY', source: actor.pos, moveTo: actor.pos });
  assert.throws(() => strictExpand([record], 0, state), /拒绝回放信息损失/);
});
test('规则态哈希覆盖pending与储备字段，但不受元数据路径影响', () => {
  const state = createDemoState(), same = structuredClone(state);
  same.metadata = { source: 'custom' } as any;
  assert.equal(ruleStateHash(state), ruleStateHash(same));
  same.pendingUnitId = 'pending'; assert.notEqual(ruleStateHash(state), ruleStateHash(same));
});
test('克隆不重复结算初次收益，原生结果未知时value及return永不开放', () => {
  const engine = new GameEngine(createDemoState(), ENGINE_OPTIONS);
  assert.equal(ruleStateHash(engine.getState()), ruleStateHash(engine.clone().getState()));
  assert.deepEqual(stepLabels({ type: 'surrender' }), { policyMask: false, valueMask: false, returnMask: false, nativeOutcomeVerified: false });
  assert.equal(stepLabels({ type: 'end_turn' }).valueMask, false);
});
test('gzip流写完成后可完整恢复；压缩输出超预算会拒绝而非继续占盘', async () => {
  await mkdir(path.join(OUT, 'test-artifacts'), { recursive: true });
  const dir = await mkdtemp(path.join(OUT, 'test-artifacts', 'gzip-'));
  const file = path.join(dir, 'valid.jsonl.gz'), writer = new GzipLines(file, 1024);
  await writer.line({ a: 1 }); await writer.line({ a: 2 }); await writer.close();
  assert.equal(gunzipSync(await readFile(file)).toString(), '{"a":1}\n{"a":2}\n');
  const tiny = new GzipLines(path.join(dir, 'budget-rejected.jsonl.gz'), 1);
  await tiny.line({ payload: '超过预算' });
  await assert.rejects(tiny.close(), /256MiB预算/);
});
test('真实SO159条：流式严格链与权威validateApkReplay终态相同，篡改候选索引被拒绝', async () => {
  const parsed = await parseRemoteReplay('captures/mitm_replay/20260704_131004/game_get_20260704_132207_088.bin', {
    inputs: [], rootDir: '', outPath: null, json: false, mode: 'SO', maxRecords: 100000, offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null,
    dedupe: true, allowAmbiguousRecruit: false, strictTerrain: true, forceExecuteReplayActions: false });
  const identity = privateIdentity(parsed.gameObjectBytes), engine = new GameEngine(parsed.initialState, ENGINE_OPTIONS);
  let state = engine.getState(), atomic = 0, policyRows = 0;
  const rows: any[] = [{ kind: 'game', schema: SCHEMA, initialState: parsed.initialState, engineOptions: ENGINE_OPTIONS,
    effectiveInitialStateHash: ruleStateHash(state), identity, playerTypes: parsed.config.playerTypes, records: parsed.actions.length, rawActionIdentity: digest(parsed.actions) }];
  for (let macro = 0; macro < parsed.actions.length; macro++) {
    const actions = strictExpand(parsed.actions, macro, state);
    rows.push({ kind: 'macro', macro, record: parsed.actions[macro], atomicCount: actions.length, beforeHash: ruleStateHash(state) });
    for (let subAction = 0; subAction < actions.length; subAction++) {
      const action = actions[subAction], before = state, exact = stepStrict(engine, before, action); state = exact.result.state;
      const labels = stepLabels(action); if (labels.policyMask) policyRows++;
      rows.push({ kind: 'atomic', atomic: atomic++, macro, subAction, action, actionCode: exact.actionCode,
        candidateIndex: exact.candidateIndex, candidateCount: exact.candidateCount, candidateHash: exact.candidateHash,
        beforeHash: ruleStateHash(before), afterHash: ruleStateHash(state), currentPlayerBefore: before.currentPlayer, turnBefore: before.turn,
        currentPlayerAfter: state.currentPlayer, turnAfter: state.turn, controller: controller(before, identity, parsed.config.playerTypes), labels });
    }
  }
  rows.push({ kind: 'end', accepted: true, fullyConsumed: true, completedMacros: parsed.actions.length, atomicActions: atomic, policyRows,
    finalStateHash: ruleStateHash(state), outcome: { projectWinner: state.winner, valueMask: false, returnMask: false, nativeOutcomeVerified: false }, evidence: { terminalIgnored: 0, forced: false } });
  const original = validateApkReplay(parsed.initialState, parsed.actions, { rejectInformationLoss: true, forceExecuteReplayActions: false,
    expansionOptions: { allowAmbiguousRecruitDeployFirstMatch: false } });
  assert.equal(original.success, true); assert.equal(original.expandedActionCount, atomic);
  assert.equal(ruleStateHash(original.finalState), ruleStateHash(state));
  const iterable = async function* (values: any[]) { for (const x of values) yield x; };
  assert.equal((await verifyRows(iterable(rows))).atomicActions, atomic);
  const corrupted = structuredClone(rows); corrupted.find(x => x.kind === 'atomic').candidateIndex++;
  await assert.rejects(verifyRows(iterable(corrupted)), /候选验收失败/);
  const wrongValue = structuredClone(rows); wrongValue.find(x => x.kind === 'atomic').labels.valueMask = true;
  await assert.rejects(verifyRows(iterable(wrongValue)), /标签mask/);
});
