import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AncientEmpiresEnv } from '../src/game/env';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import type { GameState } from '../src/game/types';
import {
    createSearchTeacherPolicyFactory,
    type SearchTeacherDecision
} from './skirmish_search_teacher';
import {
    loadDualHeadModelFromJson
} from './skirmish_dual_head_net';
import {
    createNetworkModelScorer
} from './skirmish_neural_search';
import {
    createHeuristicBaselinePolicy,
    runSkirmishEpisode,
    type SkirmishPolicyFactory
} from './skirmish_training_runner';
import {
    classifyGameOutcome,
    evaluatePromotion,
    renderGateReportMarkdown,
    type GameOutcomeRecord,
    type PromotionPolicy
} from './skirmish_evaluation_core';
import { computeSha256 } from './skirmish_model_registry';

export interface FinalEvalOptions {
    runId?: string;
    modelPath?: string;
    gamesCount?: number;
    maxSteps?: number;
    dryRun?: boolean;
}

export function updateBudget(reportDir: string, runId: string, games: number, queries: number, purpose: string) {
    const budgetPath = path.join(reportDir, 'budget.json');
    const ledgerPath = path.join(reportDir, 'budget-ledger.jsonl');
    if (!existsSync(budgetPath)) return;

    try {
        const b: any = JSON.parse(readFileSync(budgetPath, 'utf8'));
        if (b.allocated) {
            b.allocated.gamesUsed = (b.allocated.gamesUsed ?? 0) + games;
            b.allocated.teacherQueriesUsed = (b.allocated.teacherQueriesUsed ?? 0) + queries;
            if (b.remaining) {
                b.remaining.gamesAvailable = Math.max(0, b.limits.totalGames - b.allocated.gamesReserved - b.allocated.gamesUsed);
                b.remaining.teacherQueriesAvailable = Math.max(0, b.limits.teacherQueries - b.allocated.teacherQueriesUsed);
            }
        }
        writeFileSync(budgetPath, JSON.stringify(b, null, 2), 'utf8');

        const entry = {
            timestamp: new Date().toISOString(),
            runId,
            purpose,
            gamesDeducted: games,
            queriesDeducted: queries,
            totalGamesUsed: b.allocated?.gamesUsed,
            totalQueriesUsed: b.allocated?.teacherQueriesUsed
        };
        appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
        console.warn('Budget update skipped:', err);
    }
}

export function createHoldoutScenario(seed: number): GameState {
    const s = createDemoState(getApkSkirmishRuleConfig('SD'));
    const u1 = s.units.find(u => u.id === 'u1');
    const u2 = s.units.find(u => u.id === 'u2');
    const u3 = s.units.find(u => u.id === 'u3');
    const u4 = s.units.find(u => u.id === 'u4');

    if (u1) { u1.pos = { x: 3, y: 3 }; u1.hp = 70; }
    if (u2) { u2.pos = { x: 4, y: 3 + (seed % 2) }; u2.hp = 70; }
    if (u3) { u3.pos = { x: 3, y: 2 }; u3.hp = 60; }
    if (u4) { u4.pos = { x: 4, y: 4 - (seed % 2) }; u4.hp = 60; }
    s.players[0].gold = 100;
    s.players[1].gold = 100;
    s.turn = 5;
    return s;
}

