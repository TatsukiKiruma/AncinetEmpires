/** 独立strict重放；保存实际与反扑见证全部规则态的永久排重摘要。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { getAllianceId } from '../../src/game/rule_config';
import { ruleStateHash, stepStrict } from '../data_acceptance_20261016/replay/core';

const folder = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3] ?? folder);
const summaryFile = path.join(folder, 'summary.json');
const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : value instanceof Uint8Array ? value : JSON.stringify(value)).digest('hex');
const seen = new Set<string>();
let actions = 0, witnesses = 0, witnessActions = 0;
const evidence: Array<{ path: string; sha256: string }> = [];
const read = (file: string) => {
    const bytes = fs.readFileSync(file);
    evidence.push({ path: path.relative(folder, file).replaceAll('\\', '/'), sha256: hash(bytes) });
    return bytes;
};
fs.mkdirSync(output, { recursive: true });
assert.ok(!fs.existsSync(path.join(output, 'independent-strict-replay.json')), '独立复核收据已存在，禁止覆盖');
for (const game of summary.games) {
    const base = path.join(folder, game.id);
    const initial = JSON.parse(read(path.join(base, 'initial.json')).toString('utf8'));
    const engine = new GameEngine(initial);
    seen.add(ruleStateHash(engine.getState()));
    let count = 0;
    for (const line of read(path.join(base, 'actions.jsonl')).toString('utf8').trim().split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        assert.equal(hash(engine.getState()), row.beforeHash);
        assert.equal(engine.getState().currentPlayer, row.playerId);
        seen.add(ruleStateHash(engine.getState()));
        const result = stepStrict(engine, engine.getState(), row.action).result;
        assert.equal(hash(result.state), row.afterHash);
        seen.add(ruleStateHash(result.state));
        actions++; count++;
    }
    assert.equal(count, game.steps);
    assert.equal(hash(engine.getState()), game.finalSha256);
    assert.equal(engine.getState().winner, game.winner);
    if (!game.cutoff && !game.error) {
        assert.ok(engine.isTerminal(), '自然结果必须已终局');
        const expected = engine.getState().winner === -1 ? 'natural_draw' : engine.getState().winner === getAllianceId(engine.getState(), game.modelPlayer) ? 'model_win' : 'hard_win';
        assert.equal(game.classification, expected);
    }
    const witnessPath = path.join(base, 'witnesses.jsonl.gz');
    if (fs.existsSync(witnessPath)) for (const line of gunzipSync(read(witnessPath)).toString('utf8').trim().split('\n').filter(Boolean)) {
        const row = JSON.parse(line), replay = new GameEngine(row.initial);
        seen.add(ruleStateHash(replay.getState()));
        for (const action of row.actions) {
            const result = stepStrict(replay, replay.getState(), action).result;
            seen.add(ruleStateHash(result.state));
            witnessActions++;
        }
        assert.equal(hash(replay.getState()), row.finalSha256);
        witnesses++;
    }
}
const plain = [...seen].sort().join('\n') + '\n';
fs.writeFileSync(path.join(output, 'consumed-canonical-rule-states.txt.gz'), gzipSync(plain, { level: 9 }));
const receipt = { passed: true, source: folder, games: summary.games.length, actions, witnesses, witnessActions,
    summarySha256: hash(fs.readFileSync(summaryFile)), evidence,
    canonicalHash: { algorithm: 'ruleStateHash/sha256/canonical-object-keys/metadata-excluded', unique: seen.size, plainSha256: hash(plain),
        includesActualBeforeAndAfter: true, includesWitnessBeforeAndAfter: true, permanentTrainingExclusion: true },
    independent: '本进程不调用AI；每步先核对唯一合法动作编码与终局状态，再执行公共权威引擎。' };
fs.writeFileSync(path.join(output, 'independent-strict-replay.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ passed: true, games: receipt.games, actions, witnessActions, uniqueCanonicalStates: seen.size }));
