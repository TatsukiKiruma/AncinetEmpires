import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { ClientV2 } from './client_v2';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { GameEngine } from '../../../src/game/engine';

const here = import.meta.dirname;
const root = path.resolve(here, '../../..');
const data = 'D:/AncientEmpiresData/continuation_stage7_20261108_v1';
const sha = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');
const reads: any[] = [];
function read(file: string) {
    assert(!/sealed|historical|offline-329/i.test(file));
    const b = fs.readFileSync(file);
    reads.push({ file, sha256: sha(b) });
    return b;
}
const frozen = JSON.parse(read(path.join(here, 'PUBLIC_SOURCE_LOCK.json')).toString());
for (const [file, digest] of Object.entries(frozen.files)) assert.equal(sha(fs.readFileSync(path.join(root, file))), digest);
const model = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/';
assert.equal(sha(read(model + 'final.bin')), '3bedc848d9adccc2df67ffb22950d7a020ca4d3106c174e9974a17fc7647eccf');
assert.equal(sha(read(model + 'value-6000.pt')), 'a0af926f76b3c0358742b3f174484c521ffb91f80d8536524e521ecfb9dff835');
const manifest = JSON.parse(read(path.join(here, '../stage3/DEV_INITIAL_MANIFEST.json')).toString());
const dimensions = new Map<string, any>();
for (const slot of manifest.slots) {
    assert.equal(slot.split, 'dev');
    const bytes = read(path.join(here, '../stage3', slot.file)); assert.equal(sha(bytes), slot.sha256);
    const state = JSON.parse(bytes.toString());
    const key = `${state.map.width}x${state.map.height}`;
    if (!dimensions.has(key)) {
        const legal = new GameEngine(state, { applyInitialTurnStart: false }).getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        dimensions.set(key, encodeDualObservation(state, legal));
    }
}
const identity = sha(JSON.stringify({ publicSha: frozen.sha256, sources: ['service_v2.py', 'fp32_forward.py', 'batch_v2.py', 'client_v2.ts', 'transport_v2.ts', 'latency_gate.ts'].map(f => [f, sha(fs.readFileSync(path.join(here, f)))]) }));
const checkpoint = path.join(here, 'B_LATENCY_PROGRESS_attempt3.json');
let completed: any[] = [];
if (fs.existsSync(checkpoint)) {
    const prior = JSON.parse(fs.readFileSync(checkpoint, 'utf8')); assert.equal(prior.identity, identity); completed = prior.completed;
}
const buckets = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const quantile = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.max(0, Math.ceil(a.length * p) - 1)];
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2; };
let failure: string | null = null;
let failureDetail: unknown = null;
const attempts: any[] = [];
try {
    for (const mode of ['default', 'FAST']) {
        if (completed.some(c => c.mode === mode)) continue;
        const client = new ClientV2(mode);
        const warmFile = path.join(data, `attempt3-warm-${mode}.jsonl`);
        const samples: any[] = [];
        let valueLogitsMaxDiff = 0;
        try {
            // 预热覆盖完整地图尺寸 × 物理桶 × 两种前向；重启时重做内存预热。
            for (const [size, obs] of dimensions) {
                for (const batch of buckets) {
                    const rows = Array(batch).fill(obs);
                    for (const valueOnly of [false, true]) {
                        for (let repeat = 0; repeat < 3; repeat++) await client.forwardBatch(rows, { valueOnly });
                        fs.appendFileSync(warmFile, JSON.stringify({ identity, mode, size, batch, valueOnly, at: new Date().toISOString() }) + '\n');
                    }
                    const full = await client.forwardBatch(rows);
                    const value = await client.forwardBatch(rows, { valueOnly: true });
                    for (let i = 0; i < batch; i++) for (let j = 0; j < 6; j++) {
                        const diff = Math.abs(full[i].valueLogits[j] - value[i].valueLogits[j]);
                        valueLogitsMaxDiff = Math.max(valueLogitsMaxDiff, diff);
                        if (diff !== 0) {
                            failureDetail = { mode, size, batch, row: i, slot: j, diff };
                            fs.writeFileSync(path.join(here, 'B_FAIL_FAST_attempt3.json'), JSON.stringify(failureDetail));
                            assert.fail('纯价值逐桶立即停机：' + JSON.stringify(failureDetail));
                        }
                    }
                    fs.appendFileSync(warmFile, JSON.stringify({ identity, mode, size, batch, parityPassed: true, valueLogitsMaxDiff }) + '\n');
                }
                console.log(JSON.stringify({ phase: 'warm', mode, size, valueLogitsMaxDiff }));
            }
            for (const [size, obs] of dimensions) for (const batch of [1, 2, 4]) for (const valueOnly of [false, true]) {
                const rows = Array(batch).fill(obs);
                // 计时从客户端请求入口开始，包含打包、IPC、整理、H2D、前向、D2H、响应解码。
                const times: number[] = [];
                for (let i = 0; i < 100; i++) {
                    const started = performance.now(); await client.forwardBatch(rows, { valueOnly }); times.push(performance.now() - started);
                }
                const row = { mode, size, batch, valueOnly, medianMs: median(times), p99Ms: quantile(times, .99), maxMs: Math.max(...times), times };
                samples.push(row);
                fs.appendFileSync(path.join(data, `attempt3-latency-${mode}.jsonl`), JSON.stringify({ identity, ...row }) + '\n');
                console.log(JSON.stringify({ ...row, times: undefined }));
            }
        } finally {
            await client.close();
            attempts.push({ mode, valueLogitsMaxDiff, samples, exitCode: client.exitCode, closeMs: client.closeMs,
                forcedTermination: client.transport.forcedTermination, diagnostics: client.transport.diagnostics });
            fs.writeFileSync(path.join(here, 'B_ATTEMPTS_attempt3.json'), JSON.stringify({ identity, attempts, sealedAccess: 0 }));
        }
        assert.equal(client.exitCode, 0, '推理进程必须正常退出');
        assert(client.closeMs! <= 5000 && !client.transport.forcedTermination, '服务必须在5秒内自然退出');
        completed.push(attempts.at(-1));
        fs.writeFileSync(checkpoint, JSON.stringify({ identity, completed, sealedAccess: 0 }));
        assert.equal(client.exitCode, 0, '推理进程必须正常退出');
        assert.equal(valueLogitsMaxDiff, 0, '纯价值路径必须完全一致');
    }
} catch (error) { failure = String(error); }
// 预先固定按最差单元的中位数选择档位，不能混合两档的最佳单元冒充一个部署。
const scored = completed.map(c => ({ ...c, globalMedianMs: median(c.samples.map((r: any) => r.medianMs)),
    b1MeanMedianMs: c.samples.filter((r: any) => r.batch === 1).reduce((s: number, r: any) => s + r.medianMs, 0) / 22,
    worstMedianMs: Math.max(...c.samples.map((r: any) => r.medianMs)),
    worstP99Ms: Math.max(...c.samples.map((r: any) => r.p99Ms)) })).sort((a, b) => a.worstMedianMs - b.worstMedianMs);
