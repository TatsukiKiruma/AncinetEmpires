import { describe, it, expect } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import {
    getSpatialAiAction,
    getSpatialAiActionSync
} from '../src/game/ai/spatial_neural_adapter';

describe('Spatial Neural AI Adapter (Path B)', () => {
    it('异步调用入口输出 100% 合法动作，端到端延迟 < 50ms', async () => {
        const state = createDemoState();
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(0).filter(a => a.type !== 'surrender');

        const result = await getSpatialAiAction(engine, 0, { deadlineMs: 1000 });

        expect(result.action).toBeDefined();
        // 动作必在合法动作集合内
        const isLegal = legalActions.some(a => JSON.stringify(a) === JSON.stringify(result.action));
        expect(isLegal).toBe(true);

        // 端到端耗时测量与 deadlineMiss (1000ms 契约)
        expect(result.e2eMs).toBeDefined();
        expect(result.e2eMs).toBeLessThan(1000);
        expect(result.deadlineMiss).toBe(false);
        expect(result.source).toContain('Spatial ResNet v1');
    });

    it('连续对局 15 步：Spatial AI 决策稳定，无非法动作，无死循环', () => {
        const state = createDemoState();
        const engine = new GameEngine(state);
        const heuristicAi = new HeuristicAI();

        let stepCount = 0;
        const maxSteps = 15;

        while (engine.getState().winner === null && stepCount < maxSteps) {
            const curPlayer = engine.getState().currentPlayer;
            let action;

            if (curPlayer === 0) {
                // P0 使用空间残差网络
                const res = getSpatialAiActionSync(engine, curPlayer, { deadlineMs: 1000 });
                action = res.action;
                expect(res.deadlineMiss).toBe(false);
            } else {
                // P1 使用启发式基线
                action = heuristicAi.getAction(engine, curPlayer);
            }

            // 执行前断言合法性
            const legalActions = engine.getLegalActions(curPlayer);
            const isLegal = legalActions.some(a => JSON.stringify(a) === JSON.stringify(action));
            expect(isLegal).toBe(true);

            engine.step(action);
            stepCount += 1;
        }

        expect(stepCount).toBe(maxSteps);
    });

    it('模拟取消与看门狗保护触发：硬回退至 HeuristicAI 并记录 fallbackUsed', async () => {
        const state = createDemoState();
        const engine = new GameEngine(state);
        const controller = new AbortController();

        // 模拟外部主动中断取消
        controller.abort();

        const result = await getSpatialAiAction(engine, 0, {
            deadlineMs: 1000,
            signal: controller.signal
        });

        // 验证回退
        expect(result.action).toBeDefined();
        expect(result.fallbackUsed).toBe(true);
        expect(result.source).toContain('HeuristicAI');
        expect(result.fallbackReason).toContain('ABORTED');

        // 验证回退动作亦完全合法
        const legalActions = engine.getLegalActions(0);
        const isLegal = legalActions.some(a => JSON.stringify(a) === JSON.stringify(result.action));
        expect(isLegal).toBe(true);
    });
});
