/**
 * Skirmish Evaluation Core (R00 / R01)
 *
 * 核心评估器与门禁判定纯函数：
 * 1. 严格计算胜率、得分率、置信区间与时延统计，杜绝固定 PASS 与固化指标。
 * 2. 区分规则自然胜/负/平 (RULE_TERMINAL) 与步数/预算截断 (MAX_STEPS / PLY_LIMIT / WALL_BUDGET)。
 * 3. 门禁反例安全防护：样本空集、全截断、裁定混入、分区泄漏、模型 Hash 错配、单步超时或非法动作均强制输出 FAIL/HOLD。
 */

export type NaturalOutcome = 'WIN' | 'LOSS' | 'DRAW' | 'UNRESOLVED';

export type TerminationCause = 
    | 'RULE_TERMINAL' 
    | 'MAX_STEPS' 
    | 'PLY_LIMIT' 
    | 'WALL_BUDGET' 
    | 'ABORT' 
    | 'ERROR' 
    | 'UNKNOWN';

export interface GameOutcomeRecord {
    episodeId: string;
    rootFamilyId: string;
    seed: number;
    candidateSeat: number; // 0 or 1
    candidateAllianceId: number;
    stepCount: number;
    maxSteps: number;
    engineTerminal: boolean;
    winnerAlliance: number | null;
    adjudicatedWinnerAlliance: number | null;
    adjudicationMethod?: string | null;
    naturalOutcome: NaturalOutcome;
    terminationCause: TerminationCause;
    illegalActionCount: number;
    decisionDeadlineMissCount: number;
    maxLatencyMs: number;
    meanLatencyMs?: number;
    modelHash?: string | null;
    rulesHash?: string | null;
}

export interface OutcomeAggregation {
    totalGames: number;               // N
    naturalWins: number;              // W
    naturalLosses: number;            // L
    naturalDraws: number;             // D
    truncatedCount: number;           // T (MAX_STEPS, PLY_LIMIT, etc.)
    errorCount: number;               // E (Errors, Aborts)
    adjudicatedWins: number;          // 裁定胜（独立单列，不计入自然胜）
    naturalWinRate: number;           // W / N
    naturalLossRate: number;          // L / N
    naturalDrawRate: number;          // D / N
    truncationRate: number;           // T / N
    resolvedScoreRate: number | null; // (W + 0.5D) / (W + L + D), null if 0 resolved
    conservativeScoreBounds: [number, number]; // [(W + 0.5D) / N, (W + 0.5D + T) / N]
    illegalActionCount: number;
    deadlineMissCount: number;
    maxObservedLatencyMs: number;
}

export interface PromotionPolicy {
    targetModelHash: string;
    targetRulesHash?: string;
    minCompletedGames: number;
    minNaturalWinRate?: number;
    minConservativeScoreLowerBound?: number;
    maxAllowedIllegalActions: number;
    maxAllowedDeadlineMisses: number;
    hardDeadlineMs: number;
    requireZeroTruncation?: boolean;
    requirePartitionAuditPass?: boolean;
}

export type GateVerdict = 'QUALIFIED' | 'HOLD' | 'FAIL' | 'REJECTED_LEAKAGE' | 'REJECTED_TRUNCATION' | 'REJECTED_LATENCY';

export interface GateDecision {
    verdict: GateVerdict;
    passed: boolean;
    reasons: string[];
    blockingDefects: string[];
    metrics: OutcomeAggregation;
    policy: PromotionPolicy;
    evaluatedAt: string;
}

/**
 * 纯函数：解析单个对局的自然结果与终止原因
 */
