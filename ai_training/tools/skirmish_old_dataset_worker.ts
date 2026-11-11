import { createDefaultEnvFactory, type SkirmishDatasetEnvFactory } from './skirmish_dataset_export';
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
    process.send(response);
}

const factories = new Map<string, Promise<SkirmishDatasetEnvFactory>>();
process.on('disconnect', () => process.exit(0));

process.on('message', async message => {
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
        const options = request.exportOptions;
        const key = JSON.stringify([options.unpackDir, options.sdTrainingPlanFile ?? null]);
        let factory = factories.get(key);
        if (!factory) {
            factory = createDefaultEnvFactory(options.unpackDir, options.sdTrainingPlanFile ?? null);
            factories.set(key, factory);
        }
        const summary = await exportEpisodeFeatures(options, await factory);
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
