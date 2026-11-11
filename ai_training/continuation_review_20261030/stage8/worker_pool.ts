import { dispatchQueue, type DispatchHooks } from './dispatch_queue';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { BatchMux } from './batch_mux';
import type { ModelIdentity } from '../stage7/client_v2';

/** 有界线程池；每个线程同时处理固定数量的异步对局任务。 */
export class WorkerPool {
    readonly mux: BatchMux;
    readonly opponentMux?: BatchMux;
    onProgress?: (message: any) => void;
    lastRun = {stopped:false,dispatched:0};
    private workers: Worker[];
    private jobs = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>();
    private nextId = 0;
    private failure: Error | null = null;
    private closing = false;
    constructor(readonly workerCount: number, readonly gamesPerWorker: number, coalesceMs: number, services: number, mode: string,
        workerFile = 'search_worker.bundle.mjs', model?: ModelIdentity, separateC1 = false, legacyV6 = false, anchor?: ModelIdentity) {
        this.mux = new BatchMux(coalesceMs, separateC1 ? 1 : services, mode, model, legacyV6);
        if (separateC1) this.opponentMux = new BatchMux(coalesceMs, 1, mode, anchor);
        this.workers = Array.from({ length: workerCount }, () => {
            const worker = new Worker(path.join(import.meta.dirname, workerFile));
            worker.on('error', error => this.fail(error));
            worker.on('exit', code => { if (!this.closing) this.fail(Error(`工作线程意外退出：${code}`)); });
            worker.on('message', async message => {
                if (message.type === 'inference') {
                    try {
                        const route = message.model === 'C1' ? this.opponentMux ?? this.mux : this.mux;
                        const rows = await route.forwardBatch(message.observations, { valueOnly: message.valueOnly });
                        worker.postMessage({ type: 'inference_result', id: message.id, rows });
                    } catch (error) { this.fail(error as Error); }
                } else if (message.type === 'job_progress') {
                    try { this.onProgress?.(message); } catch (error) { this.fail(error as Error); }
                } else if (message.type === 'job_result') {
                    const job = this.jobs.get(message.id);
                    if (!job) { this.fail(Error('任务响应ID不匹配')); return; }
                    this.jobs.delete(message.id);
                    if (message.error) { const error = Error(message.error); job.reject(error); this.fail(error); } else job.resolve(message);
                }
            });
            return worker;
        });
    }
    private fail(error: Error) {
        this.failure = error; this.jobs.forEach(j => j.reject(error)); this.jobs.clear();
    }
    private job(worker: number, data: any): Promise<any> {
        if (this.failure) return Promise.reject(this.failure);
        // 联赛断点沿用原计划编号，跳过已完成局后不能重新编号。
        const { transportJobId, ...payload } = data;
        const id = transportJobId ?? this.nextId + 1;
        if (!Number.isSafeInteger(id) || id <= 0 || this.jobs.has(id)) return Promise.reject(Error('任务编号无效或重复'));
        this.nextId = Math.max(this.nextId, id);
        return new Promise((resolve, reject) => {
            this.jobs.set(id, { resolve, reject }); this.workers[worker].postMessage({ ...payload, type: 'job', id });
        });
    }
    async run(tasks: any[], onResult?: (result: any, index: number) => void, hooks: DispatchHooks = {}) {
        const run = await dispatchQueue(tasks, this.workerCount * this.gamesPerWorker,
            async (task, _index, lane) => {
                try { return await this.job(lane % this.workerCount, task); }
                catch (error) { this.fail(error as Error); throw error; }
            }, (reply,index) => {
                try { onResult?.(reply,index); }
                catch(error) { this.fail(error as Error); throw error; }
            }, {...hooks, shouldDispatch: () => !this.failure && (hooks.shouldDispatch?.() ?? true)});
        this.lastRun = {stopped:run.stopped,dispatched:run.dispatched};
        if (this.failure) throw this.failure;
        return run.results;
    }
    async close() {
        this.closing = true;
        this.fail(Error('线程池关闭'));
        await Promise.allSettled(this.workers.map(w => w.terminate()));
        await Promise.all([this.mux.close(), this.opponentMux?.close()]);
    }
}