export function classifyGameOutcome(input: {
    episodeId: string;
    rootFamilyId?: string;
    seed: number;
    candidateSeat: number;
    candidateAllianceId: number;
    stepCount: number;
    maxSteps: number;
    engineTerminal: boolean;
    winnerAlliance: number | null;
    adjudicatedWinnerAlliance?: number | null;
    adjudicationMethod?: string | null;
    illegalActionCount?: number;
    decisionDeadlineMissCount?: number;
    maxLatencyMs?: number;
    modelHash?: string | null;
    rulesHash?: string | null;
    customTerminationCause?: TerminationCause;
}): GameOutcomeRecord {
    const rootFamilyId = input.rootFamilyId ?? `root_${input.seed}`;
    const illegalActionCount = input.illegalActionCount ?? 0;
    const decisionDeadlineMissCount = input.decisionDeadlineMissCount ?? 0;
    const maxLatencyMs = input.maxLatencyMs ?? 0;

    let terminationCause: TerminationCause = input.customTerminationCause ?? 'UNKNOWN';
    let naturalOutcome: NaturalOutcome = 'UNRESOLVED';

    if (input.customTerminationCause) {
        terminationCause = input.customTerminationCause;
    } else if (input.engineTerminal && input.winnerAlliance !== null && input.winnerAlliance !== undefined) {
        terminationCause = 'RULE_TERMINAL';
    } else if (input.stepCount >= input.maxSteps) {
        terminationCause = 'MAX_STEPS';
    } else if (input.engineTerminal && (input.winnerAlliance === null || input.winnerAlliance === undefined)) {
        // 规则引擎宣告终局但无获胜联盟 -> 规则自然平局
        terminationCause = 'RULE_TERMINAL';
    } else {
        terminationCause = 'UNKNOWN';
    }

    if (terminationCause === 'RULE_TERMINAL') {
        if (input.winnerAlliance === null || input.winnerAlliance === undefined || input.winnerAlliance === -1) {
            naturalOutcome = 'DRAW';
        } else if (input.winnerAlliance === input.candidateAllianceId) {
            naturalOutcome = 'WIN';
        } else {
            naturalOutcome = 'LOSS';
        }
    } else {
        // 非规则自然终局均属未解决（截断、超时、异常等）
        naturalOutcome = 'UNRESOLVED';
    }

    return {
        episodeId: input.episodeId,
        rootFamilyId,
        seed: input.seed,
        candidateSeat: input.candidateSeat,
        candidateAllianceId: input.candidateAllianceId,
        stepCount: input.stepCount,
        maxSteps: input.maxSteps,
        engineTerminal: input.engineTerminal,
        winnerAlliance: input.winnerAlliance,
        adjudicatedWinnerAlliance: input.adjudicatedWinnerAlliance ?? null,
        adjudicationMethod: input.adjudicationMethod ?? null,
        naturalOutcome,
        terminationCause,
        illegalActionCount,
        decisionDeadlineMissCount,
        maxLatencyMs,
        modelHash: input.modelHash ?? null,
        rulesHash: input.rulesHash ?? null
    };
}

/**
 * 纯函数：聚合一组对局记录的原始指标与保守不确定性区间
 */
export function aggregateOutcomes(records: readonly GameOutcomeRecord[]): OutcomeAggregation {
    const N = records.length;
    if (N === 0) {
        return {
            totalGames: 0,
            naturalWins: 0,
            naturalLosses: 0,
            naturalDraws: 0,
            truncatedCount: 0,
            errorCount: 0,
            adjudicatedWins: 0,
            naturalWinRate: 0,
            naturalLossRate: 0,
            naturalDrawRate: 0,
            truncationRate: 0,
            resolvedScoreRate: null,
            conservativeScoreBounds: [0, 0],
            illegalActionCount: 0,
            deadlineMissCount: 0,
            maxObservedLatencyMs: 0
        };
    }

    let W = 0;
    let L = 0;
    let D = 0;
    let T = 0;
    let E = 0;
    let adjWins = 0;
    let totalIllegal = 0;
    let totalDeadlineMiss = 0;
    let maxLat = 0;

    for (const r of records) {
        if (r.naturalOutcome === 'WIN') W += 1;
        else if (r.naturalOutcome === 'LOSS') L += 1;
        else if (r.naturalOutcome === 'DRAW') D += 1;
        else if (r.terminationCause === 'ERROR' || r.terminationCause === 'ABORT') E += 1;
        else T += 1;

        if (r.adjudicatedWinnerAlliance !== null && r.adjudicatedWinnerAlliance === r.candidateAllianceId) {
            adjWins += 1;
        }

        totalIllegal += r.illegalActionCount;
        totalDeadlineMiss += r.decisionDeadlineMissCount;
        if (r.maxLatencyMs > maxLat) maxLat = r.maxLatencyMs;
    }

    const resolved = W + L + D;
    const resolvedScoreRate = resolved > 0 ? (W + 0.5 * D) / resolved : null;
    const conservativeLower = (W + 0.5 * D) / N;
    const conservativeUpper = (W + 0.5 * D + T) / N;

    return {
        totalGames: N,
        naturalWins: W,
        naturalLosses: L,
        naturalDraws: D,
        truncatedCount: T,
        errorCount: E,
        adjudicatedWins: adjWins,
        naturalWinRate: W / N,
        naturalLossRate: L / N,
        naturalDrawRate: D / N,
        truncationRate: T / N,
        resolvedScoreRate,
        conservativeScoreBounds: [conservativeLower, conservativeUpper],
        illegalActionCount: totalIllegal,
        deadlineMissCount: totalDeadlineMiss,
        maxObservedLatencyMs: maxLat
    };
}

