/**
 * Independent verification harness (written by the reviewing agent, NOT part of the V8 batch).
 * Purpose: test the report's central causal claim that the frozen spatial prior has a
 * "negative bias" that displaces good heuristic candidates inside the bounded search.
 *
 * Method: replay matches where the candidate is SPATIAL_V2 (so both engine state and
 * prediction path are the real ones). At every candidate decision point run BOTH
 *   S00 (no spatial predictor) and S10 (with spatial predictor)
 * on the IDENTICAL state with the IDENTICAL budget, then compare choices and scores.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { Action, GameState } from '../src/game/types';
import { encodeAction } from '../src/game/env';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import {
    loadSpatialResNetFromJson,
    SpatialResNetPredictor
} from '../src/game/ai/spatial_conv_net';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';
import { runBoundedSearch } from './v7_heuristic_bounded_search';

const CHECKPOINT = 'training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json';
const OUT_DIR = 'training_runs/zz_verify';
const BUDGET = { maxMs: 200, maxNodes: 20, hardMaxMs: 900 };
const MAPS = ['(2) Duel.aem', '(2) Crossed swords.aem'];
const SEEDS = [42, 1337];
const MAX_TURNS = 45;

function pct(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Number(sorted[idx].toFixed(2));
}

const predictor = new SpatialResNetPredictor(
    loadSpatialResNetFromJson(readFileSync(CHECKPOINT, 'utf8'))
);

interface DecisionRecord {
    map: string;
    seed: number;
    step: number;
    legalCount: number;
    priorLogitRange: number;
    priorTopAction: string;
    priorRankOfHeuristicTop: number;
    candidateCount: number;
    s00Action: string;
    s10Action: string;
    agree: boolean;
    s00Score: number;
    s10Score: number;
    s00Nodes: number;
    s10Nodes: number;
    spatialMs: number;
    s00Ms: number;
    s10Ms: number;
}

const records: DecisionRecord[] = [];
const pairedScoreDiffs: number[] = [];
const displacementRankPcts: number[] = [];
const spatialLatencies: number[] = [];

for (const map of MAPS) {
    for (const seed of SEEDS) {
        const state: GameState = createAppApkSkirmishGameState(map, 'SD');
        (state as any).mapName = map;
        const engine = new GameEngine(state);
        const candidateSeat = 0;
        // Match the benchmark's PRNG derivation so the replay is on-distribution.
        const opponentRng = (() => {
            let s = ((seed * 10007 + 2) >>> 0) ^ 0x12345678;
            return () => {
                s = (s + 0x6D2B79F5) >>> 0;
                let t = Math.imul(s ^ (s >>> 15), 1 | s);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        })();
        const opponent = new HeuristicAI(opponentRng);
        let steps = 0;

        while (!engine.isTerminal() && engine.getState().turn <= MAX_TURNS && steps < 800) {
            const cur = engine.getState();
            const player = cur.currentPlayer;
            const legal = engine.getLegalActions(player).filter((a: Action) => a.type !== 'surrender');
            if (legal.length === 0) {
                engine.step({ type: 'end_turn' } as Action);
                steps++;
                continue;
            }

            if (player === candidateSeat && legal.length > 1) {
                // --- Real spatial prediction path (same 2-arg contract the benchmark uses) ---
                const tSpatial = performance.now();
                const enc = encodeGameStateSpatial(cur, player, 'v2');
                const cands = legal.map((a: Action) => {
                    const f = encodeCandidateActionSpatial(cur, player, a, 'v2');
                    return {
                        actorCoord: f.actorCoord,
                        landingCoord: f.landingCoord,
                        targetCoord: f.targetCoord,
                        semantics: f.semantics
                    };
                });
                const pred = predictor.predict(enc, cands);
                const spatialMs = performance.now() - tSpatial;
                spatialLatencies.push(spatialMs);

                // --- Heuristic scoring on the identical state ---
                const hAi = new HeuristicAI();
                const hScores = hAi.scoreCandidateActions(engine, player, legal) as Array<{ action: Action; score: number }>;
                const scoreByCode = new Map<string, number>();
                for (const s of hScores) scoreByCode.set(encodeAction(s.action), s.score);

                // Where does the spatial prior rank the heuristic top action?
                const hTop = [...hScores].sort((a, b) => b.score - a.score)[0];
                const hTopCode = hTop ? encodeAction(hTop.action) : '';
                const order = legal
                    .map((a: Action, i: number) => ({ a, i, logit: pred.actionLogits[i] }))
                    .sort((x, y) => y.logit - x.logit);
                const rankOfH = order.findIndex(o => encodeAction(o.a) === hTopCode);
                if (order.length > 1 && rankOfH >= 0) {
                    displacementRankPcts.push(rankOfH / (order.length - 1));
                }

                // --- S00 vs S10 on the identical state and identical budget ---
                const t0 = performance.now();
                const r00 = runBoundedSearch(engine, player, { budget: BUDGET, heuristicAi: new HeuristicAI() });
                const s00Ms = performance.now() - t0;
                const t1 = performance.now();
                const r10 = runBoundedSearch(engine, player, {
                    budget: BUDGET,
                    heuristicAi: new HeuristicAI(),
                    spatialPredictor: predictor
                });
                const s10Ms = performance.now() - t1;

                const s00Code = r00.chosenActionCode;
                const s10Code = r10.chosenActionCode;
                const sc00 = scoreByCode.get(s00Code);
                const sc10 = scoreByCode.get(s10Code);
                if (typeof sc00 === 'number' && typeof sc10 === 'number') {
                    pairedScoreDiffs.push(sc10 - sc00);
                }

                records.push({
                    map, seed, step: steps,
                    legalCount: legal.length,
                    priorLogitRange: Number((Math.max(...pred.actionLogits) - Math.min(...pred.actionLogits)).toFixed(4)),
                    priorTopAction: order[0] ? encodeAction(order[0].a) : '',
                    priorRankOfHeuristicTop: rankOfH,
                    candidateCount: r10.traces.length,
                    s00Action: s00Code,
                    s10Action: s10Code,
                    agree: s00Code === s10Code,
                    s00Score: sc00 ?? Number.NaN,
                    s10Score: sc10 ?? Number.NaN,
                    s00Nodes: r00.totalNodes,
                    s10Nodes: r10.totalNodes,
                    spatialMs: Number(spatialMs.toFixed(3)),
                    s00Ms: Number(s00Ms.toFixed(2)),
                    s10Ms: Number(s10Ms.toFixed(2))
                });

                // Advance the real match using the real spatial policy choice (SPATIAL_V2).
                const bestIdx = pred.bestActionIndex;
                engine.step(legal[bestIdx] ?? legal[0]);
            } else if (player === candidateSeat) {
                const enc = encodeGameStateSpatial(cur, player, 'v2');
                const cands = legal.map((a: Action) => {
                    const f = encodeCandidateActionSpatial(cur, player, a, 'v2');
                    return { actorCoord: f.actorCoord, landingCoord: f.landingCoord, targetCoord: f.targetCoord, semantics: f.semantics };
                });
                const pred = predictor.predict(enc, cands);
                engine.step(legal[pred.bestActionIndex] ?? legal[0]);
            } else {
                engine.step(opponent.getAction(engine, player, legal));
            }
            steps++;
        }
    }
}

const sortedSpatial = [...spatialLatencies].sort((a, b) => a - b);
const agreeCount = records.filter(r => r.agree).length;
const better10 = records.filter(r => r.s10Score > r.s00Score).length;
const worse10 = records.filter(r => r.s10Score < r.s00Score).length;
const meanDiff = pairedScoreDiffs.length
    ? pairedScoreDiffs.reduce((a, b) => a + b, 0) / pairedScoreDiffs.length
    : 0;
const meanRankPct = displacementRankPcts.length
    ? displacementRankPcts.reduce((a, b) => a + b, 0) / displacementRankPcts.length
    : 0;

const report = {
    generatedBy: 'reviewing-agent independent verification (zz_verify_prior_bias.ts)',
    checkpoint: CHECKPOINT,
    budget: BUDGET,
    maps: MAPS,
    seeds: SEEDS,
    decisionPointsAnalyzed: records.length,
    spatialInferenceLatencyMs: {
        mean: Number((sortedSpatial.reduce((a, b) => a + b, 0) / Math.max(1, sortedSpatial.length)).toFixed(2)),
        p50: pct(sortedSpatial, 50),
        p95: pct(sortedSpatial, 95),
        p99: pct(sortedSpatial, 99),
        max: Number((sortedSpatial[sortedSpatial.length - 1] ?? 0).toFixed(2))
    },
    searchAgreement: {
        total: records.length,
        agree: agreeCount,
        agreePct: Number((100 * agreeCount / Math.max(1, records.length)).toFixed(1))
    },
    chosenActionQualityVsS00: {
        s10Better: better10,
        s10Worse: worse10,
        s10Same: agreeCount,
        meanPairedScoreDelta: Number(meanDiff.toFixed(2))
    },
    priorRankOfHeuristicTopAction: {
        meanPercentileRank: Number(meanRankPct.toFixed(3)),
        note: '0.0 = prior always ranks the heuristic top action first; 1.0 = always ranks it last'
    },
    nodes: {
        s00Mean: Number((records.reduce((a, r) => a + r.s00Nodes, 0) / Math.max(1, records.length)).toFixed(2)),
        s10Mean: Number((records.reduce((a, r) => a + r.s10Nodes, 0) / Math.max(1, records.length)).toFixed(2))
    },
    urgentActionDisplacement: {
        s00Urgent: records.filter(r => r.s00Score >= 50000).length,
        s10Urgent: records.filter(r => r.s10Score >= 50000).length,
        urgentLostByS10: records.filter(r => r.s00Score >= 50000 && r.s10Score < 50000).length
    },
    allRecords: records
};

mkdirSync(path.resolve(OUT_DIR), { recursive: true });
writeFileSync(path.resolve(OUT_DIR, 'prior_analysis.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('=== INDEPENDENT PRIOR-BIAS VERIFICATION ===');
console.log(`decision points analyzed: ${records.length}`);
console.log(`spatial inference latency (ms): mean=${report.spatialInferenceLatencyMs.mean} p50=${report.spatialInferenceLatencyMs.p50} p95=${report.spatialInferenceLatencyMs.p95} p99=${report.spatialInferenceLatencyMs.p99} max=${report.spatialInferenceLatencyMs.max}`);
console.log(`S00/S10 agreement: ${agreeCount}/${records.length} (${report.searchAgreement.agreePct}%)`);
console.log(`S10 better than S00: ${better10} | worse: ${worse10} | same: ${agreeCount}`);
console.log(`mean paired heuristic-score delta (S10 - S00): ${report.chosenActionQualityVsS00.meanPairedScoreDelta}`);
console.log(`mean percentile rank of heuristic top action under spatial prior: ${report.priorRankOfHeuristicTopAction.meanPercentileRank}`);
console.log(`mean nodes: S00=${report.nodes.s00Mean} S10=${report.nodes.s10Mean}`);
console.log(`report written to ${path.resolve(OUT_DIR, 'prior_analysis.json')}`);
