/** 独立重放所有老师续弈，连同未完成前缀核对身份与视角；不加载网络。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../../src/game/engine';
import { encodeAction } from '../../../../src/game/env';
import { HERE, R, read, sha, hash, writeNew, checkBudget } from './common';
import { ruleStateHash } from '../../../data_acceptance_20261016/replay/core';
import { preferences } from './preferences';
import type { StateRow, TeacherRow } from './contract';
const results: any[] = [];
for (const split of ['train', 'dev-search']) {
    const allRows: StateRow[] = read(path.join(HERE, `data/${split}.json`));
    let planned = 0, completed = 0, reliable = 0, actions = 0, missing = 0, errors = 0;
    for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i]; if (row.source !== 'search-expert') continue;
        checkBudget(); const folder = path.join(HERE, 'teacher', split, String(i));
        const prefixFile = path.join(folder, 'trajectory.jsonl');
        if (fs.existsSync(prefixFile)) {
            const branches = new Map<string, GameEngine>();
            for (const text of fs.readFileSync(prefixFile, 'utf8').trim().split('\n').filter(Boolean)) {
                const atom = JSON.parse(text), key = `${atom.code}/${atom.variant}`;
                const branch = branches.get(key) ?? new GameEngine(row.state, { applyInitialTurnStart: false });
                branches.set(key, branch);
                assert.equal(hash(branch.getState()), atom.beforeHash); assert.equal(branch.getState().currentPlayer, atom.player);
                assert.ok(branch.hasLegalAction(atom.player, atom.action)); branch.step(atom.action); assert.equal(hash(branch.getState()), atom.afterHash);
            }
        }
        if (!fs.existsSync(path.join(folder, 'result.json'))) { missing++; planned += 16; continue; }
        const result: TeacherRow = read(path.join(folder, 'result.json'));
        assert.equal(result.id, row.id); assert.equal(result.parent, row.parent); assert.equal(result.canonical, row.canonical);
        assert.equal(result.rootPlayer, row.state.currentPlayer); assert.equal(result.configSha256, hash(read(path.join(HERE, 'protocol.json'))));
        assert.deepEqual(result.modelHashes, ['pretrain_full', 'v5_gen_01'].map(n => sha(fs.readFileSync(path.join(R, 'training', n, 'model.bin')))));
        assert.equal(new Set(result.plannedCodes).size, result.plannedCodes.length); assert.ok(result.plannedCodes.length <= 8);
        planned += result.plannedCodes.length * 2;
        assert.equal(result.witnesses.length, result.plannedCodes.length * 2);
        for (const w of result.witnesses) {
            assert.ok(result.plannedCodes.includes(w.code)); assert.equal(w.seed, result.seed);
            const engine = new GameEngine(row.state, { applyInitialTurnStart: false }); let opponentSeen = false;
            assert.equal(ruleStateHash(engine.getState()), row.canonical);
            assert.equal(w.actors.length, w.actions.length); assert.equal(w.hashes.length, w.actions.length); assert.ok(w.actions.length <= 256);
            for (let j = 0; j < w.actions.length; j++) {
                const state = engine.getState(); assert.equal(w.actors[j], state.currentPlayer); assert.equal(w.hashes[j], hash(state));
                if (j === 0) assert.equal(encodeAction(w.actions[j]), w.code);
                assert.ok(engine.hasLegalAction(state.currentPlayer, w.actions[j]));
                const after = engine.step(w.actions[j]); assert.ok(!after.info.includes('非法动作')); opponentSeen ||= after.state.currentPlayer !== row.state.currentPlayer; actions++;
            }
            assert.deepEqual(engine.getState(), w.final);
            if (w.complete) {
                assert.ok(w.final.winner !== null || opponentSeen && w.final.currentPlayer === row.state.currentPlayer);
                assert.ok(['natural', 'next_root_turn'].includes(w.reason)); assert.ok(!w.error);
                assert.ok(w.scores?.every(v => Number.isFinite(v) && v >= -1 && v <= 1)); completed++;
            } else assert.ok(!w.scores);
            errors += Number(w.reason === 'error');
        }
        assert.deepEqual(preferences(result.plannedCodes, result.witnesses), result.preferences);
        reliable += Number(result.preferences.length > 0);
    }
    results.push({ split, planned, completed, completionRate: completed / Math.max(1, planned), reliable, missing, errors, actions,
        passed: !missing && !errors && completed / Math.max(1, planned) >= .8 && reliable >= (split === 'train' ? 128 : 32) });
}
writeNew(path.join(HERE, 'teacher-gate.json'), { passed: results.every(r => r.passed), strictPassed: true, results,
    qualification: '仅证明记录续弈及所选双策略核验达标，不代表穷举全部反扑或整体棋力' });
console.log(JSON.stringify(results));
