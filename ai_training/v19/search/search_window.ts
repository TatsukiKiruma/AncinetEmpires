/** 中文：有界动作前缀搜索与从原根重新执行的独立配对验证。 */
import { GameEngine } from '../../src/game/engine';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import type { SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { encodeAction } from '../../src/game/env';
import { areEnemyPlayers } from '../../src/game/rule_config';
import { streamFor, type OutcomeKind } from '../../v13/tools/eval_v3_core';
import type { GameState } from '../../src/game/types';
import { selectSearchCandidates, tacticalScore } from './selection';
import { continueToNaturalEnd, simulateFromRoot, type ContinuationResult, type TacticalSummary } from './rollout_simulation';
export { continueToNaturalEnd, tacticalScore };
export { tacticalCandidateCodes } from './selection';
export type { ContinuationResult, TacticalSummary };

/** 中文：保留旧清单命名空间；新采样器使用独立的base seed。 */
export const V19_S1_SEARCH_ROOT_BASE_SEED = 2610100000;
export const V19_SEARCH_STREAM_OFFSET = 20000000;
export const V19_VALIDATION_STREAM_OFFSET = 30000000;

export interface SearchBudget {
    maxOwnDepth: number;
    maxBranchPerLevel: number;
    policyTopK: number;
    maxBranchesPerWindow: number;
    /** 中文：整个窗口总预算，包含搜索、基线和候选独立验证。 */
    wallMsPerWindow: number;
    maxStepsPerContinuation: number;
    searchWallMs?: number;
    validationWallMsPerArm?: number;
}
export const DEFAULT_SEARCH_BUDGET: SearchBudget = {
    maxOwnDepth: 2, maxBranchPerLevel: 6, policyTopK: 4,
    maxBranchesPerWindow: 24, wallMsPerWindow: 600000,
    maxStepsPerContinuation: 12000, searchWallMs: 120000, validationWallMsPerArm: 240000,
};
export interface LeafEvaluation {
    terminal: boolean;
    outcomeKind: OutcomeKind | null;
    tactical: TacticalSummary;
    truncated: boolean;
}
export interface BranchResult {
    ownActions: string[];
    fullSequence: string[];
    legal: boolean;
    leaf: LeafEvaluation;
    leafStateJson: string;
    nodes: number;
    ms: number;
    error: string | null;
    wallTimeout: boolean;
    reachedBoundary: boolean;
    prefixStates: Array<{ stateJson: string; actionCode: string; legalActionCodes: string[] }>;
}
export interface WindowSearchResult {
    windowId: string; familyId: string; mapName: string; seed: number; ownSeat: number;
    group: 'dev' | 'sealed'; engineStepIndex: number; rootStateHash: string;
    rootLegalActionCount: number; phaseTurn: number; budget: SearchBudget;
    baseline: BranchResult; branches: BranchResult[];
    naturalBranches: Array<{ ownActions: string[]; outcomeKind: OutcomeKind }>;
    bestTactical: { ownActions: string[]; score: number } | null;
    selected: { ownActions: string[]; reason: string } | null;
    validation: {
        baseline: ContinuationResult; selected: ContinuationResult | null;
        selectedOwnActions: string[] | null; streamSeed: number | null;
        fromRoot: true; rootStateHash: string; armWallMs: number;
        budgetFair: boolean; allottedWallMs: { baseline: number; selected: number | null };
    } | null;
    candidateDiagnostics: Array<{ depth: number; prefix: string[]; diagnostics: unknown }>;
    notes: string[]; ms: number;
}
export interface SearchContext {
    windowId: string; familyId: string; mapName: string; seed: number; ownSeat: number;
    group: 'dev' | 'sealed'; engineStepIndex: number; rootState: GameState; budget: SearchBudget;
    opponentStreamSeed: number; validationStreamSeed?: number; validationMaxSteps?: number;
    policyId: string;
}

/** 中文：兼容历史根摘要；清单和源码的强身份另由驱动保存SHA256。 */
export function stateHash16(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
}
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
    return JSON.stringify(value ?? null);
}
export function hashState(state: GameState): string { return stateHash16(canonical(state)); }

