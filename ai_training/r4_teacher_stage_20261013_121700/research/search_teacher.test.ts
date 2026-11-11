import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GameEngine } from '../env/src/game/engine';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { encodeAction } from '../env/src/game/env';
import { computeStateHash } from './state_hash';
import { evaluateStateValue, DEFAULT_EVALUATOR_WEIGHTS, ABLATION_MATERIAL_ONLY_WEIGHTS } from './state_evaluator';
import { selectRootCandidates } from './candidate_selector';
import { RootRolloutSearchTeacher } from './search_teacher';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('T05: 根候选搜索教师', () => {

    it('1. 状态评估器：视角固定与自然终局绝对支配', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        // P0 视角非终局评估
        const v0 = evaluateStateValue(state, 0);
        // P1 视角非终局评估
        const v1 = evaluateStateValue(state, 1);

        // 验证非终局严格在 [-0.95, 0.95] 范围内
        expect(Math.abs(v0)).toBeLessThanOrEqual(0.95);
        expect(Math.abs(v1)).toBeLessThanOrEqual(0.95);
        // 双方初始视角基本对称且符号相反
        expect(v0).toBeCloseTo(-v1, 1);

        // 验证自然终局获胜赋 +1.0，严格大于任何非终局估值
        state.winner = 0; // 联盟 0 获胜
        const vWin = evaluateStateValue(state, 0);
        expect(vWin).toBe(1.0);
        expect(vWin).toBeGreaterThan(v0);

        // 验证自然平局赋 0.0
        state.winner = -1;
        expect(evaluateStateValue(state, 0)).toBe(0.0);
    });

    it('2. 候选选择器：正确保留 top-1 动作与 K 个代表动作', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(JSON.parse(JSON.stringify(state)));
        const legal = engine.getLegalActions(0);
        expect(legal.length).toBeGreaterThan(4);

        const sel4 = selectRootCandidates(engine, 0, legal, { targetK: 4 });
        expect(sel4.selectedActions.length).toBe(4);
        expect(sel4.selectedCodes.length).toBe(4);

        const sel8 = selectRootCandidates(engine, 0, legal, { targetK: 8 });
        expect(sel8.selectedActions.length).toBe(Math.min(8, legal.length));
    });

    it('3. 搜索教师：未搜索动作 Q=null，且最佳动作为选定动作', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(JSON.parse(JSON.stringify(state)));
        const legal = engine.getLegalActions(0);
        const codes = legal.map(encodeAction);

        const teacher = new RootRolloutSearchTeacher('teacher_test_k4', {
            targetK: 4,
            useFullResponse: true
        });

        const trace = teacher.search({
            engineClone: engine.clone(),
            observerPlayerId: 0,
            legalActions: legal,
            candidateCodes: codes,
            stateHash: computeStateHash(state),
            stepIndex: 0
        });

        expect(trace.searchedCount).toBe(4);
        expect(trace.totalCandidates).toBe(legal.length);
        expect(trace.candidateQMap[trace.chosenActionCode]).not.toBeNull();
        expect(trace.candidateQMap[trace.chosenActionCode]).toBe(trace.bestQ);

        // 验证未搜索的动作 Q 值为 null
        let nullCount = 0;
        for (const code of codes) {
            if (trace.candidateQMap[code] === null) nullCount++;
        }
        expect(nullCount).toBe(legal.length - 4);
    });

    it('4. 战术题求解能力：教师能选出关键战术动作', async () => {
        const suitePath = path.resolve(__dirname, '../eval/tactical_suite.json');
        const raw = fs.readFileSync(suitePath, 'utf-8');
        const cases = JSON.parse(raw);

        // 测试一个斩首指挥官的战术案例
        const cmdCase = cases.find((c: any) => c.category === 'lethal_commander');
        expect(cmdCase).toBeDefined();

        const engine = new GameEngine(JSON.parse(JSON.stringify(cmdCase.state)));
        const legal = engine.getLegalActions(cmdCase.state.currentPlayer);
        const codes = legal.map(encodeAction);

        const teacher = new RootRolloutSearchTeacher('teacher_tactical', {
            targetK: 4,
            useFullResponse: true
        });

        const trace = teacher.search({
            engineClone: engine.clone(),
            observerPlayerId: cmdCase.state.currentPlayer,
            legalActions: legal,
            candidateCodes: codes,
            stateHash: cmdCase.stateHash,
            stepIndex: 0
        });

        // 斩首动作应当被选中
        expect(cmdCase.expectedActionCodes).toContain(trace.chosenActionCode);
    });

    it('5. 四种消融配置实例化与运行正常', async () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(JSON.parse(JSON.stringify(state)));
        const legal = engine.getLegalActions(0);
        const codes = legal.map(encodeAction);
        const ctx = {
            engineClone: engine.clone(),
            observerPlayerId: 0,
            legalActions: legal,
            candidateCodes: codes,
            stateHash: computeStateHash(state),
            stepIndex: 0
        };

        // 消融 1: 根贪心 vs 完整回应
        const tGreedy = new RootRolloutSearchTeacher('t_greedy', { targetK: 4, useFullResponse: false });
        const trGreedy = tGreedy.search(ctx);
        expect(trGreedy.isGreedyRootOnly).toBe(true);

        // 消融 2: 仅 H 回应 vs H+ApkLike 回应
        const tHOnly = new RootRolloutSearchTeacher('t_h_only', { targetK: 4, opponentPolicies: ['heuristic'] });
        const trHOnly = tHOnly.search(ctx);
        expect(trHOnly.opponentPolicyCount).toBe(1);

        // 消融 3: K=8
        const tK8 = new RootRolloutSearchTeacher('t_k8', { targetK: 8 });
        const trK8 = tK8.search(ctx);
        expect(trK8.searchedCount).toBe(8);

        // 消融 4: 仅军力金币估值 vs 加建筑估值
        const tMatOnly = new RootRolloutSearchTeacher('t_mat_only', {
            targetK: 4,
            evaluatorWeights: ABLATION_MATERIAL_ONLY_WEIGHTS
        });
        const trMatOnly = tMatOnly.search(ctx);
        expect(trMatOnly.chosenActionCode).toBeDefined();
    });
});
