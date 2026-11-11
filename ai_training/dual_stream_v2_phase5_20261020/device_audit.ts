import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { DIR, read, save } from './common';
import { sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { turnStateHash } from '../../src/ai_runtime/dual_v2/turn_search_ai';

const folder = path.join(DIR, process.env.DEVICE_OUT ?? 'device-comparison-10'), plan = read(path.join(folder, 'plan.json'));
const identity = read(path.join(folder, 'identity.json'));
const partial = process.argv.includes('--partial');
const rows = (file: string): any[] => gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map(x => JSON.parse(x));
function quantiles(x: number[]) { const a = [...x].sort((a, b) => a - b); return { count: a.length, p50: a[Math.max(0, Math.ceil(a.length * .5) - 1)] ?? null, p95: a[Math.max(0, Math.ceil(a.length * .95) - 1)] ?? null, max: a[a.length - 1] ?? null, total: a.reduce((s, v) => s + v, 0) }; }
const devices: Record<string, any> = {};
for (const device of ['phone', 'pc']) {
    if (partial && !fs.existsSync(path.join(folder, device, 'device.json'))) continue;
    const results: any[] = [], times: Record<string, number[]> = { model: [], opponent: [], root: [], queue: [], unique: [] };
    const searchNodes: number[] = [];
    let actualActions = 0, witnessActions = 0;
    if (!partial) assert.ok(fs.existsSync(path.join(folder, device, 'complete.json')));
    assert.ok(!fs.existsSync(path.join(folder, device, 'fatal.json')));
    assert.equal(read(path.join(folder, device, 'device.json')).modelSha256, identity.assets['/model.bin']);
    for (let index = 0; index < 10; index++) {
        if (partial && !fs.existsSync(path.join(folder, device, String(index), 'result.json'))) continue;
        const prefix = path.join(folder, device, String(index)), result = read(path.join(prefix, 'result.json')), initial = plan.states[result.slot.mapIndex], engine = new GameEngine(initial);
        assert.deepEqual(result.slot, plan.slots[index]);
        const actions = rows(path.join(prefix, 'actions.jsonl.gz')), witnesses = rows(path.join(prefix, 'witnesses.jsonl.gz'));
        for (const row of actions) {
            assert.equal(stateHash(engine.getState()), row.beforeHash);
            const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code);
            assert.ok(action && action.type !== 'surrender'); const out = engine.step(action);
            assert.ok(!out.info.includes('非法动作') && out.info !== 'Game already ended'); assert.equal(stateHash(out.state), row.afterHash);
            actualActions++;
            if (row.side === 'model' && row.telemetry && !row.telemetry.queued && row.telemetry.nodes > 0) searchNodes.push(row.telemetry.nodes);
        }
        assert.equal(actions.length, result.actions); assert.equal(stateHash(engine.getState()), result.finalHash);
        if (result.failedDecision) { assert.equal(result.failedDecision.beforeHash, result.finalHash); assert.ok(engine.getLegalActions(engine.getState().currentPlayer).some(a => encodeAction(a) === result.failedDecision.code)); }
        if (result.failedDecision?.side === 'model' && result.failedDecision.telemetry?.nodes > 0 && !result.failedDecision.telemetry.queued) searchNodes.push(result.failedDecision.telemetry.nodes);
        let count = 0;
        for (const w of witnesses) {
            const map = { ...initial.map, tiles: initial.map.tiles.map((row: any[]) => row.slice()) };
            for (const [index, tile] of w.patches) map.tiles[Math.floor(index / map.width)][index % map.width] = tile;
            const keys = Object.keys(w.state), state = Object.fromEntries([...keys.slice(0, w.mapIndex).map(k => [k, w.state[k]]), ['map', map], ...keys.slice(w.mapIndex).map(k => [k, w.state[k]])]);
            const counter = new GameEngine(state);
            for (const action of w.actions) { assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(a => encodeAction(a) === encodeAction(action))); assert.ok(!counter.step(action).info.includes('非法动作')); count++; }
            assert.equal(sha(turnStateHash(counter.getState())), w.finalSha256);
        }
        witnessActions += count;
        for (const key of Object.keys(times)) times[key].push(...result.times[key]);
        save(path.join(prefix, 'strict-replay.json'), { passed: true, actions: actions.length, witnesses: witnesses.length, witnessActions: count, rejectedDecisionLegal: !!result.failedDecision, finalHash: result.finalHash, logSha256: sha(fs.readFileSync(path.join(prefix, 'actions.jsonl.gz'))) });
        results.push({ ...result, times: undefined, strict: true, witnessActions: count });
    }
    devices[device] = { device: read(path.join(folder, device, 'device.json')), complete: fs.existsSync(path.join(folder, device, 'complete.json')) ? read(path.join(folder, device, 'complete.json')) : null, results, actualActions, witnessActions, classification: results.reduce((out, r) => ({ ...out, [r.classification]: (out[r.classification] ?? 0) + 1 }), {}), wallMs: results.reduce((n, r) => n + r.wallMs, 0), ioMs: results.reduce((n, r) => n + r.ioMs, 0), latency: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, quantiles(v)])), searchNodes: { ...quantiles(searchNodes), mean: searchNodes.reduce((n, v) => n + v, 0) / searchNodes.length }, strict: true };
}
if (partial) { const receipt = { partial: true, devices, auditedAt: new Date().toISOString() }; save(path.join(folder, 'partial-strict-audit.json'), receipt); console.log(JSON.stringify({ partial: true, devices: Object.fromEntries(Object.entries(devices).map(([k, v]) => [k, { completeSlots: v.results.length, actualActions: v.actualActions, witnessActions: v.witnessActions, strict: v.strict }])) })); process.exit(0); }
assert.ok(new Date(devices.pc.device.startedAt).getTime() > new Date(devices.phone.complete.finishedAt).getTime());
const summary = { identity, strict: true, phoneFirst: true, devices, comparison: { wallRatioPhoneOverPc: devices.phone.wallMs / devices.pc.wallMs, meanDecisionRatioPhoneOverPc: (devices.phone.latency.model.total / devices.phone.latency.model.count) / (devices.pc.latency.model.total / devices.pc.latency.model.count), rootP95RatioPhoneOverPc: devices.phone.latency.root.p95 / devices.pc.latency.root.p95 }, caveat: '两端搜索按墙钟预算截断，可能选择不同分支并产生不同轨迹；总局时长与平均决策耗时不能视为相同计算工作量的纯硬件倍数。所有超时决策纳入时延统计。' };
save(path.join(folder, 'summary.json'), summary);
const sec = (ms: number) => (ms / 1000).toFixed(2), ms = (n: number) => n.toFixed(3);
const table = ['| 槽位 | 手机耗时（秒） | 电脑耗时（秒） | 手机 / 电脑结论 |', '|---|---:|---:|---|'];
const names: Record<string, string> = { natural_win: '胜', natural_loss: '负', natural_draw: '平', action_truncation: '动作截断', decision_timeout: '单步超时', wall_truncation: '墙钟截断', error: '错误' };
for (let i = 0; i < 10; i++) { const a = devices.phone.results[i], b = devices.pc.results[i]; table.push(`| ${plan.slots[i].mapIndex + 1}图 / 席位${plan.slots[i].seat} | ${sec(a.wallMs)} | ${sec(b.wallMs)} | ${names[a.classification]} / ${names[b.classification]} |`); }
const report = `# 手机与电脑同10槽计时\n\n已先停止联赛，再运行小米手机10槽，手机全部结束后才启动电脑10槽。当前第1代搜索候选，模型SHA：${identity.assets['/model.bin']}。同包、同校准、同五图双席位、同种子；各端1局/1Worker串行。单步1000ms、单局2000动作/600秒上限保持。\n\n| 指标 | 手机 | 电脑 |\n|---|---:|---:|\n| 10槽墙钟合计 | ${sec(devices.phone.wallMs)}秒 | ${sec(devices.pc.wallMs)}秒 |\n| 其中日志传输 | ${sec(devices.phone.ioMs)}秒 | ${sec(devices.pc.ioMs)}秒 |\n| AI决策计算合计 | ${sec(devices.phone.latency.model.total)}秒 | ${sec(devices.pc.latency.model.total)}秒 |\n| AI决策次数（含超时拒绝） | ${devices.phone.latency.model.count} | ${devices.pc.latency.model.count} |\n| AI整体单步p50 / p95 | ${ms(devices.phone.latency.model.p50)} / ${ms(devices.phone.latency.model.p95)}ms | ${ms(devices.pc.latency.model.p50)} / ${ms(devices.pc.latency.model.p95)}ms |\n| 非队列、非唯一快返根p95 | ${ms(devices.phone.latency.root.p95)}ms | ${ms(devices.pc.latency.root.p95)}ms |\n| 实际动作strict重放 | ${devices.phone.actualActions}通过 | ${devices.pc.actualActions}通过 |\n| 反扑动作strict重放 | ${devices.phone.witnessActions}通过 | ${devices.pc.witnessActions}通过 |\n\n${table.join('\n')}\n\n手机：${devices.phone.device.userAgent}。电脑：${devices.pc.device.userAgent}。硬件和电池温度另见pc-hardware.json及phone-preflight.json。\n\n${summary.caveat}\n`;
fs.writeFileSync(path.join(folder, 'REPORT.md'), report);
console.log(JSON.stringify({ strict: true, phone: { classification: devices.phone.classification, wallMs: devices.phone.wallMs, latency: devices.phone.latency }, pc: { classification: devices.pc.classification, wallMs: devices.pc.wallMs, latency: devices.pc.latency } }));
