/** 常驻Python批量推理桥；协议失败立即终止，不回退其他策略。 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';
import type { DualObservation } from '../../src/ai_runtime/dual_v2/contract';

export class InferenceClient {
    private child;
    private buffer = Buffer.alloc(0);
    private pending: { resolve: (v: any[]) => void; reject: (e: Error) => void; timer: NodeJS.Timeout } | null = null;
    private failure: Error | null = null;
    constructor(python: string, script: string, device: string, model: string) {
        this.child = spawn(python, ['-u', script, '--device', device, '--model', model], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
        const fail = (error: Error) => { this.failure = error; if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; } };
        this.child.on('error', fail);
        this.child.on('exit', (code) => fail(Error(`推理进程退出：${code}`)));
        this.child.stdout.on('data', (chunk: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            if (this.buffer.length < 4) return;
            const size = this.buffer.readUInt32LE();
            if (size > 2 ** 28) { fail(Error('推理响应长度无效')); return; }
            if (this.buffer.length < size + 4 || !this.pending) return;
            const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
            try { pending.resolve(JSON.parse(this.buffer.subarray(4, size + 4).toString())); }
            catch (error) { pending.reject(error as Error); }
            this.buffer = this.buffer.subarray(size + 4);
        });
    }
    async forward(observations: DualObservation[]) {
        if (this.failure) throw this.failure;
        if (this.pending) throw Error('同一推理连接不允许重叠请求');
        const packed = packTensorBatch(observations, observations.map(() => ({ target: 0, policyMask: false, valueTarget: new Float32Array(6), valueMask: false, weight: 1 })));
        const metadata = Buffer.from(JSON.stringify({ ...packed.metadata, sources: observations.map(() => ({})) }));
        const header = Buffer.alloc(8); header.writeUInt32LE(metadata.length); header.writeUInt32LE(packed.bytes.length, 4);
        const result = new Promise<any[]>((resolve, reject) => {
            const timer = setTimeout(() => { this.pending = null; this.child.kill(); reject(Error('推理超时')); }, 120000);
            this.pending = { resolve, reject, timer };
        });
        this.child.stdin.write(Buffer.concat([header, metadata, packed.bytes]), error => {
            if (error && this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
        });
        return result;
    }
    async close() {
        if (this.child.exitCode !== null || this.child.signalCode !== null) return;
        const exited = once(this.child, 'exit');
        this.child.stdin.end();
        const timer = setTimeout(() => this.child.kill(), 5000);
        try { await exited; } finally { clearTimeout(timer); }
    }
}
