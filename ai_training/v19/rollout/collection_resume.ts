import * as fs from 'node:fs';
import * as path from 'node:path';

export const COLLECTION_COMMIT_SCHEMA = 'v19_rollout_game_commit_1';

export interface CollectionFiles {
    transitionsPath: string;
    tensorsPath: string;
    gamesPath: string;
    commitsPath: string;
}

export interface CollectionOffsets {
    transitionBytes: number;
    tensorBytes: number;
    gameBytes: number;
}

export interface CollectionCommit extends CollectionOffsets {
    schema: typeof COLLECTION_COMMIT_SCHEMA;
    type: 'game' | 'legacy_anchor';
    gameId: string | null;
    transitionStartBytes: number;
    tensorStartBytes: number;
    gameStartBytes: number;
    recordedDecisions: number;
}

export interface CollectionResumeState extends CollectionOffsets {
    doneGameIds: Set<string>;
    recoveredTail: boolean;
    source: 'empty' | 'commits' | 'legacy_audit';
}

interface JsonLine<T> {
    value: T;
    start: number;
    end: number;
}

function assertSafeFileSet(files: CollectionFiles): CollectionFiles {
    const resolved = {
        transitionsPath: path.resolve(files.transitionsPath),
        tensorsPath: path.resolve(files.tensorsPath),
        gamesPath: path.resolve(files.gamesPath),
        commitsPath: path.resolve(files.commitsPath),
    };
    const dirs = new Set(Object.values(resolved).map(file => path.dirname(file)));
    if (dirs.size !== 1) throw new Error('采样恢复文件必须位于同一个 wave 目录');
    const suffixes = ['.transitions.jsonl', '.tensors.f32', '.games.jsonl', '.commits.jsonl'];
    const values = Object.values(resolved);
    const stems = values.map((file, index) => {
        if (!file.endsWith(suffixes[index])) throw new Error(`采样恢复文件名后缀不匹配：${file}`);
        return file.slice(0, -suffixes[index].length);
    });
    if (new Set(stems).size !== 1) throw new Error('采样恢复文件必须属于同一个 modelKey');
    return resolved;
}

