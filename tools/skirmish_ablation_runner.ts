import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { AncientEmpiresEnv } from '../src/game/env';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import type { GameState } from '../src/game/types';
import {
    searchTeacherAction,
    createSearchTeacherPolicyFactory,
    type SearchTeacherDecision
} from './skirmish_search_teacher';
import {
    loadDualHeadModelFromJson
} from './skirmish_dual_head_net';
import {
    createNetworkModelScorer,
    createNetworkLeafEvaluator
} from './skirmish_neural_search';
import {
    createHeuristicBaselinePolicy,
    runSkirmishEpisode,
    type SkirmishPolicyFactory
} from './skirmish_training_runner';
import { classifyGameOutcome, aggregateOutcomes, type GameOutcomeRecord } from './skirmish_evaluation_core';
import { computeSha256 } from './skirmish_model_registry';

export interface AblationOptions {
    runId?: string;
    modelPath?: string;
    dryRun?: boolean;
}

export function updateBudget(reportDir: string, runId: string, queries: number, games: number, purpose: string) {
    const budgetPath = path.join(reportDir, 'budget.json');
    const ledgerPath = path.join(reportDir, 'budget-ledger.jsonl');
    if (!existsSync(budgetPath)) return;

    try {
        const b: any = JSON.parse(readFileSync(budgetPath, 'utf8'));
        if (b.allocated) {
            b.allocated.teacherQueriesUsed = (b.allocated.teacherQueriesUsed ?? 0) + queries;
            b.allocated.gamesUsed = (b.allocated.gamesUsed ?? 0) + games;
            if (b.remaining) {
                b.remaining.teacherQueriesAvailable = Math.max(0, b.limits.teacherQueries - b.allocated.teacherQueriesUsed);
                b.remaining.gamesAvailable = Math.max(0, b.limits.totalGames - b.allocated.gamesReserved - b.allocated.gamesUsed);
            }
        }
        writeFileSync(budgetPath, JSON.stringify(b, null, 2), 'utf8');

        const entry = {
            timestamp: new Date().toISOString(),
            runId,
            purpose,
            queriesDeducted: queries,
            gamesDeducted: games,
            totalQueriesUsed: b.allocated?.teacherQueriesUsed,
            totalGamesUsed: b.allocated?.gamesUsed
        };
        appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
        console.warn('Budget update skipped:', err);
    }
}

export function createTacticalState(variation: number): GameState {
    const s = createDemoState(getApkSkirmishRuleConfig('SD'));
    const u1 = s.units.find(u => u.id === 'u1');
    const u2 = s.units.find(u => u.id === 'u2');
    const u3 = s.units.find(u => u.id === 'u3');
    const u4 = s.units.find(u => u.id === 'u4');

    if (u1) { u1.pos = { x: 3, y: 3 }; u1.hp = 70; }
    if (u2) { u2.pos = { x: 4, y: 3 + (variation % 2) }; u2.hp = 70; }
    if (u3) { u3.pos = { x: 3, y: 2 }; u3.hp = 60; }
    if (u4) { u4.pos = { x: 4, y: 4 - (variation % 2) }; u4.hp = 60; }
    s.players[0].gold = 100;
    s.players[1].gold = 100;
    s.turn = 4 + variation;
    return s;
}

