import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction, decodeAction } from '../../src/game/env';
import { observe, ACTIONS, CLASSES } from '../../src/ai_runtime/sd_v1/observation';
import { fields, encode, parameterCount, type Schema } from '../../src/ai_runtime/sd_v1/model';
import { inspectAndRead, type Admission } from '../data_acceptance_20261016/phone/compact_reader';
import { ruleStateHash, stepStrict, ENGINE_OPTIONS } from '../data_acceptance_20261016/replay/core';

const OUT = path.resolve('ai_training/sd_adapter_trial_20261016');
const PHONE = path.resolve('ai_training/data_acceptance_20261016/phone');
const REAL = path.resolve('ai_training/data_acceptance_20261016/replay');
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const json = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const random = (s: string) => parseInt(sha(s).slice(0, 8), 16);
const rows: any[] = [], sources: any[] = [];
function save(state: any, legal: any[], code: string, weight: number, provenance: any) {
  const packet = observe(state, legal), target = packet.codes.indexOf(code);
  if (target < 0) throw Error('新候选缺少标签');
  rows.push({ state, packet, target, weight, provenance });
}
async function native(entry: Admission & any, ordinal: number, tag: string) {
  const actions: any[] = [];
  const checked = await inspectAndRead(PHONE, entry, row => { actions.push(row); });
  if (!actions[ordinal]) throw Error('抽样越界');
  const engine = new GameEngine(checked.header.initialState, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
  for (let i = 0; i <= ordinal; i++) {
    const row = actions[i], state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer);
    const ordered = legal.map(a => ({ a, code: encodeAction(a) })).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
    const codes = ordered.map(a => a.code);
    if (sha(JSON.stringify(state)) !== row.beforeHash || sha(JSON.stringify(codes)) !== row.legalHash || codes.length !== row.legalCount || codes[row.index] !== row.code) throw Error(`原生重建失败:${entry.segmentId}:${i}`);
    if (i === ordinal) save(state, legal, row.code, row.weight, { source: 'native', parentId: entry.parentId, segmentId: entry.segmentId, macro: row.macro, subAction: row.subAction, ordinal, tag, map: entry.map, planId: entry.planId, sourceBeforeHash: row.beforeHash });
    const action = decodeAction(row.code); if (!action) throw Error('不可解码动作');
    if (sha(JSON.stringify(engine.step(action).state)) !== row.afterHash) throw Error('原生后态不一致');
  }
  sources.push({ segmentId: entry.segmentId, sha256: checked.sha256, sampledOrdinal: ordinal });
}
async function main() {
  const indexPath = path.join(PHONE, 'release-2026-10-15T21-05-00-859Z/release-index.jsonl');
  const entries = fs.readFileSync(indexPath, 'utf8').trim().split('\n').map(x => JSON.parse(x)).filter(e => e.policyLabelEligible && e.admittedAtoms > 0 && e.actualBucket.configuredPlayerCount === 2 && e.actualBucket.configMode === 'SD');
  const parents = new Map<string, any[]>();
  for (const e of entries) parents.set(e.parentId, [...parents.get(e.parentId) ?? [], e]);
  const chosen: any[] = [];
  for (const [parent, segments] of parents) {
    const e = segments[random(parent + ':segment') % segments.length]; chosen.push(e);
    await native(e, random(parent + ':ordinal') % Math.min(e.admittedAtoms, 32), 'parent-near-segment-start');
    if (chosen.length % 100 === 0) console.log(JSON.stringify({ nativeParents: chosen.length, rows: rows.length }));
  }
  if (chosen.length !== 1922) throw Error('父局数量改变');
  for (let i = 0; i < 33; i++) {
    const e = chosen[random('extra:' + i) % chosen.length];
    await native(e, random('late:' + i) % e.admittedAtoms, 'extra-full-segment-range');
  }
  const realIndex = json(path.join(REAL, 'policy-release-index.json'));
  const realSources = realIndex.candidateSources.filter((s: any) => s.configuredPlayerCount === 2 && s.scenario === 'SD');
  let realRows = 0;
  for (const source of realSources) {
    const bytes = fs.readFileSync(path.join(REAL, source.packet.path));
    if (sha(bytes) !== source.packet.sha256) throw Error('真实分片SHA变化');
    const data = gunzipSync(bytes).toString('utf8').trim().split('\n').map(x => JSON.parse(x));
    if (data[0].kind !== 'game' || data.at(-1).kind !== 'end' || !data.at(-1).accepted) throw Error('真实分片边界不符');
    const header = data[0], engine = new GameEngine(header.initialState, ENGINE_OPTIONS);
    if (ruleStateHash(engine.getState()) !== header.effectiveInitialStateHash) throw Error('真实初态不一致');
    let macroAtoms = 0;
    for (const row of data.slice(1)) {
      if (row.kind === 'macro') { macroAtoms = row.atomicCount; continue; }
      if (row.kind !== 'atomic') continue;
      const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer);
      if (ruleStateHash(state) !== row.beforeHash) throw Error('真实前态不一致');
      if (row.labels.policyMask && row.action.type !== 'surrender') {
        save(state, legal, row.actionCode, 1 / macroAtoms, { source: 'real', responseSha256: source.responseSha256, atomic: row.atomic, macro: row.macro, sourceBeforeHash: row.beforeHash }); realRows++;
      }
      const exact = stepStrict(engine, state, row.action);
      for (const k of ['actionCode', 'candidateIndex', 'candidateCount', 'candidateHash'] as const) if (exact[k] !== row[k]) throw Error('真实旧候选合同不一致');
      if (ruleStateHash(exact.result.state) !== row.afterHash) throw Error('真实后态不一致');
    }
    if (ruleStateHash(engine.getState()) !== data.at(-1).finalStateHash) throw Error('真实终态不一致');
    sources.push(source.packet);
  }
  if (realRows !== 445 || rows.length !== 2400) throw Error('样本计数不符');
  const tokenKeys = new Set<string>(), candidateKeys = new Set<string>();
  const collect = (record: any, keys: Set<string>) => fields(record).forEach(([k]) => keys.add(k));
  for (const row of rows) { row.packet.tokens.forEach((t: any) => collect(t, tokenKeys)); row.packet.candidates.forEach((c: any) => collect(c, candidateKeys)); }
  // 全兵种、动作和关键可选字段预留；新规则/字段仍显式拒绝，不能静默退化。
  for (const unitClass of CLASSES) { collect({ unitClass }, tokenKeys); collect({ unitClass }, candidateKeys); }
  for (const type of ACTIONS) collect({ type }, candidateKeys);
  for (const type of ['poisoned', 'inspired', 'blinded', 'weakened']) collect({ 'status.type': type, 'status.remainingTicks': 1, 'status.remainingTurns': 1 }, tokenKeys);
  collect({ exp: 0, movementRemaining: 0, hasPostAttackMoved: false, hasBeenHealedThisTurn: false, hasBeenSupportedThisTurn: false, apkStatic: false, apkTargeted: false }, tokenKeys);
  collect({ hasPostAttackMoved: true, hasBeenHealedThisTurn: true, hasBeenSupportedThisTurn: true, apkStatic: true, apkTargeted: true }, tokenKeys);
  for (const apkPendingRecruitSource of ['empty_castle', 'commander_castle']) collect({ apkPendingRecruitSource }, tokenKeys);
  const schema: Schema = { version: 'sd-entities-v1', token: { keys: [...tokenKeys].sort() }, candidate: { keys: [...candidateKeys].sort() }, hidden: 8 };
  let seed = 61016;
  const weights = Array.from({ length: parameterCount(schema) }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 0.12; });
  const encoded = rows.map(r => ({ ...encode(r.packet, schema), target: r.target, weight: r.weight }));
  fs.writeFileSync(path.join(OUT, 'schema.json'), JSON.stringify(schema));
  fs.writeFileSync(path.join(OUT, 'initial.json'), JSON.stringify(weights));
  fs.writeFileSync(path.join(OUT, 'witnesses.jsonl.gz'), gzipSync(rows.map(r => JSON.stringify(r)).join('\n') + '\n'));
  fs.writeFileSync(path.join(OUT, 'encoded.jsonl.gz'), gzipSync(encoded.map(r => JSON.stringify(r)).join('\n') + '\n'));
  fs.writeFileSync(path.join(OUT, 'dataset-manifest.json'), JSON.stringify({ at: new Date().toISOString(), nativeParents: 1922, nativeRows: 1955, realSources: 2, realRows, rows: rows.length, partition: 'train', independentEvaluation: false, allQualifiedStillAssignedTrain: true, allSourceRecordsEncoded: false, selection: '每父局按SHA选段，在该段前32个合格原子中选1；33条补充覆盖整个合格段；真实双人SD全445条', seed: 61016, sourceIndexSha256: sha(fs.readFileSync(indexPath)), realIndexSha256: sha(fs.readFileSync(path.join(REAL, 'policy-release-index.json'))), sourceBindings: sources, parameters: weights.length, featureDimensions: [schema.token.keys.length, schema.candidate.keys.length] }, null, 2));
  console.log(JSON.stringify({ done: true, rows: rows.length, parameters: weights.length, featureDimensions: [schema.token.keys.length, schema.candidate.keys.length] }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
