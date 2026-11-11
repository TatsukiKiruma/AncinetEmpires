import { parentPort } from 'node:worker_threads';
import type { DualObservation } from '../../../src/ai_runtime/dual_v2/contract';

/** 每个 worker 内允许多局异步推理，通过请求 ID 找回对应等待者。 */
export class WorkerModel {
    readonly supportsValueOnly = true;
    private id = 0;
    private pending = new Map<number, { resolve: (value: any[]) => void; reject: (error: Error) => void }>();
    constructor() {
        if (!parentPort) throw Error('必须在工作线程中使用');
        parentPort.on('message', message => {
            if (message.type !== 'inference_result') return;
            const request = this.pending.get(message.id);
            if (!request) throw Error('推理响应ID不匹配');
            this.pending.delete(message.id);
            if (message.error) request.reject(Error(message.error)); else request.resolve(message.rows);
        });
        parentPort.on('close', () => {
            this.pending.forEach(r => r.reject(Error('主线程通信已关闭'))); this.pending.clear();
        });
    }
    forwardBatch(observations: DualObservation[], context?: { valueOnly?: boolean }) {
        const id = ++this.id;
        return new Promise<any[]>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            parentPort!.postMessage({ type: 'inference', id, observations, valueOnly: !!context?.valueOnly });
        });
    }
}
