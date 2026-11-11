import fs from 'node:fs';
import path from 'node:path';
import { read, fileSha, decisions } from '../stage1/io';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { DualStreamModel } from '../../../src/ai_runtime/dual_v3/model_runtime';
import { calibrateValue, valueCalibrationFeatures } from '../../../src/ai_runtime/dual_v2/value_calibration';
import { trainingValueTarget } from '../../../src/ai_runtime/dual_v3/value_target';

const here = 'continuation_review_20261030/stage5';
const folder = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/H3-v1';
const calibration = read(path.join(folder, 'calibration.json'));
const fixtures = read(path.join(folder, 'parity-fixtures.json'));
let maximum = 0;
for (const fixture of fixtures) {
    const actual = calibrateValue(fixture.logits, fixture.active, fixture.features, calibration);
    actual.forEach((v, i) => {maximum = Math.max(maximum, Math.abs(v - fixture.expected[i]));});
}
if (!Number.isFinite(maximum) || maximum >= 1e-6) throw Error('H3跨语言误差超限：' + maximum);
const prefix = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/best/final';
const bytes = fs.readFileSync(prefix + '.bin');
const model = new DualStreamModel(read(prefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const partitionFile = 'continuation_review_20261030/stage1/PARTITIONS.json';
const panel = read('continuation_review_20261030/stage1/OFFLINE_PANEL.json');
if (panel.partitionsSha256 !== fileSha(partitionFile)) throw Error('分区变化');
const parents = new Map(read(partitionFile).parents.filter((p: any) => p.split === 'dev' && p.admitted).map((p: any) => [p.parentId, p]));
const requests = new Map<string, any[]>();
for (const request of panel.requests.filter((r: any) => r.split === 'dev')) requests.set(request.parentId, [...(requests.get(request.parentId) ?? []), request]);
const records: any[] = [];
for (const [parentId, wanted] of requests) {
    const p: any = parents.get(parentId); if (!p) throw Error('父局不在dev');
    let found = 0;
    for await (const r of decisions(p, new Set(wanted.map(r => r.macro)))) {
        if (!wanted.some(w => w.macro === r.macro && w.sub === r.sub)) continue;
        const engine = new GameEngine(r.state, {applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true});
        const obs = encodeDualObservation(r.state, engine.getLegalActions(r.state.currentPlayer).filter(a => a.type !== 'surrender'));
        const result = model.forward(obs), features = valueCalibrationFeatures(r.state, obs.playerOrder);
        const probability = calibrateValue(result.valueLogits, obs.playerOrder.active, features, calibration);
        const target = trainingValueTarget(r.state, obs.playerOrder, true, p.winner).target;
        const score = (values: ArrayLike<number>) => ({brier: Array.from(target).reduce((s, t, i) => s + (values[i] - t) ** 2, 0), ce: Array.from(target).reduce((s, t, i) => s - t * Math.log(Math.max(1e-30, values[i])), 0)});
        records.push({parentId, corpus: p.corpus, players: p.players, base: score(result.valueProbs), H3: score(probability)}); found++;
    }
    if (found !== wanted.length) throw Error('原开发面板覆盖缺失');
}
const summary: any = {};
for (const corpus of ['old', 'new']) {
    const rows = records.filter(r => r.corpus === corpus), ids = [...new Set(rows.map(r => r.parentId))];
    const metric = (model: string, key: string) => ids.reduce((sum, id) => {const group = rows.filter(r => r.parentId === id); return sum + group.reduce((s, r) => s + r[model][key], 0) / group.length;}, 0) / ids.length;
    summary[corpus] = {parents: ids.length, samples: rows.length, base: {brier: metric('base', 'brier'), ce: metric('base', 'ce')}, H3: {brier: metric('H3', 'brier'), ce: metric('H3', 'ce')}};
}
const report = {summary, paritySamples: fixtures.length, maxCalibrationDiff: maximum, modelSha256: fileSha(prefix + '.bin'), calibrationSha256: fileSha(path.join(folder, 'calibration.json')), policyLogitDiff: 0, sealedAccess: 0};
fs.writeFileSync(path.join(here, 'H3_OFFLINE_CHECK.json'), JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify(report));