export async function runNeuralSearchAblation(options: AblationOptions = {}) {
    const runId = options.runId ?? 'agent_upgrade_20260920_v4_01';
    const reportDir = path.resolve('docs/training/reports', runId);
    mkdirSync(reportDir, { recursive: true });

    console.log(`=======================================================`);
    console.log(`[R09] Neural-Assisted Search 2x2 Ablation Evaluator`);
    console.log(`Run ID: ${runId}`);
    console.log(`Report Dir: ${reportDir}`);
    console.log(`=======================================================\n`);

    const modelPath = options.modelPath ?? path.resolve('training_runs/models/net_b_checkpoint.json');
    if (!existsSync(modelPath)) throw new Error(`Model checkpoint not found: ${modelPath}`);
    const modelJson = readFileSync(modelPath, 'utf8');
    const modelSha256 = computeSha256(modelJson);
    const netB = loadDualHeadModelFromJson(modelJson);
    const modelScorer = createNetworkModelScorer(netB);
    const leafEvaluator = createNetworkLeafEvaluator(netB, { scale: 1000 });

    let queryCount = 0;
    const searchConfig = {
        deadlineMs: 1000,
        searchStopElapsedMs: 850,
        returnTargetElapsedMs: 950,
        nodeBudget: 150
    };

    const s00Metrics = { nodes: [] as number[], elapsedMs: [] as number[], actions: [] as string[] };
    const s10Metrics = { nodes: [] as number[], elapsedMs: [] as number[], actions: [] as string[], modelCandidateAccepted: 0 };
    const s01Metrics = { nodes: [] as number[], elapsedMs: [] as number[], actions: [] as string[] };
    const s11Metrics = { nodes: [] as number[], elapsedMs: [] as number[], actions: [] as string[], modelCandidateAccepted: 0 };

    console.log(`--- Running Micro-Benchmark on 12 Fixed States (S00, S10, S01, S11) ---`);
    for (let i = 0; i < 12; i += 1) {
        const state00 = createTacticalState(i);
        const state10 = createTacticalState(i);
        const state01 = createTacticalState(i);
        const state11 = createTacticalState(i);

        const dec00 = searchTeacherAction({ state: state00, playerId: state00.currentPlayer, config: searchConfig });
        queryCount += 1;
        s00Metrics.nodes.push(dec00.nodesExpanded);
        s00Metrics.elapsedMs.push(dec00.elapsedMs);
        s00Metrics.actions.push(dec00.actionCode);

        const dec10 = searchTeacherAction({ state: state10, playerId: state10.currentPlayer, config: searchConfig, modelScorer });
        queryCount += 1;
        s10Metrics.nodes.push(dec10.nodesExpanded);
        s10Metrics.elapsedMs.push(dec10.elapsedMs);
        s10Metrics.actions.push(dec10.actionCode);
        if (dec10.candidates.some(c => c.sources.includes('model'))) s10Metrics.modelCandidateAccepted += 1;

        const dec01 = searchTeacherAction({ state: state01, playerId: state01.currentPlayer, config: searchConfig, leafEvaluator });
        queryCount += 1;
        s01Metrics.nodes.push(dec01.nodesExpanded);
        s01Metrics.elapsedMs.push(dec01.elapsedMs);
        s01Metrics.actions.push(dec01.actionCode);

        const dec11 = searchTeacherAction({ state: state11, playerId: state11.currentPlayer, config: searchConfig, modelScorer, leafEvaluator });
        queryCount += 1;
        s11Metrics.nodes.push(dec11.nodesExpanded);
        s11Metrics.elapsedMs.push(dec11.elapsedMs);
        s11Metrics.actions.push(dec11.actionCode);
        if (dec11.candidates.some(c => c.sources.includes('model'))) s11Metrics.modelCandidateAccepted += 1;
    }

    let divergence10 = 0;
    let divergence01 = 0;
    let divergence11 = 0;
    for (let i = 0; i < 12; i += 1) {
        if (s10Metrics.actions[i] !== s00Metrics.actions[i]) divergence10 += 1;
        if (s01Metrics.actions[i] !== s00Metrics.actions[i]) divergence01 += 1;
        if (s11Metrics.actions[i] !== s00Metrics.actions[i]) divergence11 += 1;
    }

    const ablationJson = {
        schemaVersion: "4.0.0",
        runId,
        generatedAt: new Date().toISOString(),
        modelHash: modelSha256,
        arms: {
            s00: { name: "S00_BaselineSearch", meanElapsedMs: s00Metrics.elapsedMs.reduce((a,b)=>a+b,0)/12, meanNodes: s00Metrics.nodes.reduce((a,b)=>a+b,0)/12 },
            s10: { name: "S10_NeuralPriorSearch", meanElapsedMs: s10Metrics.elapsedMs.reduce((a,b)=>a+b,0)/12, meanNodes: s10Metrics.nodes.reduce((a,b)=>a+b,0)/12, divergenceRate: divergence10 / 12, candidateSurvival: s10Metrics.modelCandidateAccepted / 12 },
            s01: { name: "S01_NeuralValueSearch", meanElapsedMs: s01Metrics.elapsedMs.reduce((a,b)=>a+b,0)/12, meanNodes: s01Metrics.nodes.reduce((a,b)=>a+b,0)/12, divergenceRate: divergence01 / 12 },
            s11: { name: "S11_FullNeuralSearch", meanElapsedMs: s11Metrics.elapsedMs.reduce((a,b)=>a+b,0)/12, meanNodes: s11Metrics.nodes.reduce((a,b)=>a+b,0)/12, divergenceRate: divergence11 / 12, candidateSurvival: s11Metrics.modelCandidateAccepted / 12 }
        },
        valueStatus: "VALUE_HOLD",
        note: "所有耗时均为未裁剪真实耗时；动作差异反映网络引导发散，不能直接等同于胜率收益。"
    };

    if (!options.dryRun) {
        updateBudget(reportDir, runId, queryCount, 0, '2x2 Search Ablation');
        writeFileSync(path.join(reportDir, 'neural-search-ablation.json'), JSON.stringify(ablationJson, null, 2), 'utf8');

        const frontierJson = {
            schemaVersion: "4.0.0",
            runId,
            generatedAt: new Date().toISOString(),
            arms: [
                { arm: "Pure_Heuristic_Baseline", status: "NOT_MEASURED_IN_THIS_RUN" },
                { arm: "Pure_Neural_1Ply (NET_B)", status: "NOT_MEASURED_IN_THIS_RUN" },
                { arm: "S00_BaselineSearch", costPerDecisionMs: ablationJson.arms.s00.meanElapsedMs, nodesPerAction: ablationJson.arms.s00.meanNodes },
                { arm: "S10_NeuralPriorSearch (NET_B)", costPerDecisionMs: ablationJson.arms.s10.meanElapsedMs, nodesPerAction: ablationJson.arms.s10.meanNodes },
                { arm: "S01_NeuralValueSearch (NET_B)", costPerDecisionMs: ablationJson.arms.s01.meanElapsedMs, nodesPerAction: ablationJson.arms.s01.meanNodes },
                { arm: "S11_FullNeuralSearch (NET_B)", costPerDecisionMs: ablationJson.arms.s11.meanElapsedMs, nodesPerAction: ablationJson.arms.s11.meanNodes }
            ]
        };
        writeFileSync(path.join(reportDir, 'quality-cost-frontier.json'), JSON.stringify(frontierJson, null, 2), 'utf8');
    }

    console.log(`\nR09 Ablation Evaluation Finished. Value Status: VALUE_HOLD.`);
    return ablationJson;
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_ablation_runner.ts')) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`Usage: npx tsx tools/skirmish_ablation_runner.ts [options]`);
        console.log(`Options:`);
        console.log(`  --run-id <id>      Target run ID (default: agent_upgrade_20260920_v4_01)`);
        console.log(`  --model <path>     Model checkpoint path`);
        console.log(`  --help, -h         Show help and exit`);
        process.exit(0);
    }

    const runIdArgIdx = process.argv.indexOf('--run-id');
    const runId = runIdArgIdx !== -1 ? process.argv[runIdArgIdx + 1] : undefined;

    runNeuralSearchAblation({ runId }).catch(err => {
        console.error(`Ablation runner failed:`, err);
        process.exit(1);
    });
}
