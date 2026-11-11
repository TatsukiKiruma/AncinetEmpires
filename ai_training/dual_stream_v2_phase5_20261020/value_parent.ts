import fs from 'node:fs';
import path from 'node:path';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DIR, read, sha } from './common';

/** 文件读取只留在实验装配层；公共运行时只接收已加载的模型。 */
export function loadParentValueModel(calibrationPrefix: string): DualStreamModel | undefined {
    const config = read(path.join(calibrationPrefix, 'value-config.json'));
    if (!(config.parentMixture > 0)) return undefined;
    const prefix = path.resolve(DIR, calibrationPrefix, config.parentModelFile ?? 'parent-model');
    const bytes = fs.readFileSync(prefix + '.bin');
    if (sha(bytes) !== config.parentModelSha256) throw Error('父代价值模型SHA不符');
    return new DualStreamModel(read(prefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
