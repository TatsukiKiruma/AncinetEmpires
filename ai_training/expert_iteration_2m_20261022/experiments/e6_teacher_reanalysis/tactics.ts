/** 小棋盘穷举以自然胜负为唯一叶子信号；深度边界值0明确表示未证胜负。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../../src/game/engine';
import { createDemoState } from '../../../../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../../../../src/game/apk_skirmish';
import { encodeAction } from '../../../../src/game/env';
import { NeuralBeamSearchAI } from '../../../../src/ai_runtime/dual_v3/beam_search';
import { ruleStateHash } from '../../../data_acceptance_20261016/replay/core';
import type { Action, GameState, Unit } from '../../../../src/game/types';
import { HERE, R, read, hash, writeNew, checkBudget } from './common';
import { terminalValue, load, evaluate } from './inference';
import { reanalyze } from './teacher';
import { candidateValues } from './preferences';
import type { StateRow } from './contract';

export function tacticalCases() {
    const result: { id: string; category: string; state: GameState; depth: number }[] = [];
    for (let kind = 0; kind < 4; kind++) for (let variant = 0; variant < 6; variant++) {
        const state = createDemoState(getApkSkirmishRuleConfig('SD', { initialGold: 0, unitLimit: 30, levelCap: 3 }));
        const reverse = variant >= 3, width = kind === 1 ? 3 : 2, height = kind === 2 ? 2 : 1;
        state.map = { width, height, tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ terrainId: 6 as const, ownerId: null }))) };
        state.players.forEach(p => { p.gold = 0; });
        const make = (id: string, owner: number, x: number, hp: number, acted = false): Unit => ({ id, ownerId: owner, unitClass: 'soldier', pos: { x: reverse ? width - 1 - x : x, y: 0 }, hp, maxHp: 100, hasMoved: kind === 0, hasActed: acted });
        const enemyHP = [1, 5, 10][variant % 3];
        state.units = kind === 0 ? [make('own', 0, 0, 100), make('enemy', 1, 1, enemyHP)] :
            kind === 1 ? [make('own', 0, 0, 100), make('enemy', 1, 2, enemyHP)] :
            kind === 2 ? [make('own', 0, 0, 100), make('helper', 0, 1, 100), make('enemy', 1, 1, 70 + variant % 3)] :
            [make('own', 0, 0, 100, true), make('enemy', 1, 1, enemyHP)];
        if (kind === 2) {
            state.units[1].pos.y = 1;
            state.units.forEach(u => { u.hasMoved = true; });
        }
        const category = ['direct_win', 'opponent_reply', 'continuous_units', 'turn_switch'][kind];
        result.push({ id: `tactical-${category}-${variant}`, category, state, depth: kind === 0 ? 1 : kind === 1 ? 3 : kind === 2 ? 2 : 3 });
    }
    return result;
}
export function exhaustive(initial: GameState, depth: number, maxNodes = 100000) {
    const root = initial.currentPlayer, nodes: any[] = [], memo = new Map<string, number>();
    function visit(engine: GameEngine, remaining: number): number {
        const state = engine.getState(), key = `${hash(state)}:${remaining}`, known = memo.get(key);
        if (known !== undefined) return known;
        if (nodes.length >= maxNodes) throw Error('战术穷举节点上限；该用例不能确证答案');
        const index = nodes.length, terminal = terminalValue(state, root);
        const node: any = { hash: hash(state), remaining, player: state.currentPlayer, value: terminal ?? 0, reason: terminal === undefined ? remaining === 0 ? 'horizon_unresolved' : 'expanded' : 'natural', edges: [] };
        nodes.push(node); memo.set(key, index);
        if (terminal !== undefined || remaining === 0) return index;
        const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        assert.ok(legal.length);
        for (const action of legal) {
            const child = engine.clone(); assert.ok(child.hasLegalAction(state.currentPlayer, action)); child.step(action);
            const next = visit(child, remaining - 1); node.edges.push({ action, code: encodeAction(action), next });
        }
        const values = node.edges.map((e: any) => nodes[e.next].value);
        node.value = state.currentPlayer === root ? Math.max(...values) : Math.min(...values);
        return index;
    }
    visit(new GameEngine(initial, { applyInitialTurnStart: false }), depth);
    const best = nodes[0].edges.filter((e: any) => nodes[e.next].value === nodes[0].value).map((e: any) => e.code);
    const witness: Action[] = []; let index = 0;
    while (nodes[index].edges.length) {
        const node = nodes[index], edge = node.edges.find((e: any) => nodes[e.next].value === node.value);
        witness.push(edge.action); index = edge.next;
    }
    return { nodes, best, value: nodes[0].value, witness, terminalWitness: nodes[index].reason === 'natural',
        discriminative: new Set(nodes[0].edges.map((e: any) => nodes[e.next].value)).size > 1 };
}
async function prepare() {
    const cases = tacticalCases(), records = [];
    for (const c of cases) {
        checkBudget(); const proof = exhaustive(c.state, c.depth);
        // 无自然终局见证或无区分度的题不能冒充确证战术答案。
        assert.ok(proof.terminalWitness && (proof.discriminative || proof.nodes[0].edges.length === 1), `${c.id} 答案不能确证`);
        writeNew(path.join(HERE, 'tactics/proofs', c.id + '.json'), { ...c, ...proof });
        records.push({ ...c, best: proof.best, value: proof.value, proofSha256: hash(proof) });
    }
    writeNew(path.join(HERE, 'tactics/cases.json'), records);
}
function modelCases(prefix: string, output: string) {
    const loaded = load(prefix), cases = read(path.join(HERE, 'tactics/cases.json')), records = [];
    for (const c of cases) {
        checkBudget();
        const engine = new GameEngine(c.state, { applyInitialTurnStart: false });
        const ai = new NeuralBeamSearchAI(loaded.model, { modelVersion: loaded.sha256, budgetMs: 4000 });
        const action = ai.getAction(engine, c.state.currentPlayer), code = encodeAction(action);
        assert.ok(engine.hasLegalAction(c.state.currentPlayer, action));
        records.push({ id: c.id, code, correct: c.best.includes(code), rootMs: ai.telemetry.rootMs });
    }
    writeNew(output, { correct: records.filter(r => r.correct).length, total: cases.length, modelSha256: loaded.sha256, records });
}
async function teacherCases() {
    const cases = read(path.join(HERE, 'tactics/cases.json')), loaded = load(path.join(R, 'training/pretrain_full/model')), records = [];
    for (const c of cases) {
        checkBudget();
        const engine = new GameEngine(c.state, { applyInitialTurnStart: false }), ranked = evaluate(engine, loaded.model, c.state.currentPlayer).ranked;
        const row: StateRow = { id: c.id, parent: c.id, ordinal: 0, step: 0, map: 'engineering', phase: 'opening', source: 'search-expert',
            canonical: ruleStateHash(c.state), beforeHash: hash(c.state), state: c.state, action: ranked[0].action, targetCode: ranked[0].code,
            legalCodes: engine.getLegalActions(c.state.currentPlayer).map(encodeAction), winner: null, valueMask: false, parentWeight: 1 };
        const folder = path.join(HERE, 'tactics/teacher', c.id); fs.mkdirSync(folder, { recursive: true });
        const result = reanalyze(row, folder), values = candidateValues(result.plannedCodes, result.witnesses);
        const chosen = [...values].sort(([a, av], [b, bv]) => Math.min(...bv) - Math.min(...av) || a.localeCompare(b))[0]?.[0];
        records.push({ id: c.id, code: chosen ?? null, correct: chosen !== undefined && c.best.includes(chosen), complete: result.witnesses.every(w => w.complete) });
    }
    const baseline = read(path.join(HERE, 'tactics/champion.json')), correct = records.filter(r => r.correct).length;
    writeNew(path.join(HERE, 'tactical-teacher-gate.json'), { passed: correct >= 22 && correct >= baseline.correct, correct, baselineCorrect: baseline.correct, total: 24, records,
        objective: '对所有权威合法非投降动作做有限原子深度的minimax；自然胜=1/负=-1/和=0，深度边界未确证=0；每题要求自然终局见证及根动作区分度' });
}
if (process.argv[1]?.endsWith('tactics.ts')) {
    if (process.argv[2] === 'prepare') await prepare();
    else if (process.argv[2] === 'teacher') await teacherCases();
    else if (process.argv[2] === 'model') modelCases(process.argv[3], process.argv[4]);
    else throw Error('未知战术命令');
}
