/** 仅重放旧困难AI靶场实际轨迹，补齐canonical永久排重；不调用任何AI。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { ruleStateHash, stepStrict } from '../data_acceptance_20261016/replay/core';

const source = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const summaryFile = path.join(source, 'summary.json');
const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const stateHash = (state: unknown) => hash(JSON.stringify(state));
const seen = new Set<string>(), evidence: Array<{ path: string; sha256: string }> = [];
let actions = 0;
assert.ok(!fs.existsSync(path.join(output, 'independent-strict-replay.json')), '已有收据，拒绝覆盖');
fs.mkdirSync(output, { recursive: true });
for (const game of summary.games) {
    const initial = createApkSkirmishGameState(parseAppApkSkirmishMap(game.mapName), { mode: 'SD', mapName: game.mapName });
    const engine = new GameEngine(initial);
    assert.equal(stateHash(engine.getState()), game.initialStateSha256);
    const bytes = fs.readFileSync(path.join(source, game.traceFile));
    evidence.push({ path: game.traceFile, sha256: hash(bytes) });
    seen.add(ruleStateHash(engine.getState()));
    let count = 0;
    for (const line of bytes.toString('utf8').split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        assert.equal(engine.getState().currentPlayer, row.playerId);
        assert.equal(stateHash(engine.getState()), row.beforeStateSha256);
        const result = stepStrict(engine, engine.getState(), row.action).result;
        assert.equal(stateHash(result.state), row.afterStateSha256);
        seen.add(ruleStateHash(result.state));
        actions++; count++;
    }
    assert.equal(count, game.steps);
    assert.equal(stateHash(engine.getState()), game.finalStateSha256);
    assert.equal(engine.getState().winner, game.winner);
    if (!game.cutoff && !game.error) assert.ok(engine.isTerminal());
}
const plain = [...seen].sort().join('\n') + '\n';
fs.writeFileSync(path.join(output, 'consumed-canonical-rule-states.txt.gz'), gzipSync(plain, { level: 9 }));
const receipt = { passed: true, source, games: summary.games.length, actions, witnesses: 0, witnessActions: 0,
    summarySha256: hash(fs.readFileSync(summaryFile)), evidence,
    canonicalHash: { algorithm: 'ruleStateHash/sha256/canonical-object-keys/metadata-excluded', unique: seen.size,
        plainSha256: hash(plain), includesActualBeforeAndAfter: true, includesWitnessBeforeAndAfter: false, permanentTrainingExclusion: true },
    limitation: '旧靶场只保存实际动作；未落盘的V2内部搜索节点无法恢复，不冒称这些节点已被排重。' };
fs.writeFileSync(path.join(output, 'independent-strict-replay.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ passed: true, games: receipt.games, actions, uniqueCanonicalStates: seen.size }));
