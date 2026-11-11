import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import type { DualObservation } from '../../../src/ai_runtime/dual_v2/contract';
import type { BatchedSearchModel } from '../../../src/ai_runtime/dual_v3/batched_search_types';
import path from 'node:path';
import { DATA, HERE, ROOT } from './arena_io';
import { InferenceTransport, type TransportLaunch } from '../stage4_v7/inference_transport';
import { SearchBudgetExpiredError } from '../../../src/ai_runtime/dual_v3/search_budget';

/** 独立升级服务复用已验证的二进制传输，旧推理脚本及客户端协议保持兼容。 */
export class Stage4InferenceClient implements BatchedSearchModel {
    readonly supportsValueOnly = true;
    private readonly transport: InferenceTransport;
    private packMs = 0;
    get pid() { return this.transport.pid; }
    get exited() { return this.transport.exited; }
    get diagnostics() { return { ...this.transport.diagnostics, packMs: this.packMs }; }
    setLabel(label: string) { this.transport.setLabel(label); }
    constructor(prefix: string, options: { launch?: TransportLaunch; watchdogMs?: number } = {}) {
        process.env.MIOPEN_USER_DB_PATH = path.join(DATA, 'miopen-db');
        process.env.MIOPEN_CUSTOM_CACHE_DIR = path.join(DATA, 'miopen-cache');
        this.transport = new InferenceTransport(options.launch ?? { command: path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe'), args: ['-u', path.join(HERE, 'infer.py'), '--device', 'cuda:0', '--model', prefix] }, options.watchdogMs);
    }
    async forwardBatch(observations: DualObservation[], context?: { deadline: number; valueOnly?: boolean }) {
        if (!observations.length || observations.length > 128) throw Error('第四阶段批次必须为1至128');
        if (context && performance.now() >= context.deadline) throw new SearchBudgetExpiredError();
        const tick = performance.now();
        const packed = packTensorBatch(observations, observations.map(() => ({ target: 0, policyMask: false, valueTarget: new Float32Array(6), valueMask: false, weight: 1 })));
        const metadata = Buffer.from(JSON.stringify({ ...packed.metadata, valueOnly: Boolean(context?.valueOnly), sources: observations.map(() => ({})) }));
        const header = Buffer.alloc(8); header.writeUInt32LE(metadata.length); header.writeUInt32LE(packed.bytes.length, 4);
        const payload = Buffer.concat([header, metadata, packed.bytes]); this.packMs += performance.now() - tick;
        return this.transport.request(payload, observations.length, context?.deadline);
    }
    async close() {
        await this.transport.close();
    }
}
