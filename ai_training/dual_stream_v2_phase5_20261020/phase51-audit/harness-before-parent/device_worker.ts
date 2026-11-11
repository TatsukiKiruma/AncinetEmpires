import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { ApkLikeAI } from '../../src/game/ai/apk_like_ai';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';

// 两端执行同一个Chrome87兼容包；权威引擎与策略直接复用公共实现。
const scope = globalThis as any;
if (!scope.structuredClone) scope.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
if (!Object.hasOwn) (Object as any).hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const sha = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
const sorted = (x: number[]) => { const a = [...x].sort((a, b) => a - b); return { count: a.length, p50: a[Math.max(0, Math.ceil(a.length * .5) - 1)] ?? null, p95: a[Math.max(0, Math.ceil(a.length * .95) - 1)] ?? null, max: a[a.length - 1] ?? null, total: a.reduce((s, v) => s + v, 0) }; };
function rngStream(seed: number) {
    let state = seed >>> 0, calls = 0;
    return { next() { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); calls++; return ((t ^ t >>> 14) >>> 0) / 4294967296; }, snapshot: () => ({ state, calls }) };
}
async function main(device: string) {
    let ioMs = 0;
    const post = async (kind: string, payload: unknown) => {
        const start = performance.now(), response = await fetch(`/record?device=${device}&kind=${kind}`, { method: 'POST', body: JSON.stringify(payload) });
        if (!response.ok) throw Error(await response.text()); ioMs += performance.now() - start;
    };
    const [plan, manifest, binary, head, value] = await Promise.all([
        fetch('/plan.json').then(r => r.json()), fetch('/model.json').then(r => r.json()), fetch('/model.bin').then(r => r.arrayBuffer()), fetch('/head.json').then(r => r.json()), fetch('/value.json').then(r => r.json())
    ]);
    const model = new DualStreamModel(manifest, binary);
    await post('device', { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, startedAt: new Date().toISOString(), modelSha256: await shaBytes(binary), planId: plan.id });
    const allStart = performance.now();
    for (let index = 0; index < plan.slots.length; index++) {
        const slot = plan.slots[index], initial = plan.states[slot.mapIndex], engine = new GameEngine(initial), witnesses: any[] = [];
        const policy = new DualStreamTurnSearchAI(model, { headBias: head.headBias, valueCalibration: value, onWitness: w => witnesses.push(w) });
        const rng = rngStream(slot.opponentSeed), opponent = new ApkLikeAI(rng.next);
        const times = { model: [] as number[], opponent: [] as number[], root: [] as number[], queue: [] as number[], unique: [] as number[] };
        await post('start', { index, slot, startedAt: new Date().toISOString() });
        let actions = 0, classification = 'error', error: any = null, failedDecision: any = null;
        const start = performance.now(), ioStart = ioMs;
        try {
            while (true) {
                const state = engine.getState();
                if (engine.isTerminal()) { classification = state.winner === -1 ? 'natural_draw' : state.winner === getAllianceId(state, slot.seat) ? 'natural_win' : 'natural_loss'; break; }
                if (actions >= plan.budgets.maxActions) { classification = 'action_truncation'; break; }
                if (performance.now() - start >= plan.budgets.maxWallMs) { classification = 'wall_truncation'; break; }
                const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
                if (!legal.length) throw Error('没有非投降合法动作');
                const side = slot.modelSeats.includes(state.currentPlayer) ? 'model' : 'opponent', beforeHash = await sha(JSON.stringify(state)), rngBefore = rng.snapshot();
                const t0 = performance.now();
                const action = side === 'model' ? policy.getAction(engine, state.currentPlayer) : opponent.getAction(engine, state.currentPlayer, [...legal].sort((a, b) => encodeAction(a) < encodeAction(b) ? -1 : encodeAction(a) > encodeAction(b) ? 1 : 0));
                const ms = performance.now() - t0, telemetry = side === 'model' ? { ...policy.telemetry } : null;
                times[side].push(ms);
                if (telemetry) (telemetry.queued ? times.queue : legal.length > 1 ? times.root : times.unique).push(ms);
                const packed = witnesses.splice(0).map(w => {
                    const keys = Object.keys(w.initial), patches: any[] = [];
                    for (let y = 0; y < initial.map.height; y++) for (let x = 0; x < initial.map.width; x++) if (JSON.stringify(initial.map.tiles[y][x]) !== JSON.stringify(w.initial.map.tiles[y][x])) patches.push([y * initial.map.width + x, w.initial.map.tiles[y][x]]);
                    return { state: Object.fromEntries(keys.filter(k => k !== 'map').map(k => [k, w.initial[k]])), mapIndex: keys.indexOf('map'), patches, actions: w.actions, finalHash: w.finalHash, player: w.player };
                });
                const row: any = { i: actions, side, player: state.currentPlayer, ms, telemetry, beforeHash, rngBefore, rngAfter: rng.snapshot(), code: encodeAction(action) };
                if (ms > plan.budgets.maxDecisionMs || performance.now() - start >= plan.budgets.maxWallMs) {
                    classification = ms > plan.budgets.maxDecisionMs ? 'decision_timeout' : 'wall_truncation'; failedDecision = row;
                    await post('step', { index, row: null, rejected: row, witnesses: packed, turn: state.turn }); break;
                }
                if (!legal.some(a => encodeAction(a) === row.code)) throw Error('策略动作不在权威合法集合');
                const after = engine.step(action); if (after.info.includes('非法动作') || after.info === 'Game already ended') throw Error(after.info);
                row.afterHash = await sha(JSON.stringify(after.state));
                actions++;
                await post('step', { index, row, witnesses: packed, turn: after.state.turn });
                scope.postMessage({ index, actions, turn: after.state.turn, ms, side });
            }
        } catch (e) { error = { message: String(e), stack: e instanceof Error ? e.stack : null }; }
        const state = engine.getState();
        const result = { index, slot, classification, actions, winner: state.winner, finalTurn: state.turn, finalHash: await sha(JSON.stringify(state)), failedDecision, error, wallMs: performance.now() - start, ioMs: ioMs - ioStart, times, latency: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, sorted(v)])), finishedAt: new Date().toISOString() };
        await post('result', result); scope.postMessage({ index, classification, completed: index + 1 });
    }
    await post('complete', { completed: plan.slots.length, wallMs: performance.now() - allStart, finishedAt: new Date().toISOString() });
    scope.postMessage({ done: true });
}
async function shaBytes(value: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(x => x.toString(16).padStart(2, '0')).join(''); }
scope.onmessage = (event: any) => main(event.data.device).catch(async error => {
    await fetch(`/record?device=${event.data.device}&kind=fatal`, { method: 'POST', body: JSON.stringify({ error: String(error), stack: error.stack }) });
    scope.postMessage({ fatal: String(error) });
});
