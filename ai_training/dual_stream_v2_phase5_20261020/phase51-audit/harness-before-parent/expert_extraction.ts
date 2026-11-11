import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, compact, sha } from './common';
import { DurableLog, diskGuard } from './durable_log';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { encodePlayerOrder } from '../../src/ai_runtime/dual_v2/player_order';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamPureAI } from '../../src/ai_runtime/dual_v2/pure_ai';
import { activeOutcomeTarget } from './value_target';

export const POLICY_CONTRACT = 'atomic-takeover-v2';
export function pureReference(plan: any) {
    const bytes = fs.readFileSync(path.resolve(DIR, plan.teacherModel + '.bin'));
    assert.equal(sha(bytes), plan.teacherSha256, '专家教师模型身份改变');
    const model = new DualStreamModel(read(plan.teacherModel + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return new DualStreamPureAI(model, { tactical: true, headBias: read(plan.teacherCalibration + '/head-calibration.json').headBias });
}
export async function extractGame(slot: any, folder: string, excluded: ReadonlySet<string>, reference: DualStreamPureAI) {
    const prefix = `${folder}/games/${slot.id}`, result = read(prefix + '/result.json'), strict = read(prefix + '/strict-replay.json');
    assert.ok(strict.passed && strict.actions === result.actions);
    if (fs.existsSync(path.join(DIR, prefix, 'extraction.json'))) {
        const receipt = read(prefix + '/extraction.json');
        assert.equal(receipt.policyLabelContract, POLICY_CONTRACT, '旧口径提取必须先归档，不能混用'); return receipt;
    }
    const file = path.join(DIR, prefix, 'samples.jsonl.gz');
    if (fs.existsSync(file)) throw Error('未完成提取必须先保留审计，禁止覆盖');
    const writer = new DurableLog(file), initial = read(slot.initialPath), engine = new GameEngine(initial);
    const stats = { games: 1, actualActions: strict.actions, witnessActions: strict.witnessActions, eligible: 0, corrections: 0, winning: 0, excluded: 0, natural: Number(result.winner !== null), truncated: Number(result.winner === null), referencePredictions: 0, unchangedPlanOverrides: 0, correctedQueuedActions: 0, defaultChecks: 0, defaultMismatches: [] as number[] };
    try {
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'actions.jsonl.gz')))) {
            const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer), action = legal.find(a => encodeAction(a) === row.code); assert.ok(action);
            assert.equal(stateHash(state), row.beforeHash);
            const teacher = row.teacher && row.championTeacher;
            const override = teacher && (row.telemetry.takeover || row.telemetry.veto);
            const checkDefault = teacher && !row.telemetry.queued && !override && legal.length > 2 && Number.parseInt(row.beforeHash.slice(0, 8), 16) % 211 === 0;
            const leakage = excluded.has(row.beforeHash) || excluded.has(ruleStateHash(state));
            let preferred: string | null = null;
            if (!leakage && (override || checkDefault)) {
                preferred = encodeAction(reference.getAction(engine, state.currentPlayer)); stats.referencePredictions++;
                assert.equal(stateHash(engine.getState()), row.beforeHash, '纯策略参考改变了引擎');
                if (checkDefault) { stats.defaultChecks++; if (preferred !== row.code) stats.defaultMismatches.push(row.i); }
                if (override && preferred === row.code) stats.unchangedPlanOverrides++;
            }
            // 方案接管不等于原子纠错；队列中的实际改写也必须逐状态核验纯策略首选。
            const correction = Boolean(override && preferred !== null && preferred !== row.code);
            const win = teacher && result.winner !== null && result.winner !== -1 && getAllianceId(state, row.player) === result.winner;
            if (leakage) stats.excluded++;
            if ((correction || win) && !leakage && legal.some(a => a.type !== 'end_turn' && a.type !== 'surrender')) {
                const order = encodePlayerOrder(state), outcome = activeOutcomeTarget(state, order, result.winner);
                await writer.line({ ...compact(state, initial.map), id: `${slot.id}:${row.i}`, targetCode: row.code, beforeHash: row.beforeHash, quality: correction ? 1.5 : 1., correction, purePreferredCode: preferred, overrideMode: row.telemetry.veto ? 'veto' : row.telemetry.takeover ? 'takeover' : null, policyLabelContract: POLICY_CONTRACT, valueTarget: [...outcome.target], valueMask: outcome.valueMask, terminalTarget: [...outcome.target], terminalMask: outcome.valueMask, rootMask: !row.telemetry.queued && row.telemetry.retaliationAttempts > 0, rootValue: row.telemetry.rootValue, alliances: order.playerIds.map(id => id === null ? null : getAllianceId(state, id)), selfAlliance: getAllianceId(state, row.player), parentId: slot.parentId, prefix: slot.prefix, configuredPlayers: slot.configuredPlayers });
                stats.eligible++; stats.corrections += Number(correction); stats.correctedQueuedActions += Number(correction && row.telemetry.queued); stats.winning += Number(!correction && win);
            }
            const out = engine.step(action); assert.equal(stateHash(out.state), row.afterHash);
        }
    } finally { await writer.close(); }
    const receipt = { ...stats, policyLabelContract: POLICY_CONTRACT, samplesSha256: sha(fs.readFileSync(file)), actualActionsUnchanged: true };
    save(prefix + '/extraction.json', receipt); diskGuard(); return receipt;
}
