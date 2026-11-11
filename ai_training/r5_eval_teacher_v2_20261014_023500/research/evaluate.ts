import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { encodeAction } from '../env/src/game/env';
import { MatchRunner, Policy, MatchRecord } from './match_runner';
import { MatchOutcome } from './outcomes';
import { generateRealHandoffOpening, OpeningFamily } from './openings';
import {
    computeStratifiedBootstrapCI,
    computeTrajectoryHash,
    StratifiedClusterSample,
    BootstrapCIResult
} from './statistics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PairedMatchResult {
    pairId: string;
    mapName: string;
    openingFamily: OpeningFamily;
    initialStateHash: string;
    game1: {
        p0Policy: string;
        p1Policy: string;
        trajectoryHash: string;
        outcome: MatchOutcome;
    };
    game2: {
        p0Policy: string;
        p1Policy: string;
        trajectoryHash: string;
        outcome: MatchOutcome;
    };
    // 策略 A 相对于策略 B 的配对综合净分：
    // 每局胜=1, 平=0.5, 负/截断/错误=0。配对总分 0..2，归一化到 0..1
    scoreA: number;
    scoreB: number;
    normalizedScoreA: number;
}

export interface ArenaSummary {
    policyA: string;
    policyB: string;
    totalPairs: number;
    totalGames: number;
    winsA: number;
    winsB: number;
    draws: number;
    truncations: number;
    errors: number;
    winRateA: number;
    pairMeanScoreA: number;
    conservativeScoreA: number; // 95% 置信下界 (保守得分)
    ci95Lower: number;
    ci95Upper: number;
    seat0Wins: number;
    seat1Wins: number;
    seat0WinRate: number; // seat0Wins / totalGames
    seat1WinRate: number; // seat1Wins / totalGames
    policyAAsSeat0Wins: number;
    policyAAsSeat1Wins: number;
    uniqueTrajectoriesCount: number;
    uniqueInitialStatesCount: number;
    truncationBreakdown: {
        repeatedState: number;
        plyLimit: number;
        stepLimit: number;
        wallSeconds: number;
    };
    detailsByMap: Record<
        string,
        {
            pairs: number;
            winsA: number;
            winsB: number;
            draws: number;
            truncations: number;
            meanScoreA: number;
            lower95: number;
            upper95: number;
        }
    >;
}

/**
 * 运行两个策略之间的配对竞技场评估 (修正版协议)
 */
