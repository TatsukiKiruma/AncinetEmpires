import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    COLLECTION_COMMIT_SCHEMA,
    formatCollectionCommit,
    prepareCollectionResume,
    type CollectionCommit,
    type CollectionFiles,
    type CollectionOffsets,
} from './collection_resume';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function fixture(): { files: CollectionFiles; offsets: CollectionOffsets } {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'v19-resume-'));
    temporaryDirectories.push(directory);
    const stem = path.join(directory, 'wave');
    return {
        files: {
            transitionsPath: `${stem}.transitions.jsonl`,
            tensorsPath: `${stem}.tensors.f32`,
            gamesPath: `${stem}.games.jsonl`,
            commitsPath: `${stem}.commits.jsonl`,
        },
        offsets: { transitionBytes: 0, tensorBytes: 0, gameBytes: 0 },
    };
}

function appendCompleteGame(
    files: CollectionFiles,
    before: CollectionOffsets,
    gameId: string,
    checkpointSha256?: string,
): CollectionOffsets {
    const transitionLine = `${JSON.stringify({
        gameId, subjectDecisionIndex: 0,
        tensorOffset: before.tensorBytes, tensorBytes: 4,
        ...(checkpointSha256 === undefined ? {} : { checkpointSha256 }),
    })}\n`;
    fs.appendFileSync(files.transitionsPath, transitionLine);
    fs.appendFileSync(files.tensorsPath, Buffer.alloc(4, gameId.length));
    const gameLine = `${JSON.stringify({
        gameId, recordedDecisions: 1,
        ...(checkpointSha256 === undefined ? {} : { behaviorCheckpointSha256: checkpointSha256 }),
    })}\n`;
    fs.appendFileSync(files.gamesPath, gameLine);
    const after = {
        transitionBytes: before.transitionBytes + Buffer.byteLength(transitionLine),
        tensorBytes: before.tensorBytes + 4,
        gameBytes: before.gameBytes + Buffer.byteLength(gameLine),
    };
    const commit: CollectionCommit = {
        schema: COLLECTION_COMMIT_SCHEMA,
        type: 'game', gameId,
        transitionStartBytes: before.transitionBytes,
        tensorStartBytes: before.tensorBytes,
        gameStartBytes: before.gameBytes,
        ...after,
        recordedDecisions: 1,
    };
    fs.appendFileSync(files.commitsPath, formatCollectionCommit(commit));
    return after;
}

function snapshot(files: CollectionFiles): Record<keyof CollectionFiles, Buffer> {
    return Object.fromEntries(
        Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file)]),
    ) as Record<keyof CollectionFiles, Buffer>;
}

function expectUnchanged(files: CollectionFiles, before: Record<keyof CollectionFiles, Buffer>): void {
    for (const [key, file] of Object.entries(files) as Array<[keyof CollectionFiles, string]>) {
        expect(fs.readFileSync(file)).toEqual(before[key]);
    }
}

