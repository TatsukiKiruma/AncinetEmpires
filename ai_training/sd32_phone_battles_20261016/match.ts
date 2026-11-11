import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getAllianceId } from '../../src/game/rule_config';
import { candidateMap, choose, type Model } from './adapter';
import { DIR, digest, guard, read, save } from './io';

export interface Slot { id: string; device: 'phone32'; mapIndex: number; mapName: string; modelSeat: number; opponentSeed: number; }
export function rngStream(seed: number) {
  let state = seed >>> 0, calls = 0;
  return {
    next: () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      calls++;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    },
    snapshot: () => ({ state, calls })
  };
}
export function latency(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q: number) => sorted.length ? sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] : null;
  return { count: values.length, p50: p(.5), p95: p(.95), p99: p(.99), max: p(1) };
}
export function naturalClass(engine: GameEngine, seat: number) {
  const state = engine.getState();
  assert(engine.isTerminal() && state.winner !== null);
  return state.winner === -1 ? 'natural_draw' : state.winner === getAllianceId(state, seat) ? 'natural_win' : 'natural_loss';
}
export async function play(slot: Slot) {
  const manifest = read('manifest.json');
  const budget = manifest.budgets;
  const model: Model = read(`models/${slot.device}.json`);
  const initial = read(manifest.maps[slot.mapIndex].initialPath);
  assert.equal(digest(initial), manifest.maps[slot.mapIndex].initialSha256);
  const engine = new GameEngine(initial);
  assert.equal(digest(engine.getState()), digest(initial));
  const rng = rngStream(slot.opponentSeed), ai = new HeuristicAI(rng.next);
  const prefix = `slots/${slot.id}`;
  fs.mkdirSync(path.join(DIR, prefix), { recursive: true });
  save(`${prefix}/started.json`, { slot, at: new Date().toISOString(), initialSha256: digest(initial), manifestSha256: digest(manifest), resource: guard() });
  const log = fs.openSync(path.join(DIR, prefix, 'actions.jsonl'), 'wx');
  const start = performance.now();
  let classification = 'error', error: unknown = null, switches = 0, actions = 0, surrenderBy: number | null = null;
  const samples: { model: number[]; heuristic: number[] } = { model: [], heuristic: [] };
  const repeats = new Map<string, { count: number; firstAction: number }>();
  let cycle: unknown = null;
  let decisionEvidence: unknown = null;
  try {
    while (true) {
      if (engine.isTerminal()) { classification = naturalClass(engine, slot.modelSeat); break; }
      if (actions >= budget.maxActions) { classification = 'action_truncation'; break; }
      if (performance.now() - start >= budget.wallMs) { classification = 'wall_truncation'; break; }
      if (actions % 20 === 0) guard();
      const cycleKey = digest({ state: engine.getState(), rng: rng.snapshot() });
      const seen = repeats.get(cycleKey) ?? { count: 0, firstAction: actions };
      repeats.set(cycleKey, { ...seen, count: seen.count + 1 });
      if (seen.count >= 2) { classification = 'loop'; cycle = { key: cycleKey, firstAction: seen.firstAction, atAction: actions, occurrences: seen.count + 1 }; break; }
      const decisionStart = performance.now();
      process.send?.({ type: 'decision_start', at: Date.now(), action: actions });
      const state = engine.getState(), actor = state.currentPlayer;
      const side = actor === slot.modelSeat ? 'model' : 'heuristic';
      const legal = engine.getLegalActions(actor), map = candidateMap(legal);
      const beforeSha256 = digest(state), rngBefore = rng.snapshot();
      decisionEvidence = { index: actions, actor, beforeSha256, legalCodes: [...map.keys()], rngBefore };
      const selected = side === 'model' ? choose(state, legal, model) : null;
      const action = selected?.action ?? ai.getAction(engine, actor, legal);
      const code = [...map].find(([, a]) => digest(a) === digest(action))?.[0];
      assert(code && map.has(code), '策略返回非法动作');
      // 选择后的二次权威合法性检查也计入端到端决策耗时。
      assert(candidateMap(engine.getLegalActions(actor)).has(code));
      const candidateSha256 = digest([...map.keys()].sort());
      const elapsedMs = performance.now() - decisionStart;
      samples[side].push(elapsedMs);
      decisionEvidence = { ...decisionEvidence as object, code, elapsedMs, rngAfter: rng.snapshot() };
      process.send?.({ type: 'decision_end', elapsedMs });
      if (elapsedMs > budget.decisionMs) { classification = 'decision_timeout'; break; }
      if (performance.now() - start >= budget.wallMs) { classification = 'wall_truncation'; break; }
      const result = engine.step(action);
      assert(!result.info.includes('非法动作'), result.info);
      const after = engine.getState();
      assert.equal(digest(after), digest(result.state));
      assert.equal(result.done, engine.isTerminal());
      assert.equal(after.winner, engine.getWinner());
      assert.equal(digest(engine.clone().getState()), digest(after));
      if (after.currentPlayer !== actor) switches++;
      fs.writeSync(log, JSON.stringify({ i: actions, actor, action, code, before: beforeSha256, after: digest(after), candidateSha256, candidates: legal.length, input: selected?.inputSha256, logits: selected?.logitsSha256, rngBefore, rngAfter: rng.snapshot(), ms: elapsedMs, side, done: result.done, winner: after.winner }) + '\n');
      actions++;
      if (!engine.isTerminal()) candidateMap(engine.getLegalActions(after.currentPlayer));
      decisionEvidence = null;
      if (action.type === 'surrender') {
        assert(engine.isTerminal(), '合法投降未终局');
        surrenderBy = actor; classification = 'surrender'; break;
      }
    }
  } catch (e) {
    classification = 'error';
    error = { message: String(e), stack: e instanceof Error ? e.stack : null };
  } finally {
    fs.closeSync(log);
  }
  const final = engine.getState();
  save(`${prefix}/final.json`, final);
  if (decisionEvidence) save(`${prefix}/decision-evidence.json`, decisionEvidence);
  const result = { slot, classification, error, cycle, surrenderBy, winner: engine.getWinner(), terminal: engine.isTerminal(), actions, realSwitches: switches, finalTurn: final.turn, finalSha256: digest(final), initialSha256: digest(initial), wallMs: performance.now() - start, rngFinal: rng.snapshot(), latency: { model: latency(samples.model), heuristic: latency(samples.heuristic) }, latencySamples: samples, resource: guard() };
  save(`${prefix}/result.json`, result);
  process.send?.({ type: 'complete' });
  console.log(`${slot.id} ${classification} 动作=${actions} 换手=${switches}`);
}