export async function runPairedArena(
    policyA: Policy,
    policyB: Policy,
    maps: string[],
    pairsPerMap: number = 10,
    runnerConfig = {},
    familySeedOffset: number = 1000
): Promise<{ summary: ArenaSummary; pairs: PairedMatchResult[]; records: MatchRecord[] }> {
    const runner = new MatchRunner(runnerConfig);
    const pairs: PairedMatchResult[] = [];
    const records: MatchRecord[] = [];
    const uniqueTrajectories = new Set<string>();
    const uniqueInitialStates = new Set<string>();

    let winsA = 0;
    let winsB = 0;
    let draws = 0;
    let truncations = 0;
    let errors = 0;
    let seat0Wins = 0;
    let seat1Wins = 0;
    let policyAAsSeat0Wins = 0;
    let policyAAsSeat1Wins = 0;
    let totalGames = 0;

    const truncationCounts = {
        repeatedState: 0,
        plyLimit: 0,
        stepLimit: 0,
        wallSeconds: 0
    };

    const stratifiedSamples: StratifiedClusterSample[] = [];

    for (const mapName of maps) {
        for (let pIdx = 0; pIdx < pairsPerMap; pIdx++) {
            const family: OpeningFamily =
                pIdx % 3 === 0 ? '0_handoff' : pIdx % 3 === 1 ? '4_handoff' : '8_handoff';

            const stepSeed = pIdx * 100 + familySeedOffset;
            const openRes = generateRealHandoffOpening(mapName, family, policyB, stepSeed);
            const initialState = openRes.openingState;
            const initialStateHash = openRes.openingStateHash;
            uniqueInitialStates.add(initialStateHash);

            // 第一局：A 执 Seat 0, B 执 Seat 1
            const rec1 = await runner.runMatch(
                initialState,
                new Map([
                    [0, policyA],
                    [1, policyB]
                ])
            );
            records.push(rec1);
            const trajHash1 = computeTrajectoryHash(
                rec1.initialStateHash,
                rec1.steps.map(s => s.actionCode)
            );
            uniqueTrajectories.add(trajHash1);

            // 第二局：交换控制侧：B 执 Seat 0, A 执 Seat 1（使用相同初态）
            const rec2 = await runner.runMatch(
                initialState,
                new Map([
                    [0, policyB],
                    [1, policyA]
                ])
            );
            records.push(rec2);
            const trajHash2 = computeTrajectoryHash(
                rec2.initialStateHash,
                rec2.steps.map(s => s.actionCode)
            );
            uniqueTrajectories.add(trajHash2);

            totalGames += 2;
            let pScoreA = 0;
            let pScoreB = 0;

            const updateTruncationDetail = (reason: string) => {
                if (reason === 'truncated_repeated_state') truncationCounts.repeatedState++;
                else if (reason === 'truncated_ply_limit') truncationCounts.plyLimit++;
                else if (reason === 'truncated_step_limit') truncationCounts.stepLimit++;
                else if (reason === 'truncated_wall_seconds') truncationCounts.wallSeconds++;
            };

            // 结算 Game 1 (A=0, B=1)
            if (rec1.outcome.isNaturalTerminal) {
                if (rec1.outcome.winnerAlliance === 0) {
                    winsA++;
                    seat0Wins++;
                    policyAAsSeat0Wins++;
                    pScoreA += 1;
                } else if (rec1.outcome.winnerAlliance === 1) {
                    winsB++;
                    seat1Wins++;
                    pScoreB += 1;
                } else {
                    draws++;
                    pScoreA += 0.5;
                    pScoreB += 0.5;
                }
            } else if (rec1.outcome.isTruncated) {
                truncations++;
                updateTruncationDetail(rec1.outcome.terminationReason);
            } else if (rec1.outcome.isError) {
                errors++;
            }

            // 结算 Game 2 (B=0, A=1)
            if (rec2.outcome.isNaturalTerminal) {
                if (rec2.outcome.winnerAlliance === 1) {
                    winsA++;
                    seat1Wins++;
                    policyAAsSeat1Wins++;
                    pScoreA += 1;
                } else if (rec2.outcome.winnerAlliance === 0) {
                    winsB++;
                    seat0Wins++;
                    pScoreB += 1;
                } else {
                    draws++;
                    pScoreA += 0.5;
                    pScoreB += 0.5;
                }
            } else if (rec2.outcome.isTruncated) {
                truncations++;
                updateTruncationDetail(rec2.outcome.terminationReason);
            } else if (rec2.outcome.isError) {
                errors++;
            }

            const normA = pScoreA / 2;
            const pairId = `${mapName}_pair_${pIdx}_${family}`;
            stratifiedSamples.push({
                pairId,
                mapName,
                openingFamily: family,
                pairScoreA: normA
            });

            pairs.push({
                pairId,
                mapName,
                openingFamily: family,
                initialStateHash,
                game1: {
                    p0Policy: policyA.id,
                    p1Policy: policyB.id,
                    trajectoryHash: trajHash1,
                    outcome: rec1.outcome
                },
                game2: {
                    p0Policy: policyB.id,
                    p1Policy: policyA.id,
                    trajectoryHash: trajHash2,
                    outcome: rec2.outcome
                },
                scoreA: pScoreA,
                scoreB: pScoreB,
                normalizedScoreA: normA
            });
        }
    }

    const bootRes: BootstrapCIResult = computeStratifiedBootstrapCI(stratifiedSamples, 2000, 42);
    const winRateA = (winsA + 0.5 * draws) / (totalGames || 1);

    const detailsByMap: Record<string, any> = {};
    for (const [mName, mInfo] of Object.entries(bootRes.mapBreakdown)) {
        let mWinsA = 0;
        let mWinsB = 0;
        let mDraws = 0;
        let mTrunc = 0;
        for (const p of pairs) {
            if (p.mapName === mName) {
                if (p.game1.outcome.isNaturalTerminal) {
                    if (p.game1.outcome.winnerAlliance === 0) mWinsA++;
                    else if (p.game1.outcome.winnerAlliance === 1) mWinsB++;
                    else mDraws++;
                } else if (p.game1.outcome.isTruncated) mTrunc++;

                if (p.game2.outcome.isNaturalTerminal) {
                    if (p.game2.outcome.winnerAlliance === 1) mWinsA++;
                    else if (p.game2.outcome.winnerAlliance === 0) mWinsB++;
                    else mDraws++;
                } else if (p.game2.outcome.isTruncated) mTrunc++;
            }
        }
        detailsByMap[mName] = {
            pairs: mInfo.count,
            winsA: mWinsA,
            winsB: mWinsB,
            draws: mDraws,
            truncations: mTrunc,
            meanScoreA: mInfo.mean,
            lower95: mInfo.lower95,
            upper95: mInfo.upper95
        };
    }

    const summary: ArenaSummary = {
        policyA: policyA.id,
        policyB: policyB.id,
        totalPairs: pairs.length,
        totalGames,
        winsA,
        winsB,
        draws,
        truncations,
        errors,
        winRateA,
        pairMeanScoreA: bootRes.mean,
        conservativeScoreA: bootRes.ci95Lower,
        ci95Lower: bootRes.ci95Lower,
        ci95Upper: bootRes.ci95Upper,
        seat0Wins,
        seat1Wins,
        seat0WinRate: seat0Wins / (totalGames || 1),
        seat1WinRate: seat1Wins / (totalGames || 1),
        policyAAsSeat0Wins,
        policyAAsSeat1Wins,
        uniqueTrajectoriesCount: uniqueTrajectories.size,
        uniqueInitialStatesCount: uniqueInitialStates.size,
        truncationBreakdown: truncationCounts,
        detailsByMap
    };

    return { summary, pairs, records };
}

