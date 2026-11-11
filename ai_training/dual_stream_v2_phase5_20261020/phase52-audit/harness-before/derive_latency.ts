import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';

const files: string[] = [];
function walk(folder: string) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const file = path.join(folder, item.name);
        if (item.isDirectory()) walk(file);
        else if (item.name === 'result.json' || item.name === 'USER_STOP_STRICT.json' && !fs.existsSync(path.join(folder, 'result.json'))) files.push(file);
    }
}
walk(DIR);
let roots = 0, queued = 0, unique = 0, decisions = 0;
for (const file of files) {
    const prefix = path.dirname(file), interrupted = path.basename(file) === 'USER_STOP_STRICT.json';
    const result = interrupted ? { slot: read(path.join(prefix, 'started.json')).slot, classification: 'user_interrupted' } : read(file), selfplay = !result.slot;
    if (!selfplay && result.slot.mode !== 'turn_search') continue;
    let initial: any;
    if (selfplay) {
        const generation = path.dirname(path.dirname(prefix)), plan = read(path.join(generation, 'league-plan.json'));
        const slot = plan.slots.find((s: any) => s.id === path.basename(prefix)); if (!slot) throw Error('找不到自博弈槽');
        initial = read(slot.initialPath);
    } else {
        let arena = prefix;
        while (arena !== path.dirname(arena) && !fs.existsSync(path.join(arena, 'plan.json'))) arena = path.dirname(arena);
        const device = !!result.times;
        const plan = read(path.join(arena, 'plan.json'));
        initial = device ? plan.states[result.slot.mapIndex] : read(plan.maps[result.slot.mapIndex].path);
    }
    const engine = new GameEngine(initial), all: number[] = [], root: number[] = [], queue: number[] = [], fast: number[] = [];
    for await (const row of gzipRows(fs.readFileSync(path.join(prefix, 'actions.jsonl.gz')))) {
        const state = engine.getState(); assert.equal(stateHash(state), row.beforeHash);
        const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        if (selfplay ? row.teacher : row.side === 'model') {
            all.push(row.ms);
            if (row.telemetry.queued) queue.push(row.ms); else if (legal.length > 1) root.push(row.ms); else fast.push(row.ms);
        }
        const action = legal.find(a => encodeAction(a) === row.code); assert.ok(action); engine.step(action);
    }
    if (interrupted) {
        // 只统计已落盘前缀，不补造未记录的最后一次决策。
    } else if (!selfplay && result.times) {
        // 设备诊断已分别保存根、队列和唯一动作；失败决策同样留在各自数组中。
        queue.push(...result.times.queue.slice(queue.length));
        root.push(...result.times.root.slice(root.length));
        fast.push(...result.times.unique.slice(fast.length));
        all.splice(0, all.length, ...result.times.model);
    } else if (!selfplay) {
        // 超时或墙钟边界上未提交的决策仍纳入耗时，不通过只读实际动作日志丢掉慢尾部。
        if (result.queueTimes.length > queue.length) queue.push(...result.queueTimes.slice(queue.length));
        const nonQueued = result.nonQueueTimes ?? result.rootTimes;
        const missing = nonQueued.length - root.length - fast.length;
        if (missing > 0) {
            const values = nonQueued.slice(-missing), legal = engine.getLegalActions(engine.getState().currentPlayer).filter(a => a.type !== 'surrender');
            (legal.length > 1 ? root : fast).push(...values);
        }
        all.splice(0, all.length, ...result.latencySamples.model);
    } else if (result.failedDecision?.teacher) {
        all.push(result.failedDecision.ms);
        (result.failedDecision.telemetry.queued ? queue : engine.getLegalActions(engine.getState().currentPlayer).filter(a => a.type !== 'surrender').length > 1 ? root : fast).push(result.failedDecision.ms);
    }
    save(path.join(prefix, 'latency-breakdown.json'), { modelTimes: all, rootTimes: root, queueTimes: queue, uniqueFastTimes: fast, fromStrictStateReplay: true, excludesUniqueFastFromRoot: true, interruptedPrefix: interrupted, rejectedDecisionMissing: selfplay && result.classification === 'decision_timeout' && !result.failedDecision });
    roots += root.length; queued += queue.length; unique += fast.length; decisions += all.length;
}
save('latency-breakdown-receipt.json', { decisions, roots, queued, unique, preservesRejectedDecisions: true, actualActionsUnchanged: true });
console.log(JSON.stringify({ decisions, roots, queued, unique }));
