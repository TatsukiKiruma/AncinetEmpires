import path from 'node:path';
import { InferenceTransport } from '../stage4_v7/inference_transport';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import type { DualObservation } from '../../../src/ai_runtime/dual_v2/contract';
import { ROOT } from '../stage1/io';

/** 独立缓存目录，复用已验证的二进制协议与常驻异尺寸推理。 */
export class Client {
    transport: InferenceTransport;
    constructor(data: string) {
        this.transport = new InferenceTransport({command: path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe'),
            args: ['-u', path.join(ROOT, 'ai_training/continuation_review_20261030/stage4_v7/infer.py'), '--model',
                'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/best/final'],
            env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', MIOPEN_USER_DB_PATH: path.join(data, 'miopen-db'), MIOPEN_CUSTOM_CACHE_DIR: path.join(data, 'miopen-cache')}}, 120000);
    }
    async forward(rows: DualObservation[]) {
        const packed = packTensorBatch(rows, rows.map(() => ({target: 0, policyMask: false, valueTarget: new Float32Array(6), valueMask: false, weight: 1})));
        const meta = Buffer.from(JSON.stringify({...packed.metadata, sources: rows.map(() => ({}))}));
        const header = Buffer.alloc(8); header.writeUInt32LE(meta.length); header.writeUInt32LE(packed.bytes.length, 4);
        return this.transport.request(Buffer.concat([header, meta, packed.bytes]), rows.length);
    }
    close() { return this.transport.close(); }
}
