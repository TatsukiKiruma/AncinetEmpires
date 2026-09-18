import { sha256Text, stableJson } from './skirmish_dataset_artifacts';
import type { SkirmishFeatureSample } from './skirmish_bc_train';

export type VNextPartition = 'train' | 'dev-regression' | 'final-holdout-sealed' | 'quarantine-unknown-provenance' | 'unregistered';

export interface DatasetSampleVNext {
    kind: 'skirmish_dataset_sample_vnext';
    schemaVersion: 2;
    sampleId: string;
    /** sampleId 的规范化输入；validate 时重算防篡改 */
    sampleIdSeed: Record<string, unknown>;
    provenance: {
        rootFamilyKey: string;
        familyRegistered: boolean;
        partition: VNextPartition;
        sourceFile: string;
        episodeIndex: number;
        stepIndex: number;
        scenarioId: string;
        seed: number;
        initialObservationHash: string | null;
        stateReconstruction: 'full-observation' | 'episode-reference' | 'snapshot-reference' | 'irreversible-hashed-features';
    };
    representation: {
        featureExtractor: string | null;
        featureDim: number | null;
        rulesVersion: string | null;
        contractVersion: 'vnext-1';
    };
    behavior: {
        actionCode: string;
        executed: true;
        policy: string;
        playerId: number;
        step: number;
        turn: number;
        fixedActionIndex: number;
    };
    teacher: {
        actionCode: string;
        executed: false;
        evidence: 'counterfactual-advice';
        method: 'heuristic' | 'fast-rollout';
        scoreMargin: number;
        rolloutDepth: number;
    } | null;
    outcome: {
        termination: 'natural' | 'maxPlies' | 'maxSteps' | 'stagnation' | 'error' | 'unknown';
        result: 'naturalWin' | 'naturalLoss' | 'draw' | 'timeout' | 'stagnation' | 'runError' | 'unknown';
        terminated: boolean | null;
        truncated: boolean | null;
        perspectivePlayerId: number | null;
        outcomeSource: 'recorded-episode' | 'continuation-episode' | 'adjudication' | 'unknown' | null;
        reliability: 'verified' | 'unverified';
    };
    legality: { checked: boolean; legalInFixedActionSpace: boolean; errors: string[] };
    usableFor: 'trainable' | 'historical-baseline' | 'diagnostic' | 'quarantine';
}

export interface MigrationContext {
    /** split-manifest.json 家族表：key → partition */
    families: Map<string, { partition: VNextPartition }>;
    rulesVersion: string | null;
}

const ACTION_CODE_PREFIX = /^[a-z][a-z0-9_]*(:|$)/;
const PARTITIONS: VNextPartition[] = ['train', 'dev-regression', 'final-holdout-sealed', 'quarantine-unknown-provenance', 'unregistered'];

/** 根来源族定位：diagnostic 快照续局不独立于根快照；episode 按 scenarioId:seed */
export function resolveRootFamilyKey(sample: SkirmishFeatureSample, ctx: MigrationContext): string | null {
    const inputFile = String(sample.source?.inputFile ?? '');
    const diagnostic = /diagnostic-states[/\\](\d+)\.json$/.exec(inputFile);
    const key = diagnostic ? `derived_snapshot:diagnostic-${diagnostic[1]}` : `sd_episode:${sample.scenario?.id}:${sample.seed}`;
    return ctx.families.has(key) ? key : null;
}

