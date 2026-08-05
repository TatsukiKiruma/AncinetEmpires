import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { SkirmishEpisodeFeatureExportOptions } from './skirmish_episode_feature_export';
import type {
    OldDatasetWorkerRequest,
    OldDatasetWorkerResponse
} from './skirmish_old_dataset_worker';

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

function formatWorkerExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null) {
    return `迁移 worker pid=${child.pid ?? 'unknown'} 异常退出，code=${code ?? 'null'} signal=${signal ?? 'null'}`;
}

export function startOldDatasetWorkerTask(task: OldDatasetWorkerTask): OldDatasetWorkerHandle {
    const requestId = `${process.pid}-${task.workerId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const child = fork(WORKER_FILE, [], {
        cwd: process.cwd(),
        execArgv: process.execArgv,
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    let settled = false;

    const result = new Promise<string>((resolve, reject) => {
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        child.once('error', error => fail(error));
        child.once('exit', (code, signal) => {
            if (!settled) fail(new Error(formatWorkerExit(child, code, signal)));
        });
        child.on('message', message => {
            const response = message as OldDatasetWorkerResponse;
            if (
                response.kind !== 'skirmish_old_dataset_worker_result'
                || response.requestId !== requestId
            ) return;
            if (settled) return;
            settled = true;
            if (response.error) {
                const error = new Error(`worker ${task.workerId} / ${task.batchId}：${response.error.message}`);
                if (response.error.stack) error.stack = response.error.stack;
                reject(error);
                return;
            }
            if (!response.manifestFile) {
                reject(new Error(`worker ${task.workerId} / ${task.batchId} 未返回 manifest`));
                return;
            }
            resolve(response.manifestFile);
        });

        const request: OldDatasetWorkerRequest = {
            kind: 'skirmish_old_dataset_worker_run',
            requestId,
            workerId: task.workerId,
            batchId: task.batchId,
            exportOptions: task.exportOptions
        };
        child.send(request, error => {
            if (error) fail(error);
        });
    });

    return {
        result,
        terminate() {
            if (!child.killed) child.kill('SIGTERM');
        }
    };
}
