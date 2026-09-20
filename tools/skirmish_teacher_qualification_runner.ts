import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { AncientEmpiresEnv } from '../src/game/env';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import type { GameState } from '../src/game/types';
import {
    createSearchTeacherPolicyFactory,
    type SearchTeacherDecision
} from './skirmish_search_teacher';
import {
    createHeuristicBaselinePolicy,
    runSkirmishEpisode,
    type SkirmishPolicyFactory
} from './skirmish_training_runner';
import {
    classifyGameOutcome,
    aggregateOutcomes,
    type GameOutcomeRecord
} from './skirmish_evaluation_core';

export interface TeacherQualOptions {
    runId?: string;
    dryRun?: boolean;
    gamesPerDomain?: number;
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

export function createEndgameScenario(seed: number): GameState {
    const s = createDemoState(getApkSkirmishRuleConfig('SD'));
    const u1 = s.units.find(u => u.id === 'u1');
    const u2 = s.units.find(u => u.id === 'u2');
    const u3 = s.units.find(u => u.id === 'u3');
    const u4 = s.units.find(u => u.id === 'u4');
    if (u1) { u1.pos = { x: 3, y: 3 }; u1.hp = 70; }
    if (u2) { u2.pos = { x: 4, y: 3 }; u2.hp = 70; }
    if (u3) { u3.pos = { x: 3, y: 2 }; u3.hp = 60; }
    if (u4) { u4.pos = { x: 4, y: 4 }; u4.hp = 60; }
    s.players[0].gold = 100;
    s.players[1].gold = 100;
    s.turn = 5;
    return s;
}

export function createNormalScenario(seed: number): GameState {
    return createDemoState(getApkSkirmishRuleConfig('SD'));
}

export async function runTeacherQualification(options: TeacherQualOptions = {}) {
    const runId = options.runId ?? 'agent_upgrade_20260920_v4_01';
    const reportDir = path.resolve('docs/training/reports', runId);
    mkdirSync(reportDir, { recursive: true });

    console.log(`=======================================================`);
    console.log(`[R06] Teacher Qualification Evaluator`);
    console.log(`Run ID: ${runId}`);
    console.log(`=======================================================\n`);

    const evalRecords: GameOutcomeRecord[] = [];
    const traces: SearchTeacherDecision[] = [];
    let totalTeacherQueries = 0;
    const queryLatencies: number[] = [];

    const onTrace = (dec: SearchTeacherDecision) => {
        traces.push(dec);
        totalTeacherQueries += 1;
        queryLatencies.push(dec.elapsedMs);
    };

    const runMatch = (
        domain: 'endgame' | 'normal',
        matchIdx: number,
        teacherPlayerId: number,
        seed: number
    ) => {
        const initialState = domain === 'endgame' ? createEndgameScenario(seed) : createNormalScenario(seed);
        const env = new AncientEmpiresEnv({
            initialState,
            seed,
            maxPlies: 40
        });

        const policyFactory: SkirmishPolicyFactory = (playerId, playerIds, epSeed) => {
            if (playerId === teacherPlayerId) {
                return createSearchTeacherPolicyFactory({
                    config: {
                        deadlineMs: 1000,
                        searchStopElapsedMs: 850,
                        returnTargetElapsedMs: 950,
                        nodeBudget: 150
                    },
                    onTrace
                })(playerId, playerIds, epSeed);
            }
            return createHeuristicBaselinePolicy(epSeed);
        };

        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: `QUAL:${domain}:${matchIdx}`,
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            },
            seed,
            maxPlies: 40,
            maxSteps: 200,
            policyFactory
        });

        const teacherAllianceId = episode.players.find(p => p.id === teacherPlayerId)?.allianceId ?? teacherPlayerId;

        const record = classifyGameOutcome({
            episodeId: `QUAL_${domain}_${matchIdx}`,
            rootFamilyId: `demo_${domain}`,
            seed,
            candidateSeat: teacherPlayerId,
            candidateAllianceId: teacherAllianceId,
            stepCount: episode.summary.stepCount,
            maxSteps: 200,
            engineTerminal: episode.summary.winnerAlliance !== null && episode.summary.winnerAlliance !== undefined,
            winnerAlliance: episode.summary.winnerAlliance,
            adjudicatedWinnerAlliance: episode.summary.adjudicatedWinnerAlliance,
            illegalActionCount: episode.summary.illegalActionCount,
            maxLatencyMs: queryLatencies.length > 0 ? Math.max(...queryLatencies) : 0
        });

        evalRecords.push(record);
        console.log(`  [${domain.toUpperCase()}] Match ${matchIdx + 1}/8 (Teacher P${teacherPlayerId}, Seed ${seed}): ${record.naturalOutcome} (cause: ${record.terminationCause}, steps: ${record.stepCount})`);
    };

    const count = options.gamesPerDomain ?? 8;
    console.log(`Running Endgame Benchmark (${count} matches)...`);
    for (let i = 0; i < count; i += 1) {
        runMatch('endgame', i, i % 2 === 0 ? 0 : 1, 1000 + i);
    }

    console.log(`\nRunning Normal Benchmark (${count} matches)...`);
    for (let i = 0; i < count; i += 1) {
        runMatch('normal', i, i % 2 === 0 ? 0 : 1, 2000 + i);
    }

    const endgameRecords = evalRecords.filter(r => r.episodeId.includes('endgame'));
    const normalRecords = evalRecords.filter(r => r.episodeId.includes('normal'));

    const endgameAgg = aggregateOutcomes(endgameRecords);
    const normalAgg = aggregateOutcomes(normalRecords);

    // 严禁假定 GLOBAL_GO：残局若有优势评为 LOCAL_SIGNAL_ONLY(endgame)，开局未达标评为 HOLD
    const teacherQual = {
        schemaVersion: "4.0.0",
        runId,
        generatedAt: new Date().toISOString(),
        overallStatus: normalAgg.naturalWinRate > 0.5 ? "GLOBAL_GO" : "HOLD",
        domains: {
            endgame: {
                status: endgameAgg.naturalWinRate >= 0.5 ? "LOCAL_SIGNAL_ONLY(endgame)" : "HOLD",
                metrics: endgameAgg
            },
            normal: {
                status: normalAgg.naturalWinRate >= 0.5 ? "GO" : "HOLD",
                metrics: normalAgg
            }
        },
        totalTeacherQueries
    };

    if (!options.dryRun) {
        updateBudget(reportDir, runId, count * 2, totalTeacherQueries, 'Teacher Qualification');
        writeFileSync(path.join(reportDir, 'teacher-qualification.json'), JSON.stringify(teacherQual, null, 2), 'utf8');
        writeFileSync(path.join(reportDir, 'teacher-eval.jsonl'), evalRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    }

    return teacherQual;
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_teacher_qualification_runner.ts')) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`Usage: npx tsx tools/skirmish_teacher_qualification_runner.ts [options]`);
        console.log(`Options:`);
        console.log(`  --run-id <id>      Target run ID (default: agent_upgrade_20260920_v4_01)`);
        console.log(`  --help, -h         Show help and exit`);
        process.exit(0);
    }

    const runIdArgIdx = process.argv.indexOf('--run-id');
    const runId = runIdArgIdx !== -1 ? process.argv[runIdArgIdx + 1] : undefined;

    runTeacherQualification({ runId }).catch(err => {
        console.error(`Teacher qualification runner failed:`, err);
        process.exit(1);
    });
}