describe('prepareCollectionResume', () => {
    it('清除局中半行和多写的张量尾部', () => {
        const { files, offsets } = fixture();
        const committed = appendCompleteGame(files, offsets, 'g1');
        fs.appendFileSync(files.transitionsPath, '{"gameId":"g2"');
        fs.appendFileSync(files.tensorsPath, Buffer.alloc(6));

        const resumed = prepareCollectionResume(files, true);
        expect([...resumed.doneGameIds]).toEqual(['g1']);
        expect(resumed.recoveredTail).toBe(true);
        expect(fs.statSync(files.transitionsPath).size).toBe(committed.transitionBytes);
        expect(fs.statSync(files.tensorsPath).size).toBe(committed.tensorBytes);
    });

    it('清除完整 transition 对应的半张量', () => {
        const { files, offsets } = fixture();
        const committed = appendCompleteGame(files, offsets, 'g1');
        const broken = `${JSON.stringify({
            gameId: 'g2', subjectDecisionIndex: 0,
            tensorOffset: committed.tensorBytes, tensorBytes: 8,
        })}\n`;
        fs.appendFileSync(files.transitionsPath, broken);
        fs.appendFileSync(files.tensorsPath, Buffer.alloc(4));

        const resumed = prepareCollectionResume(files, true);
        expect([...resumed.doneGameIds]).toEqual(['g1']);
        expect(fs.statSync(files.transitionsPath).size).toBe(committed.transitionBytes);
        expect(fs.statSync(files.tensorsPath).size).toBe(committed.tensorBytes);
    });

    it('写 games 前崩溃时回滚整局，续跑不会留下重复 decision', () => {
        const { files, offsets } = fixture();
        const committed = appendCompleteGame(files, offsets, 'g1');
        const tail = `${JSON.stringify({
            gameId: 'g2', subjectDecisionIndex: 0,
            tensorOffset: committed.tensorBytes, tensorBytes: 4,
        })}\n`;
        fs.appendFileSync(files.transitionsPath, tail);
        fs.appendFileSync(files.tensorsPath, Buffer.alloc(4));

        const resumed = prepareCollectionResume(files, true);
        expect(resumed.transitionBytes).toBe(committed.transitionBytes);
        const afterG2 = appendCompleteGame(files, resumed, 'g2');
        const secondResume = prepareCollectionResume(files, true);
        expect([...secondResume.doneGameIds]).toEqual(['g1', 'g2']);
        expect(secondResume).toMatchObject(afterG2);
        const rows = fs.readFileSync(files.transitionsPath, 'utf8').trim().split('\n')
            .map(line => JSON.parse(line));
        expect(rows.map(row => `${row.gameId}:${row.subjectDecisionIndex}`)).toEqual(['g1:0', 'g2:0']);
    });

    it('完整局重复恢复保持偏移和文件内容不变', () => {
        const { files, offsets } = fixture();
        const afterG1 = appendCompleteGame(files, offsets, 'g1');
        const afterG2 = appendCompleteGame(files, afterG1, 'g2');
        const before = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file)]));

        const first = prepareCollectionResume(files, true);
        const second = prepareCollectionResume(files, true);
        expect(first).toMatchObject(afterG2);
        expect(second).toMatchObject(afterG2);
        expect([...second.doneGameIds]).toEqual(['g1', 'g2']);
        for (const [key, file] of Object.entries(files)) {
            expect(fs.readFileSync(file)).toEqual(before[key]);
        }
    });

    it('兼容可证明安全的旧格式，并为后续恢复建立锚点', () => {
        const { files } = fixture();
        const transition = `${JSON.stringify({
            gameId: 'legacy', subjectDecisionIndex: 0, tensorOffset: 0, tensorBytes: 4,
        })}\n`;
        fs.writeFileSync(files.transitionsPath, transition);
        fs.writeFileSync(files.tensorsPath, Buffer.alloc(4));
        fs.writeFileSync(files.gamesPath, `${JSON.stringify({ gameId: 'legacy', recordedDecisions: 1 })}\n`);

        const resumed = prepareCollectionResume(files, true);
        expect(resumed.source).toBe('legacy_audit');
        expect([...resumed.doneGameIds]).toEqual(['legacy']);
        expect(fs.readFileSync(files.commitsPath, 'utf8')).toContain('legacy_anchor');
        expect(prepareCollectionResume(files, true).source).toBe('commits');
    });

    it('旧格式存在交错的未提交局时明确拒绝', () => {
        const { files } = fixture();
        const rows = [
            { gameId: 'g1', subjectDecisionIndex: 0, tensorOffset: null, tensorBytes: null },
            { gameId: 'half', subjectDecisionIndex: 0, tensorOffset: null, tensorBytes: null },
            { gameId: 'g1', subjectDecisionIndex: 1, tensorOffset: null, tensorBytes: null },
        ];
        fs.writeFileSync(files.transitionsPath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
        fs.writeFileSync(files.tensorsPath, Buffer.alloc(0));
        fs.writeFileSync(files.gamesPath, `${JSON.stringify({ gameId: 'g1', recordedDecisions: 2 })}\n`);
        expect(() => prepareCollectionResume(files, true)).toThrow('拒绝不安全恢复');
    });

    it('不同目录或 modelKey 的文件组在任何截断前被拒绝', () => {
        const { files } = fixture();
        fs.writeFileSync(files.transitionsPath, '不可修改');
        const mismatched = { ...files, tensorsPath: path.join(path.dirname(files.tensorsPath), 'other.tensors.f32') };
        expect(() => prepareCollectionResume(mismatched, true)).toThrow('同一个 modelKey');
        expect(fs.readFileSync(files.transitionsPath, 'utf8')).toBe('不可修改');
    });

    it('计划保留前缀审计失败时不先截断任何尾部', () => {
        const { files, offsets } = fixture();
        appendCompleteGame(files, offsets, 'g1');
        fs.appendFileSync(files.transitionsPath, '{"gameId":"未提交半行"');
        fs.appendFileSync(files.tensorsPath, Buffer.alloc(3));
        const corruptedGame = fs.readFileSync(files.gamesPath, 'utf8')
            .replace('"recordedDecisions":1', '"recordedDecisions":2');
        fs.writeFileSync(files.gamesPath, corruptedGame);
        const before = snapshot(files);

        expect(() => prepareCollectionResume(files, true)).toThrow('transition 数不完整');
        expectUnchanged(files, before);
    });

    it('commit 的 gameId 或 decision 数与数据行不符时拒绝且不修改文件', () => {
        const { files, offsets } = fixture();
        appendCompleteGame(files, offsets, 'g1');
        const originalCommit = fs.readFileSync(files.commitsPath, 'utf8');
        fs.writeFileSync(files.commitsPath, originalCommit.replace('"gameId":"g1"', '"gameId":"xx"'));
        const beforeGameId = snapshot(files);
        expect(() => prepareCollectionResume(files, true)).toThrow('commit 与对应 games 行不一致');
        expectUnchanged(files, beforeGameId);

        fs.writeFileSync(files.commitsPath, originalCommit.replace('"recordedDecisions":1', '"recordedDecisions":2'));
        const beforeCount = snapshot(files);
        expect(() => prepareCollectionResume(files, true)).toThrow('commit 与对应 games 行不一致');
        expectUnchanged(files, beforeCount);
    });

    it('完整畸形 commit 越界时不静默删除最后一个有效局', () => {
        const { files, offsets } = fixture();
        const valid = appendCompleteGame(files, offsets, 'g1');
        const malformed: CollectionCommit = {
            schema: COLLECTION_COMMIT_SCHEMA, type: 'game', gameId: 'g2',
            transitionStartBytes: valid.transitionBytes,
            tensorStartBytes: valid.tensorBytes,
            gameStartBytes: valid.gameBytes,
            transitionBytes: valid.transitionBytes + 100,
            tensorBytes: valid.tensorBytes,
            gameBytes: valid.gameBytes,
            recordedDecisions: 0,
        };
        fs.appendFileSync(files.commitsPath, formatCollectionCommit(malformed));
        const before = snapshot(files);
        expect(() => prepareCollectionResume(files, true)).toThrow('文件末尾之外');
        expectUnchanged(files, before);
        expect(fs.readFileSync(files.gamesPath, 'utf8')).toContain('g1');
    });

    it('commit 含负数或非整数偏移时拒绝且不修改文件', () => {
        const { files, offsets } = fixture();
        const valid = appendCompleteGame(files, offsets, 'g1');
        const malformed = {
            schema: COLLECTION_COMMIT_SCHEMA, type: 'game', gameId: 'g2',
            transitionStartBytes: valid.transitionBytes,
            tensorStartBytes: -1,
            gameStartBytes: valid.gameBytes,
            transitionBytes: valid.transitionBytes,
            tensorBytes: valid.tensorBytes,
            gameBytes: valid.gameBytes,
            recordedDecisions: 0.5,
        };
        fs.appendFileSync(files.commitsPath, `${JSON.stringify(malformed)}\n`);
        const before = snapshot(files);
        expect(() => prepareCollectionResume(files, true)).toThrow('非整数或负数');
        expectUnchanged(files, before);
    });

    it('当前权重SHA存在时拒绝缺失行为身份的已提交局且不截断', () => {
        const { files, offsets } = fixture();
        appendCompleteGame(files, offsets, 'g1');
        fs.appendFileSync(files.transitionsPath, '{"gameId":"待清尾部"');
        fs.appendFileSync(files.tensorsPath, Buffer.alloc(2));
        const before = snapshot(files);
        expect(() => prepareCollectionResume(files, true, 'sha-a')).toThrow('behaviorCheckpointSha256 缺失');
        expectUnchanged(files, before);
    });

    it('games 行行为SHA与当前权重不符时拒绝且不修改文件', () => {
        const { files, offsets } = fixture();
        appendCompleteGame(files, offsets, 'g1', 'sha-b');
        const before = snapshot(files);
        expect(() => prepareCollectionResume(files, true, 'sha-a')).toThrow('behaviorCheckpointSha256 缺失或与当前权重不一致');
        expectUnchanged(files, before);
    });

    it('transition 行混入另一权重SHA时拒绝且不修改文件', () => {
        const { files, offsets } = fixture();
        appendCompleteGame(files, offsets, 'g1', 'sha-a');
        const mixed = fs.readFileSync(files.transitionsPath, 'utf8')
            .replace('"checkpointSha256":"sha-a"', '"checkpointSha256":"sha-b"');
        fs.writeFileSync(files.transitionsPath, mixed);
        const before = snapshot(files);
        expect(() => prepareCollectionResume(files, true, 'sha-a')).toThrow('checkpointSha256 缺失或与当前权重不一致');
        expectUnchanged(files, before);
    });

    it('已提交记录SHA全部匹配时仍正常清理未提交尾部', () => {
        const { files, offsets } = fixture();
        const committed = appendCompleteGame(files, offsets, 'g1', 'sha-a');
        fs.appendFileSync(files.transitionsPath, '{"gameId":"未提交"');
        fs.appendFileSync(files.tensorsPath, Buffer.alloc(5));
        const resumed = prepareCollectionResume(files, true, 'sha-a');
        expect([...resumed.doneGameIds]).toEqual(['g1']);
        expect(resumed.recoveredTail).toBe(true);
        expect(resumed.transitionBytes).toBe(committed.transitionBytes);
        expect(resumed.tensorBytes).toBe(committed.tensorBytes);
    });
});
