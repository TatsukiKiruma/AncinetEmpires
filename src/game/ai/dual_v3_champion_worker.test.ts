import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../engine';
import { createDefaultAppGameState } from '../default_state';
import { runCancellableAiAction, type WorkerLike } from './cancellable_ai_runner';

afterEach(() => vi.useRealTimers());

describe('冠军 Worker 加载与决策预算分离', () => {
    function setup() {
        vi.useFakeTimers();
        let request: { requestId: string };
        const worker: WorkerLike = { postMessage: message => { request = message; }, terminate: vi.fn() };
        const engine = new GameEngine(createDefaultAppGameState());
        const controller = new AbortController();
        const result = runCancellableAiAction({ policy: 'dual_v3_stage7_k1', engine,
            playerId: engine.getState().currentPlayer, deadlineMs: 1000,
            signal: controller.signal, workerFactory: () => worker });
        const send = (data: object) => worker.onmessage?.({ data: { requestId: request.requestId, ...data } } as MessageEvent);
        return { worker, result, send, controller };
    }

    it('加载超过单步预算仍可成功，就绪后重启单步计时', async () => {
        const { result, send, worker } = setup();
        await vi.advanceTimersByTimeAsync(2000);
        expect(worker.terminate).not.toHaveBeenCalled();
        send({ ready: true });
        send({ result: { action: { type: 'end_turn' }, status: 'OK', latencyMs: 10, source: '测试 Worker', fallbackUsed: false } });
        expect((await result).status).toBe('OK');
        expect((await result).deadlineMiss).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('就绪后陷入死循环仍被单步硬看门狗终止', async () => {
        const { result, send, worker } = setup();
        send({ ready: true });
        await vi.advanceTimersByTimeAsync(1001);
        expect((await result).status).toBe('TIMEOUT');
        expect((await result).fallbackReason).toBe('WATCHDOG_DEADLINE_EXCEEDED');
        expect(worker.terminate).toHaveBeenCalledOnce();
    });

    it('加载期间支持立即取消并终止 Worker', async () => {
        const { result, controller, worker } = setup();
        controller.abort();
        expect((await result).status).toBe('CANCELLED');
        expect(worker.terminate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('加载自身有独立超时并明确报告', async () => {
        const { result, worker } = setup();
        await vi.advanceTimersByTimeAsync(60001);
        expect((await result).fallbackReason).toBe('MODEL_LOADING_TIMEOUT');
        expect(worker.terminate).toHaveBeenCalledOnce();
    });
});
