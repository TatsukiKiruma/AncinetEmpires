import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { encodeAction, decodeAction } from '../env/src/game/env';
import { computeStateHash, computeGameplayStateKey } from './state_hash';
import { buildCandidateSet } from './action_protocol';
import { MatchOutcome, EpisodeTerminationReason, inspectTerminalState } from './outcomes';

export interface PolicyContext {
    engineClone: GameEngine;
    observerPlayerId: number;
    legalActions: readonly Action[];
    candidateCodes: readonly string[];
    stateHash: string;
    stepIndex: number;
    budget?: { maxWallMs?: number; maxEngineSteps?: number };
    rngStream?: () => number;
}

export interface Policy {
    id: string;
    chooseAction(ctx: PolicyContext): Promise<string> | string;
}

/**
 * 真正独立进程硬超时监管的策略封装
 */
export class WorkerGuardedPolicy implements Policy {
    public id: string;
    private workerPolicyType: string;
    private timeoutMs: number;

    constructor(id: string, workerPolicyType: string, timeoutMs: number = 30000) {
        this.id = id;
        this.workerPolicyType = workerPolicyType;
        this.timeoutMs = timeoutMs;
    }

    public chooseAction(ctx: PolicyContext): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const workerScript = path.resolve(__dirname, 'policy_worker.ts');
            const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
            const proc = spawn(npxCmd, ['--prefix', 'env', 'tsx', workerScript], {
                cwd: path.resolve(__dirname, '..'),
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
            });

            let settled = false;
            let stdoutData = '';
            let stderrData = '';

            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    try {
                        proc.kill('SIGKILL');
                    } catch {}
                    reject(new Error(`Worker timed out after ${this.timeoutMs}ms and was terminated`));
                }
            }, this.timeoutMs);

            proc.stdout.on('data', (d) => {
                stdoutData += d.toString();
            });

            proc.stderr.on('data', (d) => {
                stderrData += d.toString();
            });

            proc.on('close', (code) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    try {
                        const res = JSON.parse(stdoutData.trim());
                        if (res.success) {
                            resolve(res.actionCode);
                        } else {
                            reject(new Error(res.error || stderrData || `Worker failed with code ${code}`));
                        }
                    } catch (e) {
                        reject(new Error(stderrData || `Worker output parse failed: ${stdoutData}`));
                    }
                }
            });

            proc.on('error', (err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(err);
                }
            });

            const payload = JSON.stringify({
                policyType: this.workerPolicyType,
                state: ctx.engineClone.getState(),
                playerId: ctx.observerPlayerId
            });
            proc.stdin.write(payload);
            proc.stdin.end();
        });
    }
}

export interface StepRecord {
    stepIndex: number;
    turn: number;
    playerId: number;
    actionCode: string;
    stateHashBefore: string;
    stateHashAfter: string;
    stepDurationMs: number;
}

export interface MatchRecord {
    initialState: GameState;
    initialStateHash: string;
    rulesRevision: string;
    policies: Record<number, string>;
    steps: StepRecord[];
    outcome: MatchOutcome;
}

export interface MatchRunnerConfig {
    maxAtomicActions?: number;
    maxHandoffs?: number;
    maxEpisodeWallSeconds?: number;
    repeatedStateLimit?: number;
    allowSurrender?: boolean;
}

export const DEFAULT_MATCH_CONFIG: Required<MatchRunnerConfig> = {
    maxAtomicActions: 6000,
    maxHandoffs: 200,
    maxEpisodeWallSeconds: 1800,
    repeatedStateLimit: 3,
    allowSurrender: false
};

/**
 * 权威对局裁判运行器
 */
export class MatchRunner {
    private config: Required<MatchRunnerConfig>;

    constructor(config: MatchRunnerConfig = {}) {
        this.config = { ...DEFAULT_MATCH_CONFIG, ...config };
    }

