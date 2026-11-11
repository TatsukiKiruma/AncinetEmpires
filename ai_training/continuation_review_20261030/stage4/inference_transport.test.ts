import { it, expect } from 'vitest';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { createDefaultAppGameState } from '../../../src/game/default_state';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { Stage4InferenceClient } from './inference_client';
import { InferenceTransportError } from './inference_transport';
import { SearchBudgetExpiredError } from '../../../src/ai_runtime/dual_v3/search_budget';
import { HERE } from './io';

function setup(delays: string, watchdogMs = 1000) {
    const engine = new GameEngine(createDefaultAppGameState()), state = engine.getState();
    const o = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
    const client = new Stage4InferenceClient('协议测试不加载权重', { watchdogMs, launch: { command: process.execPath, args: [path.join(HERE, 'fake_infer.mjs')], env: { ...process.env, STAGE4_FAKE_DELAYS: delays } } });
    return { client, o };
}
it('软截止不杀死服务；排空迟到包后下一请求仍得到自己的响应', async () => {
    const { client, o } = setup('0,160,0');
    try {
        expect((await client.forwardBatch([o]))[0].sequence).toBe(1);
        client.setLabel('原根节点');
        await expect(client.forwardBatch([o], { deadline: performance.now() + 30 })).rejects.toBeInstanceOf(SearchBudgetExpiredError);
        expect(client.exited).toBe(false);
        client.setLabel('下一根节点');
        const rows = await client.forwardBatch([o], { deadline: performance.now() + 1000 });
        expect(rows[0].sequence).toBe(3);
        expect(client.diagnostics.lateResponses).toBe(1);
        expect(client.diagnostics.hardTimeouts).toBe(0);
        expect(client.diagnostics.lastEvents.find(e => e.type === 'late_drained').label).toBe('原根节点');
        expect(client.diagnostics.inFlight).toBe(null);
    } finally { await client.close(); }
    expect(client.exited).toBe(true);
}, 10000);
it('等待旧包期间再次用尽预算不会发送新包或串包', async () => {
    const { client, o } = setup('0,180,0');
    try {
        await client.forwardBatch([o]);
        await expect(client.forwardBatch([o], { deadline: performance.now() + 20 })).rejects.toBeInstanceOf(SearchBudgetExpiredError);
        await expect(client.forwardBatch([o], { deadline: performance.now() + 20 })).rejects.toBeInstanceOf(SearchBudgetExpiredError);
        expect(client.diagnostics.requests).toBe(2);
        expect((await client.forwardBatch([o], { deadline: performance.now() + 1000 }))[0].sequence).toBe(3);
    } finally { await client.close(); }
}, 10000);
it('真正服务无响应由独立看门狗报错，不能当作普通搜索截止吞掉', async () => {
    const { client, o } = setup('0,5000', 80);
    try {
        await client.forwardBatch([o]);
        await expect(client.forwardBatch([o], { deadline: performance.now() + 1000 })).rejects.toBeInstanceOf(InferenceTransportError);
        expect(client.diagnostics.hardTimeouts).toBe(1);
        expect(client.diagnostics.softDeadlines).toBe(0);
    } finally { await client.close(); }
    expect(client.exited).toBe(true);
}, 10000);
