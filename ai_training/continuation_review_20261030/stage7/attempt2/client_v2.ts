import path from 'node:path';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { InferenceTransport } from './transport_v2';
import type { DualObservation } from '../../../src/ai_runtime/dual_v2/contract';
const root = path.resolve(import.meta.dirname, '../../..');

/** 单服务串行传输层；跨局调度在其上按请求身份合批。 */
export class ClientV2 {
    readonly supportsValueOnly = true;
    readonly transport: InferenceTransport;
    constructor(mode = 'default', threads = 2) {
        const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', STAGE7_THREADS: String(threads) };
        if (mode === 'default') delete env.MIOPEN_FIND_MODE;
        else env.MIOPEN_FIND_MODE = mode;
        this.transport = new InferenceTransport({ command: path.join(root, 'ai_training/.venv-rocm/Scripts/python.exe'),
            args: ['-B', '-u', path.join(import.meta.dirname, 'service_v2.py')], env }, 120000);
    }
    get exited() { return this.transport.exited; }
    get exitCode() { return this.transport.exitCode; }
    async forwardBatch(observations: DualObservation[], context?: { valueOnly?: boolean }) {
        const packed = packTensorBatch(observations, observations.map(() => ({ target: 0, policyMask: false,
            valueTarget: new Float32Array(6), valueMask: false, weight: 1 })));
        const meta = Buffer.from(JSON.stringify({ ...packed.metadata, sources: observations.map(() => ({})), valueOnly: !!context?.valueOnly }));
        const header = Buffer.alloc(8);
        header.writeUInt32LE(meta.length); header.writeUInt32LE(packed.bytes.length, 4);
        return this.transport.request(Buffer.concat([header, meta, packed.bytes]), observations.length);
    }
    async close() { await this.transport.close(); }
}
