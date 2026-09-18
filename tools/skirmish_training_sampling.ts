import type {
    SkirmishEpisodeRecord,
    SkirmishEpisodeStep
} from './skirmish_training_runner';

export interface EpisodeStepSelectionOptions {
    retainTimeoutPrefix?: boolean;
    timeoutPrefixTurns?: number | null;
    timeoutTailTurns?: number;
    retainMaxStepPrefix?: boolean;
    retainStagnationPrefix?: boolean;
    maxSamplesPerEpisode?: number | null;
}

export interface EpisodeStepSelectionResult {
    indexes: number[];
    eligibleCount: number;
    droppedByTruncation: number;
    droppedByEpisodeQuota: number;
    truncationKind: 'none' | 'timeout' | 'max_steps' | 'stagnation';
}

export interface StreamingSampleQuotaOptions {
    maxSamples?: number | null;
    maxPerScenario?: number | null;
    maxPerPolicy?: number | null;
    maxPerActionType?: number | null;
    maxByActionType?: Readonly<Record<string, number>>;
}

export interface StreamingSampleQuotaKey {
    scenarioId: string;
    policy: string;
    actionCode: string | null;
}

export interface StreamingSampleQuotaSnapshot {
    accepted: number;
    rejected: number;
    byScenario: Record<string, number>;
    byPolicy: Record<string, number>;
    byActionType: Record<string, number>;
}

const DEFAULT_TIMEOUT_PREFIX_TURNS = 80;
const DEFAULT_TIMEOUT_TAIL_TURNS = 20;

function normalizeLimit(value: number | null | undefined): number | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return Math.max(0, Math.floor(value));
}

function getTruncationKind(
    episode: SkirmishEpisodeRecord
): EpisodeStepSelectionResult['truncationKind'] {
    if (episode.summary.timeout) return 'timeout';
    if (episode.summary.stoppedByStagnation) return 'stagnation';
    if (episode.summary.stoppedByMaxSteps) return 'max_steps';
    return 'none';
}

function selectEvenlySpacedIndexes(indexes: readonly number[], limit: number): number[] {
    if (limit <= 0) return [];
    if (indexes.length <= limit) return [...indexes];
    if (limit === 1) return [indexes[Math.floor((indexes.length - 1) / 2)]];

    const selected: number[] = [];
    for (let slot = 0; slot < limit; slot += 1) {
        const position = Math.round(slot * (indexes.length - 1) / (limit - 1));
        selected.push(indexes[position]);
    }
    return selected;
}

function getTimeoutCutoffTurn(
    steps: readonly SkirmishEpisodeStep[],
    options: EpisodeStepSelectionOptions
): number {
    const firstTurn = steps[0]?.turnBefore ?? 0;
    const lastTurn = steps.at(-1)?.turnBefore ?? firstTurn;
    const prefixTurns = normalizeLimit(options.timeoutPrefixTurns)
        ?? DEFAULT_TIMEOUT_PREFIX_TURNS;
    const tailTurns = normalizeLimit(options.timeoutTailTurns)
        ?? DEFAULT_TIMEOUT_TAIL_TURNS;
    const prefixCutoff = firstTurn + Math.max(0, prefixTurns - 1);
    const tailCutoff = lastTurn - tailTurns;
    return Math.min(prefixCutoff, tailCutoff);
}

/**
 * 截断局不再整局丢弃：保留可信前缀，并在局内配额生效时均匀覆盖前、中、后段。
 */
