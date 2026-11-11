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
import { loadParentValueModel } from './value_parent';
import { warmedPolicy } from './warmup';

// 同60个训练前缀仅复测工程SLA；不提取新训练标签，也不把结果当独立质量胜率。
const base = process.env.LEAGUE_ENGINEERING ?? 'phase53-audit/gen4-engineering-replay', plan = read(base+'/plan.json');
const lane = Number(process.argv[2] ?? 0), lanes = Number(process.argv[3] ?? 2);
async function strict(slot: any) {
    const prefix = `${base}/games/${slot.id}`, initial = read(slot.initialPath), engine = new GameEngine(initial); let actions = 0, witnessActions = 0;
    for await (const row of gzipRows(fs.readFileSync(path.join(DIR,prefix,'actions.jsonl.gz')))) {
        assert.equal(stateHash(engine.getState()),row.beforeHash);
        const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action);
        const next = engine.step(action); assert.ok(!next.info.includes('非法动作')); assert.equal(stateHash(next.state),row.afterHash); actions++;
    }
    for await (const row of gzipRows(fs.readFileSync(path.join(DIR,prefix,'witnesses.jsonl.gz')))) {
        const counter = new GameEngine(restore(row.state,initial.map,row.patches,row.mapIndex));
        for (const action of row.actions) { assert.ok(counter.hasLegalAction(counter.getState().currentPlayer,action)); const next = counter.step(action); assert.ok(!next.info.includes('非法动作')); witnessActions++; }
        assert.equal(stateHash(counter.getState()),row.finalSha256);
    }
    const result = read(prefix+'/result.json'); assert.equal(actions,result.actions); assert.equal(stateHash(engine.getState()),result.finalHash);
    save(prefix+'/strict-replay.json',{passed:true,actions,witnessActions,finalHash:result.finalHash});
}
for (const slot of plan.slots) {
    if (slot.index % lanes !== lane) continue;
    assert.equal(slot.historical,null,'本轮原60局历史席位均为空，不能静默改变复测对手');
    const prefix = `${base}/games/${slot.id}`;
    if (fs.existsSync(path.join(DIR,prefix,'result.json'))) { await strict(slot); continue; }
    if (fs.existsSync(path.join(DIR,prefix,'started.json'))) throw Error('工程复测存在未完前缀，先保全strict，不覆盖');
    const initial = read(slot.initialPath); assert.equal(stateHash(initial),slot.initialHash); let engine = new GameEngine(initial);
    const bytes = fs.readFileSync(path.join(DIR,plan.teacherModel+'.bin')); assert.equal(sha(bytes),plan.teacherSha256);
    const model = new DualStreamModel(read(plan.teacherModel+'.json'),bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const pending: any[] = [], policies = new Map<number,DualStreamTurnSearchAI>();
    for (const player of initial.players) policies.set(player.id,warmedPolicy(engine,warm => new DualStreamTurnSearchAI(model,{...plan.searchOptions,budgetMs:plan.searchOptions?.budgetMs ?? 880,headBias:read(plan.teacherCalibration+'/head-calibration.json').headBias,valueCalibration:read(plan.teacherCalibration+'/value-config.json'),parentValueModel:loadParentValueModel(plan.teacherCalibration),onWitness:warm ? undefined : w => pending.push(w)})));
    let cursor = slot.seed >>> 0;
    const random = () => { cursor = (cursor + 0x6D2B79F5) >>> 0; let t = cursor; t = Math.imul(t ^ t >>> 15,t | 1); t ^= t + Math.imul(t ^ t >>> 7,t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296; };
    const opponent = warmedPolicy(engine,warm => {
        let warmCursor = slot.seed >>> 0;
        const next = warm ? () => { warmCursor = (warmCursor + 0x6D2B79F5) >>> 0; let t = warmCursor; t = Math.imul(t ^ t >>> 15,t | 1); t ^= t + Math.imul(t ^ t >>> 7,t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296; } : random;
        return slot.opponent === 'apk_like' ? new ApkLikeAI(next) : new HeuristicAI(next);
    });
    assert.equal(cursor,slot.seed >>> 0); assert.equal(stateHash(engine.getState()),slot.initialHash);
    const log = new DurableLog(path.join(DIR,prefix,'actions.jsonl.gz')), witnesses = new DurableLog(path.join(DIR,prefix,'witnesses.jsonl.gz'));
    save(prefix+'/started.json',{slot,teacherSha256:plan.teacherSha256,opponentOptimization:plan.opponentOptimization,startedAt:new Date().toISOString(),runtimeRevision:plan.runtimeRevision,searchOptions:plan.searchOptions ?? null,executionArgs:process.execArgv});
    global.gc?.();
    let actions = 0, classification = 'error', error: string | null = null, failedDecision: any = null; const start = performance.now();
    try {
        while (true) {
            const state = engine.getState();
            if (engine.isTerminal()) { classification = 'natural_terminal'; break; }
            if (actions >= plan.maxActions) { classification = 'action_truncation'; break; }
            if (performance.now()-start > plan.maxWallMs) { classification = 'wall_truncation'; break; }
            const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'), teacher = slot.mode === 'fork' || slot.teacherSeats.includes(state.currentPlayer), policy = policies.get(state.currentPlayer)!;
            // 与正式面板共用可登记的事件循环边界，始终位于getAction计时之外。
            if (plan.executionContract?.yieldBeforeDecision) await new Promise<void>(resolve => setImmediate(resolve));
            const t0 = performance.now(), action = teacher ? policy.getAction(engine,state.currentPlayer) : opponent.getAction(engine,state.currentPlayer,[...legal].sort((a,b) => encodeAction(a).localeCompare(encodeAction(b)))), ms = performance.now()-t0;
            for (const witness of pending.splice(0)) await witnesses.line({...compact(witness.initial,initial.map),actions:witness.actions,finalSha256:sha(witness.finalHash),player:witness.player});
            const telemetry = teacher ? {...policy.telemetry} : null;
            if (ms > plan.maxDecisionMs) { classification = 'decision_timeout'; failedDecision = {teacher,ms,code:encodeAction(action),telemetry}; break; }
            assert.ok(legal.some(a => encodeAction(a) === encodeAction(action)));
            const next = engine.clone(), result = next.step(action); assert.ok(!result.info.includes('非法动作'));
            await log.line({i:actions,teacher,code:encodeAction(action),beforeHash:stateHash(state),afterHash:stateHash(result.state),ms,telemetry,rngAfter:cursor}); engine = next; actions++;
            // 工程复测与正式面板采用相同的计时外回收契约。
            if (telemetry && !telemetry.queued) global.gc?.();
            if (actions % 100 === 0) { diskGuard(); save(prefix+'/progress.json',{actions,turn:result.state.turn}); }
        }
    } catch (e) { error = String(e); }
    finally { await log.close(); await witnesses.close(); }
    save(prefix+'/result.json',{classification,actions,error,failedDecision,finalHash:stateHash(engine.getState()),seconds:(performance.now()-start)/1000,runtimeRevision:plan.runtimeRevision,searchOptions:plan.searchOptions ?? null,executionArgs:process.execArgv}); await strict(slot);
    console.log(JSON.stringify({id:slot.id,classification,actions,error}));
}
