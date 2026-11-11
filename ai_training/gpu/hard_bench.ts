/** 同一批当前初态的CPU/GPU稳态决策对照；交错先后顺序，不执行对局动作。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction, mulberry32 } from '../../src/game/env';
import { OriginalApkLikeHardAI } from '../../src/game/ai/original_apk_like_hard_ai';
import { HardGpuBridge } from './hard_bridge';
import { ROOT, readJobs, createJobState } from './hard_jobs';

const out = path.resolve(process.argv[2]);
if (fs.existsSync(out)) throw Error('基准输出已存在');
const jobs = readJobs().slice(0, 42), states = jobs.map(createJobState);
const bridge = new HardGpuBridge(path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe'));
const results: any[] = [];
try {
    for (let round = 0; round < 3; round++) for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i], state = states[i];
        bridge.clearCache();
        const engines = [0, 1].map(() => new GameEngine(state, { applyInitialTurnStart: false }));
        const policies = [false, true].map(gpu => new OriginalApkLikeHardAI({ rng: mulberry32(job.seed),
            compute: { populationLimit: job.setup.unitLimit, movementBatch: gpu ? bridge.compute : undefined } }));
        const times: number[] = [], codes: string[] = [];
        for (const device of (round + i) % 2 ? [1, 0] : [0, 1]) {
            const start = performance.now(); codes[device] = encodeAction(policies[device].getAction(engines[device], state.currentPlayer));
            times[device] = performance.now() - start;
        }
        bridge.assertHealthy(); assert.equal(codes[0], codes[1]); assert.deepEqual(policies[0].telemetry, policies[1].telemetry);
        if (round > 0) results.push({ round, executionSequence: job.executionSequence, category: job.category, players: job.actualPlayerCount, cpuMs: times[0], gpuMs: times[1] });
    }
    const cpuMs = results.reduce((s, r) => s + r.cpuMs, 0), gpuMs = results.reduce((s, r) => s + r.gpuMs, 0);
    fs.writeFileSync(out, JSON.stringify({ passed: true, warmupDecisionsPerDevice: 42, measuredDecisionsPerDevice: results.length,
        cpuMs, gpuMs, speedRatio: cpuMs / gpuMs, crossPositionCache: '每个局面清空；仅保留单次决策内部重复请求缓存', identity: bridge.identity, stats: bridge.stats,
        replay: 'disabled_by_user', actionsExecuted: 0, results }, null, 2));
    console.log(JSON.stringify({ cpuMs, gpuMs, speedRatio: cpuMs / gpuMs }));
} finally { await bridge.close(); }
