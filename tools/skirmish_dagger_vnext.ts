/**
 * T09 round02｜DAgger 采集状态 → dataset_vnext 双轨样本的契约映射模块。
 *
 * 职责：把「学生自诱导状态 + 轻量搜索教师反事实建议」的采集记录，映射为符合
 * T04 契约（tools/skirmish_dataset_vnext.ts）的 DatasetSampleVNext 样本，并给出隔离原因。
 * 语义边界（与契约一致，不做任何规则/评价改动）：
 *   - behavior = 采集中【实际执行】的学生动作（executed:true）；
 *   - teacher  = 教师建议动作，仅在建议 ≠ 行为时存在，executed:false、evidence='counterfactual-advice'、
 *                method='fast-rollout'（beam 保守聚合值差），绝不伪称续局验证；
 *   - 全量状态快照单独落盘，样本以 sourceFile 引用（stateReconstruction='full-observation'，可 trainable）；
 *   - 分区隔离：仅 split-manifest 已登记且 partition='train' 的根家族允许 trainable；
 *   - outcome 仅在续局取得核验的自然终局时 verified；截断/未结束一律 unknown，供价值头屏蔽目标。
 */
import { sha256Text, stableJson } from './skirmish_dataset_artifacts';
import { validateDatasetSampleVNext, type DatasetSampleVNext, type VNextPartition } from './skirmish_dataset_vnext';

export interface DaggerVnextMigrationContext {
    /** split-manifest.json 家族表：key → partition */
    families: Map<string, { partition: VNextPartition }>;
    rulesVersion: string | null;
}

export interface DaggerEpisodeOutcome {
    /** natural=引擎判出胜负/平局；maxPlies=步数上限截断；error=续局异常 */
    termination: 'natural' | 'maxPlies' | 'stagnation' | 'error';
    /** 终局获胜联盟（GameState.winner），未结束为 null，-1=平局 */
    winnerAllianceId: number | null;
    /** 被采集学生（subject）所在联盟 */
    subjectAllianceId: number;
}

export interface DaggerCaptureRecord {
    /** split-manifest 登记的根家族键 */
    rootFamilyKey: string;
    /** 采集根序号（同一根的多状态共享） */
    episodeIndex: number;
    /** 根续局内 1-based 步号 */
    step: number;
    turn: number;
    playerId: number;
    /** 状态内容哈希（去重键，同时供跨轮复用审计） */
    stateHash: string;
    /** 学生实际执行的动作码 */
    behaviorActionCode: string;
    /** 行为策略标识（含学生模型名） */
    behaviorPolicy: string;
    /** behavior 在全固定动作空间中的索引 */
    fixedActionIndex: number;
    /** 该状态下除 surrender 外的全部合法动作码 */
    legalActionCodes: string[];
    /** 教师建议动作码；与行为一致或未产出时为 null */
    teacherActionCode: string | null;
    /** 教师建议值 − 学生动作值（保守聚合），仅分歧样本有值 */
    teacherScoreMargin: number | null;
    /** 教师反事实证据的 rollout 深度（fast-rollout 档为 1） */
    teacherRolloutDepth: number;
    /** 全量状态快照的相对路径（sourceFile） */
    snapshotSourceFile: string;
    /** 根续局的终局核验结果；未跑完为 null */
    outcome: DaggerEpisodeOutcome | null;
}

const ACTION_CODE_PREFIX = /^[a-z][a-z0-9_]*(:|$)/;

function outcomeTrack(outcome: DaggerEpisodeOutcome | null): DatasetSampleVNext['outcome'] {
    const perspective = outcome ? outcome.subjectAllianceId : null;
    if (!outcome || outcome.termination === 'error') {
        return {
            termination: outcome ? 'error' : 'unknown', result: 'unknown',
            terminated: false, truncated: true, perspectivePlayerId: perspective,
            outcomeSource: 'unknown', reliability: 'unverified'
        };
    }
    if (outcome.termination !== 'natural') {
        return {
            termination: outcome.termination, result: 'unknown',
            terminated: false, truncated: true, perspectivePlayerId: perspective,
            outcomeSource: 'unknown', reliability: 'unverified'
        };
    }
    // 自然终局：只有引擎判出的 winner 才是可核验结果（视角=subject 联盟）
    const winner = outcome.winnerAllianceId;
    const result = winner === null ? 'unknown'
        : winner === -1 ? 'draw'
        : winner === outcome.subjectAllianceId ? 'naturalWin' : 'naturalLoss';
    return {
        termination: 'natural', result,
        terminated: true, truncated: false, perspectivePlayerId: perspective,
        outcomeSource: result === 'unknown' ? 'unknown' : 'recorded-episode',
        reliability: result === 'unknown' ? 'unverified' : 'verified'
    };
}

