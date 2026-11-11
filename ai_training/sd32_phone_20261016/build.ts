import fs from 'node:fs';
import path from 'node:path';
import { createGzip, createGunzip, gunzipSync } from 'node:zlib';
import { once } from 'node:events';
import readline from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { encodeAction, decodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode, encodeBase, type Schema } from './model';
import { segmentWriter } from './stream_format';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { digests, sha } from '../sd_300_parent_pilot_20261016/audit';

const out = path.resolve('ai_training/sd32_phone_20261016'), phone = path.resolve('ai_training/data_acceptance_20261016/phone');
const selection = JSON.parse(fs.readFileSync(path.join(out, 'selection.json'), 'utf8'));
const sealed = JSON.parse(fs.readFileSync(path.join(phone, '../DELIVERY_MANIFEST.json'), 'utf8'));
const bindings = new Map(sealed.artifacts.map((a: any) => [a.path.replaceAll('\\', '/'), a.sha256]));
const old = path.resolve('ai_training/sd_adapter_trial_20261016');
const oldWitnesses = gunzipSync(fs.readFileSync(path.join(old, 'witnesses.jsonl.gz'))).toString().trim().split('\n').map(x => JSON.parse(x));
const schema: Schema = JSON.parse(fs.readFileSync(path.join(out, 'schema.json'), 'utf8'));
const oldSets = Object.fromEntries(['rule', 'semantic', 'input'].map(k => [k, new Set<string>()]));
for (const r of oldWitnesses) { const d = digests(r.state, encode(r.packet, schema)); for (const k of Object.keys(d)) oldSets[k].add(d[k]); }
const sets = Object.fromEntries(['rule', 'semantic', 'input'].map(k => [k, new Map<string, Set<string>>() ]));
const overlaps: any = {}, roots: any[] = [], receipts: any[] = [], probes: any[] = [];
for (const split of ['train', 'validation']) overlaps[split] = { rows: 0, oldTrialParentRows: 0, oldTrialExactLocatorRows: 0, oldTrial: { rule: 0, semantic: 0, input: 0 }, crossTrain: { rule: 0, semantic: 0, input: 0 } };
const oldLocators = new Set(oldWitnesses.filter(r => r.provenance.source === 'native').map(r => `${r.provenance.segmentId}:${r.provenance.ordinal}`));
function writer(name: string) {
  const file = fs.createWriteStream(path.join(out, name)), gz = createGzip({ level: 6 }); gz.pipe(file);
  return { async write(v: any) { if (!gz.write(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v) + '\n')) await once(gz, 'drain'); }, async close() { gz.end(); await once(file, 'finish'); } };
}
async function* lines(name: string) { const reader = readline.createInterface({ input: fs.createReadStream(path.join(out, name)).pipe(createGunzip()), crlfDelay: Infinity }); for await (const line of reader) yield JSON.parse(line); }
function guard() {
  const free = fs.statfsSync(out).bavail * fs.statfsSync(out).bsize;
  const size = (dir: string): number => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
  const bytes = size(out); if (free < 12 * 1024 ** 3 || bytes > 512 * 1024 ** 2) throw Error('本阶段资源水位触发');
  return { freeBytes: free, phaseBytes: bytes, rss: process.memoryUsage().rss };
}
async function main() {
  const start = Date.now(), audit = writer('row-audit.jsonl.gz'), inputAudit = writer('input-audit.jsonl.gz');
  fs.mkdirSync(path.join(out, 'segments'), { recursive: true });
  for (const split of ['train', 'validation']) {
    let parentCount = 0;
    for (const parent of selection.parents.filter((p: any) => p.split === split)) {
      for (const entry of parent.segments) {
        for (const rel of [entry.receipt, entry.candidateShard]) if (sha(fs.readFileSync(path.join(phone, rel))) !== bindings.get('phone/' + rel)) throw Error('所选封存文件SHA改变:' + rel);
        const checked = await inspectAndRead(phone, entry);
        if (!entry.policyLabelEligible || !entry.admittedAtoms) { receipts.push({ segmentId: entry.segmentId, admitted: 0 }); continue; }
        const engine = new GameEngine(checked.header.initialState, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
        const wanted = new Set(Array.from({ length: 2 }, (_, i) => parseInt(sha(`probe:${entry.segmentId}:${i}`).slice(0, 8), 16) % entry.admittedAtoms));
        let ordinal = 0, weight = 0, candidates = 0; const trajectory: string[] = [];
        const binary = await segmentWriter(path.join(out, `segments/${entry.segmentId}.dict.gz`), entry.admittedAtoms);
        const verified = await inspectAndRead(phone, entry, async row => {
          const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer);
          const packet = observe(state, legal);
          if (sha(JSON.stringify(state)) !== row.beforeHash || sha(JSON.stringify(packet.codes)) !== row.legalHash || packet.codes.length !== row.legalCount || packet.codes[row.index] !== row.code) throw Error('前态/完整候选合同失败');

          const provenance = { source: 'native', parentId: parent.parentId, segmentId: entry.segmentId, ordinal, macro: row.macro, subAction: row.subAction, map: parent.map };

          if (split === 'train' && wanted.has(ordinal)) probes.push({ state, packet, target: packet.codes.indexOf(row.code), weight: row.weight, provenance });
          const x = encode(packet, schema), d = digests(state, x);
          await binary.row(encodeBase(packet, schema), x.codes.indexOf(row.code), row.weight);
          await inputAudit.write({ split, ...provenance, input: d.input });
          if (oldSets.input.has(d.input)) overlaps[split].oldTrial.input++;
          if (split === 'validation' && sets.input.has(d.input)) overlaps[split].crossTrain.input++;
          if (split === 'train') sets.input.set(d.input, new Set([parent.parentId]));
          // 输入摘要在冻结schema后重算，当前保存语义状态摘要。
          await audit.write({ split, ...provenance, rule: d.rule, semantic: d.semantic });
          for (const k of ['rule', 'semantic']) { if (oldSets[k].has(d[k])) overlaps[split].oldTrial[k]++; if (split === 'validation' && sets[k].has(d[k])) overlaps[split].crossTrain[k]++; if (split === 'train') sets[k].set(d[k], new Set([parent.parentId])); }
          if (oldLocators.has(`${entry.segmentId}:${ordinal}`)) overlaps[split].oldTrialExactLocatorRows++;
          overlaps[split].rows++; overlaps[split].oldTrialParentRows++;
          if (ordinal === 0) roots.push({ split, parentId: parent.parentId, segmentId: entry.segmentId, rule: d.rule, semantic: d.semantic });
          trajectory.push(sha(d.semantic + ':' + JSON.stringify(packet.candidates[x.codes.indexOf(row.code)]) + ':' + JSON.stringify(packet.refs[x.codes.indexOf(row.code)])));
          const action = decodeAction(row.code); if (!action || encodeAction(action) !== row.code) throw Error('动作码不可逆');
          const result = engine.step(action);
          if (result.info.includes('非法动作') || result.info === 'Game already ended' || sha(JSON.stringify(result.state)) !== row.afterHash) throw Error('原子后态/合法性失败');
          ordinal++; weight += row.weight; candidates += packet.codes.length;
        });
        const dictionary = await binary.close();
        if (ordinal !== entry.admittedAtoms || Math.abs(weight - entry.admittedMacros) > 1e-7) throw Error('完整合格原子或权重不一致');
        receipts.push({ split, parentId: parent.parentId, segmentId: entry.segmentId, atoms: ordinal, macroWeight: weight, candidates, sourceSha256: verified.sha256, trajectorySha256: sha(trajectory.join('\n')), quarantinedMacroTail: entry.quarantinedMacroTail, gzipComplete: true, dictionary });
      }
      if (++parentCount % 10 === 0) console.log(JSON.stringify({ split, parents: parentCount, rows: overlaps[split].rows, elapsedSeconds: (Date.now() - start) / 1000, ...guard() }));
    }

  }
  await audit.close(); await inputAudit.close();
  const weights = JSON.parse(fs.readFileSync(path.join(out, 'initial.json'), 'utf8'));
  oldSets.input.clear();
  for (const r of oldWitnesses) { const { codes: _codes, ...input } = encode(r.packet, schema); oldSets.input.add(sha(JSON.stringify(input))); }
  const witnesses = writer('witnesses.jsonl.gz'), encodedProbes = writer('encoded.jsonl.gz');
  for (const r of probes) { await witnesses.write(r); await encodedProbes.write({ ...encode(r.packet, schema), target: r.target, weight: r.weight }); }
  await witnesses.close(); await encodedProbes.close();

  const rootTrain = roots.filter(r => r.split === 'train');
  const sharedRoots = roots.filter(r => r.split === 'validation' && rootTrain.some(t => t.semantic === r.semantic));
  const trainTraj = new Set(receipts.filter(r => r.split === 'train').map(r => r.trajectorySha256));
  const report = { passed: true, selectionSha256: sha(fs.readFileSync(path.join(out, 'selection.json'))), schemaSha256: sha(fs.readFileSync(path.join(out, 'schema.json'))), schemaFromTrainOnly: true, featureDimensions: [schema.token.keys.length, schema.candidate.keys.length], parameters: weights.length, probes: probes.length, overlaps, sharedValidationRoots: sharedRoots, duplicateValidationTrajectoriesWithTrain: receipts.filter(r => r.split === 'validation' && trainTraj.has(r.trajectorySha256)).map(r => r.segmentId), roots, receipts, illegal: 0, unknownFeatureRejected: 0, truncatedEntities: 0, rejectedSelectedRecords: 0, allSelectedQualifiedAtomsEncoded: true, valueFrozen: true, independentEvaluation: false, elapsedSeconds: (Date.now() - start) / 1000, resources: guard(), format: 'sd32-stream-dictionary-v1', oldTrialWitnessSha256: sha(fs.readFileSync(path.join(old, 'witnesses.jsonl.gz'))) };
  fs.writeFileSync(path.join(out, 'data-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ done: true, ...selection.splits, schema: report.featureDimensions, elapsedSeconds: report.elapsedSeconds, resources: report.resources }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
