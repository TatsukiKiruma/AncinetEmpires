import { describe, it, expect } from 'vitest';
import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction, decodeAction } from '../env/src/game/env';
import { computeStateHash, computeGameplayStateKey } from './state_hash';
import { buildCandidateSet } from './action_protocol';
import { MatchOutcome, computeValueTarget, inspectTerminalState } from './outcomes';
import { MatchRunner, replayMatch, Policy, WorkerGuardedPolicy } from './match_runner';

describe('T01: 严格对局执行器与裁判协议', () => {

    it('1. 动作语义编解码与 roundtrip 验证', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(state.currentPlayer);
        expect(legalActions.length).toBeGreaterThan(0);

        for (const action of legalActions) {
            const code = encodeAction(action);
            const decoded = decodeAction(code);
            expect(decoded).not.toBeNull();
            expect(encodeAction(decoded!)).toBe(code);
        }
    });

    it('2. 状态克隆隔离性：策略修改克隆对象不影响裁判引擎', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const hashBefore = computeStateHash(engine.getState());

        const clone = engine.clone();
        // 模拟不良策略修改克隆状态
        (clone.getState() as any).currentPlayer = 999;
        (clone.getState() as any).players[0].gold = 999999;

        const hashAfter = computeStateHash(engine.getState());
        expect(hashAfter).toBe(hashBefore);
        expect(engine.getState().currentPlayer).toBe(0);
        expect(engine.getState().players[0].gold).not.toBe(999999);
    });

    it('3. 初始收入不重复结算验证', () => {
        const state1 = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const gold1 = state1.players[0].gold;
        // 默认 SD 300 金币，Duel 城堡收入 100 + 指挥官 50 = 150，先手 P0 初始金币为 450
        expect(gold1).toBe(450);

        const engine = new GameEngine(state1);
        expect(engine.getState().players[0].gold).toBe(450);

        const clone = engine.clone();
        expect(clone.getState().players[0].gold).toBe(450);
    });

    it('4. 同方 move 后继续，不机械切换 currentPlayer', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const pBefore = engine.getState().currentPlayer;

        const legal = engine.getLegalActions(pBefore);
        const moveAction = legal.find(a => a.type === 'move');
        expect(moveAction).toBeDefined();

        engine.step(moveAction!);
        // 执行 move 后，仍然属于同一个玩家的回合
        expect(engine.getState().currentPlayer).toBe(pBefore);
    });

    it('5. 待招募同格 pending 单位与状态克隆一致性', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(state.currentPlayer);

        const recruitAction = legal.find(a => a.type === 'recruit_to_castle');
        expect(recruitAction).toBeDefined();

        engine.step(recruitAction!);
        const postState = engine.getState();
        expect(postState.pendingUnitId).toBeDefined();

        // 验证克隆保留 pendingUnitId 及同格合法动作
        const clone = engine.clone();
        expect(clone.getState().pendingUnitId).toBe(postState.pendingUnitId);
        const cloneLegal = clone.getLegalActions(postState.currentPlayer);
        const origLegal = engine.getLegalActions(postState.currentPlayer);
        expect(cloneLegal.map(encodeAction)).toEqual(origLegal.map(encodeAction));
    });

    it('6. 非法动作阻断：裁判判定 error_illegal_action', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const runner = new MatchRunner({ maxAtomicActions: 10 });

        const illegalPolicy: Policy = {
            id: 'illegal_agent',
            chooseAction: () => 'move:fake_unit:99,99'
        };
        const validPolicy: Policy = {
            id: 'first_legal',
            chooseAction: (ctx) => ctx.candidateCodes[0]
        };

        const policies = new Map<number, Policy>([
            [0, illegalPolicy],
            [1, validPolicy]
        ]);

        const record = await runner.runMatch(state, policies);
        expect(record.outcome.isError).toBe(true);
        expect(record.outcome.terminationReason).toBe('error_illegal_action');
    });

    it('7. 重复局面截断：达到 repeatedStateLimit 判定截断', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const runner = new MatchRunner({ repeatedStateLimit: 2, maxAtomicActions: 50 });

        // 两方均只选择 end_turn，使得局面反复重现
        const endTurnPolicy: Policy = {
            id: 'end_turn_only',
            chooseAction: (ctx) => {
                const endAct = ctx.candidateCodes.find(c => c === 'end_turn');
                return endAct ?? ctx.candidateCodes[0];
            }
        };

        const policies = new Map<number, Policy>([
            [0, endTurnPolicy],
            [1, endTurnPolicy]
        ]);

        const record = await runner.runMatch(state, policies);
        expect(record.outcome.isTruncated).toBe(true);
        expect(record.outcome.terminationReason).toBe('truncated_repeated_state');
    });

    it('8. 步数与换手上限截断测试', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const runner = new MatchRunner({ maxAtomicActions: 4 });

        const firstPolicy: Policy = {
            id: 'first_legal',
            chooseAction: (ctx) => ctx.candidateCodes[0]
        };

        const policies = new Map<number, Policy>([
            [0, firstPolicy],
            [1, firstPolicy]
        ]);

        const record = await runner.runMatch(state, policies);
        expect(record.outcome.isTruncated).toBe(true);
        expect(record.outcome.terminationReason).toBe('truncated_step_limit');
        expect(record.steps.length).toBe(4);
    });

    it('9. 精确回放验证：录制的对局可通过 replayMatch 逐步校验哈希', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const runner = new MatchRunner({ maxAtomicActions: 30 });

        const hPolicy: Policy = {
            id: 'heuristic',
            chooseAction: (ctx) => {
                const ai = new HeuristicAI();
                const act = ai.getAction(ctx.engineClone, ctx.observerPlayerId);
                return encodeAction(act!);
            }
        };

        const policies = new Map<number, Policy>([
            [0, hPolicy],
            [1, hPolicy]
        ]);

        const record = await runner.runMatch(state, policies);
        expect(record.steps.length).toBeGreaterThan(5);

        const replayResult = replayMatch(record);
        expect(replayResult.success).toBe(true);
        expect(replayResult.executedSteps).toBe(record.steps.length);
    });

    it('10. 真实价值标签提取：仅自然终局赋分，截断赋 null', () => {
        const truncatedOutcome: MatchOutcome = {
            terminationReason: 'truncated_ply_limit',
            isNaturalTerminal: false,
            isTruncated: true,
            isError: false,
            winner: null,
            winnerAlliance: null,
            totalAtomicActions: 100,
            totalHandoffs: 50,
            totalRounds: 25,
            wallDurationMs: 500,
            finalStateHash: 'fake_hash'
        };
        // 截断时无论哪方视角均为 null
        expect(computeValueTarget(truncatedOutcome, 0)).toBeNull();
        expect(computeValueTarget(truncatedOutcome, 1)).toBeNull();

        const naturalWinOutcome: MatchOutcome = {
            terminationReason: 'natural_win',
            isNaturalTerminal: true,
            isTruncated: false,
            isError: false,
            winner: 0, // 联盟 0 获胜
            winnerAlliance: 0,
            totalAtomicActions: 80,
            totalHandoffs: 40,
            totalRounds: 20,
            wallDurationMs: 400,
            finalStateHash: 'win_hash'
        };
        // 观察者为联盟 0 -> +1.0；观察者为联盟 1 -> -1.0
        expect(computeValueTarget(naturalWinOutcome, 0)).toBe(1.0);
        expect(computeValueTarget(naturalWinOutcome, 1)).toBe(-1.0);
    });

    it('11. Worker 硬超时监管测试：死循环策略被强制销毁', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const runner = new MatchRunner({ maxAtomicActions: 5 });

        // 设置 500ms 超时，策略内部执行死循环
        const timeoutPolicy = new WorkerGuardedPolicy('infinite_loop', 'infinite_loop_test', 500);
        const normalPolicy = new WorkerGuardedPolicy('first_legal', 'first_legal', 5000);

        const policies = new Map<number, Policy>([
            [0, timeoutPolicy],
            [1, normalPolicy]
        ]);

        const record = await runner.runMatch(state, policies);
        if (record.outcome.terminationReason !== 'error_worker_timeout') {
            console.log('Test 11 unexpected termination details:', record.outcome.details);
        }
        expect(record.outcome.isError).toBe(true);
        expect(record.outcome.terminationReason).toBe('error_worker_timeout');
    });

    it('12. 1,000+ 次合法转移的精确回放与状态一致性验证', () => {
        // 在 3 张训练地图上，使用随机合法策略运行连续转移，累计达到 1,000+ 步，并逐段严格重放
        const maps = ['(2) Duel.aem', '(2) Liberty Port.aem', '(2) Swamplands.aem'];
        let totalTransitions = 0;

        for (const mapName of maps) {
            let seed = 42;
            const pseudoRand = () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };

            const state = createAppApkSkirmishGameState(mapName, 'SD');
            const engine = new GameEngine(JSON.parse(JSON.stringify(state)));

            const record: {
                initialState: GameState;
                initialStateHash: string;
                rulesRevision: string;
                policies: Record<number, string>;
                steps: any[];
                outcome: any;
            } = {
                initialState: JSON.parse(JSON.stringify(state)),
                initialStateHash: computeStateHash(state),
                rulesRevision: 'apk-4.2.5.1-rules-20261013-r4',
                policies: { 0: 'random_legal', 1: 'random_legal' },
                steps: [],
                outcome: {} as any
            };

            for (let step = 0; step < 400 && !engine.isTerminal(); step++) {
                const curr = engine.getState();
                const hashBefore = computeStateHash(curr);
                const legal = engine.getLegalActions(curr.currentPlayer);
                if (legal.length === 0) break;

                // 排除 surrender，纯粹推进对战
                const candidateSet = buildCandidateSet(legal, false);
                const eligibleIndices: number[] = [];
                for (let i = 0; i < candidateSet.eligibleMask.length; i++) {
                    if (candidateSet.eligibleMask[i]) eligibleIndices.push(i);
                }
                const chosenIdx = eligibleIndices[Math.floor(pseudoRand() * eligibleIndices.length)];
                const action = candidateSet.actions[chosenIdx];
                const code = candidateSet.candidateCodes[chosenIdx];

                engine.step(action);
                const hashAfter = computeStateHash(engine.getState());

                record.steps.push({
                    stepIndex: record.steps.length,
                    turn: curr.turn,
                    playerId: curr.currentPlayer,
                    actionCode: code,
                    stateHashBefore: hashBefore,
                    stateHashAfter: hashAfter,
                    stepDurationMs: 0
                });
                totalTransitions++;
            }

            // 对录制的该地图对局进行精确重放验证
            const replay = replayMatch(record as any);
            expect(replay.success).toBe(true);
            expect(replay.executedSteps).toBe(record.steps.length);
        }

        expect(totalTransitions).toBeGreaterThanOrEqual(1000);
        console.log(`Successfully verified ${totalTransitions} legal transitions with 100% exact replay parity!`);
    });
});
