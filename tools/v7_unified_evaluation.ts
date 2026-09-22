/**
 * V7 Unified Evaluation Harness (R7-08 & R8-01 / R8-02 / R8-03)
 *
 * 评估对象：
 * 1. HeuristicAI (Baseline)
 * 2. NET_A DualHead [256, 128]
 * 3. Spatial ResNet v2 (2 blocks, 32 channels)
 * 4. Spatial DAgger v2 (Corrected warm-start student)
 * 5. S00 Heuristic Bounded Search (Teacher Candidate)
 * 6. S10 Spatial Bounded Search (Guided Search)
 *
 * 核心修复与协议原则：
 * - 严格二参数模型调用：predictor.predict(encodedState, candidateActions)
 * - 拒绝静默回退：缺失模型、NaN、非法 shape 显式报错/NOT_RUN，不以 legal[0] 代替
 * - 真实随机流控制：通过种子派生独立 PRNG 流给双方策略及搜索模拟，保证可复现
 * - 废除 25 步单位数不变提前截断：保留为诊断指标，正常交战/移动不截断
 * - 解耦 maxTurns 与底层步数上限：不再隐式使用 maxTurns * 10
 * - 严密重招募口径：机会由引擎合法动作产生，区分决策机会与恢复窗口
 * - 错误分支轨迹落盘：finally 中必定写出 trajectoryLogPath
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState, Position, Unit } from '../src/game/types';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { encodeAction } from '../src/game/env';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { predictSpatialAction } from '../src/game/ai/shared_spatial_policy';
import { loadDualHeadModelFromJson, predictDecision, DualHeadNet } from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { runBoundedSearch } from './v7_heuristic_bounded_search';
import { getBehavioralStateHash } from './v7_training_pipeline';

const RUN_ID = 'agent_upgrade_20260921_v7_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
const TRAJECTORY_DIR = path.join(RUN_DIR, 'trajectories');
const CHECKPOINT_DIR = path.join(RUN_DIR, 'checkpoints');

export interface EvaluationDirectories {
    runId?: string;
    reportDir?: string;
    runDir?: string;
    trajectoryDir?: string;
    checkpointDir?: string;
    provenance?: MatchProvenance;
}

/** Exact provenance of the code snapshot that produced a match (S8-2 per-match identity). */
export interface MatchProvenance {
    codeCommit: string;
    workspaceDirty: boolean;
    dirtyPatchHash: string | null;
    node: string;
    platform: string;
}

