import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { Action, GameState } from '../../src/game/types';
import { encodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode, forward, parameterCount, type Schema } from '../sd32_phone_20261016/model';
import { SOURCE, sha, digest } from './io';

export function loadSource(device: 'phone32' = 'phone32') {
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'DELIVERY_MANIFEST.json'), 'utf8'));
  const checked = (name: string) => {
    const bytes = fs.readFileSync(path.join(SOURCE, name));
    const entry = manifest.artifacts.find((a: { path: string }) => a.path === name);
    assert(entry, `冻结清单缺失:${name}`);
    assert.equal(bytes.length, entry.bytes); assert.equal(sha(bytes), entry.sha256, `冻结SHA:${name}`);
    return bytes;
  };
  const names = ['REPORT.md', 'GATE.json', 'schema.json', 'initial.json', 'candidate.json', 'checkpoint-audit.json', 'trained-browser-parity.json', 'best.bin'];
  const bindings = Object.fromEntries(names.map(name => [name, sha(checked(name))]));
  const schema: Schema = JSON.parse(checked('schema.json').toString());
  const candidate = JSON.parse(checked('candidate.json').toString());
  const audit = JSON.parse(checked('checkpoint-audit.json').toString());
  const bytes = checked('best.bin');
  assert.equal(bytes.length, 20646 * 8);
  const weights = Array.from({ length: bytes.length / 8 }, (_, i) => bytes.readDoubleBE(i * 8));
  assert.equal(schema.version, 'sd-rel32-phone-v1');
  assert.equal(parameterCount(schema), weights.length); assert(weights.every(Number.isFinite));
  assert.deepEqual(schema, candidate.schema); assert.deepEqual(weights, candidate.weights);
  assert.equal(candidate.trainDevice, 'phone'); assert.equal(candidate.bestEpoch, audit.bestEpoch);
  assert.equal(sha(bytes), audit.bestSha256); assert.equal(bindings['candidate.json'], audit.candidateSha256);
  assert.equal(JSON.parse(checked('GATE.json').toString()).passed, true);
  assert.equal(JSON.parse(checked('trained-browser-parity.json').toString()).trainedCheckpointBrowserPassed, true);
  return { device, schema, weights, sourceFile: 'best.bin', binarySha256: sha(bytes), candidateSha256: bindings['candidate.json'], schemaSha256: bindings['schema.json'], bindings, deliveryManifestSha256: sha(fs.readFileSync(path.join(SOURCE, 'DELIVERY_MANIFEST.json'))), bestEpoch: candidate.bestEpoch, policyOnly: true, valueUsed: false };
}
export type Model = ReturnType<typeof loadSource>;
export function candidateMap(legal: readonly Action[]) {
  const map = new Map<string, Action>();
  for (const action of legal) {
    const code = encodeAction(action); assert(code !== 'unknown' && !map.has(code), '候选动作码非双射'); map.set(code, action);
  }
  assert(map.size > 0, '非终局无合法候选'); return map;
}
export function choose(state: GameState, legal: readonly Action[], model: Model) {
  const map = candidateMap(legal), packet = observe(state, legal);
  assert.equal(packet.codes.length, map.size); assert(packet.codes.every(code => map.has(code)));
  const encoded = encode(packet, model.schema), output = forward(encoded, model.schema, model.weights);
  assert(output.logits.length === legal.length && output.logits.every(Number.isFinite));
  // 使用模型原有稳定argmax，以动作码映射回权威候选，不使用value或战术替换。
  const code = encoded.codes[output.best], action = map.get(code); assert(action);
  return { action, code, candidates: legal.length, inputSha256: digest(encoded), logitsSha256: digest(output.logits), candidateSha256: digest(encoded.codes) };
}