    public async runMatch(
        initialState: GameState,
        policies: Map<number, Policy>
    ): Promise<MatchRecord> {
        const wallStart = Date.now();
        // 严格克隆初始状态构建真实裁判引擎，防止外部引用污染
        const engine = new GameEngine(JSON.parse(JSON.stringify(initialState)));
        const steps: StepRecord[] = [];
        const policyNames: Record<number, string> = {};
        for (const [pid, p] of policies.entries()) {
            policyNames[pid] = p.id;
        }

        const gameplayKeyCounts = new Map<string, number>();
        let previousPlayer = engine.getState().currentPlayer;
        let totalHandoffs = 0;
        let terminationReason: EpisodeTerminationReason | null = null;
        let errorDetail: string | undefined = undefined;

        while (true) {
            const currentState = engine.getState();
            const stateHashBefore = computeStateHash(currentState);

            // 1. 检查权威规则终局
            const terminalCheck = inspectTerminalState(currentState);
            if (terminalCheck.isTerminal) {
                terminationReason = terminalCheck.terminationReason;
                break;
            }

            // 2. 检查全局截断边界
            if (steps.length >= this.config.maxAtomicActions) {
                terminationReason = 'truncated_step_limit';
                break;
            }
            if (totalHandoffs >= this.config.maxHandoffs) {
                terminationReason = 'truncated_ply_limit';
                break;
            }
            const wallElapsedSec = (Date.now() - wallStart) / 1000;
            if (wallElapsedSec >= this.config.maxEpisodeWallSeconds) {
                terminationReason = 'truncated_wall_seconds';
                break;
            }

            // 3. 重复局面检测
            const gpKey = computeGameplayStateKey(currentState);
            const count = (gameplayKeyCounts.get(gpKey) ?? 0) + 1;
            gameplayKeyCounts.set(gpKey, count);
            if (count >= this.config.repeatedStateLimit) {
                terminationReason = 'truncated_repeated_state';
                break;
            }

            // 4. 获取当前玩家与合法动作
            const currentPlayer = currentState.currentPlayer;
            if (currentPlayer !== previousPlayer) {
                totalHandoffs += 1;
                previousPlayer = currentPlayer;
            }

            const legalActions = engine.getLegalActions(currentPlayer);
            if (legalActions.length === 0) {
                // 无合法动作时检查是否已获胜或需强制换手
                if (engine.isTerminal()) {
                    const check = inspectTerminalState(engine.getState());
                    terminationReason = check.terminationReason ?? 'natural_draw';
                } else {
                    terminationReason = 'error_illegal_action';
                    errorDetail = `Player ${currentPlayer} has 0 legal actions but engine is not terminal`;
                }
                break;
            }

            const policy = policies.get(currentPlayer);
            if (!policy) {
                terminationReason = 'error_exception';
                errorDetail = `No policy registered for player ${currentPlayer}`;
                break;
            }

            const candidateSet = buildCandidateSet(legalActions, this.config.allowSurrender);
            const stepStart = Date.now();
            let chosenCode: string;

            try {
                // 提供给策略的是安全克隆，策略无法修改裁判引擎内部数据
                const engineClone = engine.clone();
                chosenCode = await policy.chooseAction({
                    engineClone,
                    observerPlayerId: currentPlayer,
                    legalActions: candidateSet.actions,
                    candidateCodes: candidateSet.candidateCodes,
                    stateHash: stateHashBefore,
                    stepIndex: steps.length
                });
            } catch (err: any) {
                const msg = err?.message || String(err);
                if (msg.includes('Worker timed out') || msg.includes('timed out')) {
                    terminationReason = 'error_worker_timeout';
                } else {
                    terminationReason = 'error_exception';
                }
                errorDetail = msg;
                break;
            }

            const stepDuration = Date.now() - stepStart;

            // 5. 严格合法性校验：必须属于当前合法候选集合
            const matchedIndex = candidateSet.candidateCodes.indexOf(chosenCode);
            if (matchedIndex === -1) {
                terminationReason = 'error_illegal_action';
                errorDetail = `Policy chose illegal action code: ${chosenCode}`;
                break;
            }

            const actionToExecute = candidateSet.actions[matchedIndex];

            // 6. 裁判引擎权威执行
            const res = engine.step(actionToExecute);
            if (res.info.includes('非法动作')) {
                terminationReason = 'error_illegal_action';
                errorDetail = `Engine rejected action: ${res.info}`;
                break;
            }

            const stateHashAfter = computeStateHash(engine.getState());
            steps.push({
                stepIndex: steps.length,
                turn: currentState.turn,
                playerId: currentPlayer,
                actionCode: chosenCode,
                stateHashBefore,
                stateHashAfter,
                stepDurationMs: stepDuration
            });
        }

        const wallDurationMs = Date.now() - wallStart;
        const finalState = engine.getState();
        const terminalInfo = inspectTerminalState(finalState);

        const isNatural = terminationReason === 'natural_win' || terminationReason === 'natural_draw';
        const isTruncated = terminationReason?.startsWith('truncated_') ?? false;
        const isErr = terminationReason?.startsWith('error_') ?? false;

        const outcome: MatchOutcome = {
            terminationReason: terminationReason ?? 'error_exception',
            isNaturalTerminal: isNatural,
            isTruncated,
            isError: isErr,
            winner: terminalInfo.winnerAlliance,
            winnerAlliance: terminalInfo.winnerAlliance,
            totalAtomicActions: steps.length,
            totalHandoffs,
            totalRounds: finalState.turn,
            wallDurationMs,
            finalStateHash: computeStateHash(finalState),
            details: errorDetail
        };

        return {
            initialState,
            initialStateHash: computeStateHash(initialState),
            rulesRevision: 'apk-4.2.5.1-rules-20261013-r4',
            policies: policyNames,
            steps,
            outcome
        };
    }
}

