import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { decodeAction, encodeAction } from '../../src/game/env';

// 只重放两段既有完整准入分片，不修改历史收据、资格或候选缓存。
const root = new URL('../../captures/assault-post-action-20261018-01/', import.meta.url);
const phone = new URL('../../ai_training/data_acceptance_20261016/phone/', root);
const index = readFileSync(new URL('release-2026-10-15T21-05-00-859Z/release-index.jsonl', phone), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const results = ['s0001', 's0004'].map(id => {
    const entry = index.find(e => e.segmentId === id);
    assert.equal(entry.transitionAccepted, true);
    const bytes = readFileSync(new URL(entry.candidateShard, phone));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.shardSha256);
    const rows = gunzipSync(bytes).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    const header = rows[0];
    assert.equal(header.kind, 'header');
    const engine = new GameEngine(header.initialState, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    let atoms = 0;
    for (const row of rows.filter(r => r.kind === 'action')) {
        const action = decodeAction(row.code);
        assert.ok(action);
        assert.ok(engine.getLegalActions(engine.getState().currentPlayer).some(a => encodeAction(a) === row.code), `${id} macro=${row.macro} ${row.code}`);
        assert.ok(!engine.step(action).info.includes('非法动作'));
        atoms++;
    }
    assert.equal(atoms, entry.admittedAtoms);
    return { id, shardSha256: entry.shardSha256, macroCount: entry.admittedMacros, atomicActions: atoms,
        strictAccepted: true, finalWinner: engine.getState().winner, evidence: '既有原生宏展开分片的完整原子strict重放；未重新读取全部原生帧或更新准入' };
});
const report = { engineSha256: createHash('sha256').update(readFileSync(new URL('../../src/game/engine.ts', root))).digest('hex'), results };
writeFileSync(new URL('native-strict-current.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(results));