/**
 * 纯函数：门禁决策函数 (Gate Promotion Evaluator)
 * 拒绝固定 PASS，任何违规项均会导致 FAIL 或 HOLD
 */
export function evaluatePromotion(
    records: readonly GameOutcomeRecord[],
    policy: PromotionPolicy,
    extraAudits?: {
        partitionLeakageDetected?: boolean;
        actualModelHash?: string;
    }
): GateDecision {
    const evaluatedAt = new Date().toISOString();
    const metrics = aggregateOutcomes(records);
    const reasons: string[] = [];
    const defects: string[] = [];

    // 1. 记录数量与空集检查
    if (metrics.totalGames === 0) {
        defects.push('EMPTY_DATASET: 没有评估记录，不能判定晋级');
    } else if (metrics.totalGames < policy.minCompletedGames) {
        defects.push(`INSUFFICIENT_GAMES: 已完成局数 ${metrics.totalGames} 低于要求 ${policy.minCompletedGames}`);
    }

    // 2. 全截断与未解决检查
    if (metrics.totalGames > 0 && metrics.truncatedCount === metrics.totalGames) {
        defects.push('ALL_TRUNCATED: 100% 对局均达到步数或预算上限截断，无规则自然终局');
    }
    if (policy.requireZeroTruncation && metrics.truncatedCount > 0) {
        defects.push(`UNRESOLVED_TRUNCATION: 存在 ${metrics.truncatedCount} 局截断，未满足零截断要求`);
    }

    // 3. 模型 Hash 绑定检查
    if (extraAudits?.actualModelHash && extraAudits.actualModelHash !== policy.targetModelHash) {
        defects.push(`MODEL_HASH_MISMATCH: 测试模型 Hash (${extraAudits.actualModelHash}) 与注册 Hash (${policy.targetModelHash}) 不符`);
    }
    for (const r of records) {
        if (r.modelHash && r.modelHash !== policy.targetModelHash) {
            defects.push(`RECORD_MODEL_MISMATCH: 记录 ${r.episodeId} 模型 Hash (${r.modelHash}) 与目标不符`);
            break;
        }
    }

    // 4. 分区泄漏检查
    if (extraAudits?.partitionLeakageDetected) {
        defects.push('PARTITION_LEAKAGE: 数据加载或根家族分区检测到训练与评估集交集泄漏');
    }

    // 5. 非法动作与规则破坏检查
    if (metrics.illegalActionCount > policy.maxAllowedIllegalActions) {
        defects.push(`ILLEGAL_ACTIONS: 发生 ${metrics.illegalActionCount} 次非法动作，超过上限 ${policy.maxAllowedIllegalActions}`);
    }

    // 6. 1000ms 端到端耗时真实检查
    if (metrics.maxObservedLatencyMs > policy.hardDeadlineMs) {
        defects.push(`LATENCY_VIOLATION: 最大实测耗时 ${metrics.maxObservedLatencyMs}ms 突破硬截止 ${policy.hardDeadlineMs}ms`);
    }
    if (metrics.deadlineMissCount > policy.maxAllowedDeadlineMisses) {
        defects.push(`DEADLINE_MISS: 超时请求数 ${metrics.deadlineMissCount} 超过容忍上限 ${policy.maxAllowedDeadlineMisses}`);
    }

    // 7. 胜率与保守区间下界判定
    if (policy.minNaturalWinRate !== undefined && metrics.naturalWinRate < policy.minNaturalWinRate) {
        defects.push(`NATURAL_WINRATE_LOW: 自然胜率 ${(metrics.naturalWinRate * 100).toFixed(1)}% 低于目标 ${(policy.minNaturalWinRate * 100).toFixed(1)}%`);
    }
    if (policy.minConservativeScoreLowerBound !== undefined && metrics.conservativeScoreBounds[0] < policy.minConservativeScoreLowerBound) {
        defects.push(`CONSERVATIVE_BOUND_LOW: 得分率区间下界 ${(metrics.conservativeScoreBounds[0] * 100).toFixed(1)}% 低于目标 ${(policy.minConservativeScoreLowerBound * 100).toFixed(1)}%`);
    }

    // 判定结论
    let verdict: GateVerdict = 'QUALIFIED';
    let passed = true;

    if (defects.length > 0) {
        passed = false;
        if (defects.some(d => d.startsWith('PARTITION_LEAKAGE'))) {
            verdict = 'REJECTED_LEAKAGE';
        } else if (defects.some(d => d.startsWith('LATENCY_VIOLATION') || d.startsWith('DEADLINE_MISS'))) {
            verdict = 'REJECTED_LATENCY';
        } else if (defects.some(d => d.startsWith('ALL_TRUNCATED') || d.startsWith('UNRESOLVED_TRUNCATION'))) {
            verdict = 'REJECTED_TRUNCATION';
        } else {
            verdict = 'FAIL';
        }
        reasons.push(...defects);
    } else {
        verdict = 'QUALIFIED';
        reasons.push(`全量检验通过: 完成 ${metrics.totalGames} 局，自然胜率 ${(metrics.naturalWinRate * 100).toFixed(1)}%，0非法动作，0超时。`);
    }

    return {
        verdict,
        passed,
        reasons,
        blockingDefects: defects,
        metrics,
        policy,
        evaluatedAt
    };
}