/**
 * 严格对局回放器
 * 给定初态与语义动作代码序列，在干净引擎上逐步重放，
 * 验证合法性以及每一步的 stateHash 一致性。
 */
export function replayMatch(record: MatchRecord): {
    success: boolean;
    executedSteps: number;
    divergenceStep?: number;
    reason?: string;
} {
    const engine = new GameEngine(JSON.parse(JSON.stringify(record.initialState)));
    const initialHash = computeStateHash(engine.getState());
    if (initialHash !== record.initialStateHash) {
        return {
            success: false,
            executedSteps: 0,
            reason: `Initial state hash mismatch: computed=${initialHash}, recorded=${record.initialStateHash}`
        };
    }

    for (let i = 0; i < record.steps.length; i++) {
        const step = record.steps[i];
        const stateBefore = engine.getState();
        const hashBefore = computeStateHash(stateBefore);

        if (hashBefore !== step.stateHashBefore) {
            return {
                success: false,
                executedSteps: i,
                divergenceStep: i,
                reason: `State hash before step ${i} mismatch: computed=${hashBefore}, recorded=${step.stateHashBefore}`
            };
        }

        const legalActions = engine.getLegalActions(stateBefore.currentPlayer);
        const candidateCodes = legalActions.map(encodeAction);
        const matchIdx = candidateCodes.indexOf(step.actionCode);
        if (matchIdx === -1) {
            return {
                success: false,
                executedSteps: i,
                divergenceStep: i,
                reason: `Action at step ${i} is not legal in replayed state: code=${step.actionCode}`
            };
        }

        const action = legalActions[matchIdx];
        const res = engine.step(action);
        if (res.info.includes('非法动作')) {
            return {
                success: false,
                executedSteps: i,
                divergenceStep: i,
                reason: `Engine rejected action at step ${i}: ${res.info}`
            };
        }

        const hashAfter = computeStateHash(engine.getState());
        if (hashAfter !== step.stateHashAfter) {
            return {
                success: false,
                executedSteps: i,
                divergenceStep: i,
                reason: `State hash after step ${i} mismatch: computed=${hashAfter}, recorded=${step.stateHashAfter}`
            };
        }
    }

    return {
        success: true,
        executedSteps: record.steps.length
    };
}
