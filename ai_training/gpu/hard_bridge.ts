/** 为同步困难脚本提供真实GPU数值回调；模型、规则与AI控制流都不在桥中。 */
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HardMovementBatch, HardMovementResult } from '../../src/game/ai/runtime/apk_hard_compute';

export class HardGpuBridge {
    private readonly control = new Int32Array(new SharedArrayBuffer(8));
    private readonly bytes = new Uint8Array(new SharedArrayBuffer(4 * 1024 * 1024));
    private readonly worker: Worker;
    private failure: Error | null = null;
    private readonly cache = new Map<string, HardMovementResult>();
    readonly identity: Record<string, unknown>;
    readonly stats = { requests: 0, candidates: 0, cacheHits: 0, cachedCandidates: 0, kernelAndTransferSeconds: 0, bridgeMs: 0 };
    constructor(python: string, device = 'cuda:0', private readonly cacheEntries = 2048) {
        const here = path.dirname(fileURLToPath(import.meta.url));
        this.worker = new Worker(path.join(here, 'hard_bridge_worker.cjs'), { workerData: {
            python, script: path.join(here, 'hard_kernel.py'), device,
            control: this.control.buffer, bytes: this.bytes.buffer,
        } });
        this.worker.on('error', error => { this.failure = error; });
        try { this.identity = this.receive(); if (!this.identity.ready) throw Error('GPU未完成握手'); }
        catch (error) { this.worker.postMessage('close'); throw error; }
    }
    private receive(): any {
        if (Atomics.wait(this.control, 0, 0, 30000) === 'timed-out') {
            this.failure = Error('GPU响应超过30秒'); this.worker.postMessage('close'); throw this.failure;
        }
        const value = JSON.parse(Buffer.from(this.bytes.subarray(0, Atomics.load(this.control, 1))).toString());
        if (value.error) { this.failure = Error(value.error); throw this.failure; }
        return value;
    }
    compute = (input: HardMovementBatch): HardMovementResult => {
        this.assertHealthy();
        // 只复用此前GPU已计算的同一完整输入；不以CPU计算结果填充缓存。
        const key = JSON.stringify(input), cached = this.cache.get(key);
        if (cached) {
            this.stats.cacheHits++; this.stats.cachedCandidates += input.positions.length;
            return structuredClone(cached);
        }
        const start = performance.now();
        Atomics.store(this.control, 0, 0);
        this.worker.postMessage(input);
        const answer = this.receive();
        this.stats.requests++; this.stats.candidates += input.positions.length;
        this.stats.kernelAndTransferSeconds += answer.seconds;
        this.stats.bridgeMs += performance.now() - start;
        if (this.cacheEntries > 0) {
            if (this.cache.size >= this.cacheEntries) this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(key, structuredClone(answer.result));
        }
        return answer.result;
    };
    assertHealthy() { if (this.failure) throw this.failure; }
    /** 性能对照时清理跨局缓存，避免用重复初态命中率冒充新局面加速。 */
    clearCache() { this.cache.clear(); }
    async close() {
        this.worker.postMessage('close');
        await new Promise<void>(resolve => {
            const timer = setTimeout(() => { void this.worker.terminate(); resolve(); }, 5000);
            this.worker.once('exit', () => { clearTimeout(timer); resolve(); });
        });
    }
}
