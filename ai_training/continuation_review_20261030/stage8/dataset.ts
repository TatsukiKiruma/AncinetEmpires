import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { DatasetPack, type Example } from '../stage7/dataset_pack';
import { validTeacher } from '../stage7/league_policy';
import { data, read, save, sha, guard } from './io';

export function exportDataset(generation: number) {
    guard(); const dir = path.join(data, `gen${generation}`), summary = read(path.join(dir, 'SUMMARY.json'));
    assert(summary.passed && summary.sealedAccess === 0);
    const identity = sha(JSON.stringify(summary));
    const file = path.join(dir, 'dataset.sqlite'), pack = new DatasetPack(file, identity);
    const receipts = new Map(summary.games.map((g: any) => [g.gameId, g]));
    try {
        for (let block = 0, n = 0; n < summary.games.length; block++) {
            for (const job of read(path.join(dir, `block-${block}.json`))) {
                guard(); assert(job.split === 'train'); assert(receipts.has(job.gameId));
                function* rows(): Generator<Example> {
                    const db = new DatabaseSync(job.database, {readOnly: true});
                    try {
                        const p = JSON.parse(String(db.prepare('SELECT value FROM progress WHERE id=1').get()!.value));
                        assert(p.complete);
                        const engine = new GameEngine(job.state, {applyInitialTurnStart: false}); let steps = 0;
                        for (const row of db.prepare('SELECT value FROM steps ORDER BY step').iterate()) {
                            const trace = JSON.parse(String(row.value)), state = engine.getState();
                            assert(trace.step === ++steps && trace.player === state.currentPlayer && trace.code === encodeAction(trace.action));
                            assert(engine.hasLegalAction(trace.player, trace.action));
                            const teacher = validTeacher(trace.teacher) ? trace.teacher : null;
                            if (p.natural || teacher) yield {state, teacher, winner: p.natural ? p.winner : null, keepActions: true,
                                source: {parentId: job.gameId, players: job.players, step: steps, split: 'train', category: 'stage8'}};
                            engine.step(trace.action);
                        }
                        assert(steps === p.step && JSON.stringify(engine.getState()) === JSON.stringify(p.state));
                        assert(engine.isTerminal() === p.natural);
                    } finally {db.close();}
                }
                pack.pack(job.gameId, 'fresh', rows()); n++;
            }
        }
        const result = {generation, identity, pathDb: file, ...pack.stats(), sealedAccess: 0};
        save(path.join(dir, 'DATASET.json'), result); return result;
    } finally {pack.close();}
}
