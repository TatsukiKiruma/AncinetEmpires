/**
 * Skirmish Value Labeling (R03)
 *
 * 1. 严格基于规则自然终局 (RULE_TERMINAL) 赋予价值目标：
 *    - 待评测方所属联盟获胜：+1.0
 *    - 待评测方所属联盟失败：-1.0
 *    - 规则自然平局：0.0
 * 2. 截断、未解决、裁定或身份未匹配样本：valueTarget = null, valueMask = 0.0。
 * 3. 确定性洗牌：仅在训练分区内部以显式 Seed 进行 PRNG 洗牌，严禁跨分区打乱。
 */

import type { TerminationCause } from './skirmish_evaluation_core';

export interface ValueLabelResult {
    valueTarget: number | null;
    valueMask: number; // 1.0 = participate in MSE, 0.0 = masked out
    reason: string;
}

/**
 * 纯函数：根据终局规则计算自然价值标签
 */
export function assignNaturalValueLabel(params: {
    engineTerminal: boolean;
    terminationCause: TerminationCause;
    winnerAlliance: number | null;
    subjectAllianceId: number;
    adjudicatedWinnerAlliance?: number | null;
}): ValueLabelResult {
    // 只有规则确认的自然终局才提供监督信号
    if (!params.engineTerminal || params.terminationCause !== 'RULE_TERMINAL') {
        return {
            valueTarget: null,
            valueMask: 0.0,
            reason: `未解决截断或非自然终局 (cause: ${params.terminationCause})，值目标置空并 mask`
        };
    }

    if (params.winnerAlliance === null || params.winnerAlliance === undefined || params.winnerAlliance === -1) {
        // 规则引擎确认为自然平局
        return {
            valueTarget: 0.0,
            valueMask: 1.0,
            reason: '规则自然平局，自然价值标签 = 0.0'
        };
    }

    if (params.winnerAlliance === params.subjectAllianceId) {
        return {
            valueTarget: 1.0,
            valueMask: 1.0,
            reason: `待评测方联盟 A${params.subjectAllianceId} 获得自然胜利，自然价值标签 = +1.0`
        };
    }

    return {
        valueTarget: -1.0,
        valueMask: 1.0,
        reason: `敌方联盟 A${params.winnerAlliance} 获胜，待评测方 A${params.subjectAllianceId} 自然失败，自然价值标签 = -1.0`
    };
}

/**
 * 纯函数：带有确定性 Seed 的 Mulberry32 伪随机数生成器
 */
export function createDeterministicPrng(seed: number): () => number {
    let s = seed | 0;
    return function () {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * 纯函数：在给定数组内部进行确定性 Fisher-Yates 洗牌
 */
export function shuffleArrayWithSeed<T>(array: T[], seed: number): T[] {
    const copy = [...array];
    const prng = createDeterministicPrng(seed);
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
    }
    return copy;
}
