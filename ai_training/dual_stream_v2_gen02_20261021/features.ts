import { corpus, save } from './common';
import { encodePlayerOrder } from '../../src/ai_runtime/dual_v2/player_order';
import { valueCalibrationFeatures } from '../../src/ai_runtime/dual_v2/value_calibration';

const split = process.argv[2] ?? 'dev', result: Record<string, unknown> = {};
for await (const row of corpus(split)) if (row.label.valueMask) result[row.id] = valueCalibrationFeatures(row.state, encodePlayerOrder(row.state));
save(`${split}-features.json`, result);
console.log(JSON.stringify({ split, records: Object.keys(result).length }));