/** 中文：基线已自然胜时不替换；未完成回合、错误或预算截断不可作为战术改进。 */
export function selectBranch(baseline: BranchResult, branches: BranchResult[]): {
    bestTactical: WindowSearchResult['bestTactical']; selected: WindowSearchResult['selected'];
} {
    const valid = (branch: BranchResult) => !branch.error && branch.legal && !branch.leaf.truncated;
    let bestTactical: WindowSearchResult['bestTactical'] = null;
    for (const branch of [baseline, ...branches]) {
        if (!valid(branch) || branch.leaf.terminal || !branch.reachedBoundary) continue;
        const score = tacticalScore(branch.leaf.tactical);
        if (!bestTactical || score > bestTactical.score) bestTactical = { ownActions: branch.ownActions, score };
    }
    if (!valid(baseline)) return { bestTactical, selected: null };
    if (baseline.leaf.outcomeKind === 'NATURAL_WIN') return { bestTactical, selected: null };
    const win = branches.find(branch => valid(branch) && branch.leaf.outcomeKind === 'NATURAL_WIN');
    if (win) return { bestTactical, selected: { ownActions: win.ownActions, reason: '搜索流下出现自然胜，仍需从根独立验证' } };
    // 中文：自然和局优于未知局面；自然负基线可探索完整的未终局替代分支。
    if (baseline.leaf.outcomeKind === 'NATURAL_DRAW') return { bestTactical, selected: null };
    if (bestTactical && bestTactical.ownActions.length && (baseline.leaf.outcomeKind === 'NATURAL_LOSS'
        || bestTactical.score > tacticalScore(baseline.leaf.tactical))) {
        return { bestTactical, selected: { ownActions: bestTactical.ownActions, reason: '完整回合后战术评分更优，尚非整局收益' } };
    }
    return { bestTactical, selected: null };
}