function sizeOf(file: string): number {
    return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

function parseJsonLines<T>(file: string, limit = sizeOf(file)): { lines: JsonLine<T>[]; completeBytes: number } {
    if (!fs.existsSync(file) || limit === 0) return { lines: [], completeBytes: 0 };
    const source = fs.readFileSync(file).subarray(0, limit);
    const lines: JsonLine<T>[] = [];
    let start = 0;
    for (let index = 0; index < source.length; index += 1) {
        if (source[index] !== 0x0a) continue;
        const end = index + 1;
        const text = source.subarray(start, index).toString('utf8').replace(/\r$/, '');
        if (text.trim()) {
            try {
                lines.push({ value: JSON.parse(text) as T, start, end });
            } catch (error) {
                throw new Error(`JSONL 完整行损坏：${file}:${start}（${String(error)}）`);
            }
        }
        start = end;
    }
    return { lines, completeBytes: start };
}

function truncateTo(file: string, bytes: number): boolean {
    const current = sizeOf(file);
    if (bytes < 0 || bytes > current) throw new Error(`拒绝越界截断：${file} ${current} -> ${bytes}`);
    if (current === bytes) return false;
    fs.truncateSync(file, bytes);
    return true;
}

interface GameRow {
    gameId?: unknown;
    recordedDecisions?: unknown;
    behaviorCheckpointSha256?: unknown;
}
interface TransitionRow {
    gameId?: unknown;
    subjectDecisionIndex?: unknown;
    tensorOffset?: unknown;
    tensorBytes?: unknown;
    checkpointSha256?: unknown;
}

/** 审计一个已确定的文件前缀；任何无法证明安全的历史布局都会被拒绝。 */
function auditPrefix(
    files: CollectionFiles,
    limits?: Partial<CollectionOffsets>,
    expectedCheckpointSha256?: string,
): {
    done: Set<string>;
    transitionBytes: number;
    tensorBytes: number;
    gameBytes: number;
    recordedDecisions: number;
} {
    const gameLimit = limits?.gameBytes ?? sizeOf(files.gamesPath);
    const transitionLimit = limits?.transitionBytes ?? sizeOf(files.transitionsPath);
    const games = parseJsonLines<GameRow>(files.gamesPath, gameLimit);
    const transitions = parseJsonLines<TransitionRow>(files.transitionsPath, transitionLimit);
    if (limits?.gameBytes !== undefined && games.completeBytes !== gameLimit) {
        throw new Error('commit 指向的 games 前缀不是完整 JSONL 行');
    }
    if (limits?.transitionBytes !== undefined && transitions.completeBytes !== transitionLimit) {
        throw new Error('commit 指向的 transitions 前缀不是完整 JSONL 行');
    }

    const done = new Set<string>();
    const expectedCounts = new Map<string, number>();
    for (const line of games.lines) {
        const id = typeof line.value.gameId === 'string' ? line.value.gameId : '';
        const count = Number(line.value.recordedDecisions);
        if (!id || !Number.isInteger(count) || count < 0) throw new Error('games 行缺少有效 gameId/recordedDecisions');
        if (expectedCheckpointSha256 !== undefined
            && line.value.behaviorCheckpointSha256 !== expectedCheckpointSha256) {
            throw new Error(`局 ${id} 的 behaviorCheckpointSha256 缺失或与当前权重不一致`);
        }
        if (done.has(id)) throw new Error(`games 中存在重复 gameId：${id}`);
        done.add(id);
        expectedCounts.set(id, count);
    }

    const actualCounts = new Map<string, number>();
    let safeTransitionBytes = transitions.completeBytes;
    let tailStarted = false;
    let expectedTensorOffset = 0;
    for (const line of transitions.lines) {
        const id = typeof line.value.gameId === 'string' ? line.value.gameId : '';
        if (!id) throw new Error('transitions 行缺少有效 gameId');
        if (!done.has(id)) {
            if (!tailStarted) safeTransitionBytes = line.start;
            tailStarted = true;
            continue;
        }
        if (tailStarted) throw new Error('未提交半局之后又出现已提交 transition，拒绝不安全恢复');
        if (expectedCheckpointSha256 !== undefined
            && line.value.checkpointSha256 !== expectedCheckpointSha256) {
            throw new Error(`局 ${id} 的 checkpointSha256 缺失或与当前权重不一致`);
        }
        const decision = Number(line.value.subjectDecisionIndex);
        const seen = actualCounts.get(id) ?? 0;
        if (!Number.isInteger(decision) || decision !== seen) {
            throw new Error(`局 ${id} 的 subjectDecisionIndex 不连续：期望 ${seen}，得到 ${String(line.value.subjectDecisionIndex)}`);
        }
        actualCounts.set(id, seen + 1);
        if (line.value.tensorOffset === null || line.value.tensorOffset === undefined) {
            if (line.value.tensorBytes !== null && line.value.tensorBytes !== undefined) {
                throw new Error(`局 ${id} 的 tensorOffset/tensorBytes 不一致`);
            }
        } else {
            const offset = Number(line.value.tensorOffset);
            const bytes = Number(line.value.tensorBytes);
            if (!Number.isInteger(offset) || !Number.isInteger(bytes) || bytes <= 0 || offset !== expectedTensorOffset) {
                throw new Error(`局 ${id} 的 tensor offset 不连续：期望 ${expectedTensorOffset}，得到 ${offset}+${bytes}`);
            }
            expectedTensorOffset += bytes;
        }
    }
    for (const [id, expected] of expectedCounts) {
        const actual = actualCounts.get(id) ?? 0;
        if (actual !== expected) throw new Error(`局 ${id} transition 数不完整：games=${expected}，实际=${actual}`);
    }
    const tensorLimit = limits?.tensorBytes ?? sizeOf(files.tensorsPath);
    if (expectedTensorOffset !== tensorLimit && limits?.tensorBytes !== undefined) {
        throw new Error(`commit 张量尾部不匹配：引用=${expectedTensorOffset}，commit=${tensorLimit}`);
    }
    if (expectedTensorOffset > sizeOf(files.tensorsPath)) throw new Error('transition 引用了 tensors 文件末尾之外的数据');
    return {
        done,
        transitionBytes: safeTransitionBytes,
        tensorBytes: expectedTensorOffset,
        gameBytes: games.completeBytes,
        recordedDecisions: [...actualCounts.values()].reduce((sum, count) => sum + count, 0),
    };
}

/** 验证每个 game commit 恰好覆盖对应的一行 game 和该局全部 transition。 */
function validateCommitRows(files: CollectionFiles, commits: readonly CollectionCommit[]): void {
    if (commits.length === 0) return;
    const last = commits[commits.length - 1];
    const games = parseJsonLines<GameRow>(files.gamesPath, last.gameBytes).lines;
    const transitions = parseJsonLines<TransitionRow>(files.transitionsPath, last.transitionBytes).lines;
    for (const commit of commits) {
        if (commit.type === 'legacy_anchor') {
            if (commit.gameId !== null) throw new Error('legacy_anchor 的 gameId 必须为 null');
            const count = transitions.filter(line => line.start >= commit.transitionStartBytes
                && line.end <= commit.transitionBytes).length;
            if (count !== commit.recordedDecisions) {
                throw new Error(`legacy_anchor decision 数不符：commit=${commit.recordedDecisions}，实际=${count}`);
            }
            continue;
        }
        if (typeof commit.gameId !== 'string' || commit.gameId.length === 0) {
            throw new Error('game commit 缺少 gameId');
        }
        const gameLine = games.find(line => line.start === commit.gameStartBytes && line.end === commit.gameBytes);
        if (!gameLine || gameLine.value.gameId !== commit.gameId
            || Number(gameLine.value.recordedDecisions) !== commit.recordedDecisions) {
            throw new Error(`commit 与对应 games 行不一致：${commit.gameId}`);
        }
        const rows = transitions.filter(line => line.start >= commit.transitionStartBytes
            && line.end <= commit.transitionBytes);
        if (rows.length !== commit.recordedDecisions
            || rows.some(line => line.value.gameId !== commit.gameId)) {
            throw new Error(`commit 与对应 transitions 不一致：${commit.gameId}`);
        }
    }
}

export function formatCollectionCommit(commit: CollectionCommit): string {
    return `${JSON.stringify(commit)}\n`;
}

/**
 * 仅修复调用方明确传入的同一 wave/modelKey 文件组。
 * 新格式以最后一个完整 commit 为边界；旧格式仅在严格审计通过后建立锚点。
 */
export function prepareCollectionResume(
    input: CollectionFiles,
    resume: boolean,
    expectedCheckpointSha256?: string,
): CollectionResumeState {
    const files = assertSafeFileSet(input);
    if (expectedCheckpointSha256 !== undefined && expectedCheckpointSha256.trim().length === 0) {
        throw new Error('expectedCheckpointSha256 不能为空字符串');
    }
    const allFiles = Object.values(files);
    if (!resume) {
        const existing = allFiles.find(file => fs.existsSync(file));
        if (existing) throw new Error(`输出已存在且 --resume=false，拒绝覆盖：${existing}`);
        return { doneGameIds: new Set(), transitionBytes: 0, tensorBytes: 0, gameBytes: 0,
            recoveredTail: false, source: 'empty' };
    }

    if (fs.existsSync(files.commitsPath)) {
        const parsed = parseJsonLines<CollectionCommit>(files.commitsPath);
        let previous: CollectionOffsets = { transitionBytes: 0, tensorBytes: 0, gameBytes: 0 };
        const validCommits: CollectionCommit[] = [];
        for (let commitIndex = 0; commitIndex < parsed.lines.length; commitIndex += 1) {
            const line = parsed.lines[commitIndex];
            const row = line.value;
            if (row.schema !== COLLECTION_COMMIT_SCHEMA || (row.type !== 'game' && row.type !== 'legacy_anchor')) {
                throw new Error('commits 文件包含未知 schema/type');
            }
            const numeric = [
                row.transitionStartBytes, row.tensorStartBytes, row.gameStartBytes,
                row.transitionBytes, row.tensorBytes, row.gameBytes, row.recordedDecisions,
            ];
            if (!numeric.every(value => Number.isInteger(value) && value >= 0)) {
                throw new Error('commits 包含非整数或负数偏移/计数');
            }
            if (row.type === 'legacy_anchor' && commitIndex !== 0) {
                throw new Error('legacy_anchor 只能是 commits 的第一行');
            }
            const startsMatch = row.transitionStartBytes === previous.transitionBytes
                && row.tensorStartBytes === previous.tensorBytes && row.gameStartBytes === previous.gameBytes;
            const endsValid = row.transitionBytes >= previous.transitionBytes
                && row.tensorBytes >= previous.tensorBytes && row.gameBytes >= previous.gameBytes;
            if (!startsMatch || !endsValid) throw new Error('commits 偏移不连续，拒绝猜测恢复边界');
            if (row.transitionBytes > sizeOf(files.transitionsPath)
                || row.tensorBytes > sizeOf(files.tensorsPath) || row.gameBytes > sizeOf(files.gamesPath)) {
                // 中文：完整换行的 commit 已经宣告提交，数据却更短是损坏，不可静默删掉上一局。
                throw new Error('完整 commit 指向文件末尾之外，拒绝破坏性恢复');
            }
            previous = row;
            validCommits.push(row);
        }
        // 中文：所有只读验证必须先完成；以下检查失败时四个文件保持逐字节不变。
        const audited = auditPrefix(files, previous, expectedCheckpointSha256);
        validateCommitRows(files, validCommits);
        const commitBytes = parsed.completeBytes;
        let recoveredTail = truncateTo(files.commitsPath, commitBytes);
        recoveredTail = truncateTo(files.transitionsPath, previous.transitionBytes) || recoveredTail;
        recoveredTail = truncateTo(files.tensorsPath, previous.tensorBytes) || recoveredTail;
        recoveredTail = truncateTo(files.gamesPath, previous.gameBytes) || recoveredTail;
        return {
            doneGameIds: audited.done,
            transitionBytes: previous.transitionBytes,
            tensorBytes: previous.tensorBytes,
            gameBytes: previous.gameBytes,
            recoveredTail,
            source: 'commits',
        };
    }

    const anyData = [files.transitionsPath, files.tensorsPath, files.gamesPath].some(file => sizeOf(file) > 0);
    if (!anyData) {
        return { doneGameIds: new Set(), transitionBytes: 0, tensorBytes: 0, gameBytes: 0,
            recoveredTail: false, source: 'empty' };
    }
    const audited = auditPrefix(files, undefined, expectedCheckpointSha256);
    let recoveredTail = truncateTo(files.transitionsPath, audited.transitionBytes);
    recoveredTail = truncateTo(files.tensorsPath, audited.tensorBytes) || recoveredTail;
    recoveredTail = truncateTo(files.gamesPath, audited.gameBytes) || recoveredTail;
    const anchor: CollectionCommit = {
        schema: COLLECTION_COMMIT_SCHEMA, type: 'legacy_anchor', gameId: null,
        transitionStartBytes: 0, tensorStartBytes: 0, gameStartBytes: 0,
        transitionBytes: audited.transitionBytes, tensorBytes: audited.tensorBytes, gameBytes: audited.gameBytes,
        recordedDecisions: audited.recordedDecisions,
    };
    fs.writeFileSync(files.commitsPath, formatCollectionCommit(anchor), { encoding: 'utf8', flag: 'wx' });
    return { doneGameIds: audited.done, transitionBytes: audited.transitionBytes,
        tensorBytes: audited.tensorBytes, gameBytes: audited.gameBytes,
        recoveredTail, source: 'legacy_audit' };
}
