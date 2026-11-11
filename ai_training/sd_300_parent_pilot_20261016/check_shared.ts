import { GameEngine } from '../../src/game/engine';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode, forward, type Schema } from './model';

export function check(witnesses: any[], encoded: any[], references: any[], schema: Schema, weights: number[]) {
  let logitsMaxError = 0, valueMaxError = 0, candidates = 0;
  const coverage = { source: {} as Record<string, number>, currentPlayer: {} as Record<string, number>, turnMin: Infinity, turnMax: 0, maps: new Set<string>(), actionTypes: new Set<string>() };
  const same = (a: unknown, b: unknown, message: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(message); };
  for (let i = 0; i < witnesses.length; i++) {
    const row = witnesses[i], state = row.state;
    const engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    const legal = engine.getLegalActions(state.currentPlayer), packet = observe(state, legal), x = encode(packet, schema);
    same(packet, row.packet, `原始状态重建不一致:${i}`);
    const { target: _target, weight: _weight, ...stored } = encoded[i]; same(x, stored, `TS编码不一致:${i}`);
    if (i % 50 === 0) same(observe(state, [...legal].reverse()), packet, '候选重排不稳定');
    const actual = forward(x, schema, weights), expected = references[i];
    if (actual.logits.length !== expected.logits.length || actual.best !== expected.best) throw Error(`候选数或稳定argmax不一致:${i}`);
    for (let j = 0; j < actual.logits.length; j++) logitsMaxError = Math.max(logitsMaxError, Math.abs(actual.logits[j] - expected.logits[j]));
    valueMaxError = Math.max(valueMaxError, Math.abs(actual.value - expected.value)); candidates += actual.logits.length;
    coverage.source[row.provenance.source] = (coverage.source[row.provenance.source] ?? 0) + 1;
    coverage.currentPlayer[state.currentPlayer] = (coverage.currentPlayer[state.currentPlayer] ?? 0) + 1;
    coverage.turnMin = Math.min(coverage.turnMin, state.turn); coverage.turnMax = Math.max(coverage.turnMax, state.turn);
    coverage.maps.add(state.metadata?.apkResourcePath ?? row.provenance.map ?? `${state.map.width}x${state.map.height}`);
    legal.forEach(a => coverage.actionTypes.add(a.type));
  }
  if (logitsMaxError > 1e-8 || valueMaxError > 1e-8) throw Error('前向误差超过预设阈值');
  const state = structuredClone(witnesses.find(r => r.state.units.length)?.state), engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
  const legal = engine.getLegalActions(state.currentPlayer), baseline = observe(state, legal);
  const tests: string[] = [];
  const mutate = (name: string, change: (state: any) => void) => {
    const changed = structuredClone(state); change(changed); const packet = observe(changed, legal);
    if (JSON.stringify(encode(packet, schema)) === JSON.stringify(encode(baseline, schema))) throw Error(`语义信息丢失:${name}`);
    tests.push(name);
  };
  mutate('经验', s => { s.units[0].exp = (s.units[0].exp ?? 0) + 1; });
  mutate('移动余量', s => { s.units[0].movementRemaining = (s.units[0].movementRemaining ?? 0) + 1; });
  for (const field of ['hasPostAttackMoved', 'hasBeenHealedThisTurn', 'hasBeenSupportedThisTurn', 'apkStatic', 'apkTargeted']) mutate(field, s => { s.units[0][field] = !s.units[0][field]; });
  mutate('状态计时', s => { s.units[0].status = { type: 'poisoned', remainingTicks: 2, remainingTurns: 3 }; });
  mutate('pending来源', s => { s.units[0].apkPendingRecruitSource = 'commander_castle'; s.pendingUnitId = s.units[0].id; });
  const stacked = structuredClone(state); stacked.units.push({ ...structuredClone(stacked.units[0]), id: '__stacked_probe__' });
  const stackPacket = observe(stacked, legal);
  if (stackPacket.groups.filter(g => g === 2).length !== state.units.length + 1) throw Error('堆叠单位被截断'); tests.push('堆叠单位完整');
  const large = structuredClone(state); while (large.units.length < 40) large.units.push({ ...structuredClone(large.units[0]), id: `__probe_${large.units.length}` });
  if (observe(large, legal).groups.filter(g => g === 2).length !== 40) throw Error('单位数量被截断'); tests.push('40单位无截断');
  const invalid = structuredClone(state); invalid.rules = { ...invalid.rules, unrecognizedRule: 1 };
  let rejected = false; try { observe(invalid, legal); } catch { rejected = true; } if (!rejected) throw Error('未知规则未拒绝'); tests.push('未知规则拒绝');
  return { rows: witnesses.length, candidates, logitsMaxError, valueMaxError, tolerance: 1e-8, stableArgmaxAllEqual: true, fullStateObservationRebuilt: true, semanticTests: tests, coverage: { ...coverage, maps: [...coverage.maps].sort(), actionTypes: [...coverage.actionTypes].sort() } };
}

