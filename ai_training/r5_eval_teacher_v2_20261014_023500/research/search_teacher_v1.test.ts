import { describe, it, expect } from 'vitest';
import { GameEngine } from '../env/src/game/engine';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { encodeAction } from '../env/src/game/env';
import { CorrectedSearchTeacherV1 } from './search_teacher_v1';
import { computeStateHash } from './state_hash';

describe('T08: 搜索正确性、预算与可复现性测试', () => {
    it('1. 候选评估 Trace 完整性：必须记录入选理由、推演步数、换手数、完成状态与停止原因', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(state.currentPlayer);

        const teacher = new CorrectedSearchTeacherV1('test_v1', { targetK: 3 });
        const trace = teacher.search({
            engineClone: engine.clone(),
            observerPlayerId: state.currentPlayer,
            legalActions: legal,
            candidateCodes: legal.map(encodeAction),
            stateHash: computeStateHash(state),
            stepIndex: 0
        });

        expect(trace.chosenActionCode).toBeDefined();
        expect(trace.searchedCount).toBeGreaterThanOrEqual(1);
        expect(trace.completedCount).toBeGreaterThanOrEqual(1);

        for (const [code, cTrace] of Object.entries(trace.candidateTraces)) {
            expect(cTrace.actionCode).toBe(code);
            expect(cTrace.selectionReason).toBeDefined();
            expect(cTrace.engineStepCalls).toBeGreaterThanOrEqual(1);
            expect(typeof cTrace.isCompleted).toBe('boolean');
            expect(cTrace.stopReason).toBeDefined();
            expect(cTrace.leafPhase).toBeDefined();
            expect(typeof cTrace.finalQ).toBe('number');
        }
    });

    it('2. 确定性测试：相同局面与种子 100% 产生相同候选选择与行动决策', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(state.currentPlayer);

        const teacher1 = new CorrectedSearchTeacherV1('t1', { targetK: 4, seed: 12345 });
        const teacher2 = new CorrectedSearchTeacherV1('t2', { targetK: 4, seed: 12345 });

        const ctx1 = {
            engineClone: engine.clone(),
            observerPlayerId: state.currentPlayer,
            legalActions: legal,
            candidateCodes: legal.map(encodeAction),
            stateHash: computeStateHash(state),
            stepIndex: 1
        };
        const ctx2 = {
            engineClone: engine.clone(),
            observerPlayerId: state.currentPlayer,
            legalActions: legal,
            candidateCodes: legal.map(encodeAction),
            stateHash: computeStateHash(state),
            stepIndex: 1
        };

        const trace1 = teacher1.search(ctx1);
        const trace2 = teacher2.search(ctx2);

        expect(trace1.chosenActionCode).toBe(trace2.chosenActionCode);
        expect(trace1.bestQ).toBeCloseTo(trace2.bestQ, 6);
        expect(Object.keys(trace1.candidateTraces)).toEqual(Object.keys(trace2.candidateTraces));
    });

    it('3. 预算硬超时保护与 Fallback 机制：极端超时能安全回退', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(state.currentPlayer);

        // 设置 maxWallMs = 0ms 模拟立即超时
        const teacher = new CorrectedSearchTeacherV1('timeout_teacher', {
            targetK: 4,
            maxWallMs: 0
        });

        const trace = teacher.search({
            engineClone: engine.clone(),
            observerPlayerId: state.currentPlayer,
            legalActions: legal,
            candidateCodes: legal.map(encodeAction),
            stateHash: computeStateHash(state),
            stepIndex: 0
        });

        expect(trace.chosenActionCode).toBeDefined();
        expect(trace.fallbackReason).toBe('heuristic_top1');
    });

    it('4. 未完成统一相位识别：若步数限制过小，正确标记 incomplete_opp_limit', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(state.currentPlayer);

        // 仅允许对手模拟 1 步，必然无法完成整个对手回合轮转回 root
        const teacher = new CorrectedSearchTeacherV1('shallow_opp', {
            targetK: 2,
            maxSimulationSteps: 1
        });

        const trace = teacher.search({
            engineClone: engine.clone(),
            observerPlayerId: state.currentPlayer,
            legalActions: legal,
            candidateCodes: legal.map(encodeAction),
            stateHash: computeStateHash(state),
            stepIndex: 0
        });

        const traces = Object.values(trace.candidateTraces);
        const hasIncomplete = traces.some(t => t.leafPhase === 'incomplete_opp_limit' && !t.isCompleted);
        expect(hasIncomplete).toBe(true);
    });

    it('5. 根动作直接终局：若根动作导致游戏结束，立即结算为 direct_terminal', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        state.units = []; // 清空单位
        state.units.push({
            id: 'atk',
            ownerId: 0,
            unitClass: 'archer',
            pos: { x: 4, y: 4 },
            hp: 100,
            maxHp: 100,
            level: 0,
            exp: 0,
            hasActed: false,
            hasMoved: false
        });
        state.units.push({
            id: 'cmd_foe',
            ownerId: 1,
            unitClass: 'commander',
            pos: { x: 4, y: 6 },
            hp: 5,
            maxHp: 100,
            level: 0,
            exp: 0,
            hasActed: false,
            hasMoved: false
        });
        state.players[1].commanderId = 'cmd_foe';
        // 清除敌方城堡所有权，确保击杀后敌方无单位无城堡触发立即终局
        state.map.tiles.forEach(row => row.forEach(tile => {
            if (tile.ownerId === 1) tile.ownerId = null;
        }));

        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(0);

        const teacher = new CorrectedSearchTeacherV1('finisher', { targetK: 4 });
        const trace = teacher.search({
            engineClone: engine.clone(),
            observerPlayerId: 0,
            legalActions: legal,
            candidateCodes: legal.map(encodeAction),
            stateHash: computeStateHash(state),
            stepIndex: 0
        });

        const killCode = 'attack:atk:cmd_foe';
        expect(trace.chosenActionCode).toBe(killCode);
        const killTrace = trace.candidateTraces[killCode];
        expect(killTrace).toBeDefined();
        expect(killTrace.leafPhase).toBe('direct_terminal');
        expect(killTrace.isCompleted).toBe(true);
        expect(killTrace.finalQ).toBe(1.0); // 终局全胜 +1.0
    });
});
