import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { encodePlayerOrder } from '../../../src/ai_runtime/dual_v2/player_order';
import { valueCalibrationFeatures } from '../../../src/ai_runtime/dual_v2/value_calibration';
import { fileSha, read } from '../stage1/io';
import { Storage } from './storage';

/** H3直接复用运行时态势特征，按源摘要和样本步骤与缓存关联。 */
const [source, destination] = process.argv.slice(2);
const selection = source.endsWith('.json');
const reportPath = selection ? source : path.join(source, 'EXTRACTION_REPORT.json');
const report = read(reportPath);
if (selection && !report.ready) throw Error('选集尚未就绪');
const storage = new Storage(path.resolve(destination));
let count = 0;
let index = 0;
for (const entry of report.rows.filter((r: any) => selection || r.accepted)) {
    const file = selection ? entry.path : path.join(source, entry.file);
    if (selection && fileSha(file) !== entry.sha256) throw Error('来源摘要变化');
    const row = JSON.parse(gunzipSync(fs.readFileSync(file)).toString());
    if (row.split !== report.split) throw Error('分区不一致');
    const features = row.samples.map((s: any) => ({step: s.step, ...valueCalibrationFeatures(s.state, encodePlayerOrder(s.state))}));
    storage.write(selection ? `${index++}.json.gz` : entry.file, {split: row.split, sourceSha256: fileSha(file), parentId: row.parentId, features}, true);
    count += features.length;
}
storage.write('FEATURES_REPORT.json', {samples: count, split: report.split, sourceReportSha256: fileSha(reportPath)});
console.log(JSON.stringify({samples: count}));
