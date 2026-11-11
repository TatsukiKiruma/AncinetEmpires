import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { encode, forward } from '../../src/ai_runtime/sd_v1/model';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { choose, candidateMap, loadSource, type Model } from './adapter';
import { read, save, digest } from './io';
import { rngStream } from './match';
import { mulberry32 } from '../../src/game/env';

const manifest = read('manifest.json');
const checks: unknown[] = [];
for (const device of ['pc', 'phone'] as const) {
  const model: Model = read(`models/${device}.json`);
  assert.deepEqual(model, loadSource(device));
  for (const map of manifest.maps) {
    const initial = read(map.initialPath), engine = new GameEngine(initial);
    const raw = createApkSkirmishGameState(parseAppApkSkirmishMap(map.name), { mapName: map.name, mode: 'SD', applyInitialTurnStart: false });
    assert.equal(digest(new GameEngine(raw, { applyInitialTurnStart: true }).getState()), digest(initial));
    assert.equal(digest(engine.getState()), digest(initial));
    assert.equal(digest(engine.clone().getState()), digest(initial));
    const legal = engine.getLegalActions(initial.currentPlayer);
    const selected = choose(initial, legal, model);
    assert.equal(selected.code, choose(initial, [...legal].reverse(), model).code);
    assert.throws(() => candidateMap([...legal, legal[0]]), /非双射/);
    assert.throws(() => observe({ ...initial, unknownField: true }, legal), /未知状态字段/);
    const packet = observe(initial, legal);
    assert.throws(() => encode({ ...packet, tokens: [{ ...packet.tokens[0], unknownField: 1 }, ...packet.tokens.slice(1)] }, model.schema), /拒绝未知特征/);
    assert.throws(() => forward(encode(packet, model.schema), model.schema, model.weights.slice(1)), /权重长度/);
    assert.throws(() => observe({ ...initial, turn: NaN }, legal), /非有限输入/);
    const result = engine.step(selected.action);
    assert(!result.info.includes('非法动作'));
    assert.equal(digest(result.state), digest(engine.getState()));
    checks.push({ device, map: map.name, candidates: legal.length, initialCandidateBijection: true, reversedCandidateInvariant: true, restoredIncomeNotDuplicated: true, cloneEqual: true, selectedCode: selected.code, stepVerified: true });
  }
}
const actual = rngStream(2026101600), expected = mulberry32(2026101600);
for (let i = 0; i < 1000; i++) assert.equal(actual.next(), expected());
save('preflight.json', { passed: true, at: new Date().toISOString(), manifestSha256: digest(manifest), checks, semanticRejection: ['未知状态字段', '未知schema特征', '非有限输入', '重复候选码', '截短权重'], rngParityCalls: 1000, scope: '官方初态适配/一步闭环，不声称整局schema覆盖；实际对战每步继续严格拒绝。' });
console.log('适配检查通过：双来源×五图初态，一步闭环、拒绝测试、候选反序、收益与RNG检查通过。');
