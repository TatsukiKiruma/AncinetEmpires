import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { validTeacher } from './league_policy';
import { DatasetPack, type Example } from './dataset_pack';
import { trainingDirectory } from './league_collect';
import { fileSha, here, positiveProgressStop, readJson, readLocal, saveJson, sha } from './phase7_io';

const base = path.dirname(here);
const partitionFile = path.join(base, 'stage1/PARTITIONS.json');
const source5 = path.join(base, 'stage5/OOD_TRAIN_SELECTION.json');
const source6 = path.join(base, 'stage6/DISTILL_DATA_MANIFEST.json');
const readGzip = (file: string, digest: string) => {
    assert(!/(?:^|[/\\._-])(?:sealed|test|historical)(?:$|[/\\._-])/i.test(file), '开发期拒绝读取封存路径');
    const bytes = fs.readFileSync(file); assert.equal(sha(bytes), digest, `历史输入摘要变化：${file}`);
    return JSON.parse(gunzipSync(bytes).toString('utf8'));
};

function* leagueRows(job: any, receipt: any): Generator<Example> {
    assert.equal(job.gameId, receipt.gameId);
    const db = new DatabaseSync(receipt.database, { readOnly: true });
    try {
        const raw = db.prepare('SELECT value FROM progress WHERE id=1').get();
        const p = JSON.parse(String(raw?.value));
        const engine = new GameEngine(job.state, { applyInitialTurnStart: false });
        assert(p.complete && p.natural === receipt.natural && p.winner === receipt.winner);
        let step = 0;
        for (const row of db.prepare('SELECT value FROM steps ORDER BY step').iterate()) {
            const state = engine.getState(), trace = JSON.parse(String(row.value));
            assert(trace.step === ++step && state.currentPlayer === trace.player && encodeAction(trace.action) === trace.code);
            assert(engine.hasLegalAction(trace.player, trace.action), '联赛轨迹复验非法');
            if (p.natural || validTeacher(trace.teacher)) {
                const teacher = validTeacher(trace.teacher) ? trace.teacher : null;
                assert(!teacher || trace.full && trace.role === 'candidate');
                yield { state, teacher, winner: p.natural ? p.winner : null, keepActions: !!teacher,
                    source: { parentId: job.gameId, step, players: job.players, category: job.kind, split: 'train' } };
            }
            engine.step(trace.action);
        }
        assert(step === p.step && JSON.stringify(engine.getState()) === JSON.stringify(p.state) && engine.isTerminal() === p.natural);
    } finally { db.close(); }
}

export function exportDataset(generation: number, deadlineMs: number) {
    assert(readLocal('STAGE7_BASELINE_DEV54.json').passed, 'C 未通过，禁止训练数据生成');
    const directory = trainingDirectory(generation);
    const collected = readJson(path.join(directory, 'SUMMARY.json'));
    assert(collected.passed && collected.sealedAccess === 0);
    const pathDb = path.join(directory, 'dataset.sqlite');
    const partitionSha = fileSha(partitionFile), hashes = [fileSha(source5), fileSha(source6), fileSha(path.join(here, 'dataset_pack.ts')),
        fileSha(path.join(here, 'dataset_export.ts'))];
    const identity = sha(JSON.stringify([collected.sourceIdentity, partitionSha, hashes]));
    const ready = path.join(directory, 'DATASET.json');
    if (fs.existsSync(ready)) { const r = readJson(ready); assert.equal(r.identity, identity); return r; }
    const partitions = new Map<string, any>(readJson(partitionFile, partitionSha).parents.filter((p: any) =>
        p.admitted && ['train', 'dev'].includes(p.split)).map((p: any) => [p.parentId, p]));
    const sourceReceipts = new Map<string, any>(collected.games.map((r: any) => [r.gameId, r]));
    const pack = new DatasetPack(pathDb, identity);
    const guard = () => { positiveProgressStop(); if (Date.now() >= deadlineMs) throw Error('Phase D 到达墙钟上限'); };
    try {
        for (let block = 0, finished = 0; finished < sourceReceipts.size; block++) {
            for (const job of readJson(path.join(directory, `block-${block}.json`))) {
                guard();
                const receipt = sourceReceipts.get(job.gameId);
                assert(receipt && path.dirname(receipt.database) === directory);
                pack.pack(job.gameId, 'fresh', leagueRows(job, receipt)); finished++;
            }
        }
        const s5 = readJson(source5, hashes[0]); assert(s5.ready && s5.split === 'train' && s5.sealedAccess === 0);
        for (const item of s5.rows) {
            guard();
            const p = partitions.get(item.parentId);
            assert(p && p.split === 'train', 'Stage 5 回放来源不在训练白名单');
            function* rows() {
                const old = readGzip(item.path, item.sha256);
                assert(old.natural && old.split === 'train' && old.parentId === p.parentId && old.groupId === p.groupId && old.players === p.players);
                for (const s of old.samples) yield { state: s.state, teacher: null, winner: old.winner, keepActions: true,
                    source: { parentId: p.parentId, players: p.players, category: 'stage5', split: 'train' as const, step: s.step, groupId: p.groupId } };
            }
            pack.pack(`stage5/${item.parentId}/${item.seed}`, 'replay5', rows());
        }
        const s6 = readJson(source6, hashes[1]); assert(s6.complete && s6.sealedAccess === 0);
        for (const item of s6.receipts) {
            guard();
            const p = partitions.get(item.parentId);
            assert(p && p.split === item.split && p.groupId === item.groupId && p.players === item.players, 'Stage 6 回放来源不在对应白名单');
            if (item.split === 'train' && !item.valid) continue;
            const split: 'train' | 'dev' = item.split;
            function* rows() {
                const old = readGzip(item.source, item.sourceSha256);
                assert(old.natural && old.split === split && old.parentId === p.parentId && old.groupId === p.groupId);
                const sample = old.samples[item.index]; assert.equal(sample.step, item.step);
                const teacher = item.valid ? readGzip(item.file, item.sha256).teacher : null;
                yield { state: sample.state, teacher, winner: old.winner, keepActions: split === 'train',
                    source: { parentId: p.parentId, players: p.players, category: 'stage6', split, step: item.step, groupId: p.groupId } };
            }
            pack.pack(`stage6/${item.id}`, split === 'dev' ? 'offline-dev' : 'replay6', rows());
        }
        const result = { identity, pathDb, partitionSha, sources: hashes, generation, ...pack.stats(), sealedAccess: 0 };
        saveJson(ready, result);
        return result;
    } finally { pack.close(); }
}
