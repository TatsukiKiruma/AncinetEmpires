import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { encodeAction } from '../env/src/game/env';
import { MatchRunner, Policy, MatchRecord } from './match_runner';
import { MatchOutcome } from './outcomes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PairedMatchResult {
    pairId: string;
    mapName: string;
    openingFamily: string;
    game1: {
        p0Policy: string;
        p1Policy: string;
        outcome: MatchOutcome;
    };
    game2: {
        p0Policy: string;
        p1Policy: string;
        outcome: MatchOutcome;
    };
    // 策略 A 相对于策略 B 的配对综合净分：
    // 每局胜=1, 平=0.5, 负=0。配对总分 0..2
    scoreA: number;
    scoreB: number;
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
    conservativeScoreA: number; // 保守得分（95% 区间下界）
    ci95Lower: number;
    ci95Upper: number;
    seat0WinRate: number;
    seat1WinRate: number;
    uniqueTrajectoriesCount: number;
    detailsByMap: Record<string, { pairs: number; winsA: number; winsB: number; draws: number; truncations: number }>;
}

/**
 * 分层 Bootstrap 计算 95% 置信区间
 */
export function bootstrapConfidenceInterval(
    scores: number[],
    iterations: number = 2000,
    seed: number = 42
): { mean: number; lower95: number; upper95: number } {
    if (scores.length === 0) {
        return { mean: 0, lower95: 0, upper95: 0 };
    }
    const n = scores.length;
    let s = seed;
    const rand = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };

    const bootstrapMeans: number[] = [];
    for (let i = 0; i < iterations; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
            const idx = Math.floor(rand() * n);
            sum += scores[idx];
        }
        bootstrapMeans.push(sum / n);
    }
    bootstrapMeans.sort((a, b) => a - b);
    const lowIdx = Math.floor(iterations * 0.025);
    const highIdx = Math.floor(iterations * 0.975);
    const actualMean = scores.reduce((a, b) => a + b, 0) / n;
    return {
        mean: actualMean,
        lower95: bootstrapMeans[lowIdx],
        upper95: bootstrapMeans[highIdx]
    };
}

/**
 * 生成开局家族局面
 */
export function generateOpeningState(
    mapName: string,
    family: '0_handoff' | '4_handoff' | '8_handoff',
    baselinePolicy: Policy,
    stepSeed: number = 42
): GameState {
    const state = createAppApkSkirmishGameState(mapName, 'SD');
    if (family === '0_handoff') {
        return state;
    }

    const engine = new GameEngine(JSON.parse(JSON.stringify(state)));
    const targetSteps = family === '4_handoff' ? 4 : 8;

    for (let step = 0; step < targetSteps && !engine.isTerminal(); step++) {
        const curr = engine.getState();
        const legal = engine.getLegalActions(curr.currentPlayer);
        if (legal.length === 0) break;
        const candidateCodes = legal.map(encodeAction);
        const chosenCode = baselinePolicy.chooseAction({
            engineClone: engine.clone(),
            observerPlayerId: curr.currentPlayer,
            legalActions: legal,
            candidateCodes,
            stateHash: 'seed_' + stepSeed,
            stepIndex: step
        });
        const matchedIdx = candidateCodes.indexOf(chosenCode as string);
        if (matchedIdx >= 0) {
            engine.step(legal[matchedIdx]);
        } else {
            engine.step(legal[0]);
        }
    }

    return engine.getState();
}

/**
 * 运行两个策略之间的配对竞技场评估
 */
