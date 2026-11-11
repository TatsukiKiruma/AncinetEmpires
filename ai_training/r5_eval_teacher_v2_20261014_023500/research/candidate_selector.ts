import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { encodeAction } from '../env/src/game/env';

export interface CandidateSelectionOptions {
    targetK: number;
    nonTopPriorFraction?: number; // 探索比例，默认 0.20
    seed?: number; // 确定性种子
}

/**
 * 确定性 PRNG (LCG)
 */
function createDeterministicRng(seed: number = 42) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export interface CandidateSelectionResult {
    selectedActions: Action[];
    selectedCodes: string[];
    selectedIndicesInLegal: number[];
    selectionReasons: Record<string, string>; // actionCode -> reason
}

/**
 * 根候选选择器 (修正版)
 * 严格保证探索配额真正生效，固定确定性排序与种子，杜绝 Math.random 漂移。
 */
export function selectRootCandidates(
    engine: GameEngine,
    playerId: number,
    legalActions: readonly Action[],
    options: CandidateSelectionOptions,
    externalRng?: () => number
): CandidateSelectionResult {
    const K = Math.max(1, options.targetK);
    const A = legalActions.length;
    const rng = externalRng ?? createDeterministicRng(options.seed ?? 42);

    if (A <= K) {
        const codes = legalActions.map(encodeAction);
        const reasons: Record<string, string> = {};
        codes.forEach(c => (reasons[c] = 'all_legal_within_k'));
        return {
            selectedActions: [...legalActions],
            selectedCodes: codes,
            selectedIndicesInLegal: legalActions.map((_, i) => i),
            selectionReasons: reasons
        };
    }

    const state = engine.getState();
    const hAI = new HeuristicAI();

    // 1. 获取 HeuristicAI 启发式推荐的 topAction
    const topAction = hAI.getAction(engine, playerId);
    const topCode = topAction ? encodeAction(topAction) : null;

    const chosenIndices = new Set<number>();
    const selectionReasons: Record<string, string> = {};

    // 槽位配额分配：
    // explorationQuota: 预留给探索的槽位数
    const nonTopFrac = options.nonTopPriorFraction ?? 0.20;
    const explorationQuota = Math.max(0, Math.floor(K * nonTopFrac));
    const exploitationCapacity = K - explorationQuota; // 启发式与关键战术可用槽位

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
    // 注意：除非在特定防守/招募情境，不过度提前用 recruit_to_castle 占满战术槽位
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

    // E. 保证探索配额真正生效：从未选动作中用确定性种子抽取
    const remainingSlots = K - chosenIndices.size;
    if (remainingSlots > 0) {
        const unchosen: number[] = [];
        for (let i = 0; i < A; i++) {
            if (!chosenIndices.has(i)) unchosen.push(i);
        }

        // Fisher-Yates 确定性洗牌
        for (let i = unchosen.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [unchosen[i], unchosen[j]] = [unchosen[j], unchosen[i]];
        }

        for (let i = 0; i < remainingSlots && i < unchosen.length; i++) {
            const pick = unchosen[i];
            const code = encodeAction(legalActions[pick]);
            chosenIndices.add(pick);
            selectionReasons[code] = 'exploration_quota';
        }
    }

    // 最终候选按动作编码确定性排序，消除遍历顺序波动
    const finalIndices = [...chosenIndices].sort((a, b) => {
        const codeA = encodeAction(legalActions[a]);
        const codeB = encodeAction(legalActions[b]);
        return codeA.localeCompare(codeB);
    });

    return {
        selectedActions: finalIndices.map(i => legalActions[i]),
        selectedCodes: finalIndices.map(i => encodeAction(legalActions[i])),
        selectedIndicesInLegal: finalIndices,
        selectionReasons
    };
}
