import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import type { Action, GameState } from '../../../src/game/types';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { trainingValueTarget } from '../../../src/ai_runtime/dual_v3/value_target';
import type { SearchTeacher } from '../../../src/ai_runtime/dual_v3/search_teacher';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { sha } from './phase7_io';

type LabelSource = { parentId: string; players: number; split: 'train' | 'dev' | 'test'; category: string; step: number; groupId?: string };
export type Example = { state: GameState; teacher: SearchTeacher | null; winner: number | null; source: LabelSource; keepActions: boolean; demonstration?: Action };

export function encodeExample(e: Example) {
    const { state, winner, teacher } = e;
    const engine = new GameEngine(state, { applyInitialTurnStart: false });
    const legal = e.keepActions || teacher ? engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender') : [];
    const observation = encodeDualObservation(state, legal);
    const value = trainingValueTarget(state, observation.playerOrder, winner !== null, winner);
    const old = new Map(teacher?.actionCodes.map((code, i) => [code, i]) ?? []);
    assert(!teacher || old.size === teacher.actionCodes.length, '教师动作码不唯一');
    const mapped = Array.from(observation.actions.sourceIndices, index => old.get(encodeAction(legal[index])) ?? -1);
    let teacherMask = teacher?.available ? mapped.map(i => i >= 0 && teacher.evaluatedMask[i] && !teacher.vetoMask[i]) : [];
    const teacherValid = teacherMask.filter(Boolean).length >= 2;
    if (!teacherValid) teacherMask = [];
    const teacherProb = teacherValid ? mapped.map((i, j) => teacherMask[j] ? teacher!.probabilities[i] : 0) : [];
    if (teacherValid) assert(teacherProb.every(Number.isFinite) && teacherProb.reduce((a, b) => a + b, 0) > 0);
    const code = e.demonstration ? encodeAction(e.demonstration) : null;
    const legalIndex = code === null ? -1 : legal.findIndex(a => encodeAction(a) === code);
    const target = legalIndex < 0 ? -1 : observation.actions.sourceIndices.indexOf(legalIndex);
    return { observation, labels: { target: Math.max(target, 0), policyMask: target >= 0, valueTarget: value.target, valueMask: value.valueMask, weight: 1 },
        source: { ...e.source, teacherMask, teacherProb, teacherValid } };
}

export class DatasetPack {
    readonly db: DatabaseSync;
    constructor(file: string, identity: string) {
        this.db = new DatabaseSync(file);
        this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, samples INTEGER, teachers INTEGER, values_n INTEGER); CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY, split TEXT, kind TEXT, players INTEGER, samples INTEGER, teachers INTEGER, sha TEXT, payload BLOB);');
        const old = this.db.prepare("SELECT value FROM metadata WHERE key='identity'").get();
        assert(!old || old.value === identity, '编码数据断点身份变化');
        if (!old) this.db.prepare("INSERT INTO metadata VALUES('identity',?)").run(identity);
    }
    pack(id: string, kind: string, rows: Iterable<Example>) {
        if (this.db.prepare('SELECT 1 FROM jobs WHERE id=?').get(id)) return false;
        let n = 0, teachers = 0, values = 0, batch: ReturnType<typeof encodeExample>[] = [];
        const flush = () => {
            if (!batch.length) return;
            const first = batch[0].source;
            assert(batch.every(r => r.source.players === first.players && r.source.split === first.split));
            const p = packTensorBatch(batch.map(r => r.observation), batch.map(r => r.labels));
            const meta = Buffer.from(JSON.stringify({ ...p.metadata, sources: batch.map(r => r.source) }));
            const header = Buffer.alloc(4); header.writeUInt32LE(meta.length);
            const body = gzipSync(Buffer.concat([header, meta, p.bytes]), { level: 3 });
            this.db.prepare('INSERT INTO chunks(split,kind,players,samples,teachers,sha,payload) VALUES(?,?,?,?,?,?,?)')
                .run(first.split, kind, first.players, batch.length, batch.filter(r => r.source.teacherValid).length, sha(body), body);
            batch = [];
        };
        this.db.exec('BEGIN');
        try {
            for (const row of rows) {
                const encoded = encodeExample(row);
                if (!encoded.labels.valueMask && !encoded.source.teacherValid) continue;
                batch.push(encoded); n++; teachers += Number(encoded.source.teacherValid); values += Number(encoded.labels.valueMask);
                if (batch.length >= 12) flush();
            }
            flush();
            this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?)').run(id, n, teachers, values);
            this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
        return true;
    }
    stats() {
        return { counts: this.db.prepare('SELECT split,kind,players,count(*) chunks,sum(samples) samples FROM chunks GROUP BY split,kind,players').all(),
            total: this.db.prepare('SELECT sum(samples) samples,sum(teachers) teachers,sum(values_n) values_n FROM jobs').get() };
    }
    close() { this.db.close(); }
}
