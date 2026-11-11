import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { Action, GameState } from '../../src/game/types';
import { encodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode, forward, parameterCount, type Schema } from '../../src/ai_runtime/sd_v1/model';
import { SOURCE, sha, digest } from './io';

export function loadSource(device: 'pc' | 'phone') {
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'DELIVERY_MANIFEST.json'), 'utf8'));
  const checked = (name: string) => {
    const bytes = fs.readFileSync(path.join(SOURCE, name));
    const entry = manifest.artifacts.find((a: { path: string }) => a.path === name);
    assert(entry, `冻结清单缺失:${name}`);
    assert.equal(bytes.length, entry.bytes, `冻结长度:${name}`);
    assert.equal(sha(bytes), entry.sha256, `冻结SHA:${name}`);
    return bytes;
  };
  const bindings = Object.fromEntries(['REPORT.md', 'GATE.json', 'schema.json', 'initial.json', 'candidate.json', 'trial-results.json', 'trained-browser-parity.json', `${device}-train-0.bin`].map(name => [name, sha(checked(name))]));
  const schema: Schema = JSON.parse(checked('schema.json').toString());
  const bytes = checked(`${device}-train-0.bin`);
  assert.equal(bytes.length, 28528);
  const weights = Array.from({ length: bytes.length / 8 }, (_, i) => bytes.readDoubleBE(i * 8));
  assert.equal(weights.length, 3566);
  assert.equal(parameterCount(schema), weights.length);
  assert(weights.every(Number.isFinite));
  assert.equal(JSON.parse(checked('GATE.json').toString()).passed, true);
  return { device, schema, weights, sourceFile: `${device}-train-0.bin`, binarySha256: sha(bytes), schemaSha256: bindings['schema.json'], bindings, deliveryManifestSha256: sha(fs.readFileSync(path.join(SOURCE, 'DELIVERY_MANIFEST.json'))), policyOnly: true, valueUsed: false };
}
export type Model = ReturnType<typeof loadSource>;
export function candidateMap(legal: readonly Action[]) {
  const map = new Map<string, Action>();
  for (const action of legal) {
    const code = encodeAction(action);
    assert(code !== 'unknown' && !map.has(code), '候选动作码非双射');
    map.set(code, action);
  }
  assert(map.size > 0, '非终局无合法候选');
  return map;
}
export function choose(state: GameState, legal: readonly Action[], model: Model) {
  const map = candidateMap(legal);
  const packet = observe(state, legal);
  assert.equal(packet.codes.length, map.size);
  assert(packet.codes.every(code => map.has(code)));
  const encoded = encode(packet, model.schema);
  const output = forward(encoded, model.schema, model.weights);
  assert(output.logits.length === legal.length && output.logits.every(Number.isFinite));
  // 完全复用共享前向的稳定argmax和动作码，绝不把排序后索引当引擎索引。
  const code = encoded.codes[output.best];
  const action = map.get(code);
  assert(action, '选中动作不属于完整合法候选');
  return { action, code, candidates: legal.length, inputSha256: digest(encoded), logitsSha256: digest(output.logits), candidateSha256: digest(encoded.codes) };
}
