import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ledgerScore, multiplayerLedger } from '../../src/ai_runtime/dual_v2/multiplayer_leaf';
import { DIR, read, restore, save } from './common';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';

const base = 'phase54-audit/v5-deep-r2';
const plan = read(`${base}/candidate-search-arena/plan.json`);
const cases = read(`${base}/pure-win-regressions-first-divergence.json`).regressions;
const output = [];

async function* rows(file: string) {
    const input = fs.createReadStream(path.join(DIR, file));
    const unzip = createGunzip();
    const lines = createInterface({ input: input.pipe(unzip), crlfDelay: Infinity });
    try { for await (const line of lines) yield JSON.parse(line); }
    finally { lines.close(); input.destroy(); unzip.destroy(); }
}

for (const entry of cases) {
    const slot = plan.slots.find((candidate: any) => candidate.id === entry.searchId);
    const folder = `${base}/candidate-search-arena/battles/${slot.id}`;
    const root = entry.firstDifference.precedingSearchRoot;
    if (!root || root.telemetry.witnesses !== root.telemetry.risks.length) {
        output.push({ id: slot.id, skipped: '终局零动作见证可能使候选与见证不能直接一一对应' });
        continue;
    }
    const initial = read(plan.maps[slot.mapIndex].path), engine = new GameEngine(initial);
    let witnessOffset = 0;
    for await (const row of rows(`${folder}/actions.jsonl.gz`)) {
        assert.equal(stateHash(engine.getState()), row.beforeHash);
        if (row.i === root.i) break;
        if (row.telemetry && !row.telemetry.queued) witnessOffset += row.telemetry.witnesses;
        const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code);
        assert.ok(action, '根前缀必须保持strict合法');
        assert.equal(stateHash(engine.step(action).state), row.afterHash);
    }
    const before = engine.getState(), existing = new Set(before.units.map(unit => unit.id));
    const candidates = [];
    let index = 0;
    for await (const witness of rows(`${folder}/witnesses.jsonl.gz`)) {
        if (index++ < witnessOffset) continue;
        const after = restore(witness.state, initial.map, witness.patches, witness.mapIndex);
        const ledger = multiplayerLedger(before, after, slot.seat);
        candidates.push({ index: candidates.length, ownStateHash: stateHash(after), ledger, ledgerScore: ledgerScore(ledger), risk: root.telemetry.risks[candidates.length], newUnits: after.units.filter(unit => !existing.has(unit.id)).map(unit => ({ id: unit.id, owner: unit.ownerId, unitClass: unit.unitClass, hp: unit.hp, pos: unit.pos })), remainingGold: after.players.filter(player => slot.modelSeats.includes(player.id)).map(player => ({ id: player.id, gold: player.gold })) });
        if (candidates.length >= root.telemetry.witnesses) break;
    }
    assert.equal(candidates.length, root.telemetry.witnesses);
    const executed = [];
    for await (const row of rows(`${folder}/actions.jsonl.gz`)) {
        if (row.i < root.i) continue;
        if (row.i > root.i && !row.telemetry?.queued) break;
        assert.equal(stateHash(engine.getState()), row.beforeHash);
        const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code);
        assert.ok(action);
        assert.equal(stateHash(engine.step(action).state), row.afterHash);
        executed.push(row.code);
    }
    const executedState = engine.getState(), executedLedger = multiplayerLedger(before, executedState, slot.seat);
    output.push({ id: slot.id, rootIndex: root.i, beforeHash: stateHash(before), firstPureAction: entry.firstDifference.pure.code, firstSearchAction: entry.firstDifference.search.code, executedPrefix: { actions: executed, ledger: executedLedger, ledgerScore: ledgerScore(executedLedger), matchesEvaluatedFullOwnState: candidates.some(candidate => candidate.ownStateHash === stateHash(executedState)) }, candidates });
}
save(`${base}/takeover-witness-ledgers.json`, { scope: '只读使用完整strict前缀和真实见证初态计算权威账本；候选0为神经基准，未反事实宣称接管一定导致失败，不按此选择策略权重', cases: output });
console.log(JSON.stringify(output));