/**
 * 战术题套件评估 (支持等价预期候选)
 */
export async function evaluateTacticalSuite(
    policy: Policy,
    suitePath: string
): Promise<{
    totalCases: number;
    acceptanceCases: number;
    diagnosticCases: number;
    acceptanceSolved: number;
    diagnosticSolved: number;
    acceptanceRate: number;
    diagnosticRate: number;
    results: Array<{
        id: string;
        category: string;
        solved: boolean;
        chosenCode: string;
        expected: string[];
        failureReason?: string;
    }>;
}> {
    const raw = fs.readFileSync(suitePath, 'utf-8');
    const cases = JSON.parse(raw);

    let acceptanceCount = 0;
    let diagnosticCount = 0;
    let acceptanceSolved = 0;
    let diagnosticSolved = 0;
    const results: any[] = [];

    for (const c of cases) {
        const engine = new GameEngine(JSON.parse(JSON.stringify(c.state)));
        const legal = engine.getLegalActions(c.state.currentPlayer);
        const candidateCodes = legal.map(encodeAction);

        const chosenCode = await policy.chooseAction({
            engineClone: engine.clone(),
            observerPlayerId: c.state.currentPlayer,
            legalActions: legal,
            candidateCodes,
            stateHash: c.stateHash,
            stepIndex: 0
        });

        const solved = c.expectedActionCodes.includes(chosenCode);
        let failureReason: string | undefined = undefined;
        if (!solved) {
            failureReason = `Chosen "${chosenCode}" not in expected [${c.expectedActionCodes.join(', ')}]`;
        }

        if (c.isDiagnostic) {
            diagnosticCount++;
            if (solved) diagnosticSolved++;
        } else {
            acceptanceCount++;
            if (solved) acceptanceSolved++;
        }

        results.push({
            id: c.id,
            category: c.category,
            solved,
            chosenCode,
            expected: c.expectedActionCodes,
            failureReason
        });
    }

    return {
        totalCases: cases.length,
        acceptanceCases: acceptanceCount,
        diagnosticCases: diagnosticCount,
        acceptanceSolved,
        diagnosticSolved,
        acceptanceRate: acceptanceCount > 0 ? acceptanceSolved / acceptanceCount : 0,
        diagnosticRate: diagnosticCount > 0 ? diagnosticSolved / diagnosticCount : 0,
        results
    };
}
