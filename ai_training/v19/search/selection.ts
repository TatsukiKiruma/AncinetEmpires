import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';

/** 搜索叶子的可核验战术摘要；该评分不代表胜率。 */
export interface TacticalScoreSummary {
    ownCommanderHp: number | null;
    enemyCommanderHp: number | null;
    ownUnitCount: number;
    enemyUnitCount: number;
    ownGold: number;
    enemyGold: number;
}

/** policy 对同一合法动作集合的输出。动作码和 logit 必须按下标对齐。 */
export interface SearchPolicyPrediction {
    orderedActionCodes: readonly string[];
    actionLogits: readonly number[];
    bestActionCode: string;
}

export interface CandidateSelectionBudget {
    policyTopK: number;
    maxBranchPerLevel: number;
}

export type TacticalCandidateKind = 'attack' | 'capture' | 'recruit' | 'move';

export interface CandidateSelectionDiagnostics {
    legalCount: number;
    predictionCount: number;
    selectedCount: number;
    clippedCount: number;
    maxBranchPerLevel: number;
    policyTopKRequested: number;
    policyTopKAvailable: number;
    /** 以实际 logit 复算出的 argmax；数组顺序只用于精确并列时稳定裁决。 */
    argmaxCode: string | null;
    reportedBestActionCode: string;
    argmaxRetained: boolean;
    reportedBestRetained: boolean;
    selectedCodes: string[];
    clippedCodes: string[];
    tacticalAvailable: Record<TacticalCandidateKind, number>;
    tacticalSelected: Record<TacticalCandidateKind, number>;
    warnings: string[];
}

export interface CandidateSelectionResult {
    actions: Action[];
    diagnostics: CandidateSelectionDiagnostics;
}

interface RankedCandidate {
    action: Action;
    code: string;
    logit: number;
    /** prediction 中的原始位置，用于相同 logit 的稳定排序。 */
    predictionIndex: number;
    legalIndex: number;
}

const TACTICAL_TYPES = new Set<Action['type']>([
    'attack',
    'capture',
    'recruit_to_castle',
    'recruit_and_deploy',
    'move',
]);

function tacticalKind(action: Action): TacticalCandidateKind | null {
    if (action.type === 'attack') return 'attack';
    if (action.type === 'capture') return 'capture';
    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') return 'recruit';
    if (action.type === 'move') return 'move';
    return null;
}

function emptyTacticalCounts(): Record<TacticalCandidateKind, number> {
    return { attack: 0, capture: 0, recruit: 0, move: 0 };
}

/**
 * 比较未终局叶子的局部战术后果。分数越高，己方局面越好。
 * 指挥官血量、单位数和金币都严格按「己方减敌方」计算。
 */
export function tacticalScore(summary: TacticalScoreSummary): number {
    const ownHp = summary.ownCommanderHp ?? 0;
    const enemyHp = summary.enemyCommanderHp ?? 0;
    return (
        ownHp - enemyHp
        + (summary.ownUnitCount - summary.enemyUnitCount) * 40
        + (summary.ownGold - summary.enemyGold) * 0.1
    );
}

/** 返回全部必要战术动作码，并按合法动作输入顺序稳定去重。 */
export function tacticalCandidateCodes(actions: readonly Action[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const action of actions) {
        if (!TACTICAL_TYPES.has(action.type)) continue;
        const code = encodeAction(action);
        if (seen.has(code)) continue;
        seen.add(code);
        result.push(code);
    }
    return result;
}

/**
 * 从合法动作中构造有界搜索候选。
 *
 * 预算不足时的稳定优先级：实际 logit argmax、同目标双攻击、占城/招募代表、
 * policy Top-K、其余动作。move 会进入战术识别与诊断，但不会挤掉前三类稀缺代表。
 */