export function migrateLegacyFeatureSample(sample: SkirmishFeatureSample, ctx: MigrationContext): DatasetSampleVNext {
    const relabeled = Boolean(sample.label?.relabel && sample.label?.originalActionCode);
    const behaviorActionCode = relabeled ? sample.label.originalActionCode! : sample.label?.actionCode ?? '';
    const teacher = sample.label?.relabel && relabeled
        ? { actionCode: sample.label.actionCode, executed: false as const, evidence: 'counterfactual-advice' as const, method: sample.label.relabel.method, scoreMargin: sample.label.relabel.scoreMargin, rolloutDepth: sample.label.relabel.rolloutDepth }
        : null;
    const familyKey = /diagnostic-states[/\\](\d+)\.json$/.exec(String(sample.source?.inputFile ?? '')) === null
        ? `sd_episode:${sample.scenario?.id}:${sample.seed}`
        : `derived_snapshot:diagnostic-${/diagnostic-states[/\\](\d+)\.json$/.exec(String(sample.source?.inputFile ?? ''))![1]}`;
    const family = ctx.families.get(familyKey);
    const initialObservationHash: string | null = (sample as unknown as { initialObservationHash?: string }).initialObservationHash ?? null;
    const isSnapshot = familyKey.startsWith('derived_snapshot:');

    const legalityErrors: string[] = [];
    const candidates = sample.candidates ?? [];
    const idx = sample.label?.fixedActionIndex;
    // 真实数据中 fixedActionIndex 是全局固定动作空间索引，candidates[] 是采样子集：
    // 两者下标不可互推（T04 迁移实测 327/328 样本因此误判），只分别做结构检查。
    if (!Number.isInteger(idx) || (idx as number) < 0) {
        legalityErrors.push(`label.fixedActionIndex 非非负整数：${idx}`);
    }
    if (!candidates.some(candidate => candidate.actionCode === sample.label?.actionCode)) {
        legalityErrors.push(`label 动作不在候选数组（missing from candidate array）：${sample.label?.actionCode}`);
    }
    if (!candidates.some(candidate => candidate.actionCode === behaviorActionCode)) {
        legalityErrors.push(`行为动作不在候选数组（missing from fixed action space）：${behaviorActionCode}`);
    }
    if (!ACTION_CODE_PREFIX.test(behaviorActionCode)) legalityErrors.push(`actionCode 结构非法：${behaviorActionCode}`);

    const sampleIdSeed: Record<string, unknown> = {
        rootFamilyKey: familyKey,
        sourceFile: sample.source?.inputFile ?? null,
        episodeIndex: sample.source?.episodeIndex ?? null,
        stepIndex: sample.source?.stepIndex ?? null,
        step: sample.step,
        playerId: sample.playerId,
        behaviorActionCode,
        teacherActionCode: teacher?.actionCode ?? null
    };

    return {
        kind: 'skirmish_dataset_sample_vnext',
        schemaVersion: 2,
        sampleId: sha256Text(stableJson(sampleIdSeed)),
        sampleIdSeed,
        provenance: {
            rootFamilyKey: familyKey,
            familyRegistered: Boolean(family),
            partition: family?.partition ?? 'unregistered',
            sourceFile: String(sample.source?.inputFile ?? ''),
            episodeIndex: Number(sample.source?.episodeIndex ?? -1),
            stepIndex: Number(sample.source?.stepIndex ?? -1),
            scenarioId: String(sample.scenario?.id ?? ''),
            seed: Number(sample.seed),
            initialObservationHash,
            // 旧哈希特征不可逆，无法从向量重建地图语义 → 只能按 episode 引用回放
            stateReconstruction: isSnapshot ? 'snapshot-reference' : 'irreversible-hashed-features'
        },
        representation: {
            featureExtractor: sample.featureExtractor ?? null,
            featureDim: sample.featureDim ?? null,
            rulesVersion: ctx.rulesVersion,
            contractVersion: 'vnext-1'
        },
        behavior: {
            actionCode: behaviorActionCode,
            executed: true,
            policy: String(sample.policy ?? ''),
            playerId: Number(sample.playerId),
            step: Number(sample.step),
            turn: Number(sample.turn),
            fixedActionIndex: relabeled ? candidates.findIndex(candidate => candidate.actionCode === behaviorActionCode) : Number(idx)
        },
        teacher,
        outcome: {
            termination: 'unknown',
            result: 'unknown',
            terminated: null,
            truncated: null,
            perspectivePlayerId: Number(sample.playerId),
            // 旧特征样本没有终局字段：只登记来源形态，不伪造结果
            outcomeSource: isSnapshot ? 'continuation-episode' : 'unknown',
            reliability: 'unverified'
        },
        legality: { checked: true, legalInFixedActionSpace: legalityErrors.length === 0, errors: legalityErrors },
        usableFor: legalityErrors.length > 0 ? 'quarantine' : 'historical-baseline'
    };
}

