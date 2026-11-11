import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { encodeAction } from '../env/src/game/env';

export interface CandidateSelectionOptions {
    targetK: number;
    nonTopPriorFraction?: number; // 默认 0.20 探索比例
}

/**
 * 根候选选择器
 * 从当前全部合法候选集合中筛选代表性的 K 个动作
 */
export function selectRootCandidates(
    engine: GameEngine,
    playerId: number,
    legalActions: readonly Action[],
    options: CandidateSelectionOptions,
    rng: () => number = Math.random
): {
    selectedActions: Action[];
    selectedCodes: string[];
    selectedIndicesInLegal: number[];
} {
    const K = options.targetK;
    const A = legalActions.length;
    if (A <= K) {
        return {
            selectedActions: [...legalActions],
            selectedCodes: legalActions.map(encodeAction),
            selectedIndicesInLegal: legalActions.map((_, i) => i)
        };
    }

    const state = engine.getState();
    const hAI = new HeuristicAI();

    // 1. 获取 HeuristicAI 对所有动作的评分先验
    // HeuristicAI 内部按其启发式对候选排序
    const sortedIndices: number[] = legalActions.map((_, i) => i);
    // 用 HeuristicAI 选择最佳动作
    const topAction = hAI.getAction(engine, playerId);
    const topCode = topAction ? encodeAction(topAction) : null;

    // 2. 战术动作加权与分类桶
    const chosenIndices = new Set<number>();

    // 必须包含 topAction
    if (topCode) {
        const topIdx = legalActions.findIndex(a => encodeAction(a) === topCode);
        if (topIdx >= 0) chosenIndices.add(topIdx);
    } else {
        chosenIndices.add(0);
    }

    // 若有 pending 单位，优先加入该 pending 单位的部署动作
    if (state.pendingUnitId) {
        for (let i = 0; i < A; i++) {
            const act = legalActions[i];
            if ('unitId' in act && act.unitId === state.pendingUnitId) {
                chosenIndices.add(i);
                if (chosenIndices.size >= K) break;
            }
        }
    }

    // 覆盖关键战术类别：attack, capture, heal, summon, repair, recruit
    const keyTypes = ['attack', 'capture', 'heal', 'summon', 'repair', 'recruit_to_castle'];
    for (const kt of keyTypes) {
        if (chosenIndices.size >= K) break;
        for (let i = 0; i < A; i++) {
            if (!chosenIndices.has(i) && legalActions[i].type === kt) {
                chosenIndices.add(i);
                break; // 每个类型至少取一个
            }
        }
    }

    // 覆盖不同单位的行动
    const coveredUnits = new Set<string>();
    for (const idx of chosenIndices) {
        const a = legalActions[idx];
        if ('unitId' in a) coveredUnits.add((a as any).unitId);
        else if ('attackerId' in a) coveredUnits.add((a as any).attackerId);
    }

    for (let i = 0; i < A && chosenIndices.size < K; i++) {
        const a = legalActions[i];
        let uid: string | undefined;
        if ('unitId' in a) uid = (a as any).unitId;
        else if ('attackerId' in a) uid = (a as any).attackerId;

        if (uid && !coveredUnits.has(uid)) {
            chosenIndices.add(i);
            coveredUnits.add(uid);
        }
    }

    // 探索性动作注入（nonTopPriorFraction = 0.20）
    const remainingSlots = K - chosenIndices.size;
    if (remainingSlots > 0) {
        const unchosen: number[] = [];
        for (let i = 0; i < A; i++) {
            if (!chosenIndices.has(i)) unchosen.push(i);
        }
        // 洗牌未选动作
        for (let i = unchosen.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [unchosen[i], unchosen[j]] = [unchosen[j], unchosen[i]];
        }
        for (let i = 0; i < remainingSlots && i < unchosen.length; i++) {
            chosenIndices.add(unchosen[i]);
        }
    }

    const finalIndices = [...chosenIndices].sort((a, b) => a - b);
    return {
        selectedActions: finalIndices.map(i => legalActions[i]),
        selectedCodes: finalIndices.map(i => encodeAction(legalActions[i])),
        selectedIndicesInLegal: finalIndices
    };
}
