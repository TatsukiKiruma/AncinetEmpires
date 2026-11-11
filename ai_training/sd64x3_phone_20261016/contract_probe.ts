import fs from 'node:fs';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { getLegalActions } from '../../src/game/rules';
import { decodeAction, encodeAction, buildFixedActionMask } from '../../src/game/env';
import type { Action } from '../../src/game/types';
import { tacticalFeatures } from './tactics';
const root = 'ai_training/sd64x3_phone_20261016/';
const witnesses = gunzipSync(fs.readFileSync(root + 'witnesses.jsonl.gz')).toString().trim().split('\n').map(s => JSON.parse(s));
const actor = (a: Action) => 'unitId' in a ? a.unitId : 'attackerId' in a ? a.attackerId : 'healerId' in a ? a.healerId : 'supporterId' in a ? a.supporterId : 'summonerId' in a ? a.summonerId : undefined;
let candidates = 0, unitQueries = 0;
for (const row of witnesses) {
  const engine = new GameEngine(row.state, { disableAutoAdvanceWhenNoMeaningfulAction: true });
  const legal = engine.getLegalActions(row.state.currentPlayer), state = engine.getState();
  assert.deepEqual(engine.clone().getState(), state);
  const codes = legal.map(encodeAction); assert.deepEqual([...codes].sort(), row.packet.codes);
  assert.deepEqual(buildFixedActionMask(state, legal), buildFixedActionMask(state, getLegalActions(state, state.currentPlayer)));
  assert.deepEqual(engine.getLegalActions(state.currentPlayer, { skipMovement: true }), legal.filter(a => a.type !== 'move' && a.type !== 'post_attack_move'));
  for (const unit of state.units.filter(u => u.ownerId === state.currentPlayer)) {
    assert.deepEqual(engine.getLegalActions(state.currentPlayer, { unitId: unit.id }), legal.filter(a => actor(a) === undefined || actor(a) === unit.id)); unitQueries++;
  }
  for (const action of legal) {
    const branch = engine.clone(), bypass = new GameEngine(state, { unsafeBypassValidationForTests: true, disableAutoAdvanceWhenNoMeaningfulAction: true });
    assert.deepEqual(branch.step(action), bypass.step(action)); candidates++;
  }
  assert.deepEqual(engine.getState(), state);
}
// 慢查询与定向查询共享同一权威引擎结算，逐候选验证战术值完全相同。
const original = GameEngine.prototype.getLegalActions;
let compared = 0;
for (const row of witnesses.slice(0, 8)) {
  const engine = new GameEngine(row.state, { disableAutoAdvanceWhenNoMeaningfulAction: true });
  const legal = row.packet.codes.map((c: string) => decodeAction(c)!);
  try {
    GameEngine.prototype.getLegalActions = function(player: number) { return original.call(this, player); };
    const slow = tacticalFeatures(engine, legal);
    assert.deepEqual(slow, row.tactics); compared += legal.length;
  } finally { GameEngine.prototype.getLegalActions = original; }
}
const bindings = Object.fromEntries(['src/game/engine.ts', 'src/game/rules.ts', root + 'tactics.ts', root + 'selection.json'].map(n => [n, createHash('sha256').update(fs.readFileSync(n)).digest('hex')]));
fs.writeFileSync(root + 'contract-probe.json', JSON.stringify({ passed: true, states: witnesses.length, candidates, unitQueries, slowQueryTacticCandidates: compared, unchangedSourceStates: true, defaultMaskUnchanged: true, optimizerUpdates: 0, bindings }, null, 2));
console.log(JSON.stringify({ passed: true, states: witnesses.length, candidates, unitQueries, slowQueryTacticCandidates: compared }));
