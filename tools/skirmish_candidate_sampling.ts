import { getActionTypeFromCode } from './skirmish_training_sampling';

export interface ScoredActionCode {
    actionCode: string;
    teacherScore: number;
}

export interface CandidateSamplingOptions {
    maxCandidates: number | null;
    hardNegativeRatio?: number;
    deterministicKey?: string;
}

export interface SampledCandidateCode extends ScoredActionCode {
    teacherRank: number;
    selectionReason: 'label' | 'hard_negative' | 'stratum' | 'fill' | 'all';
}

function stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function compareScoredActions(
    left: ScoredActionCode,
    right: ScoredActionCode,
    deterministicKey: string
): number {
    const scoreDelta = right.teacherScore - left.teacherScore;
    if (scoreDelta !== 0) return scoreDelta;
    return stableHash(`${deterministicKey}\0${left.actionCode}`)
        - stableHash(`${deterministicKey}\0${right.actionCode}`);
}

function clampRatio(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return 0.5;
    return Math.min(1, Math.max(0, value));
}

/**
 * 标签动作始终保留；其余位置由高教师分 hard negative 和动作类型分层共同占用。
 */
export function selectStratifiedHardNegativeCandidates(
    scoredActions: readonly ScoredActionCode[],
    labelActionCode: string,
    options: CandidateSamplingOptions
): SampledCandidateCode[] {
    const deterministicKey = options.deterministicKey ?? '';
    const uniqueByCode = new Map<string, ScoredActionCode>();
    for (const action of scoredActions) {
        uniqueByCode.set(action.actionCode, action);
    }
    const uniqueActions = [...uniqueByCode.values()];
    const label = uniqueByCode.get(labelActionCode);
    if (!label) return [];

    const ranked = [...uniqueActions].sort((left, right) => (
        compareScoredActions(left, right, deterministicKey)
    ));
    const rankByCode = new Map(ranked.map((action, index) => [action.actionCode, index + 1]));
    const limit = options.maxCandidates === null
        ? uniqueActions.length
        : Math.max(1, Math.min(uniqueActions.length, Math.floor(options.maxCandidates)));

    if (limit >= uniqueActions.length) {
        return uniqueActions.map(action => ({
            ...action,
            teacherRank: rankByCode.get(action.actionCode)!,
            selectionReason: action.actionCode === labelActionCode ? 'label' : 'all'
        }));
    }

    const selected = new Map<string, SampledCandidateCode>();
    const add = (
        action: ScoredActionCode,
        selectionReason: SampledCandidateCode['selectionReason']
    ) => {
        if (selected.size >= limit || selected.has(action.actionCode)) return false;
        selected.set(action.actionCode, {
            ...action,
            teacherRank: rankByCode.get(action.actionCode)!,
            selectionReason
        });
        return true;
    };
    add(label, 'label');

    const negativeSlots = Math.max(0, limit - 1);
    const hardNegativeSlots = Math.min(
        negativeSlots,
        Math.round(negativeSlots * clampRatio(options.hardNegativeRatio))
    );
    for (const action of ranked) {
        if (selected.size >= 1 + hardNegativeSlots) break;
        if (action.actionCode !== labelActionCode) add(action, 'hard_negative');
    }

    const strata = new Map<string, ScoredActionCode[]>();
    for (const action of ranked) {
        if (selected.has(action.actionCode)) continue;
        const actionType = getActionTypeFromCode(action.actionCode);
        const bucket = strata.get(actionType) ?? [];
        bucket.push(action);
        strata.set(actionType, bucket);
    }
    const stratumTypes = [...strata.keys()].sort((left, right) => (
        stableHash(`${deterministicKey}\0${left}`)
        - stableHash(`${deterministicKey}\0${right}`)
    ));
    let stratumOffset = 0;
    while (selected.size < limit && stratumTypes.length > 0) {
        let addedInRound = false;
        for (const actionType of stratumTypes) {
            const candidate = strata.get(actionType)?.[stratumOffset];
            if (candidate && add(candidate, 'stratum')) addedInRound = true;
            if (selected.size >= limit) break;
        }
        if (!addedInRound) break;
        stratumOffset += 1;
    }

    for (const action of ranked) {
        if (selected.size >= limit) break;
        add(action, 'fill');
    }
    return [...selected.values()];
}