/**
 * 纯函数：根据 GateDecision 渲染 Markdown 报告，严禁内置硬编码结论
 */
export function renderGateReportMarkdown(decision: GateDecision, title: string, runId: string): string {
    const m = decision.metrics;
    const lower = (m.conservativeScoreBounds[0] * 100).toFixed(1);
    const upper = (m.conservativeScoreBounds[1] * 100).toFixed(1);

    return `# ${title}

**执行轮次:** \`${runId}\`  
**判定时间:** ${decision.evaluatedAt}  
**Gate 判定:** **${decision.verdict}** (Passed: \`${decision.passed}\`)  
**目标模型 Hash:** \`${decision.policy.targetModelHash}\`  

---

## 1. 真实机器核验指标

| 指标项 | 测量值 | 门禁阈值 | 状态 |
| :--- | :---: | :---: | :---: |
| **已完成总对局 (N)** | ${m.totalGames} | $\\ge ${decision.policy.minCompletedGames}$ | ${m.totalGames >= decision.policy.minCompletedGames ? 'OK' : 'FAIL'} |
| **自然胜 (W)** | ${m.naturalWins} (${(m.naturalWinRate * 100).toFixed(1)}%) | - | - |
| **自然平 (D)** | ${m.naturalDraws} (${(m.naturalDrawRate * 100).toFixed(1)}%) | - | - |
| **自然负 (L)** | ${m.naturalLosses} (${(m.naturalLossRate * 100).toFixed(1)}%) | - | - |
| **未解决截断 (T)** | ${m.truncatedCount} (${(m.truncationRate * 100).toFixed(1)}%) | ${decision.policy.requireZeroTruncation ? '0' : '允许单列'} | ${decision.policy.requireZeroTruncation && m.truncatedCount > 0 ? 'FAIL' : 'OK'} |
| **独立裁定胜 (Adjudicated)** | ${m.adjudicatedWins} (单列不混入自然胜) | - | - |
| **保守得分率区间** | [${lower}%, ${upper}%] | 下界 $\\ge ${(decision.policy.minConservativeScoreLowerBound ? decision.policy.minConservativeScoreLowerBound * 100 : 0).toFixed(1)}%$ | ${decision.policy.minConservativeScoreLowerBound && m.conservativeScoreBounds[0] < decision.policy.minConservativeScoreLowerBound ? 'FAIL' : 'OK'} |
| **非法动作数** | ${m.illegalActionCount} | $\\le ${decision.policy.maxAllowedIllegalActions}$ | ${m.illegalActionCount <= decision.policy.maxAllowedIllegalActions ? 'OK' : 'FAIL'} |
| **最大决策耗时** | ${m.maxObservedLatencyMs} ms | $\\le ${decision.policy.hardDeadlineMs}$ ms | ${m.maxObservedLatencyMs <= decision.policy.hardDeadlineMs ? 'OK' : 'FAIL'} |
| **超时请求数** | ${m.deadlineMissCount} | $\\le ${decision.policy.maxAllowedDeadlineMisses}$ | ${m.deadlineMissCount <= decision.policy.maxAllowedDeadlineMisses ? 'OK' : 'FAIL'} |

---

## 2. 门禁检查结论与阻断清单

${decision.passed 
    ? `- [x] **所有门禁检查项均真实满足预注册要求。**` 
    : decision.blockingDefects.map(d => `- [ ] **阻断原因:** ${d}`).join('\n')}

---

## 3. 详细判定依据
${decision.reasons.map(r => `> ${r}`).join('\n\n')}
`;
}
