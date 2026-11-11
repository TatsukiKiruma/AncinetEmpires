import path from 'node:path';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { InferenceTransport } from '../stage7/transport_v2';
import type { DualObservation } from '../../../src/ai_runtime/dual_v2/contract';
const root = path.resolve(import.meta.dirname, '../../..');
export type ModelIdentity = { prefix: string; sha256: string };

/** 单服务串行传输层；跨局调度在其上按请求身份合批。 */
export class ClientV2 {
    readonly supportsValueOnly = true;
    readonly transport: InferenceTransport;
    closeMs: number | null = null;
    constructor(mode = 'default', threads = 2, model?: ModelIdentity, readonly legacyV6 = false) {
        const env: NodeJS.ProcessEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', STAGE7_THREADS: String(threads) };
        if (mode === 'default') delete env.MIOPEN_FIND_MODE;
        else env.MIOPEN_FIND_MODE = mode;
        const prefix = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final';
        const args = legacyV6 ? ['-B', '-u', path.join(import.meta.dirname, 'legacy_infer.py'), '--device', 'cuda:0', '--model', prefix]
            : ['-B', '-u', path.join(import.meta.dirname, model ? 'service_model.py' : 'service_v2.py'), ...(model ? [model.prefix, model.sha256] : [])];
        this.transport = new InferenceTransport({ command: path.join(root, 'ai_training/.venv-rocm/Scripts/python.exe'), args, env }, 120000);
    }
    get exited() { return this.transport.exited; }
    get exitCode() { return this.transport.exitCode; }
    async forwardBatch(observations: DualObservation[], context?: { valueOnly?: boolean }) {
        const inputs = context?.valueOnly && !this.legacyV6 ? observations.map(obs => ({ ...obs, actions: { ...obs.actions,
            pointers: new Int32Array(0), sourceIndices: new Int32Array(0), tilesByActor: new Map<number, Int32Array>() } })) : observations;
        const packed = packTensorBatch(inputs, observations.map(() => ({ target: 0, policyMask: false,
            valueTarget: new Float32Array(6), valueMask: false, weight: 1 })));
        const meta = Buffer.from(JSON.stringify({ ...packed.metadata, sources: observations.map(() => ({})), valueOnly: !!context?.valueOnly }));
        const header = Buffer.alloc(8);
        header.writeUInt32LE(meta.length); header.writeUInt32LE(packed.bytes.length, 4);
        return this.transport.request(Buffer.concat([header, meta, packed.bytes]), observations.length);
    }
    async close() { const at = performance.now(); await this.transport.close(); this.closeMs = performance.now() - at; }
}
