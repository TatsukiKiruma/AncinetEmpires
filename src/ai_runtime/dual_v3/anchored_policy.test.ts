import { describe, expect, it } from 'vitest';
import { anchoredCandidates, rootLogPriors, rolloutPriorScale, safeBaselineReplacement } from './anchored_policy';
import { searchTeacher } from './search_teacher';
import type { RankedAction } from './search_policy';
import { GameEngine } from '../../game/engine';
import { createDemoState } from '../../game/demo_map';
import { BatchedNeuralBeamSearchAI } from './batched_beam_search';
import type { BatchedSearchModel } from './batched_search_types';
import { encodeAction } from '../../game/env';

describe('V5先验锚定与对称回合', () => {
    const ranked = (score: number, i: number, forbidden = false): RankedAction => ({ action: { type: 'end_turn' }, code: String(i), score, prior: 0, forbidden });
    it('敌我先验独立，未闭合主干不能被仅仅更快完成的分支替换', () => {
        const options = { modelVersion: '测试', priorScale: .35, ownRolloutPriorScale: .7, enemyPriorScale: 1 };
        expect(rolloutPriorScale(options, true)).toBe(.7);
        expect(rolloutPriorScale(options, false)).toBe(1);
        const candidate = { id: 'a', rootAction: 'a', value: .9, score: .49, ownChains: 1, responseComplete: true, responseActions: 1, unsafe: false, safe: true, eliminated: false, selected: false };
        expect(safeBaselineReplacement([candidate], .5)).toBeUndefined();
        expect(safeBaselineReplacement([{ ...candidate, score: .5 }], .5)).toBeUndefined();
        expect(safeBaselineReplacement([{ ...candidate, score: .51, responseComplete: false }], .5)).toBeUndefined();
        expect(safeBaselineReplacement([{ ...candidate, score: .51, safe: false }], .5)).toBeUndefined();
        expect(safeBaselineReplacement([{ ...candidate, score: .51 }], .5)?.id).toBe('a');
    });
    it('禁手不注入，保送前半主干，拒绝低先验尾部；不足两个才回退', () => {
        const rows = [ranked(100, 0, true), ...Array.from({ length: 12 }, (_, i) => ranked(99 - i, i + 1)), ranked(-100, 99)];
        const pool = anchoredCandidates(rows, 8);
        expect(pool.slice(0, 4).map(r => r.code)).toEqual(['1', '2', '3', '4']);
        expect(pool.some(r => r.forbidden || r.code === '99')).toBe(false);
        expect(anchoredCandidates([rows[0], rows[1]], 8)).toHaveLength(2);
    });
    it('微小Q噪声不能压过先验，教师同时保留纯Q及锚定分数', () => {
        const prior = rootLogPriors([ranked(10, 0), ranked(8, 1)], 4);
        const scores = [.5, .51].map((value, i) => ({ rootAction: String(i), value, score: value + .1 * prior.get(String(i))!, responseComplete: true }));
        const teacher = searchTeacher(['0', '1', '2'], scores);
        expect(teacher.qValues).toEqual([.5, .51, null]);
        expect(teacher.anchoredScores[0]!).toBeGreaterThan(teacher.anchoredScores[1]!);
        expect(teacher.probabilities[0]).toBeGreaterThan(teacher.probabilities[1]);
        expect(teacher.evaluatedMask[2]).toBe(false);
        expect(teacher.probabilities[2]).toBe(0);
    });
    it('所有决赛分支同波次推进；己方剩余动作由模型选择，队列仅兑现首链', async () => {
        const engine = new GameEngine(createDemoState()), initial = engine.getState(), witnesses: any[] = [];
        const model: BatchedSearchModel = { forwardBatch: async rows => rows.map(o => ({
            logits: Float32Array.from(o.actions.sourceIndices, (_, i) => o.actions.pointers[i * 5 + 2] === 13 ? -1000 : 0), valueLogits: new Float32Array(6),
            valueProbs: Float32Array.from(o.playerOrder.active, a => a / o.playerOrder.active.reduce((x, y) => x + y, 0))
        })) };
        const ai = new BatchedNeuralBeamSearchAI(model, { modelVersion: 'V5合同', ownTurnRollout: true, budgetMs: 4000,
            ownFraction: .4, maxNodes: 2400, finalists: 4, responseVariants: 1, responseUnits: 128, ownRolloutMaxChains: 24,
            enemyPriorScale: 1, priorScale: .7, onWitness: w => witnesses.push(w) });
        const action = await ai.getAction(engine, initial.currentPlayer);
        expect(engine.hasLegalAction(initial.currentPlayer, action)).toBe(true);
        expect(engine.getState()).toEqual(initial);
        expect(ai.telemetry.candidates.length).toBeGreaterThan(1);
        expect(ai.telemetry.candidates.every(c => c.ownChains === 1)).toBe(true);
        expect(ai.telemetry.candidates.flatMap(c => c.responseReasons).includes('cohort_deferred')).toBe(false);
        expect(ai.telemetry.batchSizes.some(n => n >= 4)).toBe(true);
        const responses = witnesses.filter(w => w.actions.some((_: unknown, i: number) => i > 3));
        expect(responses.length).toBeGreaterThan(0);
        // 存在己方未动单位的响应轨迹必须继续行动，不能强制裸接敌回合。
        const remaining = responses.filter(w => w.initial.currentPlayer === initial.currentPlayer && new GameEngine(w.initial).getLegalActions(initial.currentPlayer).some(a => a.type !== 'end_turn' && a.type !== 'surrender'));
        expect(remaining.length).toBeGreaterThan(0);
        expect(remaining.every(w => w.actions[0].type !== 'end_turn')).toBe(true);
        for (const w of witnesses) {
            const replay = new GameEngine(w.initial);
            for (const a of w.actions) { expect(replay.hasLegalAction(replay.getState().currentPlayer, a)).toBe(true); replay.step(a); }
            expect(replay.getState()).toEqual(w.final);
        }
        expect(ai.telemetry.rootProposed[0]).toBeDefined();
        expect(ai.telemetry.rootCovered).toContain(ai.telemetry.rootProposed[0]);
        expect(ai.telemetry.candidates.some(c => c.rootAction === encodeAction(action))).toBe(true);
    });
});
