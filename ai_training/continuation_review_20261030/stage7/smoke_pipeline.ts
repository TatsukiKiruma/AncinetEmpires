/** 本地合同探针，只用官方初态、CPU 桩和本任务临时目录，不运行正式门禁。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { arenaGame } from './arena_game';
import { devPanel } from './arena_panel';
import { leagueGame } from './league_game';
import { leagueBlock, officialMaps } from './league_schedule';
import { DatasetPack } from './dataset_pack';
import { data, readLocal, saveJson } from './phase7_io';

const dir = fs.mkdtempSync(path.join(data, 'pipeline-smoke-'));
const all = Array.from({ length: 10 }, (_, n) => leagueBlock(1, n, [], 2026110807)).flat();
assert.equal(new Set(all.map(j => `${j.map}/${j.candidate}`)).size, officialMaps().reduce((n, m) => n + m.playerCount, 0));
for (const group of [2, 3, 4]) assert.equal(all.filter(j => j.players === group).length, { 2: 50, 3: 90, 4: 60 }[group as 2 | 3 | 4]);
for (const [kind, count] of [['hard', 100], ['C1', 70], ['mixed', 30]]) assert.equal(all.filter(j => j.kind === kind).length, count);
const dev = devPanel(); assert.equal(dev.jobs.length, 54); assert.equal(dev.subsetIds.size, 18);
const first = all.find(j => j.players === 2)!;
const model = { forwardBatch: async () => { throw Error('此探针不应运行神经推理'); } } as any;
const ids = first.state.players.map(p => p.id).sort((a, b) => a - b);
const arena = { initial: first.state, match: { id: 'smoke', seat: ids.findIndex(id => id !== first.state.currentPlayer), opponent: 'hard', seed: 100 },
    limits: { ...dev.limits, maxActions: 1 }, config: { ...readLocal('TEACHER_CONFIG.json'), ownTurnRollout: true }, sourceIdentity: 'smoke',
    players: 2, split: 'dev', database: path.join(dir, 'arena.sqlite') };
const r = await arenaGame(arena, model);
assert(r.steps === 1 && !r.natural && r.classification === 'action_truncation');
assert.deepEqual(await arenaGame(arena, model), r);
// 模拟在完成收据写入前断电；已落盘动作必须能恢复对手内部队列并逐步复验。
const arenaDb = new DatabaseSync(arena.database);
try {
    const p = JSON.parse(String(arenaDb.prepare('SELECT value FROM progress WHERE id=1').get()?.value));
    p.complete = false; p.stop = null;
    arenaDb.prepare('UPDATE progress SET value=? WHERE id=1').run(JSON.stringify(p));
} finally { arenaDb.close(); }
assert.deepEqual(await arenaGame(arena, model), r);
const league = await leagueGame({ ...first, deadlineMs: Date.now() - 1, config: readLocal('TEACHER_CONFIG.json'), candidateModelSha256: 'smoke',
    sourceIdentity: 'smoke', database: path.join(dir, 'league.sqlite') }, model);
assert(league.wallLimit && !league.complete && !league.natural && !league.valueMask);
const db = path.join(dir, 'dataset.sqlite'), pack = new DatasetPack(db, 'smoke');
try {
    const source = { parentId: 'smoke', players: 2, split: 'train' as const, category: 'fresh', step: 1 };
    assert(pack.pack('smoke', 'fresh', [
        { state: first.state, teacher: null, winner: first.state.currentPlayer, source, keepActions: false },
        { state: first.state, teacher: null, winner: null, source, keepActions: false },
    ]));
    assert(!pack.pack('smoke', 'fresh', []));
    assert.equal(pack.stats().total?.samples, 1);
} finally { pack.close(); }
const result = { passed: true, sealedAccess: 0, gpuUsed: false, stageGatesRun: false, database: db,
    checks: ['官方地图席位与联赛配额', '开发集固定人数及子集', '竞技场截断、断点复验和收据复用', '联赛墙钟保护', '截断价值掩码和编码去重'] };
saveJson(path.join(dir, 'SMOKE.json'), result);
console.log(JSON.stringify(result));
