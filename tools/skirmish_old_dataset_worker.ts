import type { SkirmishEpisodeFeatureExportOptions } from './skirmish_episode_feature_export';
import { exportEpisodeFeatures } from './skirmish_episode_feature_export';

export interface OldDatasetWorkerRequest {
    kind: 'skirmish_old_dataset_worker_run';
    requestId: string;
    workerId: number;
    batchId: string;
    exportOptions: SkirmishEpisodeFeatureExportOptions;
}

export interface OldDatasetWorkerResponse {
    kind: 'skirmish_old_dataset_worker_result';
    requestId: string;
    workerId: number;
    batchId: string;
    manifestFile?: string;
    error?: {
        message: string;
        stack?: string;
    };
}

function sendResponse(response: OldDatasetWorkerResponse) {
    if (!process.send) throw new Error('迁移 worker 缺少 IPC 通道');
    process.send(response, () => process.exit(response.error ? 1 : 0));
}

process.once('message', async message => {
    const request = message as OldDatasetWorkerRequest;
    if (request.kind !== 'skirmish_old_dataset_worker_run') {
        sendResponse({
            kind: 'skirmish_old_dataset_worker_result',
            requestId: request.requestId ?? 'unknown',
            workerId: request.workerId ?? 0,
            batchId: request.batchId ?? 'unknown',
            error: { message: '迁移 worker 收到未知任务' }
        });
        return;
    }

    try {
        const summary = await exportEpisodeFeatures(request.exportOptions);
        if (!summary.manifestFile) {
            throw new Error(`checkpoint ${request.batchId} 未生成 manifest`);
        }
        sendResponse({
            kind: 'skirmish_old_dataset_worker_result',
            requestId: request.requestId,
            workerId: request.workerId,
            batchId: request.batchId,
            manifestFile: summary.manifestFile
        });
    } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        sendResponse({
            kind: 'skirmish_old_dataset_worker_result',
            requestId: request.requestId,
            workerId: request.workerId,
            batchId: request.batchId,
            error: {
                message: normalized.message,
                ...(normalized.stack ? { stack: normalized.stack } : {})
            }
        });
    }
});
