/** 对当前新初态双算CPU/GPU决策；不执行历史动作或轨迹重放。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction, mulberry32 } from '../../src/game/env';
import { OriginalApkLikeHardAI } from '../../src/game/ai/original_apk_like_hard_ai';
import { HardGpuBridge } from './hard_bridge';
import { ROOT, readJobs, createJobState, hash } from './hard_jobs';

const out = path.resolve(process.argv[2]), limit = Number(process.argv[3] ?? 42);
if (fs.existsSync(out)) throw Error('检查结果已存在');
fs.mkdirSync(path.dirname(out), { recursive: true });
const bridge = new HardGpuBridge(path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe'));
const results: any[] = [];
try {
    const jobs = readJobs();
    const states = jobs.map(createJobState);
    for (let i = 0; i < Math.min(limit, jobs.length); i++) {
        const job = jobs[i], state = states[i], frozen = hash(state), engine = new GameEngine(state, { applyInitialTurnStart: false });
        const cpu = new OriginalApkLikeHardAI({ rng: mulberry32(job.seed), compute: { populationLimit: job.setup.unitLimit } });
        const gpu = new OriginalApkLikeHardAI({ rng: mulberry32(job.seed), compute: { populationLimit: job.setup.unitLimit, movementBatch: bridge.compute, verifyMovementBatch: true } });
        const start = performance.now(), expected = cpu.getAction(engine, state.currentPlayer), cpuMs = performance.now() - start;
        const gpuStart = performance.now(), actual = gpu.getAction(engine, state.currentPlayer), gpuMs = performance.now() - gpuStart;
        bridge.assertHealthy();
        assert.equal(encodeAction(actual), encodeAction(expected), 'CPU/GPU最终动作不一致');
        assert.deepEqual(gpu.telemetry, cpu.telemetry, 'GPU路径改变了错误/回退行为');
        assert.equal(hash(state), frozen, '决策修改了初态');
        results.push({ executionSequence: job.executionSequence, category: job.category, players: job.actualPlayerCount, action: encodeAction(actual), cpuMs, gpuMs, telemetry: gpu.telemetry });
        fs.writeFileSync(out + '.progress.json', JSON.stringify({ completed: results.length, stats: bridge.stats }));
        console.log(JSON.stringify(results.at(-1)));
    }
    if (bridge.stats.requests === 0) throw Error('没有实际GPU评分请求');
    fs.writeFileSync(out, JSON.stringify({ passed: true, initialStatesChecked: states.length, decisions: results.length,
        identity: bridge.identity, stats: bridge.stats, results, historicalReplay: 'disabled_by_user', actionsExecuted: 0 }, null, 2));
} catch (error) {
    fs.writeFileSync(out + '.error.json', JSON.stringify({ error: String(error), results, stats: bridge.stats }, null, 2)); throw error;
} finally { await bridge.close(); }
