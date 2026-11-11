/** 同一手机内的同步前向桥接，使既有同步搜索直接使用冻结PyTorch 2M模型。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';

export class SyncInference {
    child: ReturnType<typeof spawn>;
    request: number;
    response: number;
    buffered = Buffer.alloc(0);
    serial = 0;
    ready: any;
    counters = { calls: 0, forwardMs: 0, rpcMs: 0, collateMs: 0 };
    private sleeper = new Int32Array(new SharedArrayBuffer(4));
    constructor(private readonly work: string) {
        const ipc = path.join(work, 'ipc'); fs.mkdirSync(ipc, { recursive: true });
        const request = path.join(ipc, 'request.fifo'), response = path.join(ipc, 'response.fifo');
        assert.ok(!fs.existsSync(request) && !fs.existsSync(response), '已有推理通道，拒绝重复启动');
        const made = spawnSync('/usr/bin/mkfifo', [request, response], { encoding: 'utf8' });
        assert.equal(made.status, 0, made.stderr);
        this.response = fs.openSync(response, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
        this.request = fs.openSync(request, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
        this.child = spawn('/opt/torch-env/bin/python', ['-u', path.join(work, 'infer.py'), request, response],
            { cwd: work, env: { ...process.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '1' }, stdio: ['ignore', 'inherit', 'inherit'] });
        this.ready = this.readLine();
        assert.ok(this.ready.ready && this.ready.training === false);
    }
    resetCounters() { this.counters = { calls: 0, forwardMs: 0, rpcMs: 0, collateMs: 0 }; }
    private readLine(): any {
        const deadline = performance.now() + 120000, scratch = Buffer.alloc(65536);
        for (;;) {
            const end = this.buffered.indexOf(10);
            if (end >= 0) {
                const line = this.buffered.subarray(0, end).toString('utf8'); this.buffered = this.buffered.subarray(end + 1);
                return JSON.parse(line);
            }
            assert.ok(performance.now() < deadline, '手机同步前向等待超过120秒');
            try {
                const count = fs.readSync(this.response, scratch, 0, scratch.length, null);
                if (count > 0) this.buffered = Buffer.concat([this.buffered, scratch.subarray(0, count)]);
                else Atomics.wait(this.sleeper, 0, 0, 1);
            } catch (error: any) {
                if (error.code !== 'EAGAIN' && error.code !== 'EWOULDBLOCK') throw error;
                Atomics.wait(this.sleeper, 0, 0, 1);
            }
        }
    }
    forwardSync(observation: any, warmup = false) {
        const start = performance.now();
        const packet = packTensorBatch([observation], [{ target: 0, policyMask: false, valueMask: false, valueTarget: new Float32Array(6), weight: 1 }]);
        const id = ++this.serial, metadata = Buffer.from(JSON.stringify({ ...packet.metadata, id, warmup }));
        const header = Buffer.alloc(8); header.writeUInt32LE(metadata.length); header.writeUInt32LE(packet.bytes.length, 4);
        const body = Buffer.concat([header, metadata, packet.bytes]); let offset = 0;
        const deadline = performance.now() + 120000;
        while (offset < body.length) {
            assert.ok(performance.now() < deadline, '手机同步请求发送超时');
            try { offset += fs.writeSync(this.request, body, offset, body.length - offset); }
            catch (error: any) {
                if (error.code !== 'EAGAIN' && error.code !== 'EWOULDBLOCK') throw error;
                Atomics.wait(this.sleeper, 0, 0, 1);
            }
        }
        const result = this.readLine(); assert.equal(result.id, id); assert.ok(!result.error, result.error);
        this.counters.calls++; this.counters.forwardMs += result.forwardMs;
        this.counters.collateMs += result.collateMs; this.counters.rpcMs += performance.now() - start;
        return { logits: Float32Array.from(result.logits), valueLogits: Float32Array.from(result.valueLogits),
            valueProbs: Float32Array.from(result.valueProbs), actorPrior: Float32Array.from(result.actorPrior),
            conditionalPrior: new Float32Array(0) };
    }
    async forward(observation: any, warmup = false) { return this.forwardSync(observation, warmup); }
    async close() {
        fs.closeSync(this.request); fs.closeSync(this.response);
        await new Promise<void>(resolve => { if (this.child.exitCode !== null) resolve(); else this.child.once('exit', () => resolve()); });
    }
}
