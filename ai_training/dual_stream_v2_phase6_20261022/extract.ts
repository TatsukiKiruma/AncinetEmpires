/** 从独立strict重放提取胜方大师序列及己方真实斩杀/占领纠错；截断不提供胜负标签。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { areAlliedPlayers, getAllianceId } from '../../src/game/rule_config';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, '../..');
const folders: string[] = JSON.parse(process.env.PHASE6_DATA_DIRS ?? '[]');
assert.ok(folders.length);
const output = path.join(dir, 'corpus'); assert.ok(!fs.existsSync(path.join(output, 'manifest.json')), '不能覆盖已提取数据'); fs.mkdirSync(output, { recursive: true });
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
// 编码与训练共享最后复核的运行时，避免修复期间生成过期先验。
while (!fs.existsSync(path.join(dir, 'runtime-review-complete.json'))) await new Promise(resolve => setTimeout(resolve, 1000));
const selected: any[] = [], parents: any[] = []; let verifiedActions = 0;
for (const folder of folders) {
    const summary = JSON.parse(fs.readFileSync(path.resolve(root, folder, 'summary.json'), 'utf8'));
    assert.equal(summary.errors, 0); assert.equal(summary.truncated, 0);
    for (const result of summary.games) {
        const base = path.resolve(root, folder, result.id), initial = JSON.parse(fs.readFileSync(path.join(base, 'initial.json'), 'utf8'));
        const engine = new GameEngine(initial), rows = fs.readFileSync(path.join(base, 'actions.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        const pool: any[] = [];
        for (const row of rows) {
            const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer), target = legal.findIndex(a => encodeAction(a) === encodeAction(row.action));
            assert.equal(sha(JSON.stringify(state)), row.beforeHash); assert.ok(target >= 0);
            const after = engine.step(row.action).state; assert.equal(sha(JSON.stringify(after)), row.afterHash); verifiedActions++;
            const winning = getAllianceId(state, row.playerId) === result.winner;
            const kill = state.units.some(u => !areAlliedPlayers(state, row.playerId, u.ownerId) && !after.units.some(v => v.id === u.id));
            const actor = 'unitId' in row.action ? state.units.find(u => u.id === row.action.unitId) : undefined;
            const occupiedOwner = actor ? state.map.tiles[actor.pos.y][actor.pos.x].ownerId : null;
            const enemyCapture = row.action.type === 'capture' && occupiedOwner !== null && !areAlliedPlayers(state, row.playerId, occupiedOwner);
            const correction = row.side === 'model' && (kill || enemyCapture);
            if (legal.length <= 2 || row.action.type === 'surrender' || !winning && !correction) continue;
            const identity = sha(JSON.stringify(state)), source = row.side === 'hard' ? 'hard-master' : 'v6-correction';
            pool.push({ state, action: row.action, identity, parent: `${folder}/${result.id}`, step: row.step, winner: result.winner, source, quality: correction ? 2 : 1, priority: sha(`${identity}:${row.step}`) });
        }
        assert.equal(sha(JSON.stringify(engine.getState())), result.finalSha256);
        pool.sort((a, b) => a.priority.localeCompare(b.priority)); selected.push(...pool.slice(0, 100));
        parents.push({ id: `${folder}/${result.id}`, winner: result.winner, actions: rows.length, selected: Math.min(pool.length, 100) });
    }
}
// 同语义状态仅取一份；整个父局按稳定身份划分训练和开发，防止相邻原子泄漏。
const unique = [...new Map(selected.map(s => [s.identity, s])).values()].sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, 2400);
const parentIds = [...new Set(unique.map(s => s.parent))].sort((a, b) => sha(a).localeCompare(sha(b)));
const dev = new Set(parentIds.filter((_, i) => i % 5 === 0));
const counts: any = { train: 0, dev: 0, sources: {} }, parity: any[] = [];
for (const row of unique) {
    const split = dev.has(row.parent) ? 'dev' : 'train', legal = new GameEngine(row.state).getLegalActions(row.state.currentPlayer);
    const index = legal.findIndex(a => encodeAction(a) === encodeAction(row.action)); assert.ok(index >= 0);
    const observation = encodeDualObservation(row.state, legal), target = Array.from(observation.actions.sourceIndices).indexOf(index); assert.ok(target >= 0);
    const valueTarget = new Float32Array(6);
    for (let slot = 0; slot < 6; slot++) if (observation.playerOrder.active[slot] && observation.playerOrder.playerIds[slot] !== null && getAllianceId(row.state, observation.playerOrder.playerIds[slot]!) === row.winner) valueTarget[slot] = 1;
    assert.ok(valueTarget.some(v => v > 0));
    const pack = packTensorBatch([observation], [{ target, policyMask: true, valueMask: true, valueTarget, weight: 1 }]);
    const priors = tacticalActionPriors(row.state, legal);
    const metadata = { ...pack.metadata, sources: [{ id: row.identity, parent: row.parent, source: row.source, quality: row.quality, prior: Array.from(observation.actions.sourceIndices, i => priors[i].prior) }] };
    const meta = Buffer.from(JSON.stringify(metadata)), header = Buffer.alloc(8); header.writeUInt32LE(meta.length); header.writeUInt32LE(pack.bytes.length, 4);
    fs.appendFileSync(path.join(output, `${split}.frames.gz`), gzipSync(Buffer.concat([header, meta, pack.bytes])));
    fs.appendFileSync(path.join(output, 'selected.jsonl.gz'), gzipSync(JSON.stringify({ ...row, split }) + '\n'));
    counts[split]++; counts.sources[row.source] = (counts.sources[row.source] ?? 0) + 1;
    if (parity.length < 32 && !parity.some(p => p.parent === row.parent && p.state.currentPlayer === row.state.currentPlayer)) parity.push(row);
}
fs.writeFileSync(path.join(output, 'parity-states.json'), JSON.stringify(parity));
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ verifiedActions, counts, parents, devParents: [...dev], files: ['train.frames.gz', 'dev.frames.gz', 'selected.jsonl.gz'].map(name => ({ name, sha256: sha(fs.readFileSync(path.join(output, name))) })), note: '已消费开发靶场，父局分区只用于本轮优化监测，不代表独立泛化。' }, null, 2));
console.log(JSON.stringify({ verifiedActions, counts, parents: parents.length, parity: parity.length }));
