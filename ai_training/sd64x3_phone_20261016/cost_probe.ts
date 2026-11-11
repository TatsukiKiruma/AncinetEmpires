import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { tacticalFeatures, TACTIC_KEYS } from './tactics';
const root = 'ai_training/sd64x3_phone_20261016/';
const source = 'ai_training/sd32_phone_20261016/witnesses.jsonl.gz';
const bytes = fs.readFileSync(source), rows = gunzipSync(bytes).toString().trim().split('\n');
const records = [], started = performance.now();
for (let i = 0; i < 8; i++) {
  const row = JSON.parse(rows[i * 100]);
  const engine = new GameEngine(row.state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
  const legal = engine.getLegalActions(row.state.currentPlayer), start = performance.now();
  const features = tacticalFeatures(engine, legal);
  records.push({ provenance: row.provenance, candidates: legal.length, seconds: (performance.now() - start) / 1000, nonzero: features.flat().filter(v => v !== 0).length });
  console.log(JSON.stringify(records.at(-1)));
}
const seconds = (performance.now() - started) / 1000;
const old = JSON.parse(fs.readFileSync('ai_training/sd32_phone_20261016/data-audit.json', 'utf8'));
const candidates = old.receipts.reduce((n: number, r: any) => n + (r.candidates ?? 0), 0);
const result = { trainOnly: true, optimizerUpdates: 0, records, seconds, candidates, estimatedFullSeconds: seconds / records.reduce((n, r) => n + r.candidates, 0) * candidates, featureKeys: TACTIC_KEYS, sourceSha256: createHash('sha256').update(bytes).digest('hex') };
fs.writeFileSync(root + 'cost-probe.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
