import type { GameEngine } from '../../../src/game/engine';
import type { Action } from '../../../src/game/types';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../../src/game/env';
import { DeterministicPRNG } from './prng';

export interface CandidateSelectionOptions {
    targetK: number;
    nonTopPriorFraction?: number;
    seed?: number;
    prng?: DeterministicPRNG;
}

export interface CandidateSelectionResult {
    selectedActions: Action[];
    selectedCodes: string[];
    selectionReasons: Record<string, string>;
    explorationSlotsAllocated: number;
}

/**
 * 候选动作选择器 (R6 修复版)
 * 1. 严格保证探索配额生效 (K>=2 时至少预留 1 个探索槽位，修复历史向下取整为 0 缺陷)；
 * 2. 严格使用注入的确定性 PRNG，杜绝 Math.random 泄漏；
 * 3. 优先保证 Heuristic top-1 和 pending 解除。
 */
export function selectRootCandidates(
    engine: GameEngine,
    playerId: number,
    legalActions: Action[],
    options: CandidateSelectionOptions
): CandidateSelectionResult {
    const K = Math.max(1, options.targetK);
    const A = legalActions.length;

    if (A <= K) {
        const selectedCodes = legalActions.map(a => encodeAction(a));
        const selectionReasons: Record<string, string> = {};
        for (const code of selectedCodes) {
            selectionReasons[code] = 'all_legal_actions_fit_k';
        }
        return {
            selectedActions: [...legalActions],
            selectedCodes,
            selectionReasons,
            explorationSlotsAllocated: 0
        };
    }

    const prng = options.prng ?? new DeterministicPRNG(options.seed ?? 42);
    const hAI = new HeuristicAI(() => prng.next());
    const state = engine.getState();

    // 1. 获取 HeuristicAI 启发式推荐的 topAction
    const topAction = hAI.getAction(engine, playerId);
    const topCode = topAction ? encodeAction(topAction) : null;

    const chosenIndices = new Set<number>();
    const selectionReasons: Record<string, string> = {};

    // 2. 槽位配额分配：
    // 修复关键问题：当 K=3 或 K=4 时，0.20 * K 不再被 Math.floor 取整为 0！
    const nonTopFrac = options.nonTopPriorFraction ?? 0.20;
    let explorationQuota = 0;
    if (nonTopFrac > 0 && K >= 2) {
        explorationQuota = Math.max(1, Math.round(K * nonTopFrac));
    }
    const exploitationCapacity = Math.max(1, K - explorationQuota);

    // A. 启发式 top-1
    if (topCode) {
        const topIdx = legalActions.findIndex(a => encodeAction(a) === topCode);
        if (topIdx >= 0) {
            chosenIndices.add(topIdx);
            selectionReasons[topCode] = 'heuristic_top1';
        }
    }
    if (chosenIndices.size === 0) {
        chosenIndices.add(0);
        selectionReasons[encodeAction(legalActions[0])] = 'fallback_first_legal';
    }

    // B. 若存在 pending 单位，优先保留其部署动作
    if (state.pendingUnitId && chosenIndices.size < exploitationCapacity) {
        for (let i = 0; i < A; i++) {
            const act = legalActions[i];
            if ('unitId' in act && act.unitId === state.pendingUnitId) {
                const code = encodeAction(act);
                if (!chosenIndices.has(i)) {
                    chosenIndices.add(i);
                    selectionReasons[code] = 'resolve_pending';
                    if (chosenIndices.size >= exploitationCapacity) break;
                }
            }
        }
    }

    // C. 覆盖关键战术类别：attack, capture, heal, summon, repair
    const keyTypes = ['attack', 'capture', 'heal', 'summon', 'repair'];
    for (const kt of keyTypes) {
        if (chosenIndices.size >= exploitationCapacity) break;
        for (let i = 0; i < A; i++) {
            if (!chosenIndices.has(i) && legalActions[i].type === kt) {
                const code = encodeAction(legalActions[i]);
                chosenIndices.add(i);
                selectionReasons[code] = `tactical_type_${kt}`;
                break;
            }
        }
    }

    // D. 覆盖不同单位的行动多样性
    const coveredUnits = new Set<string>();
    for (const idx of chosenIndices) {
        const a = legalActions[idx];
        if ('unitId' in a) coveredUnits.add((a as any).unitId);
        else if ('attackerId' in a) coveredUnits.add((a as any).attackerId);
    }

    for (let i = 0; i < A && chosenIndices.size < exploitationCapacity; i++) {
        const a = legalActions[i];
        let uid: string | undefined;
        if ('unitId' in a) uid = (a as any).unitId;
        else if ('attackerId' in a) uid = (a as any).attackerId;

        if (uid && !coveredUnits.has(uid) && !chosenIndices.has(i)) {
            const code = encodeAction(a);
            chosenIndices.add(i);
            coveredUnits.add(uid);
            selectionReasons[code] = 'unit_diversity';
        }
    }

    // E. 保证探索配额真正生效：从未选动作中用确定性 PRNG 抽取
    const remainingSlots = K - chosenIndices.size;
    if (remainingSlots > 0) {
        const unchosenIndices: number[] = [];
        for (let i = 0; i < A; i++) {
            if (!chosenIndices.has(i)) unchosenIndices.push(i);
        }

        // Fisher-Yates shuffle 用确定性 PRNG
        for (let i = unchosenIndices.length - 1; i > 0; i--) {
            const j = prng.nextInt(0, i);
            const tmp = unchosenIndices[i];
            unchosenIndices[i] = unchosenIndices[j];
            unchosenIndices[j] = tmp;
        }

        const toAdd = Math.min(remainingSlots, unchosenIndices.length);
        for (let i = 0; i < toAdd; i++) {
            const idx = unchosenIndices[i];
            chosenIndices.add(idx);
            selectionReasons[encodeAction(legalActions[idx])] = 'exploration_random';
        }
    }

    // 稳定排序：保持原 legalActions 相对顺序，确保可复现性
    const sortedIndices = Array.from(chosenIndices).sort((a, b) => a - b);
    const selectedActions = sortedIndices.map(idx => legalActions[idx]);
    const selectedCodes = selectedActions.map(a => encodeAction(a));

    return {
        selectedActions,
        selectedCodes,
        selectionReasons,
        explorationSlotsAllocated: explorationQuota
    };
}
