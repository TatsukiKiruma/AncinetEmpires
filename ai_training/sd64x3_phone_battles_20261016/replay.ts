import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { candidateMap, choose, type Model } from './adapter';
import { DIR, ROOT, digest, read, save, sha } from './io';
import { naturalClass, rngStream, type Slot } from './match';

const manifest = read('manifest.json');
for (const [name, hash] of Object.entries(manifest.sourceBindings)) assert.equal(sha(fs.readFileSync(path.join(ROOT, name))), hash);
const receipts = [];
for (const slot of manifest.slots as Slot[]) {
  const prefix = `slots/${slot.id}`, result = read(`${prefix}/result.json`);
  const engine = new GameEngine(read(manifest.maps[slot.mapIndex].initialPath));
  const model: Model = read(`models/${slot.device}.json`), rng = rngStream(slot.opponentSeed), ai = new HeuristicAI(rng.next);
  const logPath = path.join(DIR, prefix, 'actions.jsonl.gz');
  const raw = fs.existsSync(logPath) ? gunzipSync(fs.readFileSync(logPath)) : Buffer.from('');
  if (fs.existsSync(logPath)) assert.equal(sha(raw), read(`${prefix}/log-receipt.json`).rawSha256);
  const rows = raw.toString().trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  let switches = 0;
  for (const [i, row] of rows.entries()) {
    assert.equal(i, row.i);
    const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer), map = candidateMap(legal);
    assert.equal(state.currentPlayer, row.actor);
    assert.equal(digest(state), row.before);
    assert.equal(digest([...map.keys()].sort()), row.candidateSha256);
    assert.deepEqual(rng.snapshot(), row.rngBefore);
    const selected = state.currentPlayer === slot.modelSeat ? choose(state, legal, model) : null;
    const action = selected?.action ?? ai.getAction(engine, state.currentPlayer, legal);
    assert.equal(digest(action), digest(row.action));
    assert.equal(digest(map.get(row.code)), digest(row.action));
    if (selected) { assert.equal(selected.inputSha256, row.input); assert.equal(selected.logitsSha256, row.logits); }
    assert.deepEqual(rng.snapshot(), row.rngAfter);
    const transition = engine.step(row.action);
    assert(!transition.info.includes('非法动作'));
    assert.equal(digest(engine.getState()), row.after);
    assert.equal(engine.isTerminal(), row.done);
    assert.equal(engine.getWinner(), row.winner);
    if (engine.getState().currentPlayer !== row.actor) switches++;
  }
  let rejectionReproduced = false;
  if (result.finalSha256) {
    assert.equal(digest(engine.getState()), result.finalSha256);
    assert.equal(digest(read(`${prefix}/final.json`)), result.finalSha256);
    assert.equal(rows.length, result.actions);
    assert.equal(switches, result.realSwitches);
    assert.equal(engine.isTerminal(), result.terminal);
    assert.equal(engine.getWinner(), result.winner);
    if (result.classification.startsWith('natural_')) assert.equal(naturalClass(engine, slot.modelSeat), result.classification);
    if (result.classification === 'surrender') assert(rows.at(-1).action.type === 'surrender' && engine.isTerminal());
    if (result.error && result.error.message.includes('schema拒绝未知特征')) {
      assert.throws(() => choose(engine.getState(), engine.getLegalActions(engine.getState().currentPlayer), model), (e: Error) => String(e) === result.error.message);
      rejectionReproduced = true;
    }
  }
  receipts.push({ slot: slot.id, passed: true, actions: rows.length, switches, trajectorySha256: digest(rows.map(r => [r.actor, r.code, r.before, r.after, r.rngBefore, r.rngAfter])), classification: result.classification, finalSha256: digest(engine.getState()), rejectionReproduced, verification: '权威引擎对已提交前缀逐动作合法重放+双策略重新选择+状态/候选/前向/RNG摘要；有终态资料时核对终态' });
}
save('replay-verification.json', { passed: true, at: new Date().toISOString(), manifestSha256: digest(manifest), slots: receipts, totalActions: receipts.reduce((n, r) => n + r.actions, 0) });
console.log(`全部${receipts.length}槽重放通过，共${receipts.reduce((n, r) => n + r.actions, 0)}动作。`);
