import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { DIR, read, save, sha } from './common';
import { metricsTracker, income, quantiles, replay } from './battle';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { stateHash, gzipRows } from '../dual_stream_v2_phase1_20261020/io';

const arena = process.env.LEAGUE_ARENA!, plan = read(arena + '/plan.json');
for (const slot of plan.slots) {
    const prefix = `${arena}/battles/${slot.id}`, directory = path.join(DIR, prefix);
    if (!fs.existsSync(path.join(directory, 'started.json')) || fs.existsSync(path.join(directory, 'result.json'))) continue;
    assert.ok(slot.legacy, '仅修复不可能产生搜索见证的历史纯策略空日志');
    const initial = read(plan.maps[slot.mapIndex].path), engine = new GameEngine(initial), tracker = metricsTracker(slot.modelSeats);
    const times = { model: [] as number[], opponent: [] as number[] }; let actions = 0, round10: any = null;
    for await (const row of gzipRows(fs.readFileSync(path.join(directory, 'actions.jsonl.gz')))) {
        const state = engine.getState(); assert.equal(stateHash(state), row.beforeHash);
        if (!round10 && state.turn >= 10) {
            const enemies = state.players.filter(p => !slot.modelSeats.includes(p.id)).map(p => p.id);
            round10 = { reached: true, turn: state.turn, recurringIncomeModel: income(state, slot.modelSeats), recurringIncomeOpponent: income(state, enemies), recurringIncomeDifference: income(state, slot.modelSeats) - income(state, enemies), actualIncomeDifference: tracker.metrics.model.actualIncome - tracker.metrics.opponent.actualIncome };
        }
        const legal = engine.getLegalActions(state.currentPlayer), action = legal.find(a => encodeAction(a) === row.code); assert.ok(action);
        const out = engine.step(action); assert.equal(stateHash(out.state), row.afterHash);
        tracker.apply(state, legal, action, out.state); times[row.side as 'model' | 'opponent'].push(row.ms); actions++;
    }
    const final = engine.getState(), partial = !engine.isTerminal() && actions !== plan.budgets.maxActions;
    const empty = path.join(directory, 'witnesses.jsonl.gz'); assert.equal(fs.statSync(empty).size, 0);
    fs.copyFileSync(empty, path.join(directory, 'empty-witness-file.original'));
    fs.writeFileSync(empty, gzipSync(''));
    const started = read(prefix + '/started.json');
    const classification = partial ? 'interrupted' : engine.isTerminal() ? final.winner === -1 ? 'natural_draw' : final.winner === getAllianceId(final, slot.seat) ? 'natural_win' : 'natural_loss' : 'action_truncation';
    save(prefix + '/result.json', { slot, classification, error: partial ? '空见证close异常遮蔽原停止原因；不推断终局或超时分类，保留为中断尝试' : null, actions, winner: final.winner, finalTurn: final.turn, wallSeconds: null, recoveredWallClockUnavailable: true, round10: round10 ?? { reached: false }, finalHash: stateHash(final), metrics: tracker.metrics, rootLatency: quantiles([]), queueLatency: quantiles([]), rootTimes: [], queueTimes: [], latency: { model: quantiles(times.model), opponent: quantiles(times.opponent) }, latencySamples: times, modelSha256: started.modelSha256 });
    await replay(slot);
    save(prefix + '/EMPTY_LOG_CLOSE_REPAIR.json', { passed: true, partial, reason: '纯策略零反扑时空文件close转码失败；每个实际动作已独立gzip+fsync，逐帧strict恢复；只补合法空gzip头并保留原零字节文件，不推断未知停止原因', actions, witnessActions: 0, classification, actionsSha256: sha(fs.readFileSync(path.join(directory, 'actions.jsonl.gz'))) });
    if (partial) {
        const destination = path.join(DIR, arena, 'attempts', slot.id + '-empty-log-close');
        if (!destination.startsWith(path.join(DIR, arena, 'attempts') + path.sep) || !directory.startsWith(path.join(DIR, arena, 'battles') + path.sep) || fs.existsSync(destination)) throw Error('中断证据移动路径越界或冲突');
        fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.renameSync(directory, destination);
    }
    console.log(JSON.stringify({ recovered: slot.id, classification, actions }));
}
