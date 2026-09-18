import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { SkirmishEpisodeFeatureExportOptions } from './skirmish_episode_feature_export';
import type { OldDatasetWorkerRequest, OldDatasetWorkerResponse } from './skirmish_old_dataset_worker';

export interface OldDatasetWorkerTask {
    workerId: number;
    batchId: string;
    exportOptions: SkirmishEpisodeFeatureExportOptions;
}

export interface OldDatasetWorkerHandle {
    result: Promise<string>;
    terminate(): void;
}

const WORKER_FILE = fileURLToPath(new URL('./skirmish_old_dataset_worker.ts', import.meta.url));

class DatasetWorker {
    readonly child: ChildProcess;
    private failure: Error | null = null;
    private pending: { requestId: string; resolve: (file: string) => void; reject: (error: Error) => void } | null = null;
    private sequence = 0;

    constructor(execArgv: string[]) {
        this.child = fork(WORKER_FILE, [], {
            cwd: process.cwd(), execArgv,
            stdio: ['ignore', 'inherit', 'inherit', 'ipc']
        });
        this.child.on('error', error => this.fail(error));
        this.child.on('exit', (code, signal) => this.fail(new Error(
            `迁移 worker pid=${this.child.pid} 退出，code=${code} signal=${signal}`
        )));
        this.child.on('message', message => {
            const response = message as OldDatasetWorkerResponse;
            if (response.kind !== 'skirmish_old_dataset_worker_result'
                || response.requestId !== this.pending?.requestId) return;
            const pending = this.pending;
            this.pending = null;
            if (response.error) pending.reject(new Error(`worker ${response.workerId} / ${response.batchId}：${response.error.message}`));
            else if (response.manifestFile) pending.resolve(response.manifestFile);
            else pending.reject(new Error(`worker ${response.workerId} 未返回 manifest`));
        });
    }

    private fail(error: Error) {
        this.failure = error;
        this.pending?.reject(error);
        this.pending = null;
    }

    run(task: OldDatasetWorkerTask): OldDatasetWorkerHandle {
        if (this.failure) throw this.failure;
        if (this.pending) throw new Error(`worker ${task.workerId} 尚未完成上一批任务`);
        const requestId = `${process.pid}-${task.workerId}-${++this.sequence}`;
        const result = new Promise<string>((resolve, reject) => {
            this.pending = { requestId, resolve, reject };
            const request: OldDatasetWorkerRequest = { kind: 'skirmish_old_dataset_worker_run', requestId, ...task };
            this.child.send(request, error => { if (error) this.fail(error); });
        });
        return { result, terminate: () => this.child.kill('SIGTERM') };
    }

    async close(): Promise<void> {
        if (!this.child.pid || this.child.exitCode !== null || this.child.signalCode !== null) return;
        await new Promise<void>(resolve => {
            this.child.once('exit', () => resolve());
            this.child.kill('SIGTERM');
        });
    }
}

/** 每个调度槽复用一个进程，批次之间保留模块和地图缓存。 */
export class OldDatasetWorkerPool {
    private readonly workers = new Map<number, DatasetWorker>();

    constructor(private readonly execArgv = process.execArgv) {}

    startTask(task: OldDatasetWorkerTask): OldDatasetWorkerHandle {
        let worker = this.workers.get(task.workerId);
        if (!worker) {
            worker = new DatasetWorker(this.execArgv);
            this.workers.set(task.workerId, worker);
        }
        return worker.run(task);
    }

    get workerPids(): number[] {
        return [...this.workers.values()].map(worker => worker.child.pid!);
    }

    async close(): Promise<void> {
        await Promise.all([...this.workers.values()].map(worker => worker.close()));
        this.workers.clear();
    }
}