export function collectMatchProvenance(repoRoot: string = process.cwd()): MatchProvenance {
    const git = (args: string[]): string | null => {
        try {
            return execFileSync('git', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
                .toString()
                .trim();
        } catch {
            return null;
        }
    };
    const codeCommit = git(['rev-parse', 'HEAD']) ?? 'UNKNOWN';
    const diff = (() => {
        try {
            return execFileSync('git', ['diff', 'HEAD'], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        } catch {
            return '';
        }
    })();
    return {
        codeCommit,
        workspaceDirty: diff.length > 0,
        dirtyPatchHash: diff.length > 0 ? getSha256(diff) : null,
        node: process.version,
        platform: process.platform
    };
}

export const BENCHMARK_MAPS = [
    { name: '(2) Duel.aem', label: 'Duel' },
    { name: '(2) Crossed swords.aem', label: 'Crossed Swords' },
    { name: '(2) Icy Paths.aem', label: 'Icy Paths' },
    { name: '(2) Liberty Port.aem', label: 'Liberty Port' },
    { name: '(2) Mourningstar.aem', label: 'Mourningstar' }
];

export type PolicyType = 'HEURISTIC' | 'NET_A' | 'SPATIAL_V2' | 'SPATIAL_DAGGER' | 'S00_SEARCH' | 'S10_SPATIAL_SEARCH';

export interface MatchOutcome {
    matchId: string;
    mapName: string;
    seed: number;
    candidatePolicy: PolicyType;
    actualPolicy: PolicyType | 'NOT_RUN';
    checkpointSha256?: string;
    encoderVersion?: string;
    fallbackCount: number;
    rulesSummary?: string;
    rulesHash?: string;
    initialStateHash?: string;
    seedStreamInfo?: { seed: number; candidateSeed: number; opponentSeed: number; searchSeed: number };
    provenance?: MatchProvenance;
    candidateSeat: 0 | 1;
    opponentPolicy: 'HEURISTIC';
    terminationReason:
        | 'NATURAL_WIN'
        | 'NATURAL_LOSS'
        | 'NATURAL_DRAW'
        | 'TRUNCATION_MAX_TURNS'
        | 'TRUNCATION_MAX_STEPS'
        | 'TRUNCATION_STEP_LIMIT'
        | 'TRUNCATION_STAGNATION'
        | 'MODEL_LOAD_ERROR'
        | 'ENGINE_ERROR'
        | 'NOT_RUN';
    turns: number;
    steps: number;
    candidateFinalUnits: number;
    opponentFinalUnits: number;
    decisionOpportunityCount: number;
    recoveryWindowCount: number;
    recoveryCompletedCount: number;
    rehireOpportunities: number;
    rehireSuccesses: number;
    rehireRate: number | null; // strictly null when decisionOpportunityCount === 0!
    recoveryWindowSuccessRate: number | null;
    /** Decisions spent inside each finished recovery window before the commander was back, in window order. */
    recoveryWindowDurations?: number[];
    /** recoveryWindowSuccessRate expressed over recovery windows rather than over decision opportunities. */
    recoveryWindowCompletionRate: number | null;
    /** Protocol actually used for this match, so a replay can be reproduced from the record alone. */
    deterministicReplay?: boolean;
    searchMaxNodes?: number;
    searchBudgetMs?: number;
    errorDetails?: string;
    trajectoryLogPath: string;
    avgMsPerAction: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99?: number;
    latencyMax: number;
    decisionLatencies?: number[];
    searchTotalNodes?: number;
    budgetReason?: string;
    wallClockExceededCount?: number;
    deadlineFallbackCount?: number;
    searchCandidatesEvaluated?: number;
    searchShallowEvaluations?: number;
}

export interface PolicyAggregateReport {
    policy: PolicyType;
    matchesPlayed: number;
    naturalWins: number;
    naturalLosses: number;
    naturalDraws: number;
    truncations: number;
    truncationRate: number; // truncations / matchesPlayed
    engineErrors: number;
    modelLoadErrors: number;
    notRuns: number;
    winRateNaturalOnly: number; // naturalWins / (naturalWins + naturalLosses) if > 0 else 0
    confidenceInterval95Natural?: [number, number]; // 95% Wilson confidence interval [lower, upper]
    effectiveWinRate: number; // naturalWins / matchesPlayed
    confidenceInterval95Effective?: [number, number]; // 95% Wilson confidence interval [lower, upper]
    totalRehireOpportunities: number;
    totalRehireSuccesses: number;
    rehireSuccessRate: number | null;
    totalRecoveryWindows: number;
    totalRecoverySuccesses: number;
    recoveryWindowSuccessRate: number | null;
    /** Mean decisions spent inside a completed recovery window (null when no window completed). */
    meanRecoveryWindowDuration?: number | null;
    avgDecisionMs: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    latencyMax: number;
    latenciesOver1000ms: number;
    wallClockExceededMatches?: number;
    totalDeadlineFallbacks?: number;
    avgSearchNodes?: number;
    avgCandidatesEvaluated?: number;
    avgShallowEvaluations?: number;
}

/**
 * Protocol knobs for a benchmark run. Every one of them is recorded per match so that a result can
 * be replayed from its own record instead of from the runner's memory.
 */
export interface BenchmarkProtocol {
    maxTurns: number;
    maxAtomicSteps: number;
    searchMaxNodes: number;
    searchBudgetSoftMs: number;
    searchBudgetHardMs: number;
    /** When true the search ignores wall-clock deadlines, making node consumption replayable. */
    deterministicReplay: boolean;
}

export const DEFAULT_SEARCH_MAX_NODES = 20;
export const DEFAULT_SEARCH_SOFT_MS = 200;
export const DEFAULT_SEARCH_HARD_MS = 900;

export const DEFAULT_BENCHMARK_PROTOCOL: BenchmarkProtocol = {
    maxTurns: 45,
    maxAtomicSteps: 800,
    searchMaxNodes: DEFAULT_SEARCH_MAX_NODES,
    searchBudgetSoftMs: DEFAULT_SEARCH_SOFT_MS,
    searchBudgetHardMs: DEFAULT_SEARCH_HARD_MS,
    deterministicReplay: false
};

export function computeWilsonScoreInterval(successes: number, total: number, z: number = 1.96): [number, number] {
    if (total === 0) return [0, 0];
    const p = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const center = p + z2 / (2 * total);
    const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    const lower = Math.max(0, (center - spread) / denominator);
    const upper = Math.min(1, (center + spread) / denominator);
    return [Number((lower * 100).toFixed(1)), Number((upper * 100).toFixed(1))];
}

export function computePercentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper === lower) {
        return sortedValues[lower];
    }
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function createPrng(seed: number): () => number {
    let s = (seed ^ 0x12345678) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getSha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

export class PolicyAgent {
    constructor(
        public readonly type: PolicyType,
        private readonly spatialPredictor?: SpatialResNetPredictor,
        private readonly netAModel?: DualHeadNet,
        private heuristicAi: HeuristicAI = new HeuristicAI(),
        public readonly checkpointSha256?: string
    ) {}

    public setRng(rng: () => number): void {
        this.heuristicAi = new HeuristicAI(rng);
    }

    public selectAction(
        engine: GameEngine,
        playerId: number,
        searchRng?: () => number,
        protocol: BenchmarkProtocol = DEFAULT_BENCHMARK_PROTOCOL
    ): {
        action: Action;
        ms: number;
        searchNodes?: number;
        budgetReason?: string;
        wallClockExceeded?: boolean;
        deadlineFallbackCount?: number;
        candidatesEvaluated?: number;
        shallowEvaluations?: number;
    } {
        const t0 = performance.now();
        const state = engine.getState();
        const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legal.length === 0) return { action: { type: 'end_turn' }, ms: performance.now() - t0 };

        switch (this.type) {
            case 'HEURISTIC': {
                const act = this.heuristicAi.getAction(engine, playerId, legal);
                return { action: act, ms: performance.now() - t0 };
            }
            case 'NET_A': {
                if (!this.netAModel) {
                    throw new Error('MODEL_LOAD_ERROR: NET_A model is not loaded (cannot silently fall back to legal[0])');
                }
                const sFeat = Array.from(encodeGameState(state, playerId));
                const cFeats = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
                const pred = predictDecision(this.netAModel, sFeat, cFeats);
                const bestIdx = pred.bestActionIndex ?? pred.topIndex;
                if (bestIdx === undefined || bestIdx < 0 || bestIdx >= legal.length) {
                    throw new Error(`NET_A invalid action index ${bestIdx} for ${legal.length} legal actions`);
                }
                return { action: legal[bestIdx], ms: performance.now() - t0 };
            }
            case 'SPATIAL_V2':
            case 'SPATIAL_DAGGER': {
                if (!this.spatialPredictor) {
                    throw new Error(`MODEL_LOAD_ERROR: Spatial predictor is not loaded for ${this.type} (cannot silently fall back to legal[0])`);
                }
                const predRes = predictSpatialAction(this.spatialPredictor, state, playerId, legal, 'v2');
                return { action: predRes.action, ms: performance.now() - t0 };
            }
            case 'S00_SEARCH': {
                const res = runBoundedSearch(engine, playerId, {
                    budget: {
                        maxMs: protocol.searchBudgetSoftMs,
                        maxNodes: protocol.searchMaxNodes,
                        hardMaxMs: protocol.searchBudgetHardMs,
                        deterministic: protocol.deterministicReplay
                    },
                    heuristicAi: searchRng ? new HeuristicAI(searchRng) : this.heuristicAi
                });
                return {
                    action: res.chosenAction,
                    ms: performance.now() - t0,
                    searchNodes: res.totalNodes,
                    budgetReason: res.budgetReason,
                    wallClockExceeded: res.wallClockExceeded,
                    deadlineFallbackCount: res.deadlineFallbackCount,
                    candidatesEvaluated: res.candidatesEvaluated,
                    shallowEvaluations: res.shallowEvaluations
                };
            }
            case 'S10_SPATIAL_SEARCH': {
                if (!this.spatialPredictor) {
                    throw new Error('MODEL_LOAD_ERROR: Spatial predictor is not loaded for S10_SPATIAL_SEARCH (cannot silently degrade to S00)');
                }
                const res = runBoundedSearch(engine, playerId, {
                    budget: {
                        maxMs: protocol.searchBudgetSoftMs,
                        maxNodes: protocol.searchMaxNodes,
                        hardMaxMs: protocol.searchBudgetHardMs,
                        deterministic: protocol.deterministicReplay
                    },
                    heuristicAi: searchRng ? new HeuristicAI(searchRng) : this.heuristicAi,
                    spatialPredictor: this.spatialPredictor
                });
                return {
                    action: res.chosenAction,
                    ms: performance.now() - t0,
                    searchNodes: res.totalNodes,
                    budgetReason: res.budgetReason,
                    wallClockExceeded: res.wallClockExceeded,
                    deadlineFallbackCount: res.deadlineFallbackCount,
                    candidatesEvaluated: res.candidatesEvaluated,
                    shallowEvaluations: res.shallowEvaluations
                };
            }
        }
    }
}

export function runBenchmarkMatch(
    mapName: string,
    candidatePolicy: PolicyAgent,
    candidateSeat: 0 | 1,
    seed: number,
    maxTurns: number = 50,
    maxAtomicSteps: number = 1000,
    directories?: EvaluationDirectories,
    protocol: BenchmarkProtocol = { ...DEFAULT_BENCHMARK_PROTOCOL, maxTurns, maxAtomicSteps }
): MatchOutcome {
    const matchId = `match_${candidatePolicy.type}_seat${candidateSeat}_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}_s${seed}`;
    const state = createAppApkSkirmishGameState(mapName, 'SD');
    (state as any).mapName = mapName;
    const initialStateHash = getBehavioralStateHash(state, candidateSeat);
    const rulesHash = getSha256(JSON.stringify(state.rules));
    const engine = new GameEngine(state);

    const candidateSeed = (seed * 10007 + 1) >>> 0;
    const opponentSeed = (seed * 10007 + 2) >>> 0;
    const searchSeed = (seed * 10007 + 3) >>> 0;
    const candidateRng = createPrng(candidateSeed);
    const opponentRng = createPrng(opponentSeed);
    const searchRng = createPrng(searchSeed);

    candidatePolicy.setRng(candidateRng);
    const opponentPolicy = new HeuristicAI(opponentRng);

    let steps = 0;
    let turn = 0;

    let decisionOpportunityCount = 0;
    let inRecoveryWindow = false;
    let recoveryWindowCount = 0;
    let recoveryCompletedCount = 0;
    let rehireSuccesses = 0;
    // Decisions spent inside the currently open recovery window, and the length of each window that
    // actually ended with the commander back. Keeping these separate is what stops a single death
    // that spans twenty decisions from being reported as twenty independent failures.
    let decisionsInCurrentRecoveryWindow = 0;
    const recoveryWindowDurations: number[] = [];

    let totalDecisionMs = 0;
    let candidateActionCount = 0;
    const candidateLatencies: number[] = [];
    let totalSearchNodes = 0;
    let lastBudgetReason: string | undefined;
    let wallClockExceededCount = 0;
    let deadlineFallbackCount = 0;
    let totalCandidatesEvaluated = 0;
    let totalShallowEvaluations = 0;

    const actionHistory: Array<{ step: number; player: number; action: Action; ms: number }> = [];

    const runId = directories?.runId ?? RUN_ID;
    const runDir = directories?.runDir ?? (directories?.runId ? path.resolve(`training_runs/${directories.runId}`) : RUN_DIR);
    const trajectoryDir = directories?.trajectoryDir ?? path.join(runDir, 'trajectories');
    mkdirSync(trajectoryDir, { recursive: true });
    const trajFile = path.join(trajectoryDir, `${matchId}.json`);

    let termination: MatchOutcome['terminationReason'] = 'ENGINE_ERROR';
    let errorDetails: string | undefined;

    try {
        while (!engine.isTerminal() && engine.getState().turn <= maxTurns && steps < maxAtomicSteps) {
            const curState = engine.getState();
            const curPlayer = curState.currentPlayer;
            turn = curState.turn;

            const legal = engine.getLegalActions(curPlayer);

            // Check commander rehire opportunity strictly via engine legal actions
            if (curPlayer === candidateSeat) {
                const canRehire = legal.some(a =>
                    (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') &&
                    (a as any).unitClass === 'commander'
                );
                if (canRehire) {
                    decisionOpportunityCount++;
                    if (!inRecoveryWindow) {
                        inRecoveryWindow = true;
                        recoveryWindowCount++;
                        decisionsInCurrentRecoveryWindow = 0;
                    }
                    decisionsInCurrentRecoveryWindow++;
                }
            }

            let action: Action;
            let actMs = 0;

            if (curPlayer === candidateSeat) {
                const sel = candidatePolicy.selectAction(engine, candidateSeat, searchRng, protocol);
                action = sel.action;
                actMs = sel.ms;
                totalDecisionMs += actMs;
                candidateActionCount++;
                candidateLatencies.push(actMs);
                if (sel.searchNodes !== undefined) {
                    totalSearchNodes += sel.searchNodes;
                }
                if (sel.budgetReason !== undefined) {
                    lastBudgetReason = sel.budgetReason;
                }
                if (sel.wallClockExceeded) {
                    wallClockExceededCount++;
                }
                if (sel.deadlineFallbackCount) {
                    deadlineFallbackCount += sel.deadlineFallbackCount;
                }
                if (sel.candidatesEvaluated !== undefined) {
                    totalCandidatesEvaluated += sel.candidatesEvaluated;
                }
                if (sel.shallowEvaluations !== undefined) {
                    totalShallowEvaluations += sel.shallowEvaluations;
                }
            } else {
                const t0 = performance.now();
                action = opponentPolicy.getAction(engine, curPlayer, legal);
                actMs = performance.now() - t0;
            }

            // Invariant: Action must be legal (strict: illegal end_turn triggers ENGINE_ERROR)
            const isLegal = legal.some(l => JSON.stringify(l) === JSON.stringify(action));
            if (!isLegal) {
                termination = 'ENGINE_ERROR';
                errorDetails = `Illegal action produced: ${JSON.stringify(action)}`;
                break;
            }

            const isRehire = curPlayer === candidateSeat &&
                (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') &&
                (action as any).unitClass === 'commander';
            const preGold = curPlayer === candidateSeat ? (curState.players.find(p => p.id === candidateSeat)?.gold ?? 0) : 0;

            engine.step(action);
            steps++;
            actionHistory.push({ step: steps, player: curPlayer, action, ms: actMs });

            // Validate rehire success strictly AFTER engine.step: the commander must only be counted
            // as recovered when the engine actually created it again for this seat.
            if (isRehire) {
                const postState = engine.getState();
                const postGold = postState.players.find(p => p.id === candidateSeat)?.gold ?? 0;
                const commanderBack = postState.units.some(
                    u => u.ownerId === candidateSeat && u.unitClass === 'commander' && u.hp > 0
                );
                if (postGold < preGold && commanderBack) {
                    rehireSuccesses++;
                    if (inRecoveryWindow) {
                        recoveryCompletedCount++;
                        recoveryWindowDurations.push(decisionsInCurrentRecoveryWindow);
                        inRecoveryWindow = false;
                        decisionsInCurrentRecoveryWindow = 0;
                    }
                }
            }

            if (engine.getState().units.some(u => u.ownerId === candidateSeat && u.unitClass === 'commander' && u.hp > 0)) {
                // Commander alive: any open recovery window is over, but only a verified rehire above
                // counts as a completed window (a commander that never died must not open one).
                inRecoveryWindow = false;
                decisionsInCurrentRecoveryWindow = 0;
            }

            if (curPlayer === 1) {
                turn++;
            }
        }

        if (!errorDetails) {
            const finalState = engine.getState();
            const candidateAlliance = getAllianceId(finalState, candidateSeat);

            if (finalState.winner !== null) {
                if (finalState.winner === candidateAlliance) {
                    termination = 'NATURAL_WIN';
                } else if (finalState.winner === -1) {
                    termination = 'NATURAL_DRAW';
                } else {
                    termination = 'NATURAL_LOSS';
                }
            } else if (finalState.turn > maxTurns) {
                termination = 'TRUNCATION_MAX_TURNS';
            } else {
                termination = 'TRUNCATION_MAX_STEPS';
            }
        }
    } catch (e: any) {
        termination = 'ENGINE_ERROR';
        errorDetails = String(e?.message ?? e);
    } finally {
        if (!termination) {
            termination = engine.isTerminal() ? 'NATURAL_DRAW' : 'TRUNCATION_MAX_STEPS';
        }
        const outcomeLog = {
            matchId,
            candidatePolicy: candidatePolicy.type,
            terminationReason: termination,
            turns: engine.getState().turn,
            steps,
            errorDetails,
            actionHistory
        };
        try {
            writeFileSync(trajFile, JSON.stringify(outcomeLog, null, 2), 'utf8');
        } catch {
            // best-effort
        }
    }

    const finalState = engine.getState();
    const sortedLatencies = [...candidateLatencies].sort((a, b) => a - b);
    const latencyP50 = Number(computePercentile(sortedLatencies, 50).toFixed(1));
    const latencyP95 = Number(computePercentile(sortedLatencies, 95).toFixed(1));
    const latencyP99 = Number(computePercentile(sortedLatencies, 99).toFixed(1));
    const latencyMax = Number((sortedLatencies.length > 0 ? sortedLatencies[sortedLatencies.length - 1] : 0).toFixed(1));

    const rehireRate = decisionOpportunityCount > 0 ? Number((rehireSuccesses / decisionOpportunityCount * 100).toFixed(1)) : null;
    const recoveryWindowSuccessRate = recoveryWindowCount > 0 ? Number((recoveryCompletedCount / recoveryWindowCount * 100).toFixed(1)) : null;
    const recoveryWindowCompletionRate = recoveryWindowCount > 0
        ? Number((recoveryCompletedCount / recoveryWindowCount * 100).toFixed(1))
        : null;

    const encoderVersion = (candidatePolicy.type === 'SPATIAL_V2' || candidatePolicy.type === 'SPATIAL_DAGGER' || candidatePolicy.type === 'S10_SPATIAL_SEARCH')
        ? 'v2'
        : (candidatePolicy.type === 'NET_A' ? 'dense' : 'heuristic');

    return {
        matchId,
        mapName,
        seed,
        candidatePolicy: candidatePolicy.type,
        actualPolicy: candidatePolicy.type,
        checkpointSha256: candidatePolicy.checkpointSha256,
        encoderVersion,
        fallbackCount: 0,
        rulesSummary: 'SD (Apk Skirmish)',
        rulesHash,
        initialStateHash,
        seedStreamInfo: { seed, candidateSeed, opponentSeed, searchSeed },
        provenance: directories?.provenance,
        candidateSeat,
        opponentPolicy: 'HEURISTIC',
        terminationReason: termination,
        turns: finalState.turn,
        steps,
        candidateFinalUnits: finalState.units.filter(u => u.ownerId === candidateSeat && u.hp > 0).length,
        opponentFinalUnits: finalState.units.filter(u => u.ownerId !== candidateSeat && u.hp > 0).length,
        decisionOpportunityCount,
        recoveryWindowCount,
        recoveryCompletedCount,
        rehireOpportunities: decisionOpportunityCount,
        rehireSuccesses,
        rehireRate,
        recoveryWindowSuccessRate,
        recoveryWindowDurations,
        recoveryWindowCompletionRate,
        deterministicReplay: protocol.deterministicReplay,
        searchMaxNodes: protocol.searchMaxNodes,
        searchBudgetMs: protocol.searchBudgetSoftMs,
        errorDetails,
        trajectoryLogPath: trajFile,
        avgMsPerAction: candidateActionCount > 0 ? totalDecisionMs / candidateActionCount : 0,
        latencyP50,
        latencyP95,
        latencyP99,
        latencyMax,
        decisionLatencies: candidateLatencies,
        searchTotalNodes: totalSearchNodes > 0 ? totalSearchNodes : undefined,
        budgetReason: lastBudgetReason,
        wallClockExceededCount,
        deadlineFallbackCount,
        searchCandidatesEvaluated: totalCandidatesEvaluated,
        searchShallowEvaluations: totalShallowEvaluations
    };
}

export async function runFullV7BenchmarkSuite(options: {
    policiesToEvaluate?: PolicyType[];
    maps?: Array<{ name: string; label: string }>;
    seeds?: number[];
    maxTurns?: number;
    maxAtomicSteps?: number;
    reportPath?: string;
    directories?: EvaluationDirectories;
    /** Search/protocol knobs; defaults reproduce the historical 20-node / 200ms / 900ms protocol. */
    protocol?: Partial<BenchmarkProtocol>;
}): Promise<{
    outcomes: MatchOutcome[];
    aggregates: Record<PolicyType, PolicyAggregateReport>;
    reportPath: string;
}> {
    const maps = options.maps ?? BENCHMARK_MAPS;
    const seeds = options.seeds ?? [42, 1337];
    const maxTurns = options.maxTurns ?? 50;
    const maxAtomicSteps = options.maxAtomicSteps ?? 1000;
    const policies = options.policiesToEvaluate ?? ['HEURISTIC', 'SPATIAL_V2', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'];

    // The protocol is fixed once, before any match runs, and is echoed into every match record.
    const protocol: BenchmarkProtocol = {
        ...DEFAULT_BENCHMARK_PROTOCOL,
        maxTurns,
        maxAtomicSteps,
        ...(options.protocol ?? {})
    };
    const provenance = options.directories?.provenance ?? collectMatchProvenance();

    const runId = options.directories?.runId ?? RUN_ID;
    const runDir = options.directories?.runDir ?? (options.directories?.runId ? path.resolve(`training_runs/${options.directories.runId}`) : RUN_DIR);
    const reportDir = options.directories?.reportDir ?? (options.directories?.runId ? path.resolve(`docs/training/reports/${options.directories.runId}`) : REPORT_DIR);
    const trajectoryDir = options.directories?.trajectoryDir ?? path.join(runDir, 'trajectories');
    const checkpointDir = options.directories?.checkpointDir ?? path.join(runDir, 'checkpoints');

    mkdirSync(reportDir, { recursive: true });
    mkdirSync(trajectoryDir, { recursive: true });

    const defaultReportName = runId === 'agent_upgrade_20260921_v7_01' ? 'corrected_v7_rerun.json' : 'v8_clean_benchmark.json';
    const reportPath = options.reportPath ?? path.join(reportDir, defaultReportName);

    // Load available models and compute SHA-256
    let spatialPredictor: SpatialResNetPredictor | undefined;
    let spatialSha256: string | undefined;
    let spatialLoadError: string | undefined;
    const spatialModelPath = path.join(checkpointDir, 'spatial_resnet/spatial_resnet_v2_best.json');
    if (existsSync(spatialModelPath)) {
        try {
            const mJson = readFileSync(spatialModelPath, 'utf8');
            spatialSha256 = getSha256(mJson);
            spatialPredictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(mJson));
        } catch (e: any) {
            spatialLoadError = String(e?.message ?? e);
            console.warn('Could not load spatial predictor:', e);
        }
    } else {
        spatialLoadError = `Model file not found: ${spatialModelPath}`;
    }

    let daggerPredictor: SpatialResNetPredictor | undefined;
    let daggerSha256: string | undefined;
    let daggerLoadError: string | undefined;
    const daggerModelPath = path.join(checkpointDir, 'spatial_resnet_dagger/spatial_resnet_dagger_best.json');
    if (existsSync(daggerModelPath)) {
        try {
            const mJson = readFileSync(daggerModelPath, 'utf8');
            daggerSha256 = getSha256(mJson);
            daggerPredictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(mJson));
        } catch (e: any) {
            daggerLoadError = String(e?.message ?? e);
            console.warn('Could not load dagger predictor:', e);
        }
    } else {
        daggerLoadError = `Model file not found: ${daggerModelPath}`;
    }

    let netAModel: DualHeadNet | undefined;
    let netASha256: string | undefined;
    let netALoadError: string | undefined;
    const netAPath = path.join(checkpointDir, 'net_a/net_a_checkpoint.json');
    if (existsSync(netAPath)) {
        try {
            const mJson = readFileSync(netAPath, 'utf8');
            netASha256 = getSha256(mJson);
            netAModel = loadDualHeadModelFromJson(mJson);
        } catch (e: any) {
            netALoadError = String(e?.message ?? e);
            console.warn('Could not load net_a model:', e);
        }
    } else {
        netALoadError = `Model file not found: ${netAPath}`;
    }

    const outcomes: MatchOutcome[] = [];
    const aggregates: Partial<Record<PolicyType, PolicyAggregateReport>> = {};

    for (const pType of policies) {
        console.log(`\n=======================================================`);
        console.log(`[V7 Benchmark] Evaluating Policy: ${pType}`);
        console.log(`Maps: ${maps.length} | Seats: 2 | Seeds: ${seeds.length} (Total: ${maps.length * 2 * seeds.length} matches)`);
        console.log(`=======================================================\n`);

        let predictorForAgent: SpatialResNetPredictor | undefined;
        let netAForAgent: DualHeadNet | undefined;
        let sha256ForAgent: string | undefined;
        let isModelAvailable = true;
        let loadErrorForPolicy: string | undefined;
        let terminationForMissing: MatchOutcome['terminationReason'] = 'NOT_RUN';

        if (pType === 'SPATIAL_V2' || pType === 'S10_SPATIAL_SEARCH') {
            predictorForAgent = spatialPredictor;
            sha256ForAgent = spatialSha256;
            if (!predictorForAgent) {
                isModelAvailable = false;
                loadErrorForPolicy = spatialLoadError;
                terminationForMissing = existsSync(spatialModelPath) ? 'MODEL_LOAD_ERROR' : 'NOT_RUN';
            }
        } else if (pType === 'SPATIAL_DAGGER') {
            predictorForAgent = daggerPredictor;
            sha256ForAgent = daggerSha256;
            if (!predictorForAgent) {
                isModelAvailable = false;
                loadErrorForPolicy = daggerLoadError;
                terminationForMissing = existsSync(daggerModelPath) ? 'MODEL_LOAD_ERROR' : 'NOT_RUN';
            }
        } else if (pType === 'NET_A') {
            netAForAgent = netAModel;
            sha256ForAgent = netASha256;
            if (!netAForAgent) {
                isModelAvailable = false;
                loadErrorForPolicy = netALoadError;
                terminationForMissing = existsSync(netAPath) ? 'MODEL_LOAD_ERROR' : 'NOT_RUN';
            }
        }

        const pOutcomes: MatchOutcome[] = [];

        if (!isModelAvailable) {
            console.warn(`[V7 Benchmark] Policy ${pType} cannot run (${terminationForMissing}): ${loadErrorForPolicy}`);
            for (const map of maps) {
                for (const seat of [0, 1] as const) {
                    for (const seed of seeds) {
                        const matchId = `match_${pType}_seat${seat}_${map.name.replace(/[^a-zA-Z0-9]/g, '_')}_s${seed}`;
                        const trajFile = path.join(trajectoryDir, `${matchId}.json`);
                        writeFileSync(trajFile, JSON.stringify({
                            matchId,
                            pType,
                            status: terminationForMissing,
                            error: loadErrorForPolicy,
                            checkpointSha256: sha256ForAgent
                        }, null, 2), 'utf8');
                        const notRunOutcome: MatchOutcome = {
                            matchId,
                            mapName: map.name,
                            seed,
                            candidatePolicy: pType,
                            actualPolicy: 'NOT_RUN',
                            checkpointSha256: sha256ForAgent,
                            encoderVersion: (pType === 'SPATIAL_V2' || pType === 'SPATIAL_DAGGER' || pType === 'S10_SPATIAL_SEARCH') ? 'v2' : (pType === 'NET_A' ? 'dense' : 'heuristic'),
                            fallbackCount: 0,
                            rulesSummary: 'SD (Apk Skirmish)',
                            provenance,
                            candidateSeat: seat,
                            opponentPolicy: 'HEURISTIC',
                            terminationReason: terminationForMissing,
                            turns: 0,
                            steps: 0,
                            candidateFinalUnits: 0,
                            opponentFinalUnits: 0,
                            decisionOpportunityCount: 0,
                            recoveryWindowCount: 0,
                            recoveryCompletedCount: 0,
                            rehireOpportunities: 0,
                            rehireSuccesses: 0,
                            rehireRate: null,
                            recoveryWindowSuccessRate: null,
                            recoveryWindowDurations: [],
                            recoveryWindowCompletionRate: null,
                            deterministicReplay: protocol.deterministicReplay,
                            searchMaxNodes: protocol.searchMaxNodes,
                            searchBudgetMs: protocol.searchBudgetSoftMs,
                            errorDetails: loadErrorForPolicy,
                            trajectoryLogPath: trajFile,
                            avgMsPerAction: 0,
                            latencyP50: 0,
                            latencyP95: 0,
                            latencyP99: 0,
                            latencyMax: 0,
                            decisionLatencies: [],
                            wallClockExceededCount: 0,
                            deadlineFallbackCount: 0
                        };
                        pOutcomes.push(notRunOutcome);
                        outcomes.push(notRunOutcome);
                    }
                }
            }
        } else {
            const agent = new PolicyAgent(pType, predictorForAgent, netAForAgent, new HeuristicAI(), sha256ForAgent);

            for (const map of maps) {
                for (const seat of [0, 1] as const) {
                    for (const seed of seeds) {
                        const outcome = runBenchmarkMatch(map.name, agent, seat, seed, maxTurns, maxAtomicSteps, options.directories, protocol);
                        pOutcomes.push(outcome);
                        outcomes.push(outcome);

                        console.log(`  [${pType}] ${map.label} (Seat ${seat}, Seed ${seed}) -> ${outcome.terminationReason} (${outcome.turns} turns, ${outcome.steps} steps, ${outcome.avgMsPerAction.toFixed(1)}ms/act, Rehire: ${outcome.rehireSuccesses}/${outcome.rehireOpportunities})`);
                    }
                }
            }
        }

        const natWins = pOutcomes.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const natLosses = pOutcomes.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const natDraws = pOutcomes.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const truncs = pOutcomes.filter(o => o.terminationReason.startsWith('TRUNCATION')).length;
        const errs = pOutcomes.filter(o => o.terminationReason === 'ENGINE_ERROR').length;
        const modelErrs = pOutcomes.filter(o => o.terminationReason === 'MODEL_LOAD_ERROR').length;
        const notRuns = pOutcomes.filter(o => o.terminationReason === 'NOT_RUN').length;
        const totalRehireOpp = pOutcomes.reduce((acc, o) => acc + o.rehireOpportunities, 0);
        const totalRehireSucc = pOutcomes.reduce((acc, o) => acc + o.rehireSuccesses, 0);
        const totalRecWindows = pOutcomes.reduce((acc, o) => acc + o.recoveryWindowCount, 0);
        const totalRecSuccesses = pOutcomes.reduce((acc, o) => acc + o.recoveryCompletedCount, 0);
        const avgMs = pOutcomes.reduce((acc, o) => acc + o.avgMsPerAction, 0) / Math.max(1, pOutcomes.length);

        const allDecisionLatencies = pOutcomes.flatMap(o => o.decisionLatencies ?? []).sort((a, b) => a - b);
        const aggP50 = Number(computePercentile(allDecisionLatencies, 50).toFixed(1));
        const aggP95 = Number(computePercentile(allDecisionLatencies, 95).toFixed(1));
        const aggP99 = Number(computePercentile(allDecisionLatencies, 99).toFixed(1));
        const aggMax = Number((allDecisionLatencies.length > 0 ? allDecisionLatencies[allDecisionLatencies.length - 1] : 0).toFixed(1));
        const latenciesOver1000ms = allDecisionLatencies.filter(l => l > 1000).length;
        const totalDeadlineFallbacks = pOutcomes.reduce((acc, o) => acc + (o.deadlineFallbackCount ?? 0), 0);
        const candidatesEvaluatedList = pOutcomes.map(o => o.searchCandidatesEvaluated).filter((n): n is number => n !== undefined);
        const avgCandidatesEvaluated = candidatesEvaluatedList.length > 0
            ? Number((candidatesEvaluatedList.reduce((a, b) => a + b, 0) / candidatesEvaluatedList.length).toFixed(2))
            : undefined;
        const shallowEvaluationsList = pOutcomes.map(o => o.searchShallowEvaluations).filter((n): n is number => n !== undefined);
        const avgShallowEvaluations = shallowEvaluationsList.length > 0
            ? Number((shallowEvaluationsList.reduce((a, b) => a + b, 0) / shallowEvaluationsList.length).toFixed(2))
            : undefined;
        const wallClockExceededMatches = pOutcomes.filter(o => (o.wallClockExceededCount ?? 0) > 0).length;
        const searchNodesList = pOutcomes.map(o => o.searchTotalNodes).filter((n): n is number => n !== undefined);
        const avgSearchNodes = searchNodesList.length > 0 ? Number((searchNodesList.reduce((a, b) => a + b, 0) / searchNodesList.length).toFixed(1)) : undefined;

        // Recovery windows are the honest denominator for "did the commander come back": a window is
        // one death, not the twenty ordinary decisions that may pass while it is open.
        const allWindowDurations = pOutcomes.flatMap(o => o.recoveryWindowDurations ?? []);
        const meanRecoveryWindowDuration = allWindowDurations.length > 0
            ? Number((allWindowDurations.reduce((a, b) => a + b, 0) / allWindowDurations.length).toFixed(2))
            : null;

        const naturalTotal = natWins + natLosses;
        const confNatural = computeWilsonScoreInterval(natWins, naturalTotal);
        const confEffective = computeWilsonScoreInterval(natWins, pOutcomes.length);

        aggregates[pType] = {
            policy: pType,
            matchesPlayed: pOutcomes.length,
            naturalWins: natWins,
            naturalLosses: natLosses,
            naturalDraws: natDraws,
            truncations: truncs,
            truncationRate: Number((truncs / Math.max(1, pOutcomes.length) * 100).toFixed(1)),
            engineErrors: errs,
            modelLoadErrors: modelErrs,
            notRuns,
            winRateNaturalOnly: naturalTotal > 0 ? Number((natWins / naturalTotal * 100).toFixed(1)) : 0,
            confidenceInterval95Natural: confNatural,
            effectiveWinRate: Number((natWins / pOutcomes.length * 100).toFixed(1)),
            confidenceInterval95Effective: confEffective,
            totalRehireOpportunities: totalRehireOpp,
            totalRehireSuccesses: totalRehireSucc,
            rehireSuccessRate: totalRehireOpp > 0 ? Number((totalRehireSucc / totalRehireOpp * 100).toFixed(1)) : null,
            totalRecoveryWindows: totalRecWindows,
            totalRecoverySuccesses: totalRecSuccesses,
            recoveryWindowSuccessRate: totalRecWindows > 0 ? Number((totalRecSuccesses / totalRecWindows * 100).toFixed(1)) : null,
            meanRecoveryWindowDuration,
            avgDecisionMs: Number(avgMs.toFixed(1)),
            latencyP50: aggP50,
            latencyP95: aggP95,
            latencyP99: aggP99,
            latencyMax: aggMax,
            latenciesOver1000ms,
            wallClockExceededMatches,
            totalDeadlineFallbacks,
            avgSearchNodes,
            avgCandidatesEvaluated,
            avgShallowEvaluations
        };
    }

    const comparisonReport = {
        runId,
        evaluatedAt: new Date().toISOString(),
        benchmarkMaps: maps.map(m => m.name),
        seeds,
        maxTurns,
        maxAtomicSteps,
        protocol,
        provenance,
        aggregates,
        totalMatches: outcomes.length,
        outcomes
    };

    writeFileSync(reportPath, JSON.stringify(comparisonReport, null, 2), 'utf8');
    console.log(`\n[V7 Benchmark] Saved comparison report to: ${reportPath}`);

    return {
        outcomes,
        aggregates: aggregates as Record<PolicyType, PolicyAggregateReport>,
        reportPath
    };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Usage: npx tsx tools/v7_unified_evaluation.ts [--dry-run] [--quick] [--maps N]');
        process.exit(0);
    }
    if (process.argv.includes('--dry-run')) {
        console.log('[V7 Evaluation] Dry run acknowledged. Exiting.');
        process.exit(0);
    }

    let runId: string | undefined;
    const runIdIdx = process.argv.indexOf('--run-id');
    if (runIdIdx !== -1 && process.argv[runIdIdx + 1]) {
        runId = process.argv[runIdIdx + 1];
    }

    const isQuick = process.argv.includes('--quick');
    const selectedMaps = isQuick ? BENCHMARK_MAPS.slice(0, 2) : BENCHMARK_MAPS;
    const selectedSeeds = isQuick ? [42] : [42, 1337];

    let cliPolicies: PolicyType[] | undefined;
    const polIdx = process.argv.indexOf('--policies');
    if (polIdx !== -1 && process.argv[polIdx + 1]) {
        cliPolicies = process.argv[polIdx + 1].split(',') as PolicyType[];
    } else if (process.argv.includes('--all-policies')) {
        cliPolicies = ['HEURISTIC', 'NET_A', 'SPATIAL_V2', 'SPATIAL_DAGGER', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'];
    }

    let customOutput: string | undefined;
    const outIdx = process.argv.indexOf('--output');
    if (outIdx !== -1 && process.argv[outIdx + 1]) {
        customOutput = path.resolve(process.argv[outIdx + 1]);
    }

    let customTurns: number = isQuick ? 30 : 45;
    const turnsIdx = process.argv.indexOf('--max-turns');
    if (turnsIdx !== -1 && process.argv[turnsIdx + 1]) {
        customTurns = parseInt(process.argv[turnsIdx + 1], 10);
    }

    (async () => {
        await runFullV7BenchmarkSuite({
            maps: selectedMaps,
            seeds: selectedSeeds,
            maxTurns: customTurns,
            policiesToEvaluate: cliPolicies,
            reportPath: customOutput,
            directories: runId ? { runId } : undefined
        });
        console.log('\n✅ V7 BENCHMARK EVALUATION FINISHED!');
    })().catch(err => {
        console.error('Fatal error in V7 evaluation:', err);
        process.exit(1);
    });
}
