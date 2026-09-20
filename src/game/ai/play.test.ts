import { describe, it, expect } from 'vitest';
import { playAutoGame } from './play';

describe('Auto Game Runner with Cancellable AI (C67)', () => {
    it('正常完成数步对局并返回合法状态与日志', async () => {
        let stepCount = 0;
        const res = await playAutoGame({
            delayMs: 0,
            p0Policy: 'heuristic',
            p1Policy: 'random',
            deadlineMs: 500,
            maxSteps: 6,
            onStep: (eng, info, meta) => {
                if (!meta) return;
                stepCount++;
                expect(meta).toBeDefined();
                expect(meta?.action).toBeDefined();
                expect(meta?.latencyMs).toBeGreaterThanOrEqual(0);
            }
        });

        expect(stepCount).toBeGreaterThan(0);
        expect(res.logs.length).toBeGreaterThan(0);
        expect(res.finalState).toBeDefined();
    });

    it('外部 AbortSignal 可即时中断自动对局', async () => {
        const controller = new AbortController();
        let stepCount = 0;

        // 在第 3 步触发取消
        const res = await playAutoGame({
            delayMs: 0,
            p0Policy: 'heuristic',
            p1Policy: 'random',
            deadlineMs: 500,
            signal: controller.signal,
            onStep: () => {
                stepCount++;
                if (stepCount >= 3) {
                    controller.abort();
                }
            }
        });

        expect(stepCount).toBeGreaterThanOrEqual(3);
        expect(stepCount).toBeLessThan(10);
        expect(res.logs[res.logs.length - 1]).toContain('aborted');
    });
});