export function selectEpisodeStepIndexes(
    episode: SkirmishEpisodeRecord,
    options: EpisodeStepSelectionOptions = {}
): EpisodeStepSelectionResult {
    const truncationKind = getTruncationKind(episode);
    let eligibleIndexes = episode.steps.map((_, index) => index);

    if (truncationKind === 'timeout') {
        if (options.retainTimeoutPrefix === false) {
            eligibleIndexes = [];
        } else {
            const cutoffTurn = getTimeoutCutoffTurn(episode.steps, options);
            eligibleIndexes = eligibleIndexes.filter(index => (
                episode.steps[index].turnBefore <= cutoffTurn
            ));
        }
    } else if (truncationKind === 'max_steps' && options.retainMaxStepPrefix === false) {
        eligibleIndexes = [];
    } else if (truncationKind === 'stagnation' && options.retainStagnationPrefix === false) {
        eligibleIndexes = [];
    }

    const eligibleCount = eligibleIndexes.length;
    const episodeLimit = normalizeLimit(options.maxSamplesPerEpisode);
    const indexes = episodeLimit === null
        ? eligibleIndexes
        : selectEvenlySpacedIndexes(eligibleIndexes, episodeLimit);

    return {
        indexes,
        eligibleCount,
        droppedByTruncation: episode.steps.length - eligibleCount,
        droppedByEpisodeQuota: eligibleCount - indexes.length,
        truncationKind
    };
}

export function getActionTypeFromCode(actionCode: string | null): string {
    if (!actionCode) return 'unknown';
    const separator = actionCode.indexOf(':');
    return separator < 0 ? actionCode : actionCode.slice(0, separator);
}

/**
 * 流式样本级配额。计数只在样本真正接收时递增，可同时限制总量、场景、策略和动作类型。
 */
export class StreamingSampleQuota {
    private accepted = 0;
    private rejected = 0;
    private readonly byScenario = new Map<string, number>();
    private readonly byPolicy = new Map<string, number>();
    private readonly byActionType = new Map<string, number>();

    constructor(
        private readonly options: StreamingSampleQuotaOptions = {},
        private readonly initial?: StreamingSampleQuotaSnapshot
    ) {
        if (initial) {
            this.accepted = initial.accepted;
            this.rejected = initial.rejected;
            for (const [key, value] of Object.entries(initial.byScenario)) this.byScenario.set(key, value);
            for (const [key, value] of Object.entries(initial.byPolicy)) this.byPolicy.set(key, value);
            for (const [key, value] of Object.entries(initial.byActionType)) this.byActionType.set(key, value);
        }
    }

    accept(key: StreamingSampleQuotaKey): boolean {
        const actionType = getActionTypeFromCode(key.actionCode);
        const limits: Array<[number, number | null]> = [
            [this.accepted, normalizeLimit(this.options.maxSamples)],
            [this.byScenario.get(key.scenarioId) ?? 0, normalizeLimit(this.options.maxPerScenario)],
            [this.byPolicy.get(key.policy) ?? 0, normalizeLimit(this.options.maxPerPolicy)],
            [
                this.byActionType.get(actionType) ?? 0,
                normalizeLimit(this.options.maxByActionType?.[actionType])
                    ?? normalizeLimit(this.options.maxPerActionType)
            ]
        ];
        if (limits.some(([count, limit]) => limit !== null && count >= limit)) {
            this.rejected += 1;
            return false;
        }

        this.accepted += 1;
        this.byScenario.set(key.scenarioId, (this.byScenario.get(key.scenarioId) ?? 0) + 1);
        this.byPolicy.set(key.policy, (this.byPolicy.get(key.policy) ?? 0) + 1);
        this.byActionType.set(actionType, (this.byActionType.get(actionType) ?? 0) + 1);
        return true;
    }

    snapshot(): StreamingSampleQuotaSnapshot {
        // 并行批次从全局前缀继续计数，报告仅统计本批新增的样本。
        const delta = (counts: Map<string, number>, initial: Record<string, number> = {}) => (
            Object.fromEntries([...counts].map(([key, value]) => [key, value - (initial[key] ?? 0)])
                .filter(([, value]) => Number(value) > 0))
        );
        return {
            accepted: this.accepted - (this.initial?.accepted ?? 0),
            rejected: this.rejected - (this.initial?.rejected ?? 0),
            byScenario: delta(this.byScenario, this.initial?.byScenario),
            byPolicy: delta(this.byPolicy, this.initial?.byPolicy),
            byActionType: delta(this.byActionType, this.initial?.byActionType)
        };
    }
}
