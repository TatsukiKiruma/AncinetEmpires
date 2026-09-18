import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { selectEpisodeStepIndexes, StreamingSampleQuota, type EpisodeStepSelectionOptions,
    type StreamingSampleQuotaOptions, type StreamingSampleQuotaSnapshot } from './skirmish_training_sampling';
import type { SkirmishEpisodeRecord } from './skirmish_training_runner';

interface QuotaBatch {
    inputFile: string;
    startEpisode: number;
    episodeCount: number;
    initialQuotaSnapshot?: StreamingSampleQuotaSnapshot;
}

/** 按串行输入顺序预分配配额，只读取棋谱，不运行引擎或教师。 */
export async function prepareCheckpointQuotas(
    batches: QuotaBatch[],
    options: EpisodeStepSelectionOptions,
    quotaOptions: StreamingSampleQuotaOptions
): Promise<void> {
    const quota = new StreamingSampleQuota(quotaOptions);
    const byFile = new Map<string, QuotaBatch[]>();
    for (const batch of batches) {
        const group = byFile.get(batch.inputFile) ?? [];
        group.push(batch);
        byFile.set(batch.inputFile, group);
    }
    for (const [file, fileBatches] of byFile) {
        const starts = new Map(fileBatches.map(batch => [batch.startEpisode, batch]));
        let index = 0;
        const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
        for await (const line of lines) {
            if (!line.trim()) continue;
            const batch = starts.get(index++);
            if (batch) batch.initialQuotaSnapshot = quota.snapshot();
            const episode = JSON.parse(line) as SkirmishEpisodeRecord;
            if (episode.kind !== 'skirmish_episode') continue;
            const selection = selectEpisodeStepIndexes(episode, options);
            for (const stepIndex of selection.indexes) {
                const step = episode.steps[stepIndex];
                if (step.illegal) continue;
                quota.accept({ scenarioId: episode.scenario.id, policy: step.policy, actionCode: step.actionCode });
            }
        }
    }
}