export async function runPairedArena(
    policyA: Policy,
    policyB: Policy,
    maps: string[],
    pairsPerMap: number = 10,
    runnerConfig = {}
): Promise<{ summary: ArenaSummary; pairs: PairedMatchResult[]; records: MatchRecord[] }> {
    const runner = new MatchRunner(runnerConfig);
    const pairs: PairedMatchResult[] = [];
    const records: MatchRecord[] = [];
    const uniqueHashes = new Set<string>();

    let winsA = 0;
    let winsB = 0;
    let draws = 0;
    let truncations = 0;
    let errors = 0;
    let seat0Wins = 0;
    let seat1Wins = 0;
    let totalGames = 0;

    const pairScoresA: number[] = [];
    const mapStats: Record<string, any> = {};

    for (const mapName of maps) {
        mapStats[mapName] = { pairs: 0, winsA: 0, winsB: 0, draws: 0, truncations: 0 };

        for (let pIdx = 0; pIdx < pairsPerMap; pIdx++) {
            const family: '0_handoff' | '4_handoff' | '8_handoff' =
                pIdx % 3 === 0 ? '0_handoff' : pIdx % 3 === 1 ? '4_handoff' : '8_handoff';

            const initialState = generateOpeningState(mapName, family, policyB, pIdx * 100 + 42);

            // 第一局：A 执 Seat 0, B 执 Seat 1
            const rec1 = await runner.runMatch(
                initialState,
                new Map([
                    [0, policyA],
                    [1, policyB]
                ])
            );
            records.push(rec1);
            uniqueHashes.add(rec1.outcome.finalStateHash);

            // 第二局：交换控制侧：B 执 Seat 0, A 执 Seat 1（使用相同初态）
            const rec2 = await runner.runMatch(
                initialState,
                new Map([
                    [0, policyB],
                    [1, policyA]
                ])
            );
            records.push(rec2);
            uniqueHashes.add(rec2.outcome.finalStateHash);

            totalGames += 2;
            let pScoreA = 0;
            let pScoreB = 0;

            // 结算 Game 1 (A=0, B=1)
            if (rec1.outcome.isNaturalTerminal) {
                if (rec1.outcome.winnerAlliance === 0) {
                    winsA++;
                    seat0Wins++;
                    pScoreA += 1;
                    mapStats[mapName].winsA++;
                } else if (rec1.outcome.winnerAlliance === 1) {
                    winsB++;
                    seat1Wins++;
                    pScoreB += 1;
                    mapStats[mapName].winsB++;
                } else {
                    draws++;
                    pScoreA += 0.5;
                    pScoreB += 0.5;
                    mapStats[mapName].draws++;
                }
            } else if (rec1.outcome.isTruncated) {
                truncations++;
                mapStats[mapName].truncations++;
            } else if (rec1.outcome.isError) {
                errors++;
            }

            // 结算 Game 2 (B=0, A=1)
            if (rec2.outcome.isNaturalTerminal) {
                if (rec2.outcome.winnerAlliance === 1) {
                    winsA++;
                    seat1Wins++;
                    pScoreA += 1;
                    mapStats[mapName].winsA++;
                } else if (rec2.outcome.winnerAlliance === 0) {
                    winsB++;
                    seat0Wins++;
                    pScoreB += 1;
                    mapStats[mapName].winsB++;
                } else {
                    draws++;
                    pScoreA += 0.5;
                    pScoreB += 0.5;
                    mapStats[mapName].draws++;
                }
            } else if (rec2.outcome.isTruncated) {
                truncations++;
                mapStats[mapName].truncations++;
            } else if (rec2.outcome.isError) {
                errors++;
            }

            mapStats[mapName].pairs++;
            // 归一化配对得分到 [0, 1]
            pairScoresA.push(pScoreA / 2);

            pairs.push({
                pairId: `${mapName}_pair_${pIdx}`,
                mapName,
                openingFamily: family,
                game1: {
                    p0Policy: policyA.id,
                    p1Policy: policyB.id,
                    outcome: rec1.outcome
                },
                game2: {
                    p0Policy: policyB.id,
                    p1Policy: policyA.id,
                    outcome: rec2.outcome
                },
                scoreA: pScoreA,
                scoreB: pScoreB
            });
        }
    }

    const ci = bootstrapConfidenceInterval(pairScoresA);
    const winRateA = (winsA + 0.5 * draws) / (totalGames || 1);

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
        conservativeScoreA: ci.lower95,
        ci95Lower: ci.lower95,
        ci95Upper: ci.upper95,
        seat0WinRate: seat0Wins / (totalGames || 1),
        seat1WinRate: seat1Wins / (totalGames || 1),
        uniqueTrajectoriesCount: uniqueHashes.size,
        detailsByMap: mapStats
    };

    return { summary, pairs, records };
}

/**
 * 战术题套件评估
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
    results: Array<{ id: string; category: string; solved: boolean; chosenCode: string; expected: string[] }>;
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
            expected: c.expectedActionCodes
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
