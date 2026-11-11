import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, compact, restore, sha } from './common';
import { DurableLog, diskGuard } from './durable_log';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../../src/game/ai/apk_like_ai';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { getAllianceId } from '../../src/game/rule_config';
import { fixedDevExclusions } from './dev_exclusions';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';

const generation = Number(process.argv[2]), folder = `generations/gen_${String(generation).padStart(2, '0')}`;
const plan = read(`${folder}/league-plan.json`);
const fixedDev = await fixedDevExclusions();
for (const slot of plan.slots) {
    const initial = read(slot.initialPath);
    if (fixedDev.has(slot.sourceBeforeHash) || fixedDev.has(stateHash(initial)) || fixedDev.has(ruleStateHash(initial))) throw Error('联赛初态命中固定开发集，拒绝启动任何采样动作');
}
function load(prefix: string, expectedSha: string) {
    const bytes = fs.readFileSync(path.resolve(DIR, prefix + '.bin'));
    assert.equal(sha(bytes), expectedSha, '采样模型SHA改变，拒绝继续既有计划');
    return new DualStreamModel(read(prefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
function random(seed: number) {
    let state = seed >>> 0;
    return { next: () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }, get: () => state, set: (x: number) => { state = x; } };
}
async function replay(slot: any, partial = false) {
    const prefix = `${folder}/games/${slot.id}`, initial = read(slot.initialPath), engine = new GameEngine(initial);
    let actions = 0, witnessActions = 0, witnesses = 0;
    const file = path.join(DIR, prefix, 'actions.jsonl.gz');
    if (fs.existsSync(file)) for await (const row of gzipRows(fs.readFileSync(file))) {
        assert.equal(stateHash(engine.getState()), row.beforeHash);
        const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action);
        const out = engine.step(action); assert.ok(!out.info.includes('非法动作')); assert.equal(stateHash(out.state), row.afterHash); actions++;
    }
    const wf = path.join(DIR, prefix, 'witnesses.jsonl.gz');
    if (fs.existsSync(wf)) for await (const w of gzipRows(fs.readFileSync(wf))) {
        const counter = new GameEngine(restore(w.state, initial.map, w.patches, w.mapIndex));
        for (const a of w.actions) { assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(v => encodeAction(v) === encodeAction(a))); const out = counter.step(a); assert.ok(!out.info.includes('非法动作')); witnessActions++; }
        assert.equal(stateHash(counter.getState()), w.finalSha256); witnesses++;
    }
    save(prefix + (partial ? '/partial-strict.json' : '/strict-replay.json'), { passed: true, partial, actions, witnesses, witnessActions, finalHash: stateHash(engine.getState()) });
    return engine;
}
async function play(slot: any) {
    const prefix = `${folder}/games/${slot.id}`;
    if (fs.existsSync(path.join(DIR, prefix, 'result.json'))) { await replay(slot); return; }
    const initial = read(slot.initialPath); assert.equal(stateHash(initial), slot.initialHash);
    let engine = new GameEngine(initial), actions = 0, segments = 0;
    const rng = random(slot.seed);
    if (fs.existsSync(path.join(DIR, prefix, 'started.json'))) {
        engine = await replay(slot, true);
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'actions.jsonl.gz')))) { actions++; rng.set(row.rngAfter); }
        segments = read(prefix + '/started.json').resumeSegments + 1;
    }
    const model = load(plan.teacherModel, plan.teacherSha256), pending: any[] = [];
    const calibration = read(plan.teacherCalibration + '/value-config.json'), headBias = read(plan.teacherCalibration + '/head-calibration.json').headBias;
    const policies = new Map<number, DualStreamTurnSearchAI>();
    for (const player of initial.players) {
        const isHistorical = slot.historical && player.id !== slot.seat;
        const historicalEntry = isHistorical ? read('league-state.json').hallOfFame.find((entry: any) => entry.modelPath === slot.historical) : null;
        const m = isHistorical ? load(slot.historical, slot.historicalSha256 ?? historicalEntry?.sha256) : model;
        const historicalCalibration = slot.historicalCalibration ?? historicalEntry?.calibrationPath;
        const playerHead = isHistorical ? read(historicalCalibration + '/head-calibration.json').headBias : headBias;
        const playerValue = isHistorical ? read(historicalCalibration + '/value-config.json') : calibration;
        policies.set(player.id, new DualStreamTurnSearchAI(m, { budgetMs: 930, headBias: playerHead, valueCalibration: playerValue, onWitness: w => pending.push(w) }));
    }
    const opponent = slot.opponent === 'apk_like' ? new ApkLikeAI(rng.next) : new HeuristicAI(rng.next);
    const writer = new DurableLog(path.join(DIR, prefix, 'actions.jsonl.gz')), witnesses = new DurableLog(path.join(DIR, prefix, 'witnesses.jsonl.gz'));
    save(prefix + '/started.json', { slot, teacherSha256: plan.teacherSha256, startedAt: new Date().toISOString(), resumeSegments: segments });
    let classification = 'error', error: string | null = null, start = performance.now(), failedDecision: any = null;
    const flush = async () => { for (const w of pending.splice(0)) await witnesses.line({ ...compact(w.initial, initial.map), actions: w.actions, finalSha256: sha(w.finalHash), player: w.player }); };
    try {
        while (true) {
            const state = engine.getState();
            if (engine.isTerminal()) { classification = state.winner === -1 ? 'natural_draw' : 'natural_terminal'; break; }
            if (actions >= plan.maxActions) { classification = 'action_truncation'; break; }
            if (performance.now() - start > plan.maxWallMs) { classification = 'wall_truncation'; break; }
            const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
            const teacher = slot.mode === 'fork' || slot.teacherSeats.includes(state.currentPlayer), policy = policies.get(state.currentPlayer)!;
            const t0 = performance.now(), action = teacher ? policy.getAction(engine, state.currentPlayer) : opponent.getAction(engine, state.currentPlayer, [...legal].sort((a, b) => encodeAction(a).localeCompare(encodeAction(b))));
            const ms = performance.now() - t0; await flush();
            const telemetry = teacher ? { ...policy.telemetry } : null;
            if (ms > plan.maxDecisionMs) { failedDecision = { ms, teacher, player: state.currentPlayer, code: encodeAction(action), telemetry }; classification = 'decision_timeout'; break; }
            assert.ok(legal.some(a => encodeAction(a) === encodeAction(action)));
            const next = engine.clone(), out = next.step(action); assert.ok(!out.info.includes('非法动作'));
            // 先持久化完整意图和权威后态，再推进主引擎；中断恢复不丢失已提交轨迹。
            await writer.line({ i: actions, code: encodeAction(action), player: state.currentPlayer, teacher, championTeacher: !slot.historical || state.currentPlayer === slot.seat, beforeHash: stateHash(state), afterHash: stateHash(out.state), ms, telemetry, rngAfter: rng.get() });
            engine = next; actions++;
            if (actions % 100 === 0) { diskGuard(); save(prefix + '/progress.json', { actions, turn: out.state.turn, seconds: (performance.now() - start) / 1000 }); }
        }
    } catch (e) { error = String(e); }
    finally { await flush(); await writer.close(); await witnesses.close(); }
    const final = engine.getState();
    if (error) { save(prefix + '/interruption.json', { error, actions, finalHash: stateHash(final) }); await replay(slot, true); throw Error(error); }
    save(prefix + '/result.json', { classification, actions, winner: final.winner, finalHash: stateHash(final), finalTurn: final.turn, teacherWinner: final.winner !== null && slot.teacherSeats.some((id: number) => getAllianceId(final, id) === final.winner), seconds: (performance.now() - start) / 1000, resumeSegments: segments, failedDecision });
    await replay(slot);
    console.log(JSON.stringify({ id: slot.id, classification, actions, winner: final.winner }));
}
const lane = Number(process.argv[3] ?? 0), lanes = Number(process.argv[4] ?? 1);
for (const slot of plan.slots) if (slot.index % lanes === lane) await play(slot);
