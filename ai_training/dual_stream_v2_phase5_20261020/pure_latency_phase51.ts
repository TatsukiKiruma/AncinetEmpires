import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamPureAI } from '../../src/ai_runtime/dual_v2/pure_ai';
import { DIR, STAGE4, read, save, sha } from './common';

// 首次调用也计入统计；只读89个冻结局面，不提交动作或消费对战随机数。
const rows = read(path.join(STAGE4, 'pipeline-inputs.json'));
const bytes = fs.readFileSync(path.join(DIR, 'generations/gen_00/model.bin'));
const model = new DualStreamModel(read('generations/gen_00/model.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const pure = new DualStreamPureAI(model, { tactical: true, headBias: read('generations/gen_00/head-calibration.json').headBias });
const samples: { round: number; index: number; units: number; ms: number }[] = [];
for (let round = 0; round < 2; round++) for (const [index, row] of rows.entries()) {
    const engine = new GameEngine(row.state, { applyInitialTurnStart: false });
    if (engine.isTerminal()) continue;
    const start = performance.now(); pure.getAction(engine, engine.getState().currentPlayer);
    samples.push({ round, index, units: row.state.units.length, ms: performance.now() - start });
}
const times = samples.map(s => s.ms).sort((a, b) => a - b);
save('phase51-audit/pure-cold-warm-latency.json', { passed: times.every(t => t < 1000), samples, count: times.length, firstCallMs: samples[0]?.ms, p95: times[Math.ceil(times.length * .95) - 1], maximumMs: times.at(-1), modelSha256: sha(bytes), scope: '89冻结状态两次遍历，首次调用保留；不是全状态空间或GC尾部保证' });
console.log(JSON.stringify({ count: times.length, max: times.at(-1), first: samples[0]?.ms }));
