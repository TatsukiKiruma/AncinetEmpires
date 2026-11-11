/** 将本轮修改前快照作为只读数值参照，不改写规则或历史成绩。 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { GameEngine } from '../../../src/game/engine';
import { getLegalActions, estimateCounterDamage } from '../../../src/game/rules';
import { DATA, HERE, ROOT, S3, read, save, sha } from './io';
import { lines } from './analysis';

const out = path.join(DATA, 'rules-equivalence-v4'); fs.mkdirSync(out);
const referenceFile = path.join(out, 'reference.mjs');
await build({ stdin: { contents: fs.readFileSync(path.join(HERE, 'revisions/prior-distance-v4-20261101/rules.ts'), 'utf8'), resolveDir: path.join(ROOT, 'src/game'), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: referenceFile });
const reference = await import(pathToFileURL(referenceFile).href);
const summary = read(path.join(DATA, 'resume-v3-screen-maxn-prior035-aggregate/SUMMARY.json'));
const manifest = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
let states = 0, menus = 0, counters = 0;
for (const players of [2, 3, 4]) {
    const game = summary.games.find((g: any) => g.players === players);
    const engine = new GameEngine(read(path.join(S3, manifest.slots[game.slot].file)), { applyInitialTurnStart: false });
    for await (const step of lines(path.join(game.artifactDirectory, 'steps.jsonl.gz'))) {
        const state = engine.getState(); assert.equal(sha(JSON.stringify(state)), step.before);
        if (step.step % 31 === 0) {
            states++;
            for (const query of [{}, { skipMovement: true }, { onlyAttacks: true }, { skipRecruitment: true }]) {
                assert.deepEqual(getLegalActions(state, state.currentPlayer, query), reference.getLegalActions(state, state.currentPlayer, query)); menus++;
            }
            const before = JSON.stringify(state);
            for (const attacker of state.units) for (const target of state.units) if (attacker.ownerId !== target.ownerId) {
                assert.equal(estimateCounterDamage(state, attacker.id, target.id), reference.estimateCounterDamage(state, attacker.id, target.id)); counters++;
            }
            assert.equal(JSON.stringify(state), before);
        }
        assert(engine.hasLegalAction(state.currentPlayer, step.action)); engine.step(step.action);
        assert.equal(sha(JSON.stringify(engine.getState())), step.after);
    }
}
const result = { passed: true, states, menus, counters, inputUnchanged: true, allRecordedTransitionsExact: true, newGames: 0, sealedAccess: 0 };
await save(path.join(out, 'SUMMARY.json'), result, true); console.log(JSON.stringify(result));
