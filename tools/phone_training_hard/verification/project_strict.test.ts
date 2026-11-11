import { describe, expect, it } from 'vitest';
import { createDefaultAppGameState } from '../../../src/game/default_state';
import { canonicalProjection, compareProjectedStates, validateActions, type NativeAction } from './project_strict';

describe('困难原生独立项目验收', () => {
  it('支持新父局与尝试ID，并拒绝换父局、缺字段、序号及种子断裂', () => {
    const job = { parentId: 'native-hard-20261022-0001', attemptId: 'hard-trial-123', map: '(2) Duel.aem', seed: 999, maxActions: 1 };
    const action: NativeAction = { ...job, index: 0, ai_seed: 999, path: 'hard_js_primary', fields: { a: -1, b: -1, c: -1, d: -1, e: -1, f: -1, g: -1, h: -1, i: -1, j: 'NEXT_TURN' } };
    expect(() => validateActions([action], job, 1)).not.toThrow();
    for (const change of [{ parentId: '另一父局' }, { attemptId: '另一尝试' }, { index: 1 }, { ai_seed: 1000 }, { path: 'ordinary_ai' }, { fields: { ...action.fields, j: undefined } }]) {
      const mutated = { ...action, ...change } as NativeAction;
      if (change.fields) delete mutated.fields.j;
      expect(() => validateActions([mutated], job, 1)).toThrow();
    }
  });
  it('联盟数字标签和单位ID变化不影响语义，联盟分组变化仍被拒绝', () => {
    const left = createDefaultAppGameState(), right = structuredClone(left);
    left.rules = { ...left.rules, alliances: { 0: 0, 1: 1 } };
    right.rules = { ...right.rules, alliances: { 0: 1, 1: 2 } };
    right.units.forEach((u, i) => { u.id = '原生_' + i; });
    expect(canonicalProjection(left)).toEqual(canonicalProjection(right));
    expect(() => compareProjectedStates(left, right, '联盟')).not.toThrow();
    right.rules.alliances = { 0: 1, 1: 1 };
    expect(() => compareProjectedStates(left, right, '联盟')).toThrow();
  });
  it('不接受棋盘看似相同但金钱、脚本变量、墓碑或当前队伍不同的状态', () => {
    const base = createDefaultAppGameState();
    for (const mutate of [
      (s: typeof base) => { s.players[0].gold++; },
      (s: typeof base) => { s.apkScriptState = { integers: { 计数: 2 } }; },
      (s: typeof base) => { s.graves = [{ id: 'g', pos: { x: 1, y: 1 }, ownerId: 0, remainingTurns: 3 }]; },
      (s: typeof base) => { s.currentPlayer = s.players[1].id; },
    ]) { const changed = structuredClone(base); mutate(changed); expect(() => compareProjectedStates(base, changed, '严格状态')).toThrow(); }
  });
});
