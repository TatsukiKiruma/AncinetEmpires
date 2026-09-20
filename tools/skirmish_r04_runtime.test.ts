import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { getAiAction } from '../src/game/ai/neural_ai_adapter';
import { runCancellableAiAction, type DecisionTelemetryEntry } from '../src/game/ai/cancellable_ai_runner';

describe('R04: Real 1-Second Boundary & Cancellable Execution', () => {
    it('真实端到端时延：调用方单调时钟测量，不被裁剪', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const engine = new GameEngine(state);

        const res = getAiAction('heuristic', engine, 0);
        expect(res.latencyMs).toBeGreaterThanOrEqual(0);
        expect(res.e2eMs).toBe(res.latencyMs);
        expect(res.action).toBeDefined();
        expect(res.deadlineMiss).toBe(false);
    });

    it('取消机制：外部 AbortSignal 触发时安全交付合法回退动作', async () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const engine = new GameEngine(state);
        const controller = new AbortController();

        // 预先取消
        controller.abort();

        const telemetries: DecisionTelemetryEntry[] = [];
        const res = await runCancellableAiAction({
            policy: 'net_b_s10',
            engine,
            playerId: 0,
            deadlineMs: 1000,
            signal: controller.signal,
            onTelemetry: (t) => telemetries.push(t)
        });

        expect(res.fallbackUsed).toBe(true);
        expect(res.fallbackReason).toContain('ABORTED');
        expect(res.action).toBeDefined();
        // 校验回退动作是合法的
        const legal = engine.getLegalActions(0);
        expect(legal.some(a => a.type === res.action.type)).toBe(true);
        expect(telemetries.length).toBe(1);
        expect(telemetries[0].fallbackUsed).toBe(true);
    });

    it('看门狗截止保护：配置 1ms 极限超时触发看门狗熔断回退', async () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const engine = new GameEngine(state);

        const telemetries: DecisionTelemetryEntry[] = [];
        const res = await runCancellableAiAction({
            policy: 'net_b_s10',
            engine,
            playerId: 0,
            deadlineMs: 0, // 故意设为 0ms 触发看门狗超时
            onTelemetry: (t) => telemetries.push(t)
        });

        expect(res.deadlineMiss).toBe(true);
        expect(res.fallbackUsed).toBe(true);
        expect(res.action).toBeDefined();
        expect(telemetries[0].deadlineMiss).toBe(true);
    });

    it('NET_B 1-ply 策略使用 45 维编码执行无报错', () => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const engine = new GameEngine(state);

        const res = getAiAction('net_b_1ply', engine, 0);
        expect(res.action).toBeDefined();
        expect(res.source).toContain('NET_B');
    });
});
