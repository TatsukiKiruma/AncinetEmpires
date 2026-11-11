/** 独立重放战术穷举主变和老师全部前缀；答案与老师评分分别核验。 */
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../../src/game/engine';
import { encodeAction } from '../../../../src/game/env';
import { HERE, read, hash, writeNew, checkBudget } from './common';
import { exhaustive } from './tactics';
import { terminalValue } from './inference';
const cases = read(path.join(HERE, 'tactics/cases.json')); let actions = 0;
for (const c of cases) {
    checkBudget();
    const proof = read(path.join(HERE, 'tactics/proofs', c.id + '.json'));
    const fresh = exhaustive(c.state, c.depth);
    assert.deepEqual(fresh.best, proof.best); assert.equal(fresh.value, proof.value); assert.equal(hash(fresh), c.proofSha256);
    const result = read(path.join(HERE, 'tactics/teacher', c.id, 'result.json'));
    assert.equal(result.rootPlayer, c.state.currentPlayer);
    for (const w of result.witnesses) {
        const engine = new GameEngine(c.state, { applyInitialTurnStart: false }); let opponentSeen = false;
        assert.equal(w.actions.length, w.actors.length); assert.equal(w.actions.length, w.hashes.length);
        for (let i = 0; i < w.actions.length; i++) {
            const state = engine.getState(); assert.equal(state.currentPlayer, w.actors[i]); assert.equal(hash(state), w.hashes[i]);
            if (i === 0) assert.equal(encodeAction(w.actions[i]), w.code);
            assert.ok(engine.hasLegalAction(state.currentPlayer, w.actions[i])); engine.step(w.actions[i]);
            opponentSeen ||= engine.getState().currentPlayer !== c.state.currentPlayer; actions++;
        }
        assert.deepEqual(engine.getState(), w.final);
        if (w.complete) {
            assert.ok(w.final.winner !== null || opponentSeen && w.final.currentPlayer === c.state.currentPlayer);
            const terminal = terminalValue(w.final, c.state.currentPlayer);
            if (terminal !== undefined) assert.deepEqual(w.scores, [terminal, terminal]);
        } else assert.ok(!w.scores);
    }
}
writeNew(path.join(HERE, 'strict-tactics.json'), { passed: true, cases: cases.length, actions });
