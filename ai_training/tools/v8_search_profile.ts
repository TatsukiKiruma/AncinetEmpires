/**
 * Read-only search-stage profiler for S00/S10.
 *
 * Replays a recorded closure_01 trajectory and times the stages that dominate
 * bounded search latency: legal-action enumeration, HeuristicAI scoring,
 * candidate filtering, engine.clone(), leaf evaluation, spatial predictor
 * inference, and the full runBoundedSearch call.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { evaluatePositionHeuristic, getFilteredCandidateActions, runBoundedSearch } from './v7_heuristic_bounded_search';
import { computePercentile } from './v7_unified_evaluation';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function median(values: number[]): number {
    return computePercentile([...values].sort((a, b) => a - b), 50);
}

function timeIt(fn: () => void, runs = 3): number {
    const values: number[] = [];
    for (let i = 0; i < runs; i++) {
        const start = performance.now();
        fn();
        values.push(performance.now() - start);
    }
    return median(values);
}

const trajectoryPath = path.resolve(arg('--trajectory', 'training_runs/agent_upgrade_20260921_v8_closure_01/trajectories/match_S00_SEARCH_seat0__2__Duel_aem_s1337.json')!);
const mapName = arg('--map', '(2) Duel.aem')!;
const seat = Number(arg('--seat', '0'));
const steps = (arg('--steps', '60,120,200,320,500,700')!).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
const every = arg('--every') ? Number(arg('--every')) : null;
const maxRows = arg('--max-rows') ? Number(arg('--max-rows')) : Number.POSITIVE_INFINITY;
const shouldProfile = (step: number): boolean =>
    every !== null ? step % every === 0 : steps.includes(step);
const modelPath = path.resolve(arg('--model', 'training_runs/agent_upgrade_20260921_v8_closure_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json')!);
const budgetMs = Number(arg('--budget-ms', '200'));
const budgetNodes = Number(arg('--budget-nodes', '20'));
const hardBudgetMs = Number(arg('--hard-ms', '900'));
const outPath = arg('--out');

const trajectory = JSON.parse(fs.readFileSync(trajectoryPath, 'utf8'));
const weights = loadSpatialResNetFromJson(fs.readFileSync(modelPath, 'utf8'));
const predictor = new SpatialResNetPredictor(weights);
const heuristic = new HeuristicAI();
const engine = new GameEngine(createAppApkSkirmishGameState(mapName, 'SD'));
const rows: any[] = [];

for (const entry of trajectory.actionHistory ?? []) {
    if (shouldProfile(entry.step) && engine.getState().currentPlayer === seat && rows.length < maxRows) {
        const legal = engine.getLegalActions(seat).filter((a: any) => a.type !== 'surrender');
        const quotas = { maxTotal: 10, topSpatialK: 6, tacticalQuota: 4, heuristicQuota: 4 };
        const heuristicGetActionMs = timeIt(() => heuristic.getAction(engine, seat, legal));
        const heuristicScoreAllMs = timeIt(() => heuristic.scoreCandidateActions(engine, seat, legal));
        const filteredCandidatesMs = timeIt(() => getFilteredCandidateActions(engine, seat, heuristic, predictor, quotas));
        // The pre-refactor fixed per-decision overhead: a standalone HeuristicAI.getAction() call for the
        // fallback top action PLUS a candidate-filtering pass that performed its own full scoring pass.
        const legacyFixedOverheadMs = timeIt(() => {
            heuristic.getAction(engine, seat, legal);
            getFilteredCandidateActions(engine, seat, heuristic, predictor, quotas);
        });
        // The post-refactor fixed per-decision overhead: one scoring pass, reused by the filter.
        const newFixedOverheadMs = timeIt(() => {
            const scores = heuristic.scoreCandidateActions(engine, seat, legal);
            getFilteredCandidateActions(engine, seat, heuristic, predictor, quotas, scores);
        });
        const cloneMs = timeIt(() => { engine.clone(); });
        const leafEvalMs = timeIt(() => {
            const cloned = engine.clone();
            evaluatePositionHeuristic(cloned.getState(), seat);
        });
        const predictorAllLegalMs = timeIt(() => {
            const state = engine.getState();
            const encodedState = encodeGameStateSpatial(state, seat, 'v2');
            const candidateFeatures = legal.map((action: any) => {
                const feature = encodeCandidateActionSpatial(state, seat, action, 'v2');
                return { actorCoord: feature.actorCoord, landingCoord: feature.landingCoord, targetCoord: feature.targetCoord, semantics: feature.semantics };
            });
            predictor.predict(encodedState, candidateFeatures);
        }, 2);
        const boundedSearchStart = performance.now();
        const search = runBoundedSearch(engine, seat, {
            budget: { maxMs: budgetMs, maxNodes: budgetNodes, hardMaxMs: hardBudgetMs },
            heuristicAi: heuristic,
            spatialPredictor: predictor
        });
        const boundedSearchMs = performance.now() - boundedSearchStart;

        rows.push({
            step: entry.step,
            turn: engine.getState().turn,
            legalActions: legal.length,
            heuristicGetActionMs: Number(heuristicGetActionMs.toFixed(2)),
            heuristicScoreAllMs: Number(heuristicScoreAllMs.toFixed(2)),
            filteredCandidatesMs: Number(filteredCandidatesMs.toFixed(2)),
            legacyFixedOverheadMs: Number(legacyFixedOverheadMs.toFixed(2)),
            newFixedOverheadMs: Number(newFixedOverheadMs.toFixed(2)),
            cloneMs: Number(cloneMs.toFixed(2)),
            leafEvalMs: Number(leafEvalMs.toFixed(2)),
            predictorAllLegalMs: Number(predictorAllLegalMs.toFixed(2)),
            boundedSearchMs: Number(boundedSearchMs.toFixed(2)),
            boundedSearchFallback: search.deadlineFallbackCount ?? 0,
            boundedSearchWallClockExceeded: search.wallClockExceeded ?? false,
            boundedSearchNodes: search.totalNodes,
            boundedSearchCandidatesEvaluated: search.candidatesEvaluated ?? 0,
            boundedSearchShallowEvaluations: search.shallowEvaluations ?? 0,
            boundedSearchReason: search.budgetReason,
            boundedSearchTraces: search.traces.length
        });
    }
    engine.step(entry.action as any);
}

const result = {
    profiledAt: new Date().toISOString(),
    source: trajectoryPath.replace(/\\/g, '/'),
    mapName,
    seat,
    budget: { maxMs: budgetMs, maxNodes: budgetNodes, hardMaxMs: hardBudgetMs },
    rows
};
const json = JSON.stringify(result, null, 2);
if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), json, 'utf8');
    console.log(`Wrote profile to ${path.resolve(outPath)}`);
} else {
    console.log(json);
}