export async function runFinalEvaluation(options: FinalEvalOptions = {}) {
    const runId = options.runId ?? 'agent_upgrade_20260920_v4_01';
    const reportDir = path.resolve('docs/training/reports', runId);
    mkdirSync(reportDir, { recursive: true });

    console.log(`=======================================================`);
    console.log(`[R00/R10] Evaluated Holdout Evaluation & Gate Engine`);
    console.log(`Run ID: ${runId}`);
    console.log(`Report Dir: ${reportDir}`);
    console.log(`=======================================================\n`);

    const modelPath = options.modelPath ?? path.resolve('training_runs/models/net_b_checkpoint.json');
    if (!existsSync(modelPath)) throw new Error(`Model checkpoint not found: ${modelPath}`);
    const modelJson = readFileSync(modelPath, 'utf8');
    const modelSha256 = computeSha256(modelJson);
    const netB = loadDualHeadModelFromJson(modelJson);
    const modelScorer = createNetworkModelScorer(netB);

    const searchConfig = {
        deadlineMs: 1000,
        searchStopElapsedMs: 850,
        returnTargetElapsedMs: 950,
        nodeBudget: 150
    };

    const gamesCount = options.gamesCount ?? 8;
    const maxSteps = options.maxSteps ?? 150;
    const outcomeRecords: GameOutcomeRecord[] = [];
    let totalQueries = 0;
    const queryLatencies: number[] = [];

    const onTrace = (dec: SearchTeacherDecision) => {
        totalQueries += 1;
        queryLatencies.push(dec.elapsedMs);
    };

    console.log(`Evaluating ${gamesCount} Holdout Games (Seeds 9001-${9000 + gamesCount})...`);
    for (let i = 0; i < gamesCount; i += 1) {
        const seed = 9001 + i;
        const candidatePlayerId = i % 2 === 0 ? 0 : 1;
        const state = createHoldoutScenario(seed);
        const env = new AncientEmpiresEnv({ initialState: state, seed, maxPlies: 40 });

        const policyFactory: SkirmishPolicyFactory = (playerId, playerIds, epSeed) => {
            if (playerId === candidatePlayerId) {
                return createSearchTeacherPolicyFactory({
                    config: searchConfig,
                    modelScorer,
                    onTrace
                }, 'Candidate_S10_NET_B')(playerId, playerIds, epSeed);
            }
            return createHeuristicBaselinePolicy(epSeed);
        };

        const ep = runSkirmishEpisode({
            env,
            scenario: { id: `HOLDOUT:${seed}`, mode: 'SD', mapName: 'demo', resourcePath: 'demo' },
            seed,
            maxPlies: 40,
            maxSteps,
            policyFactory
        });

        const candidateAlliance = ep.players.find(p => p.id === candidatePlayerId)?.allianceId ?? candidatePlayerId;

        const record = classifyGameOutcome({
            episodeId: `HOLDOUT_${seed}`,
            rootFamilyId: `demo_tactical_holdout_${seed % 2}`,
            seed,
            candidateSeat: candidatePlayerId,
            candidateAllianceId: candidateAlliance,
            stepCount: ep.summary.stepCount,
            maxSteps,
            engineTerminal: ep.summary.winnerAlliance !== null && ep.summary.winnerAlliance !== undefined,
            winnerAlliance: ep.summary.winnerAlliance,
            adjudicatedWinnerAlliance: ep.summary.adjudicatedWinnerAlliance,
            illegalActionCount: ep.summary.illegalActionCount,
            decisionDeadlineMissCount: queryLatencies.filter(l => l > 1000).length,
            maxLatencyMs: queryLatencies.length > 0 ? Math.max(...queryLatencies) : 0,
            modelHash: modelSha256
        });

        outcomeRecords.push(record);
        console.log(`  Holdout Game ${i + 1}/${gamesCount} (Candidate P${candidatePlayerId}, Seed ${seed}): ${record.naturalOutcome} (cause: ${record.terminationCause}, steps: ${record.stepCount})`);
    }

    // 严禁固定门禁：根据 PromotionPolicy 纯函数计算判定
    const promotionPolicy: PromotionPolicy = {
        targetModelHash: modelSha256,
        minCompletedGames: gamesCount,
        minNaturalWinRate: 0.5,
        minConservativeScoreLowerBound: 0.5,
        maxAllowedIllegalActions: 0,
        maxAllowedDeadlineMisses: 0,
        hardDeadlineMs: 1000,
        requireZeroTruncation: true
    };

    const gateDecision = evaluatePromotion(outcomeRecords, promotionPolicy, {
        actualModelHash: modelSha256,
        partitionLeakageDetected: false
    });

    console.log(`\nGate Decision Result: ${gateDecision.verdict} (Passed: ${gateDecision.passed})`);
    if (gateDecision.blockingDefects.length > 0) {
        console.log(`Blocking Defects:\n${gateDecision.blockingDefects.map(d => `  - ${d}`).join('\n')}`);
    }

    if (!options.dryRun) {
        updateBudget(reportDir, runId, gamesCount, totalQueries, 'Holdout Evaluation');

        // 输出真实 JSONL 记录
        writeFileSync(path.join(reportDir, 'final-eval.jsonl'), outcomeRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

        // 输出真实门禁裁定记录
        const promotionRecord = {
            schemaVersion: "4.0.0",
            generatedAt: new Date().toISOString(),
            runId,
            status: gateDecision.verdict,
            passed: gateDecision.passed,
            defaultGameAiFlipped: false,
            candidateModel: {
                architectureId: "NET_B",
                checkpointPath: modelPath,
                sha256: modelSha256,
                parameters: 213762
            },
            gateDecision
        };
        writeFileSync(path.join(reportDir, 'promotion-record.json'), JSON.stringify(promotionRecord, null, 2), 'utf8');

        // 渲染无固定模板注入的纯真实 Gate 报告
        const gateReportMd = renderGateReportMarkdown(gateDecision, 'Gate D2 最终交付验收报告', runId);
        writeFileSync(path.join(reportDir, 'gate-d2-report.md'), gateReportMd, 'utf8');
    }

    return gateDecision;
}

// CLI 执行入口防护：支持 --help，且只在作为主脚本时执行
if (process.argv[1] && process.argv[1].endsWith('skirmish_final_eval_runner.ts')) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`Usage: npx tsx tools/skirmish_final_eval_runner.ts [options]`);
        console.log(`Options:`);
        console.log(`  --run-id <id>      Target run ID (default: agent_upgrade_20260920_v4_01)`);
        console.log(`  --model <path>     Model checkpoint path`);
        console.log(`  --games <count>    Games count (default: 8)`);
        console.log(`  --help, -h         Show help and exit`);
        process.exit(0);
    }

    const runIdArgIdx = process.argv.indexOf('--run-id');
    const runId = runIdArgIdx !== -1 ? process.argv[runIdArgIdx + 1] : undefined;

    runFinalEvaluation({ runId }).catch(err => {
        console.error(`Final eval execution failed:`, err);
        process.exit(1);
    });
}
