import { describe, it, expect } from 'vitest';
import {
    classifyGameOutcome,
    aggregateOutcomes,
    evaluatePromotion,
    renderGateReportMarkdown,
    type PromotionPolicy,
    type GameOutcomeRecord
} from './skirmish_evaluation_core';

describe('R00 / R01: Evaluation Core & Gate Decision', () => {
    const defaultPolicy: PromotionPolicy = {
        targetModelHash: 'HASH_MODEL_A',
        minCompletedGames: 8,
        minNaturalWinRate: 0.5,
        minConservativeScoreLowerBound: 0.5,
        maxAllowedIllegalActions: 0,
        maxAllowedDeadlineMisses: 0,
        hardDeadlineMs: 1000,
        requireZeroTruncation: false
    };

    it('分类：正确区分规则自然胜负平与步数截断', () => {
        // 自然胜
        const win = classifyGameOutcome({
            episodeId: 'ep_1',
            seed: 100,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 45,
            maxSteps: 150,
            engineTerminal: true,
            winnerAlliance: 0
        });
        expect(win.naturalOutcome).toBe('WIN');
        expect(win.terminationCause).toBe('RULE_TERMINAL');

        // 自然负
        const loss = classifyGameOutcome({
            episodeId: 'ep_2',
            seed: 101,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 50,
            maxSteps: 150,
            engineTerminal: true,
            winnerAlliance: 1
        });
        expect(loss.naturalOutcome).toBe('LOSS');
        expect(loss.terminationCause).toBe('RULE_TERMINAL');

        // 步数截断 (maxSteps 达到，无胜者) -> UNRESOLVED / MAX_STEPS，绝不是 DRAW
        const truncated = classifyGameOutcome({
            episodeId: 'ep_3',
            seed: 102,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 150,
            maxSteps: 150,
            engineTerminal: false,
            winnerAlliance: null
        });
        expect(truncated.naturalOutcome).toBe('UNRESOLVED');
        expect(truncated.terminationCause).toBe('MAX_STEPS');

        // 仅材料裁定胜者 -> 不得伪装为自然胜者
        const adj = classifyGameOutcome({
            episodeId: 'ep_4',
            seed: 103,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 150,
            maxSteps: 150,
            engineTerminal: false,
            winnerAlliance: null,
            adjudicatedWinnerAlliance: 0,
            adjudicationMethod: 'MATERIAL_COUNT'
        });
        expect(adj.naturalOutcome).toBe('UNRESOLVED');
        expect(adj.terminationCause).toBe('MAX_STEPS');
        expect(adj.adjudicatedWinnerAlliance).toBe(0);
    });

    it('聚合：全截断记录得分率为 null，下界为 0，不能视为平局 0.5', () => {
        const records: GameOutcomeRecord[] = Array.from({ length: 8 }, (_, i) => classifyGameOutcome({
            episodeId: `trunc_${i}`,
            seed: 9001 + i,
            candidateSeat: i % 2,
            candidateAllianceId: i % 2,
            stepCount: 150,
            maxSteps: 150,
            engineTerminal: false,
            winnerAlliance: null
        }));

        const agg = aggregateOutcomes(records);
        expect(agg.totalGames).toBe(8);
        expect(agg.naturalWins).toBe(0);
        expect(agg.naturalDraws).toBe(0);
        expect(agg.truncatedCount).toBe(8);
        expect(agg.naturalWinRate).toBe(0);
        expect(agg.resolvedScoreRate).toBeNull();
        expect(agg.conservativeScoreBounds).toEqual([0, 1.0]); // 下界 0.0，上界 1.0
    });

    it('门禁反例 1：全截断 records 无法通过晋级门禁 (REJECTED_TRUNCATION)', () => {
        const records: GameOutcomeRecord[] = Array.from({ length: 8 }, (_, i) => classifyGameOutcome({
            episodeId: `trunc_${i}`,
            seed: 9001 + i,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 150,
            maxSteps: 150,
            engineTerminal: false,
            winnerAlliance: null,
            modelHash: 'HASH_MODEL_A'
        }));

        const decision = evaluatePromotion(records, defaultPolicy);
        expect(decision.passed).toBe(false);
        expect(decision.verdict).toBe('REJECTED_TRUNCATION');
        expect(decision.blockingDefects.some(d => d.includes('ALL_TRUNCATED'))).toBe(true);
    });

    it('门禁反例 2：模型 Hash 错配无法通过晋级门禁 (MODEL_HASH_MISMATCH)', () => {
        const records: GameOutcomeRecord[] = Array.from({ length: 8 }, (_, i) => classifyGameOutcome({
            episodeId: `win_${i}`,
            seed: 1000 + i,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 40,
            maxSteps: 150,
            engineTerminal: true,
            winnerAlliance: 0,
            modelHash: 'HASH_WRONG_B' // 错配
        }));

        const decision = evaluatePromotion(records, defaultPolicy, { actualModelHash: 'HASH_WRONG_B' });
        expect(decision.passed).toBe(false);
        expect(decision.blockingDefects.some(d => d.includes('MODEL_HASH_MISMATCH'))).toBe(true);
    });

    it('门禁反例 3：分区泄漏时被强制阻断 (REJECTED_LEAKAGE)', () => {
        const records: GameOutcomeRecord[] = Array.from({ length: 8 }, (_, i) => classifyGameOutcome({
            episodeId: `win_${i}`,
            seed: 1000 + i,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 40,
            maxSteps: 150,
            engineTerminal: true,
            winnerAlliance: 0,
            modelHash: 'HASH_MODEL_A'
        }));

        const decision = evaluatePromotion(records, defaultPolicy, { partitionLeakageDetected: true });
        expect(decision.passed).toBe(false);
        expect(decision.verdict).toBe('REJECTED_LEAKAGE');
        expect(decision.blockingDefects.some(d => d.includes('PARTITION_LEAKAGE'))).toBe(true);
    });

    it('门禁反例 4：实测耗时 1200ms 超限被强制阻断 (REJECTED_LATENCY)', () => {
        const records: GameOutcomeRecord[] = Array.from({ length: 8 }, (_, i) => classifyGameOutcome({
            episodeId: `win_${i}`,
            seed: 1000 + i,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 40,
            maxSteps: 150,
            engineTerminal: true,
            winnerAlliance: 0,
            maxLatencyMs: i === 3 ? 1205 : 450, // 第 3 局超时
            decisionDeadlineMissCount: i === 3 ? 1 : 0,
            modelHash: 'HASH_MODEL_A'
        }));

        const decision = evaluatePromotion(records, defaultPolicy);
        expect(decision.passed).toBe(false);
        expect(decision.verdict).toBe('REJECTED_LATENCY');
        expect(decision.blockingDefects.some(d => d.includes('LATENCY_VIOLATION'))).toBe(true);
    });

    it('门禁反例 5：非法动作数非零被强制阻断', () => {
        const records: GameOutcomeRecord[] = Array.from({ length: 8 }, (_, i) => classifyGameOutcome({
            episodeId: `win_${i}`,
            seed: 1000 + i,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 40,
            maxSteps: 150,
            engineTerminal: true,
            winnerAlliance: 0,
            illegalActionCount: i === 0 ? 1 : 0, // 非法动作
            modelHash: 'HASH_MODEL_A'
        }));

        const decision = evaluatePromotion(records, defaultPolicy);
        expect(decision.passed).toBe(false);
        expect(decision.blockingDefects.some(d => d.includes('ILLEGAL_ACTIONS'))).toBe(true);
    });

    it('门禁通过：真实 8 局自然全胜、0非法、0超时且 Hash 一致时方可通过', () => {
        const records: GameOutcomeRecord[] = Array.from({ length: 8 }, (_, i) => classifyGameOutcome({
            episodeId: `win_${i}`,
            seed: 1000 + i,
            candidateSeat: 0,
            candidateAllianceId: 0,
            stepCount: 40,
            maxSteps: 150,
            engineTerminal: true,
            winnerAlliance: 0,
            maxLatencyMs: 450,
            modelHash: 'HASH_MODEL_A'
        }));

        const decision = evaluatePromotion(records, defaultPolicy, { actualModelHash: 'HASH_MODEL_A' });
        expect(decision.passed).toBe(true);
        expect(decision.verdict).toBe('QUALIFIED');
        expect(decision.blockingDefects.length).toBe(0);

        const md = renderGateReportMarkdown(decision, 'Gate D2 Test', 'test_run');
        expect(md).toContain('QUALIFIED');
        expect(md).not.toContain('OFFICIALLY PASSED');
    });
});