export function searchWindow(context: SearchContext, predictor: SpatialResNetPredictor): WindowSearchResult {
    const started = Date.now();
    const { rootState: root, ownSeat, budget } = context;
    if (root.currentPlayer !== ownSeat || root.winner !== null) throw new Error('搜索根必须是候选方的非终局状态');
    for (const [name, value] of Object.entries(budget)) {
        if (!Number.isFinite(value) || value < 0) throw new Error(`非法搜索预算 ${name}=${value}`);
    }
    if (context.validationStreamSeed !== undefined && context.validationStreamSeed === context.opponentStreamSeed) {
        throw new Error('搜索与独立验证不能使用相同随机流');
    }
    const totalDeadline = started + budget.wallMsPerWindow;
    const searchDeadline = Math.min(totalDeadline, started + (budget.searchWallMs ?? budget.wallMsPerWindow / 3));
    const rootHash = hashState(root);
    const opponentSeat = root.players.find(p => areEnemyPlayers(root, ownSeat, p.id))?.id;
    if (opponentSeat === undefined) throw new Error('搜索根没有敌方座位');
    const notes: string[] = [];
    const branches: BranchResult[] = [];
    const candidateDiagnostics: WindowSearchResult['candidateDiagnostics'] = [];
    const runBranch = (ownActions: string[]): BranchResult => {
        const result = simulateFromRoot(root, ownSeat, predictor, streamFor(context.opponentStreamSeed, opponentSeat),
            budget.maxStepsPerContinuation, { ownPrefix: ownActions, stopAtOwnBoundary: true, deadlineMs: searchDeadline });
        const incompletePrefix = result.appliedPrefix.length < ownActions.length && !result.terminal && !result.truncated;
        const error = result.error ?? (incompletePrefix ? '前缀没有在初始己方回合内完整执行' : null);
        return {
            ownActions, fullSequence: result.fullSequence, legal: !error,
            leaf: { terminal: result.terminal, outcomeKind: result.terminal ? result.outcomeKind : null,
                tactical: result.finalTactical, truncated: result.truncated },
            leafStateJson: JSON.stringify(result.finalState), nodes: result.steps, ms: result.ms,
            error, wallTimeout: result.wallTimeout, reachedBoundary: result.reachedBoundary, prefixStates: result.prefixStates,
        };
    };
    const baseline = runBranch([]);
    let frontier: string[][] = [[]];
    let branchCount = 1;
    const seen = new Set<string>(['[]']);
    for (let depth = 0; depth < budget.maxOwnDepth && Date.now() < searchDeadline; depth++) {
        const expansions: Array<{ prefix: string[]; actions: string[] }> = [];
        for (const prefix of frontier) {
            if (Date.now() >= searchDeadline || branchCount >= budget.maxBranchesPerWindow) break;
            const engine = new GameEngine(root);
            let valid = true;
            for (const code of prefix) {
                const state = engine.getState();
                const action = engine.getLegalActions(ownSeat).find(a => encodeAction(a) === code);
                if (engine.isTerminal() || state.currentPlayer !== ownSeat || state.turn !== root.turn || !action) { valid = false; break; }
                if (String(engine.step(action).info ?? '').includes('非法动作')) { valid = false; break; }
            }
            const state = engine.getState();
            if (!valid || engine.isTerminal() || state.currentPlayer !== ownSeat || state.turn !== root.turn) continue;
            const legal = engine.getLegalActions(ownSeat).filter(a => a.type !== 'surrender');
            const prediction = predictSpatialAction(predictor, state, ownSeat, legal);
            const chosen = selectSearchCandidates(legal, prediction, budget);
            candidateDiagnostics.push({ depth, prefix, diagnostics: chosen.diagnostics });
            expansions.push({ prefix, actions: chosen.actions.map(encodeAction) });
        }
        const next: string[][] = [];
        // 中文：轮转各前缀，避免第二层总预算全部被前两个字典序分支占用。
        for (let i = 0; i < budget.maxBranchPerLevel; i++) {
            for (const expansion of expansions) {
                if (branchCount >= budget.maxBranchesPerWindow || Date.now() >= searchDeadline) break;
                const action = expansion.actions[i];
                if (!action) continue;
                const child = [...expansion.prefix, action];
                const key = JSON.stringify(child);
                if (seen.has(key)) continue;
                seen.add(key); next.push(child); branches.push(runBranch(child)); branchCount++;
            }
        }
        frontier = next;
        if (!frontier.length) break;
    }
    const { bestTactical, selected } = selectBranch(baseline, branches);
    let validation: WindowSearchResult['validation'] = null;
    if (context.validationStreamSeed !== undefined) {
        const arms = selected ? 2 : 1;
        // 中文：为同步原子调用和两臂切换预留余量；若仍挤压第二臂，标记配对无效。
        const armWallMs = Math.max(0, Math.min(budget.validationWallMsPerArm ?? budget.wallMsPerWindow / 3,
            (totalDeadline - Date.now() - 1000) / arms));
        const allocations: number[] = [];
        const validate = (ownPrefix: string[]) => {
            const armStart = Date.now();
            const allocation = Math.max(0, Math.min(armWallMs, totalDeadline - armStart));
            allocations.push(allocation);
            return continueToNaturalEnd(root, ownSeat, predictor,
                streamFor(context.validationStreamSeed!, opponentSeat), context.validationMaxSteps ?? budget.maxStepsPerContinuation,
                { ownPrefix, deadlineMs: armStart + allocation });
        };
        // 中文：两臂都从原根开始，不复用任何搜索叶状态或搜索H0回应。
        const baseResult = validate([]);
        const selectedResult = selected ? validate(selected.ownActions) : null;
        validation = { baseline: baseResult, selected: selectedResult, selectedOwnActions: selected?.ownActions ?? null,
            streamSeed: context.validationStreamSeed, fromRoot: true, rootStateHash: rootHash, armWallMs,
            budgetFair: armWallMs > 0 && allocations.every(value => value === armWallMs),
            allottedWallMs: { baseline: allocations[0], selected: allocations[1] ?? null } };
    }
    if (Date.now() >= searchDeadline) notes.push('搜索扩展到达预登记墙钟预算；未完成的分支不能进入评分');
    if (hashState(root) !== rootHash) throw new Error('搜索污染了根状态');
    return {
        windowId: context.windowId, familyId: context.familyId, mapName: context.mapName, seed: context.seed,
        ownSeat, group: context.group, engineStepIndex: context.engineStepIndex, rootStateHash: rootHash,
        rootLegalActionCount: new GameEngine(root).getLegalActions(ownSeat).filter(a => a.type !== 'surrender').length,
        phaseTurn: root.turn, budget, baseline, branches,
        naturalBranches: branches.filter(b => !b.error && b.leaf.outcomeKind === 'NATURAL_WIN')
            .map(b => ({ ownActions: b.ownActions, outcomeKind: b.leaf.outcomeKind! })),
        bestTactical, selected, validation, candidateDiagnostics, notes, ms: Date.now() - started,
    };
}