const eligible = scored.filter(c => c.samples.length === 66 && c.globalMedianMs <= 10 && c.b1MeanMedianMs <= 9.5 && c.worstMedianMs <= 15 && c.worstP99Ms <= 30);
const selected = eligible[0];
const passed = !failure && completed.length === 2 && !!selected;
const result = { identity, passed, failure, failureDetail, attempts, selected: selected?.mode, dimensions: [...dimensions.keys()], reads,
    B_G1: { passed, globalMedianMs: selected?.globalMedianMs, b1MeanMedianMs: selected?.b1MeanMedianMs,
        worstMedianMs: selected?.worstMedianMs, worstP99Ms: selected?.worstP99Ms,
        limits: { globalMedianMs: 10, b1MeanMedianMs: 9.5, worstMedianMs: 15, worstP99Ms: 30 } },
    B_G5: { passed: !failure && completed.length === 2 && completed.every(c => c.exitCode === 0 && c.valueLogitsMaxDiff === 0),
        coverage: '全部Dev初态地图尺寸×9个桶，每桶完整/纯价值逐行6槽对比', modes: attempts.map(c => ({ mode: c.mode, exitCode: c.exitCode, closeMs: c.closeMs, forcedTermination: c.forcedTermination, valueLogitsMaxDiff: c.valueLogitsMaxDiff })) },
    completed: scored, sealedAccess: 0 };
fs.writeFileSync(path.join(here, 'B_G1_G5.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed, failure, selected: result.selected, B_G1: result.B_G1, B_G5: result.B_G5 }));
if (!passed) process.exitCode = 1;
