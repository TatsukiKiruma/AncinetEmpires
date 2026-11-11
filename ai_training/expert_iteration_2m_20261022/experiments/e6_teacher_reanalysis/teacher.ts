/** 独立离线老师：固定根候选、完整己方回合与两种对手回合，不放宽应用搜索预算。 */
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../../../src/game/engine';
import { encodeAction } from '../../../../src/game/env';
import { OriginalApkLikeHardAI } from '../../../../src/game/ai/original_apk_like_hard_ai';
import { diverseCandidates, coverageRotation } from '../../../../src/ai_runtime/dual_v3/search_policy';
import { ruleStateHash } from '../../../data_acceptance_20261016/replay/core';
import { HERE, R, E, read, hash, writeNew, seeded, SEED, checkBudget } from './common';
import { load, evaluate } from './inference';
import { preferences } from './preferences';
import type { StateRow, TeacherRow, Witness } from './contract';

export function reachedBoundary(state: StateRow['state'], root: number, opponentSeen: boolean) {
    return state.winner !== null || opponentSeen && state.currentPlayer === root;
}
export function reanalyze(row: StateRow, output: string, deadline = Date.now() + 60000): TeacherRow {
    const start = Date.now(), config = read(path.join(HERE, 'protocol.json'));
    const champion = load(path.join(R, 'training/pretrain_full/model')), cross = load(path.join(R, 'training/v5_gen_01/model'));
    const root = row.state.currentPlayer, seed = (SEED ^ parseInt(hash(row.id).slice(0, 8), 16)) >>> 0;
    const result: TeacherRow = { version: 'e6-teacher-v1', id: row.id, parent: row.parent, canonical: row.canonical, rootPlayer: root,
        plannedCodes: [], witnesses: [], preferences: [], rejected: [], seed, modelHashes: [champion.sha256, cross.sha256], configSha256: hash(config), elapsedMs: 0 };
    const excluded = new Set<string>();
    for (const file of Object.keys(read(path.join(HERE, 'data-inputs.json'))).filter(p => p.endsWith('.txt.gz'))) {
        // 排除集合已经由数据准入校验字节身份；续弈逐态继续检查。
        for (const h of gunzip(fs.readFileSync(file))) excluded.add(h);
    }
    const validationGolds = new Set<number>(read(path.join(E, 'plan.json')).validationInitialGolds);
    const room = () => { checkBudget(); if (Date.now() >= deadline) throw Error('root_timeout'); };
    const engine = new GameEngine(row.state, { applyInitialTurnStart: false });
    if (ruleStateHash(engine.getState()) !== row.canonical || hash(engine.getState()) !== row.beforeHash) throw Error('根状态身份失配');
    room();
    const ranked = evaluate(engine, champion.model, root).ranked; room();
    const actual = ranked.find(r => r.code === row.targetCode); if (!actual) throw Error('轨迹动作未通过权威合法性');
    const selected = [actual, ranked[0], ...diverseCandidates(ranked, 8, coverageRotation(row.state)), ...ranked]
        .filter((r, i, all) => all.findIndex(s => s.code === r.code) === i).slice(0, 8);
    result.plannedCodes = selected.map(r => r.code);
    writeNew(path.join(output, 'started.json'), { row, plannedCodes: result.plannedCodes, seed, deadline, modelHashes: result.modelHashes, configSha256: result.configSha256 });
    for (const candidate of selected) for (const variant of ['hard', 'champion'] as const) {
        const branch = engine.clone(), rng = seeded(seed), hard = new OriginalApkLikeHardAI({ rng });
        const witness: Witness = { variant, code: candidate.code, seed, actions: [], actors: [], hashes: [], final: branch.getState(), complete: false, reason: 'not_started' };
        let opponentSeen = false;
        try {
            for (let step = 0; step < 256; step++) {
                room(); const state = branch.getState();
                if (step > 0 && reachedBoundary(state, root, opponentSeen)) { witness.complete = true; witness.reason = state.winner !== null ? 'natural' : 'next_root_turn'; break; }
                const action = step === 0 ? candidate.action : state.currentPlayer !== root && variant === 'hard' ? hard.getAction(branch, state.currentPlayer) : evaluate(branch, champion.model, root).ranked[0].action;
                room();
                if (!branch.hasLegalAction(state.currentPlayer, action)) throw Error('illegal_action');
                if (excluded.has(ruleStateHash(state)) || validationGolds.has(state.rules?.initialGold)) throw Error('evaluation_contamination');
                witness.actions.push(action); witness.actors.push(state.currentPlayer); witness.hashes.push(hash(state));
                const after = branch.step(action); if (after.info.includes('非法动作')) throw Error('illegal_action');
                // 原子前缀及时落盘，进程被看门狗终止时仍能独立strict重放。
                fs.appendFileSync(path.join(output, 'trajectory.jsonl'), JSON.stringify({ code: candidate.code, variant, action, player: state.currentPlayer, beforeHash: hash(state), afterHash: hash(after.state) }) + '\n');
                opponentSeen ||= after.state.currentPlayer !== root;
                if (reachedBoundary(after.state, root, opponentSeen)) { witness.complete = true; witness.reason = after.state.winner !== null ? 'natural' : 'next_root_turn'; break; }
                if (step === 255) witness.reason = 'action_limit';
            }
            room();
            if (hard.telemetry.runtimeErrors) throw Error('hard_runtime_error');
            if (witness.complete) {
                const state = branch.getState();
                if (excluded.has(ruleStateHash(state))) throw Error('evaluation_contamination');
                witness.scores = [evaluate(branch, champion.model, root).value, evaluate(branch, cross.model, root).value]; room();
            }
        } catch (error) {
            witness.complete = false; witness.scores = undefined; witness.reason = String(error).includes('root_timeout') ? 'root_timeout' : 'error'; witness.error = String(error);
        }
        witness.final = branch.getState(); result.witnesses.push(witness);
        fs.appendFileSync(path.join(output, 'witnesses.jsonl'), JSON.stringify(witness) + '\n');
    }
    result.preferences = preferences(result.plannedCodes, result.witnesses);
    result.rejected = [...new Set(result.witnesses.filter(w => !w.complete).map(w => w.reason))];
    if (!result.preferences.length) result.rejected.push('no_robust_margin');
    result.elapsedMs = Date.now() - start; writeNew(path.join(output, 'result.json'), result); return result;
}
import { gunzipSync } from 'node:zlib';
const gunzip = (b: Buffer) => gunzipSync(b).toString().split('\n').filter(Boolean);
if (process.argv[1]?.endsWith('teacher.ts')) {
    const rows: StateRow[] = read(process.argv[2]), index = Number(process.argv[3]);
    reanalyze(rows[index], process.argv[4], Number(process.env.E6_ROOT_DEADLINE ?? Date.now() + 60000));
}
