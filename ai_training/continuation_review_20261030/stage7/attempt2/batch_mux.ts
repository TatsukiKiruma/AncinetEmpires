import type { DualObservation } from '../../../src/ai_runtime/dual_v2/contract';
import { ClientV2 } from './client_v2';

type Request = { id: number; observations: DualObservation[]; valueOnly: boolean; at: number;
    resolve: (rows: any[]) => void; reject: (error: Error) => void };

/** 跨 worker/对局合批，只有同模式请求可共用物理批，返回按原请求 ID 分发。 */
export class BatchMux {
    private nextId = 0;
    private queue: Request[] = [];
    private timer?: NodeJS.Timeout;
    private active = new Set<number>();
    private closed = false;
    private failure: Error | null = null;
    private running = new Set<Promise<void>>();
    readonly batches: number[] = [];
    readonly waits: number[] = [];
    readonly clients: ClientV2[];
    constructor(readonly coalesceMs: number, services = 1, mode = 'default') {
        if (![.5, 1, 2].includes(coalesceMs) || ![1, 2].includes(services)) throw Error('不支持的合批窗口或服务数');
        this.clients = Array.from({ length: services }, () => new ClientV2(mode));
    }
    forwardBatch(observations: DualObservation[], context?: { valueOnly?: boolean }) {
        if (this.failure) return Promise.reject(this.failure);
        if (this.closed || !observations.length || observations.length > 256) return Promise.reject(Error('请求批次无效或服务已关闭'));
        return new Promise<any[]>((resolve, reject) => {
            this.queue.push({ id: ++this.nextId, observations, valueOnly: !!context?.valueOnly, at: performance.now(), resolve, reject });
            this.schedule();
        });
    }
    private schedule() {
        if (this.timer || !this.queue.length || this.closed || this.active.size === this.clients.length) return;
        this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, this.coalesceMs);
    }
    private flush() {
        for (const [index, client] of this.clients.entries()) {
            if (!this.queue.length || this.active.has(index)) continue;
            const mode = this.queue[0].valueOnly, selected: Request[] = [];
            let size = 0;
            this.queue = this.queue.filter(request => {
                if (request.valueOnly !== mode || size + request.observations.length > 256) return true;
                selected.push(request); size += request.observations.length; return false;
            });
            this.active.add(index); this.batches.push(size);
            const at = performance.now(); selected.forEach(r => this.waits.push(at - r.at));
            const work = client.forwardBatch(selected.flatMap(r => r.observations), { valueOnly: mode }).then(rows => {
                let start = 0;
                for (const request of selected) {
                    request.resolve(rows.slice(start, start + request.observations.length)); start += request.observations.length;
                }
            }).catch(error => {
                this.failure = error; selected.forEach(r => r.reject(error)); this.queue.splice(0).forEach(r => r.reject(error));
            }).finally(() => { this.active.delete(index); this.running.delete(work); this.schedule(); });
            this.running.add(work);
        }
    }
    async close() {
        this.closed = true; clearTimeout(this.timer);
        this.queue.splice(0).forEach(r => r.reject(Error('合批器关闭')));
        await Promise.allSettled([...this.running]);
        await Promise.allSettled(this.clients.map(c => c.close()));
    }
}