/** 采集记录 → vnext 样本；返回样本 + 隔离原因（空=可接纳）。 */
export function buildDaggerVNextSample(
    record: DaggerCaptureRecord,
    ctx: DaggerVnextMigrationContext
): { sample: DatasetSampleVNext; quarantineReasons: string[] } {
    const family = ctx.families.get(record.rootFamilyKey);
    const partition: VNextPartition = family?.partition ?? 'unregistered';
    const hasTeacher = record.teacherActionCode !== null && record.teacherActionCode !== record.behaviorActionCode;
    const teacherActionCode = hasTeacher ? record.teacherActionCode! : null;

    const legalityErrors: string[] = [];
    const legalSet = new Set(record.legalActionCodes);
    if (!ACTION_CODE_PREFIX.test(record.behaviorActionCode)) {
        legalityErrors.push(`行为动作码结构非法：${record.behaviorActionCode}`);
    }
    if (!legalSet.has(record.behaviorActionCode)) {
        legalityErrors.push(`行为动作不在合法集合：${record.behaviorActionCode}`);
    }
    if (teacherActionCode !== null) {
        if (!legalSet.has(teacherActionCode)) {
            legalityErrors.push(`教师建议动作不在合法集合：${teacherActionCode}`);
        }
        if (teacherActionCode === record.behaviorActionCode) {
            legalityErrors.push('教师建议与行为相同却标记反事实：矛盾');
        }
    }
    if (!Number.isInteger(record.fixedActionIndex) || record.fixedActionIndex < 0) {
        legalityErrors.push(`behavior.fixedActionIndex 非非负整数：${record.fixedActionIndex}`);
    }

    const quarantineReasons: string[] = [...legalityErrors];
    if (!family) {
        quarantineReasons.push(`根家族未登记于 split-manifest：${record.rootFamilyKey}`);
    } else if (partition !== 'train') {
        // 分区隔离：非训练分区（dev/holdout/quarantine）的根禁止进入纠错数据集
        quarantineReasons.push(`根家族分区为 ${partition}，禁止进入训练纠错数据集`);
    }

    const sampleIdSeed: Record<string, unknown> = {
        rootFamilyKey: record.rootFamilyKey,
        sourceFile: record.snapshotSourceFile,
        episodeIndex: record.episodeIndex,
        stepIndex: record.step - 1,
        step: record.step,
        playerId: record.playerId,
        behaviorActionCode: record.behaviorActionCode,
        teacherActionCode
    };

    const sample: DatasetSampleVNext = {
        kind: 'skirmish_dataset_sample_vnext',
        schemaVersion: 2,
        sampleId: sha256Text(stableJson(sampleIdSeed)),
        sampleIdSeed,
        provenance: {
            rootFamilyKey: record.rootFamilyKey,
            familyRegistered: Boolean(family),
            partition,
            sourceFile: record.snapshotSourceFile,
            episodeIndex: record.episodeIndex,
            stepIndex: record.step - 1,
            scenarioId: record.rootFamilyKey.replace(/^sd_episode:/, '').replace(/:\d+$/, ''),
            seed: Number(/:(\d+)$/.exec(record.rootFamilyKey)?.[1] ?? record.episodeIndex),
            initialObservationHash: record.stateHash,
            // 采集流水线随样本落盘全量 GameState 快照，可完整重放
            stateReconstruction: 'full-observation'
        },
        representation: {
            featureExtractor: 'dagger-full-state-snapshot',
            featureDim: null,
            rulesVersion: ctx.rulesVersion,
            contractVersion: 'vnext-1'
        },
        behavior: {
            actionCode: record.behaviorActionCode,
            executed: true,
            policy: record.behaviorPolicy,
            playerId: record.playerId,
            step: record.step,
            turn: record.turn,
            fixedActionIndex: record.fixedActionIndex
        },
        teacher: teacherActionCode === null ? null : {
            actionCode: teacherActionCode,
            executed: false,
            evidence: 'counterfactual-advice',
            method: 'fast-rollout',
            scoreMargin: Number.isFinite(record.teacherScoreMargin ?? Number.NaN) ? record.teacherScoreMargin! : 0,
            rolloutDepth: record.teacherRolloutDepth
        },
        outcome: outcomeTrack(record.outcome),
        legality: { checked: true, legalInFixedActionSpace: legalityErrors.length === 0, errors: legalityErrors },
        usableFor: quarantineReasons.length === 0 ? 'trainable' : 'quarantine'
    };
    // 契约校验兜底（本模块产物必须逐条通过 validateDatasetSampleVNext）
    const schemaErrors = validateDatasetSampleVNext(sample)
        .filter(e => !legalityErrors.some(x => e.includes(x)));
    quarantineReasons.push(...schemaErrors);
    if (schemaErrors.length > 0) sample.usableFor = 'quarantine';
    return { sample, quarantineReasons };
}