export function validateDatasetSampleVNext(value: unknown): string[] {
    const errors: string[] = [];
    const s = value as DatasetSampleVNext;
    if (!s || typeof s !== 'object') return ['样本不是对象'];
    if (s.kind !== 'skirmish_dataset_sample_vnext') errors.push(`kind 必须为 skirmish_dataset_sample_vnext，实际 ${String(s.kind)}`);
    if (s.schemaVersion !== 2) errors.push(`schemaVersion 必须为 2，实际 ${String(s.schemaVersion)}`);
    if (typeof s.sampleId !== 'string' || !/^[0-9a-f]{64}$/.test(s.sampleId)) errors.push('sampleId 必须是 64 位十六进制 sha256');
    else if (typeof s.sampleIdSeed !== 'object' || s.sampleIdSeed === null) errors.push('缺少 sampleIdSeed，无法防篡改校验');
    else if (sha256Text(stableJson(s.sampleIdSeed)) !== s.sampleId) errors.push('sampleId 与 sampleIdSeed 重算不一致（篡改）');
    if (!s.provenance || typeof s.provenance !== 'object') errors.push('缺少 provenance');
    else {
        if (typeof s.provenance.rootFamilyKey !== 'string' || !s.provenance.rootFamilyKey) errors.push('provenance.rootFamilyKey 必须是非空字符串');
        if (!PARTITIONS.includes(s.provenance.partition)) errors.push(`provenance.partition 非法：${String(s.provenance.partition)}`);
        if (typeof s.provenance.sourceFile !== 'string') errors.push('provenance.sourceFile 必须是字符串');
    }
    if (!s.behavior || typeof s.behavior.actionCode !== 'string' || !s.behavior.actionCode) errors.push('behavior.actionCode 缺失');
    if (s.behavior && s.behavior.executed !== true) errors.push('behavior.executed 必须为 true（行为=实际执行）');
    if (s.teacher) {
        if (s.teacher.executed !== false) errors.push('teacher.executed 必须为 false：反事实建议不得伪装成实际行为');
        if (s.teacher.evidence !== 'counterfactual-advice') errors.push('teacher.evidence 必须为 counterfactual-advice');
        if (s.behavior && s.teacher.actionCode === s.behavior.actionCode) errors.push('teacher.actionCode 与 behavior 相同但标记为未执行：矛盾');
    } else if (s.teacher !== null) errors.push('teacher 必须是对象或 null');
    if (s.outcome) {
        const term = ['natural', 'maxPlies', 'maxSteps', 'stagnation', 'error', 'unknown'];
        const result = ['naturalWin', 'naturalLoss', 'draw', 'timeout', 'stagnation', 'runError', 'unknown'];
        if (!term.includes(s.outcome.termination)) errors.push(`outcome.termination 非法枚举：${String(s.outcome.termination)}`);
        if (!result.includes(s.outcome.result)) errors.push(`outcome.result 非法枚举：${String(s.outcome.result)}`);
        const outcomeSources = ['recorded-episode', 'continuation-episode', 'adjudication', 'unknown'];
        const src = s.outcome.outcomeSource as unknown;
        if (src !== null && !outcomeSources.includes(String(src))) {
            errors.push(src === 'teacher-counterfactual'
                ? 'outcomeSource 不得为 teacher-counterfactual：未执行动作没有终局证据'
                : `outcomeSource 非法枚举：${String(src)}`);
        }
        if (s.outcome.reliability === 'verified' && s.outcome.result === 'unknown') errors.push('verified 可靠性必须搭配已核验结果');
    } else errors.push('缺少 outcome（可用 unknown 枚举，不得缺省）');
    if (!s.legality || s.legality.checked !== true) errors.push('legality.checked 必须为 true');
    if (s.legality && s.legality.errors.length > 0 && s.usableFor !== 'quarantine') errors.push('合法性检查失败的样本 usableFor 必须为 quarantine');
    if (!['trainable', 'historical-baseline', 'diagnostic', 'quarantine'].includes(s.usableFor)) errors.push(`usableFor 非法：${String(s.usableFor)}`);
    if (s.provenance?.stateReconstruction === 'irreversible-hashed-features' && s.usableFor === 'trainable') {
        errors.push('仅含不可逆哈希特征的样本不得标记 trainable，须降级 historical-baseline');
    }
    return errors;
}

/** 跨分区污染审计：正式 split 只允许对应分区的已登记家族 */
export function auditPartitionAssignment(
    entries: ReadonlyArray<{ sample: DatasetSampleVNext; split: 'train' | 'validation' | 'dev' }>,
    ctx: MigrationContext
): string[] {
    const errors: string[] = [];
    for (const { sample, split } of entries) {
        const family = ctx.families.get(sample.provenance.rootFamilyKey);
        if (!family) {
            errors.push(`${sample.sampleId.slice(0, 12)}：家族 ${sample.provenance.rootFamilyKey} 未在 split-manifest 登记，禁止进入 ${split}`);
            continue;
        }
        if (split !== 'dev' && family.partition !== 'train') {
            errors.push(`${sample.sampleId.slice(0, 12)}：家族 ${sample.provenance.rootFamilyKey} 分区为 ${family.partition}，禁止进入 ${split}`);
        }
    }
    return errors;
}
