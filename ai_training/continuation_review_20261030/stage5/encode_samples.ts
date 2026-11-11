import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { trainingValueTarget } from '../../../src/ai_runtime/dual_v3/value_target';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { read, fileSha } from '../stage1/io';
import { Storage } from './storage';

/** 只编码严格重放准入的样本，复用权威六槽顺序和联盟标签。 */
const [source, output] = process.argv.slice(2);
const selection = source.endsWith('.json');
const reportPath = selection ? source : path.join(source, 'EXTRACTION_REPORT.json');
const report = read(reportPath);
if (selection && !report.ready) throw Error('严格等权选集尚未就绪');
if (!['train', 'dev'].includes(report.split)) throw Error('分区无效');
const storage = new Storage(path.resolve(output));
let samples = 0;
let index = 0;
for (const entry of report.rows.filter((r: any) => selection || r.accepted)) {
    const file = selection ? entry.path : path.join(source, entry.file);
    if (selection && fileSha(file) !== entry.sha256) throw Error('选集来源摘要变化');
    const row = JSON.parse(gunzipSync(fs.readFileSync(file)).toString());
    if (row.split !== report.split || !row.natural || row.winner === null || row.winner === -1 || row.samples.length !== 12) throw Error('样本合同失败');
    const observations = row.samples.map((s: any) => {
        const engine = new GameEngine(s.state, {applyInitialTurnStart: false});
        return encodeDualObservation(s.state, engine.getLegalActions(s.state.currentPlayer).filter(a => a.type !== 'surrender'));
    });
    const labels = observations.map((obs: any, i: number) => {
        const target = trainingValueTarget(row.samples[i].state, obs.playerOrder, true, row.winner);
        return {target: 0, policyMask: false, valueTarget: target.target, valueMask: target.valueMask, weight: 1};
    });
    const packed = packTensorBatch(observations, labels);
    const sources = row.samples.map((s: any) => ({parentId: row.parentId, groupId: row.groupId, split: row.split, players: row.players, mode: row.mode, step: s.step, phase: s.phase, boundary: s.boundary, sourceSha256: fileSha(file)}));
    storage.write(selection ? `${index++}.json.gz` : entry.file, {metadata: {...packed.metadata, sources}, bytes: packed.bytes.toString('base64')}, true);
    samples += row.samples.length;
}
storage.write('ENCODING_REPORT.json', {split: report.split, samples, sourceReportSha256: fileSha(reportPath), sealedAccess: 0});
console.log(JSON.stringify({samples}));
