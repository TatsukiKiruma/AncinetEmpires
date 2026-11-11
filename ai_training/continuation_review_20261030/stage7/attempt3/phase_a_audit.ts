import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine as OldEngine } from './before/engine.bundle.mjs';
import { getLegalActions as oldLegal } from './before/rules.bundle.mjs';
import { GameEngine } from '../../../src/game/engine';
import { getLegalActions } from '../../../src/game/rules';
import { AncientEmpiresEnv, encodeAction, encodeFixedActionIndex } from '../../../src/game/env';

const here = path.resolve(import.meta.dirname);
const sha = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const reads: { path: string; sha256: string }[] = [];
function read(file: string) {
    assert(!/sealed|historical|offline-329/i.test(file), '禁止读取封存路径');
    const bytes = fs.readFileSync(file);
    reads.push({ path: file, sha256: sha(bytes) });
    return bytes;
}
const summary = JSON.parse(read(path.join(here, '../stage6/DEV54_SUMMARY.json')).toString());
const contract = fs.readFileSync(path.resolve('src/ai_runtime/dual_v2/contract.ts'));
assert.deepEqual(contract, fs.readFileSync(path.join(here, 'before/contract.ts')));
const checkpoint = path.join(here, 'PHASE_A_PROGRESS.json');
const rows: any[] = fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint, 'utf8')).rows : [];
const sourceFiles = ['src/game/rules.ts', 'src/game/engine.ts', 'src/game/env.ts'];
const sourceSha256 = Object.fromEntries(sourceFiles.map(f => [f, sha(fs.readFileSync(f))]));
const engineSha256 = sha(JSON.stringify(sourceSha256));
if (fs.existsSync(checkpoint)) assert.equal(JSON.parse(fs.readFileSync(checkpoint, 'utf8')).engineSha256, engineSha256);
let failed: unknown = null;
try {
    for (const game of summary.games.slice(rows.length)) {
        const initial = JSON.parse(read(path.join(game.artifactDirectory, 'INITIAL.json')).toString());
        const steps = gunzipSync(read(path.join(game.artifactDirectory, 'steps.jsonl.gz'))).toString().trim().split('\n').map(line => JSON.parse(line));
        const engine = new OldEngine(initial.state, initial.engineOptions);
        const result = { id: game.id, players: game.players, checked: 0, properSubsets: 0, removed: 0, strictErrors: [] as any[] };
        // 每局等距抽取四十个前态；历史后态始终由修改前的权威引擎还原。
        const chosen = new Set(Array.from({ length: 40 }, (_, i) => Math.floor(i * steps.length / 40)));
        for (const row of steps) {
            const s = engine.getState();
            assert.equal(sha(JSON.stringify(s)), row.before, `${game.id}/${row.step}历史前态摘要`);
            if (chosen.has(row.step)) {
                const old = new Set(oldLegal(s, s.currentPlayer).map(encodeAction));
                const legal = getLegalActions(s, s.currentPlayer);
                assert(legal.every(a => old.has(encodeAction(a))), `${game.id}/${row.step}新增动作`);
                const env = new AncientEmpiresEnv({ initialState: s });
                const current = new GameEngine(s, { applyInitialTurnStart: false });
                assert.deepEqual(current.getLegalActions(s.currentPlayer), legal);
                assert.deepEqual(env.getLegalActions(), legal);
                assert.deepEqual(current.clone().getState(), s);
                assert.deepEqual(env.clone().getState(), s);
                assert.equal(env.reset().reward, 0);
                const indexes = legal.map(a => encodeFixedActionIndex(a, s));
                assert(indexes.every(i => i !== null));
                const mask = env.getFixedActionMask().actionMask;
                const expected = [...new Set(indexes)].sort((a, b) => a! - b!);
                assert.deepEqual(env.getFixedLegalActionIndexes(), expected);
                assert.deepEqual(mask.flatMap((v, i) => v ? [i] : []), expected);
                result.checked++;
                result.removed += old.size - legal.length;
                if (old.size > legal.length) result.properSubsets++;
            }
            if (!new GameEngine(s, { applyInitialTurnStart: false }).hasLegalAction(s.currentPlayer, row.action)) {
                result.strictErrors.push({ step: row.step, action: row.action, before: row.before });
            }
            assert(engine.hasLegalAction(s.currentPlayer, row.action));
            engine.step(row.action);
            assert.equal(sha(JSON.stringify(engine.getState())), row.after, `${game.id}/${row.step}历史后态摘要`);
        }
        rows.push(result);
        fs.writeFileSync(checkpoint, JSON.stringify({ engineSha256, rows, sealedAccess: 0 }));
        console.log(JSON.stringify(result));
    }
    assert(rows.reduce((n, r) => n + r.checked, 0) >= 2000);
    assert(rows.some(r => r.properSubsets > 0));
} catch (error) { failed = String(error); }
const report = { passed: failed === null, error: failed, engineSha256, sourceSha256, contractSha256: sha(contract),
    actionHeadsByteIdentical: true, states: rows.reduce((n, r) => n + r.checked, 0), rows, reads, sealedAccess: 0,
    subsetDefinition: '逐状态新集合包含于旧集合，允许相等；整个样本集存在真子集。严格旧动作错误仅登记，不放宽规则。' };
fs.writeFileSync(path.join(here, 'PHASE_A_SUBSET.json'), JSON.stringify(report, null, 2));
if (failed) throw Error(failed);
