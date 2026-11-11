import { readFileSync } from 'node:fs';
import { readNativeConfig } from '../../ai_training/data_acceptance_20261016/native_reader/reader';

// 复用原生配置解码器，人口上限来自实际采集输入而不是网页默认值。
const config = readNativeConfig(readFileSync(process.argv[2]));
if (!config?.k || config.k.length !== 6 || config.k.some(value => !Number.isInteger(value) || value <= 0)) {
  throw new Error('原生配置人口上限不完整');
}
if (new Set(config.k).size !== 1) throw new Error('本批网页适配需要六队使用相同的原生人口上限');
console.log(JSON.stringify({ populationCaps: config.k, populationLimit: config.k[0] }));