export function selectSearchCandidates(
    legalActions: readonly Action[],
    prediction: SearchPolicyPrediction,
    budget: CandidateSelectionBudget,
): CandidateSelectionResult {
    const warnings: string[] = [];
    const maxBranch = Math.max(0, Math.floor(budget.maxBranchPerLevel));
    const policyTopK = Math.max(0, Math.floor(budget.policyTopK));

    if (prediction.orderedActionCodes.length !== prediction.actionLogits.length) {
        warnings.push(
            `policy 动作码 ${prediction.orderedActionCodes.length} 项与 logit ${prediction.actionLogits.length} 项不一致`,
        );
    }

    // 同一动作码在合法集中只采用第一次出现，避免重复展开相同分支。
    const legalByCode = new Map<string, { action: Action; legalIndex: number }>();
    legalActions.forEach((action, legalIndex) => {
        const code = encodeAction(action);
        if (!legalByCode.has(code)) legalByCode.set(code, { action, legalIndex });
    });

    const ranked: RankedCandidate[] = [];
    const rankedCodes = new Set<string>();
    prediction.orderedActionCodes.forEach((code, predictionIndex) => {
        const legal = legalByCode.get(code);
        if (!legal || rankedCodes.has(code)) return;
        const rawLogit = prediction.actionLogits[predictionIndex];
        if (!Number.isFinite(rawLogit)) {
            warnings.push(`动作 ${code} 的 logit 非有限数，按负无穷处理`);
        }
        ranked.push({
            action: legal.action,
            code,
            logit: Number.isFinite(rawLogit) ? rawLogit : Number.NEGATIVE_INFINITY,
            predictionIndex,
            legalIndex: legal.legalIndex,
        });
        rankedCodes.add(code);
    });

    // 预测缺失的合法动作仍可作为战术或兜底候选，但排在有真实 logit 的动作之后。
    for (const [code, legal] of legalByCode) {
        if (rankedCodes.has(code)) continue;
        ranked.push({
            action: legal.action,
            code,
            logit: Number.NEGATIVE_INFINITY,
            predictionIndex: Number.MAX_SAFE_INTEGER,
            legalIndex: legal.legalIndex,
        });
    }

    ranked.sort((a, b) => {
        if (a.logit !== b.logit) return b.logit - a.logit;
        if (a.predictionIndex !== b.predictionIndex) return a.predictionIndex - b.predictionIndex;
        return a.legalIndex - b.legalIndex;
    });

    const actualArgmax = ranked.find(candidate => Number.isFinite(candidate.logit)) ?? null;
    if (actualArgmax && prediction.bestActionCode !== actualArgmax.code) {
        warnings.push(
            `policy 报告 bestActionCode=${prediction.bestActionCode}，实际 logit argmax=${actualArgmax.code}`,
        );
    }
    if (prediction.bestActionCode && !legalByCode.has(prediction.bestActionCode)) {
        warnings.push(`policy 报告的最佳动作不在合法集中：${prediction.bestActionCode}`);
    }

    const selected: RankedCandidate[] = [];
    const selectedCodes = new Set<string>();
    const add = (candidate: RankedCandidate | undefined): boolean => {
        if (!candidate || selected.length >= maxBranch || selectedCodes.has(candidate.code)) return false;
        selected.push(candidate);
        selectedCodes.add(candidate.code);
        return true;
    };

    // 无论 orderedActionCodes 是否按字典序排列，都先按实际 logit 锁定 argmax。
    add(actualArgmax ?? ranked[0]);

    const byKind = (kind: TacticalCandidateKind): RankedCandidate[] =>
        ranked.filter(candidate => tacticalKind(candidate.action) === kind);

    const attacks = byKind('attack');
    const captures = byKind('capture');
    const recruits = byKind('recruit');

    // 若存在同目标双攻击，优先选择排名最靠前的完整组合；否则保留最高分攻击代表。
    const attacksByTarget = new Map<string, RankedCandidate[]>();
    for (const candidate of attacks) {
        if (candidate.action.type !== 'attack') continue;
        const group = attacksByTarget.get(candidate.action.targetId) ?? [];
        group.push(candidate);
        attacksByTarget.set(candidate.action.targetId, group);
    }
    const attackPair = [...attacksByTarget.values()].find(group => group.length >= 2);
    add(attackPair?.[0] ?? attacks[0]);
    add(attackPair?.[1]);

    // 攻击次序组合之后，再保留占城与招募各一个经济代表。
    add(captures[0]);
    add(recruits[0]);

    const policyCandidates = ranked.filter(candidate => Number.isFinite(candidate.logit)).slice(0, policyTopK);
    for (const candidate of policyCandidates) add(candidate);
    for (const candidate of ranked) add(candidate);

    const tacticalAvailable = emptyTacticalCounts();
    const tacticalSelected = emptyTacticalCounts();
    for (const candidate of ranked) {
        const kind = tacticalKind(candidate.action);
        if (kind) tacticalAvailable[kind] += 1;
    }
    for (const candidate of selected) {
        const kind = tacticalKind(candidate.action);
        if (kind) tacticalSelected[kind] += 1;
    }

    const clippedCodes = ranked
        .filter(candidate => !selectedCodes.has(candidate.code))
        .map(candidate => candidate.code);
    const argmaxCode = actualArgmax?.code ?? null;

    return {
        actions: selected.map(candidate => candidate.action),
        diagnostics: {
            legalCount: legalByCode.size,
            predictionCount: ranked.filter(candidate => Number.isFinite(candidate.logit)).length,
            selectedCount: selected.length,
            clippedCount: clippedCodes.length,
            maxBranchPerLevel: maxBranch,
            policyTopKRequested: policyTopK,
            policyTopKAvailable: policyCandidates.length,
            argmaxCode,
            reportedBestActionCode: prediction.bestActionCode,
            argmaxRetained: argmaxCode !== null && selectedCodes.has(argmaxCode),
            reportedBestRetained: selectedCodes.has(prediction.bestActionCode),
            selectedCodes: selected.map(candidate => candidate.code),
            clippedCodes,
            tacticalAvailable,
            tacticalSelected,
            warnings,
        },
    };
}
